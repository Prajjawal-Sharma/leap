// Unit tests for the sidebar cookie parser. Runner: Node's built-in node:test
// via tsx — `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SIDEBAR_COOKIE_NAME, parseSidebarCookie } from "./sidebar-state";

describe("parseSidebarCookie", () => {
  it("reads the two values the sidebar writes", () => {
    assert.equal(parseSidebarCookie("true"), true);
    assert.equal(parseSidebarCookie("false"), false);
  });
  it("treats anything else as no choice yet (auto)", () => {
    for (const raw of [undefined, null, "", "TRUE", "1", "open", "true "]) {
      assert.equal(parseSidebarCookie(raw), undefined, JSON.stringify(raw));
    }
  });
  it("keeps the cookie name shadcn's sidebar has always used", () => {
    assert.equal(SIDEBAR_COOKIE_NAME, "sidebar_state");
  });
});
