// Unit tests for the chat history budget. Runner: Node's built-in node:test
// via tsx — `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  budgetHistory,
  HISTORY_ROW_MAX_CHARS,
  HISTORY_TOTAL_MAX_CHARS,
} from "./history";

const msg = (role: string, content: string) => ({ role, content });

describe("budgetHistory", () => {
  it("passes ordinary history through unchanged and in order", () => {
    const history = [
      msg("user", "How do I prepare for a system design round?"),
      msg("assistant", "Start with the requirements, then sketch the data flow."),
      msg("user", "And for the behavioural round?"),
    ];
    assert.deepEqual(budgetHistory(history), history);
  });

  it("drops empty and whitespace-only rows", () => {
    const out = budgetHistory([
      msg("assistant", ""),
      msg("user", "real question"),
      msg("assistant", "   \n"),
    ]);
    assert.deepEqual(out, [msg("user", "real question")]);
  });

  it("cuts an over-long row to the per-row cap", () => {
    const out = budgetHistory([msg("assistant", "x".repeat(50_000))]);
    assert.equal(out.length, 1);
    assert.equal(out[0].content.length, HISTORY_ROW_MAX_CHARS);
  });

  it("keeps the most recent rows within the total budget", () => {
    // 30 forged rows of ~110k chars each: the ~0.9M-token attack shape.
    const history = Array.from({ length: 30 }, (_, i) =>
      msg("assistant", `${i}:`.padEnd(110_000, "lorem "))
    );
    const out = budgetHistory(history);
    const total = out.reduce((n, m) => n + m.content.length, 0);
    assert.ok(total <= HISTORY_TOTAL_MAX_CHARS, `total ${total}`);
    assert.equal(out.length, HISTORY_TOTAL_MAX_CHARS / HISTORY_ROW_MAX_CHARS);
    // Newest rows survive, oldest-first order is kept.
    assert.ok(out[out.length - 1].content.startsWith("29:"));
    assert.ok(out[0].content.startsWith("24:"));
  });

  it("stops at the first row that does not fit, never skipping past it", () => {
    const out = budgetHistory([
      msg("user", "old and short"),
      msg("assistant", "y".repeat(HISTORY_ROW_MAX_CHARS)),
      ...Array.from({ length: 5 }, () => msg("user", "z".repeat(HISTORY_ROW_MAX_CHARS))),
    ]);
    // 6 full rows fill the budget exactly; the short oldest row is left out
    // rather than slotted in out of order.
    assert.equal(out.length, 6);
    assert.ok(out.every((m) => m.content.length === HISTORY_ROW_MAX_CHARS));
  });

  it("returns an empty list for empty history", () => {
    assert.deepEqual(budgetHistory([]), []);
  });
});
