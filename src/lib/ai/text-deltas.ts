// Turns an AI SDK `fullStream` into plain text deltas that THROW on failure.
//
// Why not `result.textStream`: in ai@6 it forwards only text-delta parts and
// silently drops `error` parts, so a non-2xx from Gemini (bad key, quota,
// 5xx after the SDK's own retries) reaches the consumer as an empty stream
// that ends normally. The chat route could not tell "the model failed" from
// "the model said nothing", so its error paths never ran and a failed call
// could not be refunded against the daily cap.
//
// Kept free of imports so it is unit-testable without gemini-client.ts, which
// throws at import time when no GEMINI_KEY_* env var is set.

/** The subset of the AI SDK's TextStreamPart this consumer reads. */
export type StreamPartLike =
  | { type: "text-delta"; text: string }
  | { type: "error"; error: unknown }
  | { type: "abort"; reason?: string }
  | { type: string };

const defaultToError = (raw: unknown): Error =>
  raw instanceof Error ? raw : new Error("model stream failed");

/**
 * Yields each non-empty text delta as soon as it arrives — no buffering — and
 * throws on the first `error` or `abort` part. Empty deltas are skipped so a
 * consumer that waits for the first chunk always waits for real text. A
 * rejection from the source itself (a reset connection surfaces as a bare
 * TypeError) goes through `toError` too, so callers see one error type.
 */
export async function* textDeltas(
  parts: AsyncIterable<StreamPartLike>,
  toError: (raw: unknown) => Error = defaultToError
): AsyncGenerator<string, void, undefined> {
  const source = parts[Symbol.asyncIterator]();
  let exhausted = false;
  try {
    for (;;) {
      let step: IteratorResult<StreamPartLike>;
      try {
        step = await source.next();
      } catch (raw) {
        exhausted = true;
        throw toError(raw);
      }
      if (step.done) {
        exhausted = true;
        return;
      }
      const part = step.value;
      if (part.type === "text-delta") {
        const { text } = part as { text: unknown };
        if (typeof text === "string" && text.length > 0) yield text;
      } else if (part.type === "error") {
        throw toError((part as { error: unknown }).error);
      } else if (part.type === "abort") {
        throw toError(new Error("model stream aborted"));
      }
    }
  } finally {
    // Stopped early (consumer broke out, or an error part): release the
    // source the way for-await would have.
    if (!exhausted) {
      try {
        await source.return?.();
      } catch {
        // The error already on its way out is the one that matters.
      }
    }
  }
}
