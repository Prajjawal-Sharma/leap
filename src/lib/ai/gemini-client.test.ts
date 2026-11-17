// Unit tests for the time limits in withGeminiKey. Runner: Node's built-in
// node:test via tsx — `npm test`. No network: the request function is passed
// in, and these tests pass their own.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

type Client = typeof import("./gemini-client");
let client: Client;
let keepAlive: ReturnType<typeof setInterval>;

before(async () => {
  // gemini-client reads its keys once, when it is first loaded, and refuses to
  // load without one — so the key is set first and the import comes after.
  process.env.GEMINI_KEY_2 ??= "test-key";
  client = await import("./gemini-client");
  // AbortSignal.timeout does not keep the process alive on its own. A real
  // request holds a socket open while it waits; the stand-ins below hold
  // nothing, so this does it for them.
  keepAlive = setInterval(() => {}, 1_000);
});

after(() => clearInterval(keepAlive));

const ok = () => new Response(JSON.stringify({ answer: 42 }));
const readJson = (res: Response) => res.json() as Promise<{ answer: number }>;

// A request that sends nothing until it is aborted.
const hang = (signal?: AbortSignal) =>
  new Promise<Response>((_, reject) => {
    signal?.addEventListener("abort", () => reject(signal.reason));
  });

// A response whose headers arrive and whose body then stalls until aborted,
// which is what fetch gives when its signal fires mid-body.
const stalledBody = (status: number, signal?: AbortSignal) =>
  new Response(
    new ReadableStream({
      start(controller) {
        signal?.addEventListener("abort", () => controller.error(signal.reason));
      },
    }),
    { status }
  );

describe("withGeminiKey without a time budget", () => {
  it("passes no abort signal, as before the budget existed", async () => {
    const signals: Array<AbortSignal | undefined> = [];
    const result = await client.withGeminiKey(async (_key, signal) => {
      signals.push(signal);
      return ok();
    }, readJson);
    assert.deepEqual(result, { answer: 42 });
    assert.deepEqual(signals, [undefined]);
  });
});

describe("withGeminiKey with attemptTimeoutMs", () => {
  it("abandons a request that does not answer and tries again", async () => {
    let calls = 0;
    const result = await client.withGeminiKey(
      (_key, signal) => (++calls === 1 ? hang(signal) : Promise.resolve(ok())),
      readJson,
      { attemptTimeoutMs: 40 }
    );
    assert.deepEqual(result, { answer: 42 });
    assert.equal(calls, 2);
  });

  it("tries again when the body stops arriving after the headers", async () => {
    let calls = 0;
    const result = await client.withGeminiKey(
      async (_key, signal) => (++calls === 1 ? stalledBody(200, signal) : ok()),
      readJson,
      { attemptTimeoutMs: 40 }
    );
    assert.deepEqual(result, { answer: 42 });
    assert.equal(calls, 2);
  });

  it("treats an error response cut off mid-body as a timeout, not a caller error", async () => {
    let calls = 0;
    const result = await client.withGeminiKey(
      async (_key, signal) => (++calls === 1 ? stalledBody(404, signal) : ok()),
      readJson,
      { attemptTimeoutMs: 40 }
    );
    assert.deepEqual(result, { answer: 42 });
    assert.equal(calls, 2);
  });
});

describe("withGeminiKey with deadlineAt", () => {
  it("makes no request when too little time is left, and says so retryably", async () => {
    let calls = 0;
    await assert.rejects(
      client.withGeminiKey(
        async () => {
          calls++;
          return ok();
        },
        readJson,
        { attemptTimeoutMs: 60_000, deadlineAt: Date.now() + 1_000 }
      ),
      (err: unknown) => {
        assert.ok(err instanceof client.GeminiError);
        assert.equal(err.status, 504);
        assert.equal(err.retryable, true);
        return true;
      }
    );
    assert.equal(calls, 0);
  });

  it("reports the timeout of the last attempt once the deadline is reached", async () => {
    // Enough time for one attempt and no more: the attempt is cut at its
    // 40 ms limit, the backoff runs into the deadline, and the loop stops.
    let calls = 0;
    const started = Date.now();
    await assert.rejects(
      client.withGeminiKey(
        (_key, signal) => {
          calls++;
          return hang(signal);
        },
        readJson,
        { attemptTimeoutMs: 40, deadlineAt: started + 30_400 }
      ),
      (err: unknown) => {
        assert.ok(err instanceof client.GeminiError);
        assert.equal(err.message, "Gemini request timed out");
        assert.equal(err.retryable, true);
        return true;
      }
    );
    assert.equal(calls, 1);
    assert.ok(Date.now() - started < 5_000, "did not wait out the deadline");
  });
});
