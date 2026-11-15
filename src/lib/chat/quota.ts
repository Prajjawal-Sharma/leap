// Pure helpers for the daily chat cap. The count itself lives in
// public.chat_usage (migration 0007) and is moved only by the
// consume_chat_quota / refund_chat_quota functions; these helpers compute the
// day boundary the route reports and the message the client shows.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The UTC calendar day of `now` as `YYYY-MM-DD` — the `day` key in chat_usage. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** The first instant of the UTC day after `now`: when the cap resets. */
export function nextUtcMidnight(now: Date): Date {
  const start = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  return new Date(start + MS_PER_DAY);
}

/**
 * Formats a reset instant in the viewer's own time zone, e.g. "5:30 AM".
 * Returns null for anything that is not a valid ISO timestamp so the caller
 * can fall back to the generic message. `locales` and `timeZone` exist for
 * tests; the UI passes neither and gets the browser's own settings.
 */
export function formatResetTime(
  resetsAt: unknown,
  locales: string[] = [],
  timeZone?: string
): string | null {
  if (typeof resetsAt !== "string" || resetsAt.length === 0) return null;
  const when = new Date(resetsAt);
  if (Number.isNaN(when.getTime())) return null;
  return when.toLocaleTimeString(locales, {
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });
}

/** The notice shown when the API answers 429 daily_limit_reached. */
export function dailyLimitMessage(
  limit: number,
  resetsAt: unknown,
  locales: string[] = [],
  timeZone?: string
): string {
  const at = formatResetTime(resetsAt, locales, timeZone);
  if (at === null) {
    return `You've reached today's chat limit (${limit} messages). It resets at midnight UTC.`;
  }
  return `You've used today's ${limit} messages. You can chat again at ${at}.`;
}
