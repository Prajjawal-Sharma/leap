// Unit tests for textDeltas — the throw-on-error-part adapter streamGemini
// uses. Runner: Node's built-in node:test via tsx — `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { textDeltas, type StreamPartLike } from "./text-deltas";

async function* fake(parts: StreamPartLike[]): AsyncGenerator<StreamPartLike> {
  for (const part of parts) yield part;
}

async function collect(
  it: AsyncIterable<string>
): Promise<{ chunks: string[]; error: unknown }> {
  const chunks: string[] = [];
  try {
    for await (const chunk of it) chunks.push(chunk);
  } catch (error) {
    return { chunks, error };
  }
  return { chunks, error: undefined };
}

describe("textDeltas", () => {
  it("yields text deltas in order and ignores other part types", async () => {
    const { chunks, error } = await collect(
      textDeltas(
        fake([
          { type: "start" },
          { type: "text-start" },
          { type: "text-delta", text: "Hel" },
          { type: "reasoning-delta" },
          { type: "text-delta", text: "lo" },
          { type: "text-end" },
          { type: "finish" },
        ])
      )
    );
    assert.equal(error, undefined);
    assert.deepEqual(chunks, ["Hel", "lo"]);
  });

  // The pre-stream failure the chat route refunds: a non-2xx arrives as an
  // error part before any text.
  it("throws on an error part before any text", async () => {
    const apiError = Object.assign(new Error("API key not valid"), {
      statusCode: 400,
    });
    const { chunks, error } = await collect(
      textDeltas(fake([{ type: "start" }, { type: "error", error: apiError }]))
    );
    assert.deepEqual(chunks, []);
    assert.equal(error, apiError);
  });

  it("throws mid-stream after the text already yielded", async () => {
    const { chunks, error } = await collect(
      textDeltas(
        fake([
          { type: "text-delta", text: "partial " },
          { type: "error", error: new Error("connection reset") },
          { type: "text-delta", text: "never seen" },
        ])
      )
    );
    assert.deepEqual(chunks, ["partial "]);
    assert.ok(error instanceof Error);
    assert.equal(error.message, "connection reset");
  });

  it("maps the raw error through toError", async () => {
    const { error } = await collect(
      textDeltas(fake([{ type: "error", error: { code: 503 } }]), (raw) =>
        Object.assign(new Error("mapped"), { raw })
      )
    );
    assert.ok(error instanceof Error);
    assert.equal(error.message, "mapped");
    assert.deepEqual((error as Error & { raw: unknown }).raw, { code: 503 });
  });

  it("wraps a non-Error error part in an Error by default", async () => {
    const { error } = await collect(
      textDeltas(fake([{ type: "error", error: "boom" }]))
    );
    assert.ok(error instanceof Error);
  });

  it("maps a rejection from the source itself through toError", async () => {
    async function* broken(): AsyncGenerator<StreamPartLike> {
      yield { type: "text-delta", text: "a" };
      throw new TypeError("terminated");
    }
    const { chunks, error } = await collect(
      textDeltas(broken(), (raw) =>
        Object.assign(new Error("mapped"), { raw })
      )
    );
    assert.deepEqual(chunks, ["a"]);
    assert.ok(error instanceof Error);
    assert.equal(error.message, "mapped");
    assert.ok((error as Error & { raw: unknown }).raw instanceof TypeError);
  });

  it("releases the source when the consumer stops early", async () => {
    let released = false;
    async function* source(): AsyncGenerator<StreamPartLike> {
      try {
        yield { type: "text-delta", text: "a" };
        yield { type: "text-delta", text: "b" };
      } finally {
        released = true;
      }
    }
    for await (const chunk of textDeltas(source())) {
      assert.equal(chunk, "a");
      break;
    }
    assert.equal(released, true);
  });

  it("throws on an abort part", async () => {
    const { chunks, error } = await collect(
      textDeltas(fake([{ type: "text-delta", text: "a" }, { type: "abort" }]))
    );
    assert.deepEqual(chunks, ["a"]);
    assert.ok(error instanceof Error);
  });

  // An empty delta must not count as "something was streamed": the route
  // waits for the first chunk to decide whether a failure is refundable.
  it("skips empty deltas so the first chunk is real text", async () => {
    const iterator = textDeltas(
      fake([
        { type: "text-delta", text: "" },
        { type: "error", error: new Error("quota") },
      ])
    )[Symbol.asyncIterator]();
    await assert.rejects(iterator.next(), /quota/);
  });

  // No buffering: the first delta is available before the source finishes.
  it("yields the first delta before the source has produced the rest", async () => {
    let releaseRest!: () => void;
    const gate = new Promise<void>((r) => (releaseRest = r));
    async function* slow(): AsyncGenerator<StreamPartLike> {
      yield { type: "text-delta", text: "first" };
      await gate;
      yield { type: "text-delta", text: "second" };
    }
    const iterator = textDeltas(slow())[Symbol.asyncIterator]();
    assert.deepEqual(await iterator.next(), { value: "first", done: false });
    releaseRest();
    assert.deepEqual(await iterator.next(), { value: "second", done: false });
    assert.equal((await iterator.next()).done, true);
  });
});
