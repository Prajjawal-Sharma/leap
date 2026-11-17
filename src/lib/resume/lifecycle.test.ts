// Unit tests for the résumé lifecycle helpers. Runner: Node's built-in
// node:test via tsx — `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ABANDONED_AFTER_MS,
  pickResumeView,
  removablePaths,
  resumeStatus,
  selectAbandoned,
  type CleanupCandidate,
} from "./lifecycle";

const PARSED = { full_name: "Jane Doe" };

describe("resumeStatus", () => {
  it("is parsed only when parse and score are both saved", () => {
    assert.equal(
      resumeStatus({ parsed_content: PARSED, ats_score: 72, parse_error: null }),
      "parsed"
    );
    assert.equal(
      resumeStatus({ parsed_content: PARSED, ats_score: 0, parse_error: null }),
      "parsed"
    );
  });
  it("is pending for a new upload", () => {
    assert.equal(
      resumeStatus({ parsed_content: null, ats_score: null, parse_error: null }),
      "pending"
    );
  });
  it("is pending for an old row that has a parse but no score", () => {
    assert.equal(
      resumeStatus({ parsed_content: PARSED, ats_score: null, parse_error: null }),
      "pending"
    );
  });
  it("is failed when the file could not be read", () => {
    assert.equal(
      resumeStatus({ parsed_content: null, ats_score: null, parse_error: "no_text" }),
      "failed"
    );
    assert.equal(
      resumeStatus({ parsed_content: null, ats_score: null, parse_error: "unreadable" }),
      "failed"
    );
  });
  it("is parsed even if an old failure mark was left behind", () => {
    assert.equal(
      resumeStatus({ parsed_content: PARSED, ats_score: 72, parse_error: "no_text" }),
      "parsed"
    );
  });
});

const NOW = Date.parse("2026-11-16T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const HOUR = 60 * 60 * 1000;

const candidate = (over: Partial<CleanupCandidate>): CleanupCandidate => ({
  id: "row",
  is_primary: false,
  parsed_content: null,
  created_at: ago(2 * HOUR),
  ...over,
});

describe("selectAbandoned", () => {
  it("uses a one-hour window", () => {
    assert.equal(ABANDONED_AFTER_MS, HOUR);
  });
  it("selects an unparsed, non-primary upload older than an hour", () => {
    assert.deepEqual(selectAbandoned([candidate({ id: "old" })], NOW), ["old"]);
  });
  it("keeps an upload that is an hour old or younger", () => {
    const rows = [
      candidate({ id: "just-now", created_at: ago(1000) }),
      candidate({ id: "59-min", created_at: ago(59 * 60 * 1000) }),
      candidate({ id: "exactly-1h", created_at: ago(HOUR) }),
      candidate({ id: "1h-and-1ms", created_at: ago(HOUR + 1) }),
    ];
    assert.deepEqual(selectAbandoned(rows, NOW), ["1h-and-1ms"]);
  });
  it("keeps the primary, however old and unparsed", () => {
    const rows = [candidate({ id: "primary", is_primary: true, created_at: ago(90 * 24 * HOUR) })];
    assert.deepEqual(selectAbandoned(rows, NOW), []);
  });
  it("keeps anything that has been parsed", () => {
    const rows = [candidate({ id: "parsed", parsed_content: PARSED })];
    assert.deepEqual(selectAbandoned(rows, NOW), []);
  });
  it("keeps the row the upload just created", () => {
    const rows = [candidate({ id: "new" }), candidate({ id: "old" })];
    assert.deepEqual(selectAbandoned(rows, NOW, "new"), ["old"]);
  });
  it("keeps a row whose age cannot be read", () => {
    const rows = [
      candidate({ id: "bad-date", created_at: "not a date" }),
      candidate({ id: "empty-date", created_at: "" }),
      candidate({ id: "future", created_at: new Date(NOW + HOUR).toISOString() }),
    ];
    assert.deepEqual(selectAbandoned(rows, NOW), []);
  });
  it("returns ids in the order given, and nothing for no rows", () => {
    const rows = [candidate({ id: "b" }), candidate({ id: "a" }), candidate({ id: "c" })];
    assert.deepEqual(selectAbandoned(rows, NOW), ["b", "a", "c"]);
    assert.deepEqual(selectAbandoned([], NOW), []);
  });
});

describe("removablePaths", () => {
  it("returns the files of the rows that were deleted", () => {
    assert.deepEqual(removablePaths(["u/1-a.pdf", "u/2-b.pdf"], []), [
      "u/1-a.pdf",
      "u/2-b.pdf",
    ]);
  });
  it("keeps a file that a row left behind still names", () => {
    assert.deepEqual(
      removablePaths(["u/1-a.pdf", "u/2-primary.pdf"], ["u/2-primary.pdf"]),
      ["u/1-a.pdf"]
    );
  });
  it("lists a file once when several deleted rows named it", () => {
    assert.deepEqual(removablePaths(["u/1-a.pdf", "u/1-a.pdf"], []), ["u/1-a.pdf"]);
  });
  it("returns nothing when nothing was deleted or every file is still named", () => {
    assert.deepEqual(removablePaths([], ["u/1-a.pdf"]), []);
    assert.deepEqual(removablePaths(["u/1-a.pdf"], ["u/1-a.pdf"]), []);
  });
});

type Row = {
  id: string;
  is_primary: boolean;
  parsed_content: unknown;
  ats_score: number | null;
  parse_error: string | null;
};

const parsed = (id: string, isPrimary = false): Row => ({
  id,
  is_primary: isPrimary,
  parsed_content: PARSED,
  ats_score: 70,
  parse_error: null,
});
const pending = (id: string, isPrimary = false): Row => ({
  id,
  is_primary: isPrimary,
  parsed_content: null,
  ats_score: null,
  parse_error: null,
});
const failed = (id: string): Row => ({ ...pending(id), parse_error: "no_text" });

const ids = (view: ReturnType<typeof pickResumeView<Row>>) => ({
  shown: view.shown?.id ?? null,
  pending: view.pending?.id ?? null,
  failed: view.failed?.id ?? null,
});

// Rows are newest first, as /api/resume/list returns them.
describe("pickResumeView", () => {
  it("shows nothing when there are no uploads", () => {
    assert.deepEqual(ids(pickResumeView<Row>([])), {
      shown: null,
      pending: null,
      failed: null,
    });
  });
  it("shows the parsed primary", () => {
    assert.deepEqual(ids(pickResumeView([parsed("new", true), parsed("old")])), {
      shown: "new",
      pending: null,
      failed: null,
    });
  });
  it("reports a first upload that has not been processed", () => {
    assert.deepEqual(ids(pickResumeView([pending("first")])), {
      shown: null,
      pending: "first",
      failed: null,
    });
  });
  it("reports a newer unprocessed upload beside the résumé still in use", () => {
    const view = pickResumeView([pending("new"), parsed("old", true)]);
    assert.deepEqual(ids(view), { shown: "old", pending: "new", failed: null });
  });
  it("reports a newer upload that could not be read beside the current résumé", () => {
    const view = pickResumeView([failed("scan"), parsed("old", true)]);
    assert.deepEqual(ids(view), { shown: "old", pending: null, failed: "scan" });
  });
  it("ignores an unprocessed upload once a newer one has been parsed", () => {
    const view = pickResumeView([parsed("new", true), pending("stale"), failed("scan")]);
    assert.deepEqual(ids(view), { shown: "new", pending: null, failed: null });
  });
  it("looks only at the newest upload for pending and failed", () => {
    assert.deepEqual(ids(pickResumeView([failed("scan"), pending("stale"), parsed("old", true)])), {
      shown: "old",
      pending: null,
      failed: "scan",
    });
    assert.deepEqual(ids(pickResumeView([pending("new"), failed("scan"), parsed("old", true)])), {
      shown: "old",
      pending: "new",
      failed: null,
    });
  });
  it("prefers the newest primary when old data has several", () => {
    const view = pickResumeView([parsed("a"), parsed("b", true), parsed("c", true)]);
    assert.equal(view.shown?.id, "b");
  });
  it("falls back to the newest parsed upload when none is primary", () => {
    assert.equal(pickResumeView([parsed("a"), parsed("b")]).shown?.id, "a");
  });
  it("handles a primary that was never parsed, from before promotion moved to parse", () => {
    const view = pickResumeView([pending("stranded", true), parsed("older")]);
    assert.deepEqual(ids(view), { shown: "older", pending: "stranded", failed: null });
  });
});
