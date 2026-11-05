// Unit tests for the theme cookie helpers. Runner: Node's built-in node:test
// via tsx — `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PREFERENCE_MAX_AGE_SECONDS,
  htmlThemeState,
  parseSolid,
  parseTheme,
  serializePreference,
} from "./config";

describe("parseTheme / parseSolid", () => {
  it("accepts only the three theme values", () => {
    assert.equal(parseTheme("light"), "light");
    assert.equal(parseTheme("dark"), "dark");
    assert.equal(parseTheme("system"), "system");
    for (const raw of [undefined, null, "", "Dark", "blue", "dark "]) {
      assert.equal(parseTheme(raw), null, JSON.stringify(raw));
    }
  });
  it("treats only '1' as solid", () => {
    assert.equal(parseSolid("1"), true);
    for (const raw of [undefined, null, "", "0", "true", "11"]) {
      assert.equal(parseSolid(raw), false, JSON.stringify(raw));
    }
  });
});

describe("htmlThemeState", () => {
  it("forces dark while FORCED_THEME is set, whatever the cookie says", () => {
    for (const cookie of [undefined, "light", "system", "dark", "junk"]) {
      const s = htmlThemeState(cookie, undefined, "dark");
      assert.equal(s.theme, "dark");
      assert.equal(s.className, "dark");
      assert.equal(s.dataTheme, undefined);
    }
  });

  it("maps light and dark to a class and no data-theme", () => {
    assert.deepEqual(htmlThemeState("light", undefined, null), {
      theme: "light",
      solid: false,
      className: "light",
      dataTheme: undefined,
    });
    assert.equal(htmlThemeState("dark", undefined, null).className, "dark");
  });

  it("maps system, a missing cookie and junk to no class plus data-theme=system", () => {
    for (const cookie of ["system", undefined, "", "blue"]) {
      const s = htmlThemeState(cookie, undefined, null);
      assert.equal(s.theme, "system");
      assert.equal(s.className, "");
      assert.equal(s.dataTheme, "system");
    }
  });

  it("adds solid alongside the theme class", () => {
    assert.equal(htmlThemeState(undefined, "1", "dark").className, "dark solid");
    assert.equal(htmlThemeState("system", "1", null).className, "solid");
    assert.equal(htmlThemeState("light", "0", null).className, "light");
  });
});

describe("serializePreference", () => {
  it("writes Path=/, SameSite=Lax and a one-year Max-Age", () => {
    assert.equal(
      serializePreference("leap-theme", "dark", false),
      `leap-theme=dark; Path=/; SameSite=Lax; Max-Age=${PREFERENCE_MAX_AGE_SECONDS}`
    );
    assert.equal(PREFERENCE_MAX_AGE_SECONDS, 31_536_000);
  });
  it("adds Secure on https", () => {
    assert.match(serializePreference("leap-solid", "1", true), /; Secure$/);
  });
  it("clears with an empty value and Max-Age=0", () => {
    assert.equal(
      serializePreference("leap-solid", null, true),
      "leap-solid=; Path=/; SameSite=Lax; Max-Age=0; Secure"
    );
  });
  it("never writes HttpOnly — the client must be able to set it", () => {
    assert.doesNotMatch(serializePreference("leap-theme", "light", true), /HttpOnly/i);
  });
});
