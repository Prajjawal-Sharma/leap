// Unit tests for CompanyMark's initial and tint. Runner: Node's built-in
// node:test via tsx (no new dependencies) — `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COMPANY_MARK_FALLBACK,
  COMPANY_MARK_TINTS,
  companyInitial,
  companyTint,
} from "./company-mark";

describe("companyInitial — one letter or digit, uppercased", () => {
  it("takes the first letter", () =>
    assert.equal(companyInitial("Squarespace"), "S"));
  it("uppercases a lowercase name", () =>
    assert.equal(companyInitial("mongoDB"), "M"));
  it("takes a leading digit", () =>
    assert.equal(companyInitial("7-Eleven"), "7"));

  it("steps past leading punctuation", () =>
    assert.equal(companyInitial("@Scale"), "S"));
  it("steps past leading whitespace", () =>
    assert.equal(companyInitial("   Acme"), "A"));

  // Iterating code points, not UTF-16 units, is what keeps these intact.
  it("steps past a leading emoji", () =>
    assert.equal(companyInitial("🚀 Rocket Labs"), "R"));
  it("keeps a non-Latin first character", () =>
    assert.equal(companyInitial("株式会社カドカワ"), "株"));
  it("handles Cyrillic", () => assert.equal(companyInitial("Яндекс"), "Я"));

  // "ß".toUpperCase() is "SS"; the tile has room for one character.
  it("returns a single character when uppercasing expands", () => {
    assert.equal(companyInitial("ßeta"), "S");
    assert.equal(Array.from(companyInitial("ßeta")).length, 1);
  });

  // Modifier letters are not initials — tiling one renders a stray mark.
  it("steps past a leading modifier letter", () => {
    assert.equal(companyInitial("\u02bcAcme"), "A");
    assert.equal(companyInitial("\u0640Acme"), "A");
  });

  it("steps past combining marks and invisible characters", () => {
    assert.equal(companyInitial("\u0301Acme"), "A");
    assert.equal(companyInitial("\u200b\u200bAcme"), "A");
    assert.equal(companyInitial("\ufeffAcme"), "A");
  });

  it("survives a lone surrogate", () => {
    assert.equal(companyInitial("\ud800Acme"), "A");
    assert.equal(companyInitial("\udc00Acme"), "A");
    assert.equal(companyInitial("\ud800"), COMPANY_MARK_FALLBACK);
  });

  it("falls back when there is no letter or digit", () => {
    assert.equal(companyInitial(""), COMPANY_MARK_FALLBACK);
    assert.equal(companyInitial("   "), COMPANY_MARK_FALLBACK);
    assert.equal(companyInitial("---"), COMPANY_MARK_FALLBACK);
    assert.equal(companyInitial("🚀"), COMPANY_MARK_FALLBACK);
  });
});

describe("companyTint — stable and evenly spread", () => {
  it("always returns one of the four tints", () => {
    for (const name of ["Squarespace", "MongoDB", "Acme", "", "   ", "🚀"]) {
      assert.ok(COMPANY_MARK_TINTS.includes(companyTint(name)));
    }
  });

  it("is deterministic across calls", () => {
    assert.equal(companyTint("MongoDB"), companyTint("MongoDB"));
  });

  it("ignores case and surrounding whitespace", () => {
    assert.equal(companyTint("MongoDB"), companyTint("  mongodb  "));
  });

  it("does not collapse every name onto one tint", () => {
    const names = [
      "Squarespace", "MongoDB", "Acme", "Stripe", "Vercel", "Linear",
      "Notion", "Figma", "Supabase", "Cloudflare", "Datadog", "Airbnb",
    ];
    const used = new Set(names.map(companyTint));
    assert.ok(used.size > 1, `expected a spread, got ${[...used].join(",")}`);
  });

  it("handles a name with no letters at all", () => {
    assert.ok(COMPANY_MARK_TINTS.includes(companyTint("---")));
  });

  // Two boards spelling one company differently must not get two colours.
  it("is stable across Unicode composition", () => {
    assert.equal(companyTint("Caf\u00e9 Co"), companyTint("Cafe\u0301 Co"));
  });

  it("ignores invisible formatting characters", () => {
    assert.equal(companyTint("\u200bMongoDB"), companyTint("MongoDB"));
    assert.equal(companyTint("Mongo\u200dDB"), companyTint("MongoDB"));
  });
});
