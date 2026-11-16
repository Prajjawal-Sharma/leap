// Unit tests for the shell's account helpers. Runner: Node's built-in
// node:test via tsx — `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { displayName, initials, isActivePath } from "./account";

describe("displayName", () => {
  it("prefers the profile's full name, tidied", () => {
    assert.equal(displayName("  Prajjawal   Sharma ", "p@example.com"), "Prajjawal Sharma");
  });
  it("falls back to the email's local part", () => {
    assert.equal(displayName(null, "prajjawal.s@example.com"), "prajjawal.s");
    assert.equal(displayName("   ", "asha@example.com"), "asha");
  });
  it("has a neutral fallback when neither exists", () => {
    assert.equal(displayName(null, null), "Your account");
    assert.equal(displayName("", "@example.com"), "Your account");
  });
});

describe("initials", () => {
  it("takes the first and last word", () => {
    assert.equal(initials("Prajjawal Sharma"), "PS");
    assert.equal(initials("Asha Rani Verma"), "AV");
  });
  it("takes two letters from a single word", () => {
    assert.equal(initials("asha"), "AS");
  });
  it("splits email-style names on dots, underscores and hyphens", () => {
    assert.equal(initials("prajjawal.s"), "PS");
    assert.equal(initials("meera_iyer"), "MI");
  });
  it("ignores digits and symbols", () => {
    assert.equal(initials("dev42 ops!"), "DO");
    assert.equal(initials("1234"), "?");
  });
  it("keeps non-Latin and accented first letters whole", () => {
    assert.equal(initials("Élodie Durand"), "ÉD");
    assert.equal(initials("प्रज्ज्वल शर्मा"), "प्रश");
  });
});

describe("isActivePath", () => {
  it("matches the path and paths below it", () => {
    assert.equal(isActivePath("/jobs", "/jobs"), true);
    assert.equal(isActivePath("/jobs/abc", "/jobs"), true);
  });
  it("does not match a sibling that shares a prefix", () => {
    assert.equal(isActivePath("/jobsearch", "/jobs"), false);
    assert.equal(isActivePath("/chat", "/chatter"), false);
  });
});
