// Bounds the chat history sent to the paid Gemini key. The daily cap limits
// how many calls a user makes; this limits what each call can cost. History
// rows are user-writable (the chat_messages insert-own policy lets a user
// insert any role, any length, any created_at), so without a budget one
// account could pin ~0.9M tokens of filler into every capped call.

/** Longest single history row sent to the model, in characters. */
export const HISTORY_ROW_MAX_CHARS = 8_000;
/** Total characters of history sent per call (~12k tokens). */
export const HISTORY_TOTAL_MAX_CHARS = 48_000;

export type HistoryMessage = { role: string; content: string };

/**
 * Takes chronological history (oldest first) and returns the most recent
 * rows that fit the budget, still oldest first. Rows with no text are
 * dropped: Gemini rejects an empty `parts` array with a 400 for the whole
 * request. Each row is cut to HISTORY_ROW_MAX_CHARS; once the next-older row
 * would exceed HISTORY_TOTAL_MAX_CHARS, it and everything older are left out.
 */
export function budgetHistory<T extends HistoryMessage>(history: T[]): T[] {
  const kept: T[] = [];
  let total = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (typeof m.content !== "string" || m.content.trim() === "") continue;
    const content = m.content.slice(0, HISTORY_ROW_MAX_CHARS);
    if (total + content.length > HISTORY_TOTAL_MAX_CHARS) break;
    total += content.length;
    kept.push(content === m.content ? m : { ...m, content });
  }
  return kept.reverse();
}
