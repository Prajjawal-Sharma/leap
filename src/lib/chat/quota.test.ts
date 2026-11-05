// Unit tests for the chat-cap helpers. Runner: Node's built-in node:test via
// tsx — `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  dailyLimitMessage,
  formatResetTime,
  nextUtcMidnight,
  utcDay,
} from "./quota";

describe("utcDay", () => {
  it("uses the UTC date, not the local one", () => {
    // 23:30 on the 25th in UTC is already the 26th in India.
    assert.equal(utcDay(new Date("2026-10-25T23:30:00Z")), "2026-10-25");
  });
  it("rolls over exactly at UTC midnight", () => {
    assert.equal(utcDay(new Date("2026-10-26T00:00:00.000Z")), "2026-10-26");
    assert.equal(utcDay(new Date("2026-10-25T23:59:59.999Z")), "2026-10-25");
  });
});

describe("nextUtcMidnight", () => {
  it("returns the start of the next UTC day", () => {
    assert.equal(
      nextUtcMidnight(new Date("2026-10-25T09:15:00Z")).toISOString(),
      "2026-10-26T00:00:00.000Z"
    );
  });
  it("moves a full day forward when called exactly at midnight", () => {
    assert.equal(
      nextUtcMidnight(new Date("2026-10-26T00:00:00.000Z")).toISOString(),
      "2026-10-27T00:00:00.000Z"
    );
  });
  it("crosses month and year ends", () => {
    assert.equal(
      nextUtcMidnight(new Date("2026-12-31T23:59:59Z")).toISOString(),
      "2027-01-01T00:00:00.000Z"
    );
    assert.equal(
      nextUtcMidnight(new Date("2028-02-28T12:00:00Z")).toISOString(),
      "2028-02-29T00:00:00.000Z"
    );
  });
  it("agrees with utcDay on the following day", () => {
    const now = new Date("2026-03-08T07:00:00Z");
    assert.equal(utcDay(nextUtcMidnight(now)), "2026-03-09");
  });
});

describe("formatResetTime", () => {
  const resetsAt = "2026-10-26T00:00:00.000Z";

  it("formats in the viewer's time zone", () => {
    assert.equal(
      formatResetTime(resetsAt, ["en-US"], "Asia/Kolkata"),
      "5:30 AM"
    );
    assert.equal(
      formatResetTime(resetsAt, ["en-US"], "America/Los_Angeles"),
      "5:00 PM"
    );
  });
  it("returns null for missing or malformed values", () => {
    assert.equal(formatResetTime(undefined), null);
    assert.equal(formatResetTime(""), null);
    assert.equal(formatResetTime(1761436800000), null);
    assert.equal(formatResetTime("not a date"), null);
  });
});

describe("dailyLimitMessage", () => {
  it("names the local reset time when resets_at is present", () => {
    assert.equal(
      dailyLimitMessage(
        30,
        "2026-10-26T00:00:00.000Z",
        ["en-US"],
        "Asia/Kolkata"
      ),
      "You've used today's 30 messages. You can chat again at 5:30 AM."
    );
  });
  it("falls back to the original text when resets_at is missing", () => {
    assert.equal(
      dailyLimitMessage(30, undefined),
      "You've reached today's chat limit (30 messages). It resets at midnight UTC."
    );
  });
});
