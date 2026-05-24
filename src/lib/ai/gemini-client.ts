// Two parallel call paths into the Gemini API:
//
//   1. Free-tier multi-key rotation (callGemini / withGeminiKey).
//      Resume parse + score still run here. Per-project free-tier limits
//      hover around 10–15 RPM, so we round-robin across GEMINI_KEY_1..KEY_8
//      and use 60s cooldowns + exponential backoff to ride out 429s.
//
//   2. Tier 1 paid single-key (callGeminiTier1 / getTier1Key).
//      GEMINI_KEY_1's project was upgraded to Gemini API Tier 1 (paid),
//      ~3000 RPM. Embeddings run here — there's no point rotating, and the
//      per-key cooldown machinery would actively get in the way under heavy
//      throughput. Simple 3-attempt backoff is enough.
//
// Generation calls target gemini-2.5-flash. The 2.0-flash family was
// deprecated 2026-03-03 and shuts down in September 2026.
//
// Pool reads GEMINI_KEY_1..GEMINI_KEY_8. Only populated entries are used,
// so adding a sixth/seventh/eighth key in env is a no-restart change to env
// vars and a redeploy. Rotation, cooldown, and backoff are size-agnostic.
const keys = [
  process.env.GEMINI_KEY_1,
  process.env.GEMINI_KEY_2,
  process.env.GEMINI_KEY_3,
  process.env.GEMINI_KEY_4,
  process.env.GEMINI_KEY_5,
  process.env.GEMINI_KEY_6,
  process.env.GEMINI_KEY_7,
  process.env.GEMINI_KEY_8,
].filter((k): k is string => Boolean(k));

if (keys.length === 0) {
  throw new Error("No GEMINI_KEY_* env vars found");
}

let index = 0;
const cooldowns = new Map<number, number>();

export const getKeyCount = (): number => keys.length;

export const markCooldown = (key: string, durationMs = 60_000) => {
  const slot = keys.indexOf(key);
  if (slot >= 0) cooldowns.set(slot, Date.now() + durationMs);
};

const pickFreshKey = (): { key: string; slot: number } | null => {
  const now = Date.now();
  for (let i = 0; i < keys.length; i++) {
    const slot = (index + i) % keys.length;
    const cooldownUntil = cooldowns.get(slot) ?? 0;
    if (now >= cooldownUntil) {
      index = (slot + 1) % keys.length;
      return { key: keys[slot], slot };
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
  return keys[index];
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

const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_ATTEMPTS = 5;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const backoffMs = (attempt: number) =>
  2 ** attempt * 500 + Math.floor(Math.random() * 500);

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
};

export type CallGeminiOptions = {
  temperature?: number;
  model?: string;
};

export type AttemptInfo = { slot: number; attempt: number };

export type WithGeminiKeyOptions = {
  onAttempt?: (info: AttemptInfo) => void;
};

// Generic retry/rotation primitive. Caller provides the request and a
// success-parser; we own the 5-attempt loop, key rotation, 60s cooldown on
// 429, and exponential-backoff-with-jitter between attempts.
export async function withGeminiKey<T>(
  doRequest: (key: string) => Promise<Response>,
  parseSuccess: (res: Response) => Promise<T>,
  opts: WithGeminiKeyOptions = {}
): Promise<T> {
  let lastError: GeminiError | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const picked = pickFreshKey();
    if (!picked) {
      throw new GeminiError(
        "All Gemini keys are rate-limited. Try again in 60s.",
        429,
        true
      );
    }
    opts.onAttempt?.({ slot: picked.slot, attempt });

    let res: Response;
    try {
      res = await doRequest(picked.key);
    } catch (err) {
      lastError = new GeminiError(
        err instanceof Error ? err.message : "Network error",
        0,
        true
      );
      if (attempt < MAX_ATTEMPTS - 1) await sleep(backoffMs(attempt));
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

    if (res.status === 429) {
      markCooldown(picked.key);
      lastError = new GeminiError(
        "Gemini rate-limited, please retry in 60s",
        429,
        true
      );
      if (attempt < MAX_ATTEMPTS - 1) await sleep(backoffMs(attempt));
      continue;
    }

    if (res.status === 503 || res.status === 500) {
      lastError = new GeminiError(
        `Gemini temporarily unavailable (${res.status})${snippet ? `: ${snippet}` : ""}`,
        res.status,
        true
      );
      if (attempt < MAX_ATTEMPTS - 1) await sleep(backoffMs(attempt));
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
    if (attempt < MAX_ATTEMPTS - 1) await sleep(backoffMs(attempt));
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
// Free-tier multi-key path — chat / parse / score
// ---------------------------------------------------------------------------

export async function callGemini(
  prompt: string,
  opts: CallGeminiOptions = {}
): Promise<string> {
  const model = opts.model ?? DEFAULT_MODEL;
  const temperature = opts.temperature ?? 0.3;

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
            },
          }),
        }
      ),
    async (res) => {
      const json = (await res.json()) as GeminiResponse;
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new GeminiError("Gemini returned no text", 502, false);
      }
      return text;
    }
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
};

// Retry behaviour mirrors withGeminiKey: rotate keys + backoff on
// 429/5xx/network until the stream opens. Once data starts flowing,
// mid-stream failures terminate the iterator — recovery would require
// re-sending the full prompt under a new key, which loses partial output
// and is not worth the complexity at v1.
export async function streamGemini(
  contents: GeminiContent[],
  opts: StreamGeminiOptions = {}
): Promise<AsyncIterable<string>> {
  const model = opts.model ?? DEFAULT_MODEL;
  const temperature = opts.temperature ?? 0.7;
  const body = JSON.stringify({
    contents,
    generationConfig: { temperature },
    ...(opts.systemInstruction
      ? { systemInstruction: { parts: [{ text: opts.systemInstruction }] } }
      : {}),
  });

  let lastError: GeminiError | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const picked = pickFreshKey();
    if (!picked) {
      throw new GeminiError(
        "All Gemini keys are rate-limited. Try again in 60s.",
        429,
        true
      );
    }

    let res: Response;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${picked.key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        }
      );
    } catch (err) {
      lastError = new GeminiError(
        err instanceof Error ? err.message : "Network error",
        0,
        true
      );
      if (attempt < MAX_ATTEMPTS - 1) await sleep(backoffMs(attempt));
      continue;
    }

    if (res.ok && res.body) {
      return parseSSEStream(res.body);
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
      if (attempt < MAX_ATTEMPTS - 1) await sleep(backoffMs(attempt));
      continue;
    }

    if (res.status === 500 || res.status === 503) {
      lastError = new GeminiError(
        `Gemini temporarily unavailable (${res.status})${snippet ? `: ${snippet}` : ""}`,
        res.status,
        true
      );
      if (attempt < MAX_ATTEMPTS - 1) await sleep(backoffMs(attempt));
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
    if (attempt < MAX_ATTEMPTS - 1) await sleep(backoffMs(attempt));
  }

  throw lastError ?? new GeminiError("Gemini stream failed", 502, true);
}

async function* parseSSEStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<string, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep = buffer.indexOf("\n\n");
      while (sep !== -1) {
        const eventBlock = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);

        const dataLines = eventBlock
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trimStart());

        sep = buffer.indexOf("\n\n");
        if (dataLines.length === 0) continue;

        const payload = dataLines.join("\n");
        if (payload === "[DONE]") return;

        try {
          const obj = JSON.parse(payload) as GeminiResponse;
          const text = obj.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) yield text;
        } catch {
          // Skip malformed SSE chunks rather than failing the whole stream.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
