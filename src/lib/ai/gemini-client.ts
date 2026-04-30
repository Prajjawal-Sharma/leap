// Round-robin Gemini API key pool with per-key cooldowns. The pool is shared
// across the parse and score routes so a 429 on one route penalizes the same
// key everywhere until the cooldown expires.
//
// We target gemini-2.5-flash. The 2.0-flash family was deprecated 2026-03-03
// and shuts down in September 2026.
const keys = [
  process.env.GEMINI_KEY_1,
  process.env.GEMINI_KEY_2,
  process.env.GEMINI_KEY_3,
  process.env.GEMINI_KEY_4,
  process.env.GEMINI_KEY_5,
].filter((k): k is string => Boolean(k));

if (keys.length === 0) {
  throw new Error("No GEMINI_KEY_* env vars found");
}

let index = 0;
const cooldowns = new Map<number, number>();

export const markCooldown = (key: string, durationMs = 60_000) => {
  const slot = keys.indexOf(key);
  if (slot >= 0) cooldowns.set(slot, Date.now() + durationMs);
};

const pickFreshKey = (): string | null => {
  const now = Date.now();
  for (let i = 0; i < keys.length; i++) {
    const slot = (index + i) % keys.length;
    const cooldownUntil = cooldowns.get(slot) ?? 0;
    if (now >= cooldownUntil) {
      index = (slot + 1) % keys.length;
      return keys[slot];
    }
  }
  return null;
};

// Kept for backward compatibility — returns the next non-cooling key, or
// the next slot regardless if all are cooling. Prefer callGemini, which has
// proper cooldown handling.
export const nextKey = (): string => {
  const fresh = pickFreshKey();
  if (fresh) return fresh;
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

export async function callGemini(
  prompt: string,
  opts: CallGeminiOptions = {}
): Promise<string> {
  const model = opts.model ?? DEFAULT_MODEL;
  const temperature = opts.temperature ?? 0.3;

  let lastError: GeminiError | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const key = pickFreshKey();
    if (!key) {
      throw new GeminiError(
        "All Gemini keys are rate-limited. Try again in 60s.",
        429,
        true
      );
    }

    let res: Response;
    try {
      res = await fetch(
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

    if (res.ok) {
      const json = (await res.json()) as GeminiResponse;
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new GeminiError("Gemini returned no text", 502, false);
      }
      return text;
    }

    const detail = await res.text().catch(() => "");
    const snippet = detail.slice(0, 200);

    if (res.status === 429) {
      markCooldown(key);
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
