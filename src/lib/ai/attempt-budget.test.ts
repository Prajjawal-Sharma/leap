// Unit tests for the Gemini attempt budget. Runner: Node's built-in
// node:test via tsx — `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { attemptTimeout, capBackoff, MIN_ATTEMPT_MS } from "./attempt-budget";

const T0 = 1_800_000_000_000;

describe("attemptTimeout", () => {
  it("sets no limit when none was asked for", () => {
    assert.equal(attemptTimeout(T0, {}), undefined);
  });
  it("uses the per-attempt limit when there is no deadline", () => {
    assert.equal(attemptTimeout(T0, { attemptTimeoutMs: 60_000 }), 60_000);
  });
  it("uses the time left when only a deadline was given", () => {
    assert.equal(attemptTimeout(T0, { deadlineAt: T0 + 90_000 }), 90_000);
  });
  it("uses the smaller of the per-attempt limit and the time left", () => {
    const budget = { attemptTimeoutMs: 60_000, deadlineAt: T0 + 270_000 };
    assert.equal(attemptTimeout(T0, budget), 60_000);
    assert.equal(attemptTimeout(T0 + 230_000, budget), 40_000);
  });
  it("refuses to start with less than the minimum left", () => {
    const budget = { attemptTimeoutMs: 60_000, deadlineAt: T0 + 270_000 };
    assert.equal(attemptTimeout(T0 + 270_000 - MIN_ATTEMPT_MS, budget), MIN_ATTEMPT_MS);
    assert.equal(attemptTimeout(T0 + 270_000 - MIN_ATTEMPT_MS + 1, budget), null);
    assert.equal(attemptTimeout(T0 + 270_000, budget), null);
    assert.equal(attemptTimeout(T0 + 999_999, budget), null);
  });
});

describe("capBackoff", () => {
  it("leaves the pause alone when there is no deadline", () => {
    assert.equal(capBackoff(4_000, T0, undefined), 4_000);
  });
  it("leaves the pause alone when it ends before the deadline", () => {
    assert.equal(capBackoff(4_000, T0, T0 + 10_000), 4_000);
  });
  it("shortens a pause that would run past the deadline", () => {
    assert.equal(capBackoff(4_000, T0, T0 + 1_500), 1_500);
  });
  it("does not pause at all once the deadline has passed", () => {
    assert.equal(capBackoff(4_000, T0, T0), 0);
    assert.equal(capBackoff(4_000, T0, T0 - 5_000), 0);
  });
});

// The parse route's numbers: a 300 s function limit, a deadline 270 s after
// the request arrived, 60 s per attempt, five attempts, and the client's
// backoff of 2^n * 500 ms plus up to 500 ms of jitter. Replays the loop in
// gemini-client.ts against a clock, with every attempt running to its
// timeout — the slowest the loop can be.
function slowestLoop(spentBeforeGeminiMs: number) {
  const deadlineAt = T0 + 270_000;
  const budget = { attemptTimeoutMs: 60_000, deadlineAt };
  let now = T0 + spentBeforeGeminiMs;
  let attempts = 0;
  while (attempts < 5) {
    const timeout = attemptTimeout(now, budget);
    if (timeout === null) break;
    assert.ok(timeout !== undefined && timeout <= 60_000);
    now += timeout;
    attempts++;
    if (attempts < 5) now += capBackoff(2 ** (attempts - 1) * 500 + 500, now, deadlineAt);
  }
  return { attempts, endedAfterMs: now - T0 };
}

describe("the parse route's time budget", () => {
  it("ends inside the 270 s deadline when every attempt times out", () => {
    for (const spent of [0, 2_000, 10_000, 45_000, 120_000, 249_000]) {
      const { endedAfterMs } = slowestLoop(spent);
      assert.ok(endedAfterMs <= 270_000, `spent ${spent}: ended at ${endedAfterMs}`);
    }
  });
  it("fits four full attempts after a normal download and extraction", () => {
    assert.deepEqual(slowestLoop(5_000), { attempts: 4, endedAfterMs: 254_500 });
  });
  it("makes no attempt when the earlier steps used the time", () => {
    assert.equal(slowestLoop(255_000).attempts, 0);
    assert.equal(slowestLoop(400_000).attempts, 0);
  });
});
