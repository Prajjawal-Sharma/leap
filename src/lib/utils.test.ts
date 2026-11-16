// Unit tests for cn(). Runner: Node's built-in node:test via tsx — `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cn } from "./utils";

describe("cn — DESIGN type scale", () => {
  it("keeps a type token next to a colour token", () => {
    assert.equal(cn("text-caption text-muted-foreground"), "text-caption text-muted-foreground");
    assert.equal(cn("text-title-3", "text-foreground"), "text-title-3 text-foreground");
  });

  it("still lets a later size replace an earlier one", () => {
    assert.equal(cn("text-body-sm", "text-caption"), "text-caption");
    assert.equal(cn("text-sm", "text-body"), "text-body");
  });

  it("still lets a later colour replace an earlier one", () => {
    assert.equal(cn("text-foreground", "text-brand-text"), "text-brand-text");
  });

  it("covers every step of the scale", () => {
    for (const size of ["display", "title-1", "title-2", "title-3", "body", "body-sm", "caption"]) {
      assert.equal(cn(`text-${size}`, "text-foreground"), `text-${size} text-foreground`, size);
    }
  });
});
