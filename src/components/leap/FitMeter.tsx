import {
  clampFit,
  FIT_METER_SIZES,
  fitDashArray,
  ringRadius,
  type FitMeterSize,
} from "@/lib/ui/fit-meter";
import { cn } from "@/lib/utils";

const LABEL_CLASS: Record<FitMeterSize, string> = {
  xs: "text-caption",
  md: "text-title-3",
  lg: "text-title-1",
};

const SUFFIX_CLASS: Record<FitMeterSize, string> = {
  xs: "text-[9px]",
  md: "text-caption",
  lg: "text-body-sm",
};

type FitMeterProps = {
  /** 0-100. Out-of-range and non-finite values clamp rather than throw. */
  value: number;
  size?: FitMeterSize;
  /** Hides the "%" — the lg ATS score reads as a bare number. */
  showSuffix?: boolean;
  /**
   * Overrides the default "68% fit". Required in practice wherever the number
   * is not a fit percentage — the lg ATS score, for one.
   */
  label?: string;
  className?: string;
};

/**
 * The one bold element (DESIGN §2): a ring plus a number, used wherever fit or
 * score appears. Always the brand colour — never amber or red, which would
 * read as a warning on what is an ordinary good match (DESIGN §7).
 *
 * The ring is rotated -90° so it starts at twelve o'clock, and the fill
 * animates stroke-dasharray on the spring. Under prefers-reduced-motion the
 * transition is dropped entirely, per DESIGN §5.5.
 */
export function FitMeter({
  value,
  size = "md",
  showSuffix = true,
  label,
  className,
}: FitMeterProps) {
  const { box, stroke } = FIT_METER_SIZES[size];
  const percent = clampFit(value);
  const radius = ringRadius(box, stroke);
  const center = box / 2;

  return (
    <div
      role="img"
      // `??` would let an empty or whitespace-only label through and ship a
      // role="img" with no accessible name.
      aria-label={label?.trim() || `${percent}% fit`}
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: box, height: box }}
    >
      <svg
        viewBox={`0 0 ${box} ${box}`}
        width={box}
        height={box}
        aria-hidden
        className="-rotate-90"
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-fit-track"
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          // Round caps add half a stroke at each end, which turns a 0% arc
          // into a visible dot at twelve o'clock — the dotted-line trick.
          strokeLinecap={percent === 0 ? "butt" : "round"}
          strokeDasharray={fitDashArray(percent, radius)}
          className="stroke-brand-text transition-[stroke-dasharray] duration-[var(--dur-spring)] ease-spring motion-reduce:transition-none"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex items-baseline gap-px">
          <span
            className={cn(
              "font-semibold tabular-nums text-foreground",
              LABEL_CLASS[size],
            )}
          >
            {percent}
          </span>
          {showSuffix ? (
            <span
              className={cn(
                "font-medium text-muted-foreground",
                SUFFIX_CLASS[size],
              )}
            >
              %
            </span>
          ) : null}
        </span>
      </span>
    </div>
  );
}
