/**
 * Geometry and clamping for the Fit meter. Pure functions, no DOM — the React
 * component in src/components/leap/FitMeter.tsx only arranges what these
 * return, which is what makes the arithmetic testable.
 */

/** Ring sizes from DESIGN §7: box in px, stroke in px. */
export const FIT_METER_SIZES = {
  xs: { box: 40, stroke: 3 },
  md: { box: 64, stroke: 5 },
  lg: { box: 96, stroke: 7 },
} as const;

export type FitMeterSize = keyof typeof FIT_METER_SIZES;

/**
 * A fit percentage is always a whole number in 0–100. Scores arrive from the
 * match engine and from Gemini, so NaN and out-of-range values are expected
 * rather than exceptional; they clamp instead of throwing.
 */
export function clampFit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** Radius of the stroked ring, inset so the stroke stays inside the box. */
export function ringRadius(box: number, stroke: number): number {
  return (box - stroke) / 2;
}

export function ringCircumference(radius: number): number {
  return 2 * Math.PI * radius;
}

/**
 * `stroke-dasharray` drawing `percent` of a ring of `radius`: one dash the
 * length of the arc, then a gap long enough to cover the rest. Animating this
 * value is what fills the ring.
 *
 * Rounded to 3dp so the string is stable (useful in tests and diffs) while
 * staying far below one device pixel of error.
 */
export function fitDashArray(percent: number, radius: number): string {
  const circumference = ringCircumference(radius);
  const filled = (clampFit(percent) / 100) * circumference;
  return `${round3(filled)} ${round3(circumference)}`;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
