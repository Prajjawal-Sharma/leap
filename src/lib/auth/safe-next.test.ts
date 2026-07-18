// Unit tests for the open-redirect guard. Runner: Node's built-in node:test
// via tsx (no new dependencies) — `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { safeNext } from "./safe-next";

const FALLBACK = "/jobs";

describe("safeNext — safe internal paths pass through", () => {
  it("plain path", () => assert.equal(safeNext("/jobs"), "/jobs"));
  it("path with query", () =>
    assert.equal(safeNext("/applications?x=1"), "/applications?x=1"));
  it("nested path", () =>
    assert.equal(safeNext("/jobs/abc-123"), "/jobs/abc-123"));
  it("path with hash", () =>
    assert.equal(safeNext("/profile#top"), "/profile#top"));
  it("surrounding whitespace is trimmed", () =>
    assert.equal(safeNext("  /profile  "), "/profile"));
});

describe("safeNext — hostile or malformed targets fall back", () => {
  const hostile: Array<[string, string | null | undefined]> = [
    ["null", null],
    ["undefined", undefined],
    ["empty", ""],
    ["whitespace only", "   "],
    ["protocol-relative", "//evil.com"],
    ["protocol-relative with path", "//evil.com/jobs"],
    ["backslash after slash", "/\\evil.com"],
    ["backslash anywhere", "/jobs\\..\\x"],
    // Interior TAB/LF/CR: browsers strip these before URL parsing, so
    // "/<TAB>/evil.com" collapses to "//evil.com" and escapes cross-origin
    // when router.replace resolves it relative to location. trim() only
    // touches the ends, so these MUST be rejected explicitly.
    ["interior tab (protocol-relative after strip)", "/\t/evil.com"],
    ["interior newline", "/\n/evil.com"],
    ["interior carriage return", "/\r/evil.com"],
    ["tab before scheme", "/\tjavascript:alert(1)"],
    ["interior null", "/\0/evil.com"],
    ["interior DEL", "/\x7f/evil.com"],
    ["scheme: javascript", "javascript:alert(1)"],
    ["scheme: data", "data:text/html,<script>alert(1)</script>"],
    ["absolute https", "https://evil.com"],
    ["absolute http", "http://evil.com/jobs"],
    ["missing leading slash", "evil.com"],
    ["relative path", "jobs"],
    ["whitespace-masked protocol-relative", "  //evil.com"],
  ];
  for (const [name, input] of hostile) {
    it(name, () => assert.equal(safeNext(input), FALLBACK));
  }
});

describe("safeNext — login site relative-resolution stays same-origin", () => {
  // The login page does router.replace(safeNext(next)), which Next resolves
  // as new URL(value, location.href). This is where interior TAB/LF/CR would
  // escape (the two server sites prefix the origin and can't). Assert the
  // guarded value resolves back to our own origin against a login base.
  const base = "https://leap-five-delta.vercel.app/login";
  const attacks = ["/\t/evil.com", "/\n/evil.com", "/\r/evil.com", "//evil.com", "/\\evil.com"];
  for (const next of attacks) {
    it(`router.replace target for ${JSON.stringify(next)} stays same-origin`, () => {
      const resolved = new URL(safeNext(next), base);
      assert.equal(resolved.origin, "https://leap-five-delta.vercel.app");
      assert.equal(resolved.pathname, FALLBACK);
    });
  }
  it("legit next resolves to its own path same-origin", () => {
    const resolved = new URL(safeNext("/applications?x=1"), base);
    assert.equal(resolved.origin, "https://leap-five-delta.vercel.app");
    assert.equal(resolved.pathname, "/applications");
  });
});

describe("safeNext — redirect construction stays same-origin", () => {
  // Mirrors the /auth/callback construction: `${origin}${safeNext(next)}`.
  const origin = "https://leap-five-delta.vercel.app";
  const attacks = [
    "//evil.com",
    "/\\evil.com",
    "https://evil.com",
    "javascript:alert(1)",
    "\\/evil.com",
    "//evil.com/%2e%2e",
  ];
  for (const next of attacks) {
    it(`\`\${origin}\${safeNext(${JSON.stringify(next)})}\` stays on ${origin}`, () => {
      const target = new URL(`${origin}${safeNext(next)}`);
      assert.equal(target.origin, origin);
      assert.equal(target.pathname, FALLBACK);
    });
  }
  it("legitimate next keeps its path and query", () => {
    const target = new URL(`${origin}${safeNext("/applications?x=1")}`);
    assert.equal(target.origin, origin);
    assert.equal(target.pathname, "/applications");
    assert.equal(target.search, "?x=1");
  });
});
