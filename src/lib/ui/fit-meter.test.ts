// Unit tests for the Fit meter geometry. Runner: Node's built-in node:test
// via tsx (no new dependencies) — `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clampFit,
  FIT_METER_SIZES,
  fitDashArray,
  ringCircumference,
  ringRadius,
} from "./fit-meter";

describe("clampFit — scores land in 0-100 as whole numbers", () => {
  it("passes a whole number through", () => assert.equal(clampFit(68), 68));
  it("rounds half up", () => assert.equal(clampFit(67.5), 68));
  it("rounds down", () => assert.equal(clampFit(67.4), 67));
  it("clamps above 100", () => assert.equal(clampFit(140), 100));
  it("clamps below 0", () => assert.equal(clampFit(-20), 0));
  it("keeps the bounds themselves", () => {
    assert.equal(clampFit(0), 0);
    assert.equal(clampFit(100), 100);
  });

  // The match engine and Gemini both feed this; neither guarantees a number.
  it("treats NaN as 0", () => assert.equal(clampFit(Number.NaN), 0));
  it("treats Infinity as 0", () => {
    assert.equal(clampFit(Number.POSITIVE_INFINITY), 0);
    assert.equal(clampFit(Number.NEGATIVE_INFINITY), 0);
  });
});

describe("ring geometry", () => {
  it("insets the radius by half the stroke on each side", () => {
    assert.equal(ringRadius(40, 3), 18.5);
    assert.equal(ringRadius(64, 5), 29.5);
    assert.equal(ringRadius(96, 7), 44.5);
  });

  it("keeps the stroke inside the box", () => {
    for (const { box, stroke } of Object.values(FIT_METER_SIZES)) {
      assert.ok(ringRadius(box, stroke) * 2 + stroke <= box);
    }
  });

  it("circumference is 2πr", () => {
    assert.equal(ringCircumference(10), 2 * Math.PI * 10);
  });
});

describe("fitDashArray — the filled arc", () => {
  const radius = ringRadius(40, 3);
  const circumference = ringCircumference(radius);

  it("draws nothing at 0%", () => {
    assert.equal(fitDashArray(0, radius).split(" ")[0], "0");
  });

  it("draws the whole ring at 100%", () => {
    const [filled, total] = fitDashArray(100, radius).split(" ");
    assert.equal(filled, total);
  });

  it("draws half the ring at 50%", () => {
    const [filled] = fitDashArray(50, radius).split(" ").map(Number);
    assert.ok(Math.abs(filled - circumference / 2) < 0.001);
  });

  it("clamps out-of-range input like clampFit", () => {
    assert.equal(fitDashArray(150, radius), fitDashArray(100, radius));
    assert.equal(fitDashArray(-5, radius), fitDashArray(0, radius));
  });

  it("is deterministic", () => {
    assert.equal(fitDashArray(68, radius), fitDashArray(68, radius));
  });

  it("emits two finite numbers", () => {
    const parts = fitDashArray(68, radius).split(" ");
    assert.equal(parts.length, 2);
    for (const part of parts) assert.ok(Number.isFinite(Number(part)));
  });
});
