// Guards the one piece of duplication the cookie-based theme needs: the
// system-theme block in globals.css repeats the .dark palette (CSS cannot
// apply one rule under both a class and a media query without repeating it).
// If someone edits one and not the other, system mode on a dark OS would drift
// from the dark theme silently, so the gate fails instead.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

function declarations(block: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    out.set(m[1], m[2].trim());
  }
  return out;
}

describe("globals.css system theme", () => {
  const dark = css.match(/\n\.dark \{\n([\s\S]*?)\n\}\n/);
  const system = css.match(
    /@media \(prefers-color-scheme: dark\) \{\n {2}\[data-theme="system"\] \{\n([\s\S]*?)\n {2}\}\n\}/
  );

  it("has both blocks", () => {
    assert.ok(dark, ".dark block not found");
    assert.ok(system, "system-theme block not found");
  });

  it("declares exactly the .dark palette under [data-theme=system]", () => {
    const d = declarations(dark![1]);
    const s = declarations(system![1]);
    assert.ok(d.size > 30, `only ${d.size} variables parsed from .dark`);
    assert.deepEqual([...s.entries()].sort(), [...d.entries()].sort());
  });

  it("flips color-scheme with it", () => {
    assert.match(system![1], /color-scheme: dark;/);
  });

  it("extends the dark variant to system mode", () => {
    assert.match(
      css,
      /@custom-variant dark \{[\s\S]*?@media \(prefers-color-scheme: dark\) \{[\s\S]*?\[data-theme="system"\]/
    );
  });
});
