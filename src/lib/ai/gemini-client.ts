import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
  APICallError,
  RetryError,
  streamText,
  type ModelMessage,
} from "ai";

import { textDeltas } from "./text-deltas";

// Three call paths into the Gemini API:
//
//   1. Free-tier multi-key rotation (callGemini / withGeminiKey).
//      Resume parse + ATS score run here. Per-project free-tier limits
//      hover around 10–15 RPM, so we round-robin across GEMINI_KEY_2..KEY_8
//      and use 60s cooldowns + exponential backoff to ride out 429s.
//
//   2. Tier 1 paid single-key, raw fetch (callGeminiTier1 / getTier1Key).
//      GEMINI_KEY_1's project is on Gemini API Tier 1 (paid), ~3000 RPM.
//      Embeddings run here — there's no point rotating, and the per-key
//      cooldown machinery would actively get in the way under heavy
//      throughput. Simple 3-attempt backoff is enough.
//
//   3. Tier 1 paid via the Vercel AI SDK (streamGemini).
//      Interactive chat streams through @ai-sdk/google on the same paid
//      key — a live conversation can't tolerate the free rotation's "all
//      keys cooling, retry in 60s" stalls. Also sets up tool-calling later.
//
// Rotation generation calls target gemini-3.5-flash; chat stays pinned to
// gemini-2.5-flash on the paid KEY_1 project (see CHAT_MODEL below). Model
// availability is PER-PROJECT: Google 404s older models ("no longer
// available to new users") on projects without prior usage of them, so two
// keys in the same rotation can disagree about the same model. That's why
// withGeminiKey rotates past per-key 404s and the model consts are verified
// against every key (see scheduleKeyAvailabilityCheck) instead of assumed
// uniform.
//
// Free pool reads GEMINI_KEY_2..GEMINI_KEY_8 — KEY_1 is reserved for the paid
// Tier 1 paths (embeddings + chat). Only populated entries are used, so adding
// a key in env is a no-restart change. Rotation, cooldown, and backoff are
// size-agnostic. Entries keep their env-var name so failures can be logged
// against a concrete key slot.
type KeyEntry = { name: string; key: string };

const allEntries: KeyEntry[] = (
  [
    "GEMINI_KEY_1",
    "GEMINI_KEY_2",
    "GEMINI_KEY_3",
    "GEMINI_KEY_4",
    "GEMINI_KEY_5",
    "GEMINI_KEY_6",
    "GEMINI_KEY_7",
    "GEMINI_KEY_8",
  ] as const
).flatMap((name) => {
  const key = process.env[name];
  return key ? [{ name, key }] : [];
});

if (allEntries.length === 0) {
  throw new Error("No GEMINI_KEY_* env vars found");
}

// The free rotation pool deliberately excludes GEMINI_KEY_1: that key is on a
// paid Tier 1 project, so free-tier work (resume parse + ATS scoring) landing
// on it would bill the paid project. Embeddings and chat use KEY_1 explicitly
// via getTier1Key(); everything else rotates over KEY_2..KEY_8.
// Fallback: if KEY_1 is the only key configured, use it so the app still runs.
const freeEntries = allEntries.filter(
  (e) => e.key !== process.env.GEMINI_KEY_1
);
const keys: KeyEntry[] = freeEntries.length > 0 ? freeEntries : allEntries;

let index = 0;
const cooldowns = new Map<number, number>();

export const getKeyCount = (): number => keys.length;

export const markCooldown = (key: string, durationMs = 60_000) => {
  const slot = keys.findIndex((e) => e.key === key);
  if (slot >= 0) cooldowns.set(slot, Date.now() + durationMs);
};

const pickFreshKey = (
  exclude?: ReadonlySet<number>
): { key: string; name: string; slot: number } | null => {
  const now = Date.now();
  for (let i = 0; i < keys.length; i++) {
    const slot = (index + i) % keys.length;
    if (exclude?.has(slot)) continue;
    const cooldownUntil = cooldowns.get(slot) ?? 0;
    if (now >= cooldownUntil) {
      index = (slot + 1) % keys.length;
      return { key: keys[slot].key, name: keys[slot].name, slot };
    }
  }
  return null;
};

// Kept for backward compatibility — returns the next non-cooling key, or
// the next slot regardless if all are cooling. Prefer callGemini /
// withGeminiKey, which have proper cooldown handling.
export const nextKey = (): string => {
  const fresh = pickFreshKey();
  if (fresh) return fresh.key;
  index = (index + 1) % keys.length;
  return keys[index].key;
};

export class GeminiError extends Error {
  status: number;
  retryable: boolean;
  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
    this.retryable = retryable;
  }
}

// Model choice (2026-07-18 per-key generateContent probe, all 8 keys):
//   - gemini-2.5-flash 404s ("no longer available to new users") on the
//     newer free-key projects (KEY_6..KEY_8). Google restricts older models
//     to projects with prior usage — and ListModels still LISTS a model the
//     project cannot call, so only a real generateContent proves access.
//   - gemini-3.5-flash is the newest generally-available (non-preview) text
//     model that every free key can actually serve.
//   - Pro-class models are unusable on this rotation: free-tier projects
//     have zero pro quota (429 on every free key), and even paid KEY_1 is
//     404-restricted from gemini-2.5-pro.
const DEFAULT_MODEL = "gemini-3.5-flash";

// Chat is pinned separately: it streams on the paid KEY_1 project, which
// still serves gemini-2.5-flash — verified working and deliberately left
// untouched. A separate const means rotation-model changes never silently
// change chat.
const CHAT_MODEL = "gemini-2.5-flash";

const MAX_ATTEMPTS = 5;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const backoffMs = (attempt: number) =>
  2 ** attempt * 500 + Math.floor(Math.random() * 500);

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
  }>;
};

export type CallGeminiOptions = {
  temperature?: number;
  model?: string;
  onAttempt?: (info: AttemptInfo) => void;
};

export type AttemptInfo = { slot: number; attempt: number; keyName: string };

export type WithGeminiKeyOptions = {
  onAttempt?: (info: AttemptInfo) => void;
};

// Matches Google's 404 bodies for a model this key's project cannot call:
// "This model models/X is no longer available to new users." and
// "models/X is not found for API version v1beta, or is not supported for
// generateContent". A 404 whose body says nothing about a model stays on the
// fail-fast caller-error path.
const MODEL_UNAVAILABLE_RE = /\bmodels?\b/i;

// Generic retry/rotation primitive. Caller provides the request and a
// success-parser; we own the 5-attempt loop, key rotation, 60s cooldown on
// 429, and exponential-backoff-with-jitter between attempts.
//
// Model-availability 404s are handled separately from the attempt budget:
// availability is per-project, so one key rejecting the model says nothing
// about the next. Such a key is excluded for the remainder of THIS call and
// rotation continues immediately (no backoff — nothing is rate-limited);
// the call only fails with 404 once EVERY key has rejected the model.
// Genuine caller errors (400, 403, non-model 404) still fail fast.
export async function withGeminiKey<T>(
  doRequest: (key: string) => Promise<Response>,
  parseSuccess: (res: Response) => Promise<T>,
  opts: WithGeminiKeyOptions = {}
): Promise<T> {
  let lastError: GeminiError | null = null;
  const unavailableSlots = new Set<number>();

  let attempt = 0;
  while (attempt < MAX_ATTEMPTS) {
    if (unavailableSlots.size >= keys.length) {
      throw new GeminiError(
        `None of the ${keys.length} configured Gemini keys can serve the requested model (404 on every key)${
          lastError ? ` — last error: ${lastError.message}` : ""
        }`,
        404,
        false
      );
    }

    const picked = pickFreshKey(unavailableSlots);
    if (!picked) {
      throw new GeminiError(
        "All Gemini keys are rate-limited. Try again in 60s.",
        429,
        true
      );
    }
    opts.onAttempt?.({ slot: picked.slot, attempt, keyName: picked.name });

    let res: Response;
    try {
      res = await doRequest(picked.key);
    } catch (err) {
      lastError = new GeminiError(
        err instanceof Error ? err.message : "Network error",
        0,
        true
      );
      attempt++;
      if (attempt < MAX_ATTEMPTS) await sleep(backoffMs(attempt - 1));
      continue;
    }

    if (res.ok) {
      try {
        return await parseSuccess(res);
      } catch (err) {
        if (err instanceof GeminiError && err.retryable) {
          // A retryable parse failure (e.g. structurally invalid JSON from
          // a flaky model) — an independent resample usually succeeds, so
          // spend an attempt instead of surfacing it to the caller.
          lastError = err;
          attempt++;
          if (attempt < MAX_ATTEMPTS) await sleep(backoffMs(attempt - 1));
          continue;
        }
        if (err instanceof GeminiError) throw err;
        throw new GeminiError(
          err instanceof Error ? err.message : "parse failed",
          502,
          false
        );
      }
    }

    const detail = await res.text().catch(() => "");
    const snippet = detail.slice(0, 200);

    if (res.status === 429) {
      markCooldown(picked.key);
      lastError = new GeminiError(
        "Gemini rate-limited, please retry in 60s",
        429,
        true
      );
      attempt++;
      if (attempt < MAX_ATTEMPTS) await sleep(backoffMs(attempt - 1));
      continue;
    }

    if (res.status === 503 || res.status === 500) {
      lastError = new GeminiError(
        `Gemini temporarily unavailable (${res.status})${snippet ? `: ${snippet}` : ""}`,
        res.status,
        true
      );
      attempt++;
      if (attempt < MAX_ATTEMPTS) await sleep(backoffMs(attempt - 1));
      continue;
    }

    if (res.status === 404 && MODEL_UNAVAILABLE_RE.test(detail)) {
      // This key's project cannot call the model at all (e.g. "no longer
      // available to new users") — a retry on the same key can never
      // succeed, so burn the slot rather than an attempt.
      unavailableSlots.add(picked.slot);
      console.warn(
        `[gemini] ${picked.name} cannot serve the requested model (404) — rotating to the next key`
      );
      lastError = new GeminiError(
        `Gemini error 404${snippet ? `: ${snippet}` : ""}`,
        404,
        false
      );
      continue;
    }

    if (res.status >= 400 && res.status < 500) {
      throw new GeminiError(
        `Gemini error ${res.status}${snippet ? `: ${snippet}` : ""}`,
        res.status,
        false
      );
    }

    lastError = new GeminiError(
      `Gemini error ${res.status}${snippet ? `: ${snippet}` : ""}`,
      res.status,
      true
    );
    attempt++;
    if (attempt < MAX_ATTEMPTS) await sleep(backoffMs(attempt - 1));
  }

  throw lastError ?? new GeminiError("Gemini call failed", 502, true);
}

// ---------------------------------------------------------------------------
// Tier 1 (paid) single-key path — embeddings
// ---------------------------------------------------------------------------

export const getTier1Key = (): string => {
  const k = process.env.GEMINI_KEY_1;
  if (!k) {
    throw new Error(
      "GEMINI_KEY_1 not set — required for Tier 1 (paid) embeddings"
    );
  }
  return k;
};

const TIER1_MAX_ATTEMPTS = 3;

// 1s / 2s / 4s + up to 500ms jitter. No 60s cooldown — at Tier 1 we want
// retries to stay tight, and 429s should be transient anyway.
const tier1BackoffMs = (attempt: number) =>
  2 ** attempt * 1000 + Math.floor(Math.random() * 500);

export type CallGeminiTier1Options = {
  onAttempt?: (attempt: number) => void;
};

export async function callGeminiTier1<T>(
  doRequest: (key: string) => Promise<Response>,
  parseSuccess: (res: Response) => Promise<T>,
  opts: CallGeminiTier1Options = {}
): Promise<T> {
  const key = getTier1Key();
  let lastError: GeminiError | null = null;

  for (let attempt = 0; attempt < TIER1_MAX_ATTEMPTS; attempt++) {
    opts.onAttempt?.(attempt);

    let res: Response;
    try {
      res = await doRequest(key);
    } catch (err) {
      lastError = new GeminiError(
        err instanceof Error ? err.message : "Network error",
        0,
        true
      );
      if (attempt < TIER1_MAX_ATTEMPTS - 1) await sleep(tier1BackoffMs(attempt));
      continue;
    }

    if (res.ok) {
      try {
        return await parseSuccess(res);
      } catch (err) {
        if (err instanceof GeminiError) throw err;
        throw new GeminiError(
          err instanceof Error ? err.message : "parse failed",
          502,
          false
        );
      }
    }

    const detail = await res.text().catch(() => "");
    const snippet = detail.slice(0, 200);

    // 4xx other than 429 are caller errors — no point retrying.
    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      throw new GeminiError(
        `Gemini error ${res.status}${snippet ? `: ${snippet}` : ""}`,
        res.status,
        false
      );
    }

    // 429, 500, 503, and any other 5xx — retry with backoff.
    lastError = new GeminiError(
      res.status === 429
        ? "Gemini rate-limited (Tier 1) — retrying"
        : `Gemini ${res.status}${snippet ? `: ${snippet}` : ""}`,
      res.status,
      true
    );
    if (attempt < TIER1_MAX_ATTEMPTS - 1) await sleep(tier1BackoffMs(attempt));
  }

  throw lastError ?? new GeminiError("Gemini Tier 1 call failed", 502, true);
}

// ---------------------------------------------------------------------------
// Lazy per-key model-availability warning
// ---------------------------------------------------------------------------

// Names any rotation key that cannot serve the model, so a bad key/model
// combination shows up as an explicit warning instead of intermittent
// failures whenever round-robin lands on the wrong key.
//
// ListModels/models.get CANNOT detect this: restricted models are still
// listed on projects that cannot call them (verified 2026-07-18 — all 8 keys
// return identical ListModels sets while generateContent 404s on three of
// them). The only truthful probe is a minimal generateContent call. Runs at
// most once per process per model, off the request path, fire-and-forget;
// cost is one ~1-token request per key.
//
// That cost is real money at the free tier: quotaValue for gemini-3.5-flash
// is 20 requests/day/project (observed 2026-07-18), so one ping sweep burns
// ~7 of the pool's ~140 daily requests — and serverless cold starts would
// repeat it per instance. The proactive sweep therefore runs only in
// development, or when GEMINI_AVAILABILITY_CHECK=1 is set explicitly;
// production diagnosis is covered by the zero-cost warn-on-rotate in
// withGeminiKey, which stays on always.
const availabilityChecked = new Set<string>();

function scheduleKeyAvailabilityCheck(model: string): void {
  const enabled =
    process.env.GEMINI_AVAILABILITY_CHECK === "1" ||
    process.env.NODE_ENV !== "production";
  if (!enabled) return;
  if (availabilityChecked.has(model)) return;
  availabilityChecked.add(model);
  void (async () => {
    for (const { name, key } of keys) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: "ping" }] }],
              generationConfig: { temperature: 0, maxOutputTokens: 1 },
            }),
          }
        );
        if (res.status === 404) {
          const detail = (await res.text().catch(() => ""))
            .replace(/\s+/g, " ")
            .slice(0, 160);
          console.warn(
            `[gemini] availability check: ${name} cannot serve "${model}"${
              detail ? ` — ${detail}` : ""
            }. Rotation skips such keys per call, but fix the key or model to restore full pool capacity.`
          );
        }
        // 200/429/503 prove nothing about entitlement — stay quiet.
      } catch {
        // Diagnostics only — the check must never surface errors.
      }
      await sleep(400);
    }
  })();
}

// ---------------------------------------------------------------------------
// Free-tier multi-key path — parse / score / tailor
// ---------------------------------------------------------------------------

// gemini-3.x+ accepts thinkingConfig.thinkingLevel; older generations reject
// it outright (2.5-flash: 400 "Thinking level is not supported for this
// model"), so the knob must be gated by model generation.
const supportsThinkingLevel = (model: string): boolean =>
  /^gemini-(?:[3-9]|\d{2,})/.test(model);

// Mirror of the routes' fence-stripping, used only for the validity check
// above — the returned text stays raw.
const stripJsonFences = (s: string): string =>
  s
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

export async function callGemini(
  prompt: string,
  opts: CallGeminiOptions = {}
): Promise<string> {
  const model = opts.model ?? DEFAULT_MODEL;
  const temperature = opts.temperature ?? 0.3;
  scheduleKeyAvailabilityCheck(model);

  return withGeminiKey<string>(
    (key) =>
      fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              temperature,
              responseMimeType: "application/json",
              // Without an explicit thinkingLevel, gemini-3.5-flash's JSON
              // mode intermittently emits a truncated payload (finishReason
              // STOP, single part, the closing brace missing) — observed
              // 2026-07-18 at a ~30-40% rate across keys and prompt shapes,
              // including with thinkingBudget:0. thinkingLevel "low" was
              // 20/20 clean in the same harness. Cheaper AND more reliable
              // for these structured parse/score/tailor tasks.
              ...(supportsThinkingLevel(model)
                ? { thinkingConfig: { thinkingLevel: "low" } }
                : {}),
            },
          }),
        }
      ),
    async (res) => {
      const json = (await res.json()) as GeminiResponse;
      // Join ALL non-thought parts, not parts[0] alone: gemini-3.5-flash
      // intermittently splits one JSON answer across multiple parts
      // (observed live 2026-07-18 — the tail part held just the closing
      // brace, so reading parts[0] yielded unparseable JSON). Parts flagged
      // thought:true are reasoning summaries, never answer text.
      const text = (json.candidates?.[0]?.content?.parts ?? [])
        .filter((p) => p.thought !== true)
        .map((p) => p.text ?? "")
        .join("");
      if (!text) {
        throw new GeminiError("Gemini returned no text", 502, false);
      }
      // callGemini is a JSON-only path (responseMimeType is always
      // application/json), yet gemini-3.5-flash occasionally emits a
      // truncated or trailing-garbage payload anyway (observed 2026-07-18,
      // ~5-10% on some prompts, finishReason STOP). Malformed JSON is
      // transient — a resample nearly always parses — so mark it retryable
      // and let the rotation loop retry instead of 502ing the caller.
      // Callers still parse the raw text themselves (incl. fence-stripping).
      try {
        JSON.parse(stripJsonFences(text));
      } catch {
        throw new GeminiError("Gemini returned malformed JSON", 502, true);
      }
      return text;
    },
    { onAttempt: opts.onAttempt }
  );
}

// ---------------------------------------------------------------------------
// Streaming multi-turn — chat
// ---------------------------------------------------------------------------

export type GeminiContent = {
  role: "user" | "model";
  parts: Array<{ text: string }>;
};

export type StreamGeminiOptions = {
  systemInstruction?: string;
  temperature?: number;
  model?: string;
  /** Aborting before the first chunk surfaces as a retryable GeminiError. */
  abortSignal?: AbortSignal;
};

// Chat runs on the paid Tier 1 key through the Vercel AI SDK rather than the
// free rotation: a live conversation can't tolerate the rotation's "all keys
// cooling, retry in 60s" stalls. We map the GeminiContent history onto AI SDK
// ModelMessages and hand back the raw text-delta stream; the caller owns
// persistence and client framing. Deltas come from fullStream via textDeltas,
// not result.textStream: textStream silently drops error parts, so a non-2xx
// used to look like an empty reply. Now any failure throws into the consumer
// — before the first chunk (the route refunds the quota slot) or mid-stream
// (the route pump surfaces it).
//
// Messages are for server logs only (the chat route never forwards them),
// and are scrubbed of key material anyway: a malformed key value is echoed
// verbatim by fetch's header validation ("... is an invalid header value").
const redactKeys = (message: string): string => {
  let out = message;
  for (const { key } of allEntries) out = out.split(key).join("[redacted]");
  return out.replace(/AIza[0-9A-Za-z_-]{8,}/g, "[redacted]");
};

const toGeminiStreamError = (raw: unknown): GeminiError => {
  // After the SDK's own retries a retryable failure arrives wrapped.
  const cause = RetryError.isInstance(raw) ? raw.lastError : raw;
  if (APICallError.isInstance(cause)) {
    return new GeminiError(
      redactKeys(cause.message),
      cause.statusCode ?? 502,
      cause.isRetryable
    );
  }
  const message = cause instanceof Error ? cause.message : "chat stream failed";
  return new GeminiError(redactKeys(message), 502, true);
};

export async function streamGemini(
  contents: GeminiContent[],
  opts: StreamGeminiOptions = {}
): Promise<AsyncIterable<string>> {
  const model = opts.model ?? CHAT_MODEL;
  const google = createGoogleGenerativeAI({ apiKey: getTier1Key() });

  const messages: ModelMessage[] = contents.map((c) => ({
    role: c.role === "model" ? "assistant" : "user",
    content: c.parts.map((p) => p.text).join(""),
  }));

  const result = streamText({
    model: google(model),
    messages,
    temperature: opts.temperature ?? 0.7,
    ...(opts.systemInstruction ? { system: opts.systemInstruction } : {}),
    ...(opts.abortSignal ? { abortSignal: opts.abortSignal } : {}),
  });

  return textDeltas(result.fullStream, toGeminiStreamError);
}
