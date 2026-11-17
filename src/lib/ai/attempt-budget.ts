// Time limits for a Gemini retry loop: how long one attempt may run, and
// whether there is time left to make another. Kept apart from
// gemini-client.ts so the arithmetic can be tested without API keys.

/**
 * An attempt is not started with less than this left before the deadline: a
 * request that is cut off still counts against the key's daily quota, and
 * half an attempt's time is rarely enough to get an answer. With the parse
 * route's numbers (60 s an attempt, 270 s in all) it also means four attempts
 * that all hang are not followed by a fifth.
 */
export const MIN_ATTEMPT_MS = 30_000;

export type AttemptBudget = {
  /** Abort one attempt — the request and reading its body — after this long. */
  attemptTimeoutMs?: number;
  /** Epoch ms by which the whole loop, backoff included, must have ended. */
  deadlineAt?: number;
};

/**
 * The timeout for an attempt starting at `now`. `undefined` means no limit
 * was asked for. `null` means the deadline is too close to start one.
 */
export function attemptTimeout(
  now: number,
  budget: AttemptBudget
): number | undefined | null {
  const { attemptTimeoutMs, deadlineAt } = budget;
  if (deadlineAt === undefined) return attemptTimeoutMs;
  const remaining = deadlineAt - now;
  if (remaining < MIN_ATTEMPT_MS) return null;
  return attemptTimeoutMs === undefined
    ? remaining
    : Math.min(attemptTimeoutMs, remaining);
}

/** A backoff pause that never runs past the deadline. */
export function capBackoff(
  backoffMs: number,
  now: number,
  deadlineAt: number | undefined
): number {
  if (deadlineAt === undefined) return backoffMs;
  return Math.max(0, Math.min(backoffMs, deadlineAt - now));
}
