import {
  companyInitial,
  companyTint,
  type CompanyMarkTint,
} from "@/lib/ui/company-mark";
import { cn } from "@/lib/utils";

/** Tailwind cannot build class names at runtime, so map the tints explicitly. */
const TINT_CLASS: Record<CompanyMarkTint, string> = {
  slate: "bg-mk-slate-bg text-mk-slate-fg",
  teal: "bg-mk-teal-bg text-mk-teal-fg",
  amber: "bg-mk-amber-bg text-mk-amber-fg",
  sky: "bg-mk-sky-bg text-mk-sky-fg",
};

const SIZES = { sm: 36, md: 40, lg: 48 } as const;

type CompanyMarkProps = {
  company: string;
  size?: keyof typeof SIZES;
  className?: string;
};

/**
 * Initial tile standing in for a company logo (DESIGN §7) — no real logos, so
 * nothing to fetch and nothing to lay out late.
 *
 * aria-hidden on purpose: the company name is always rendered as text next to
 * the tile, and announcing a bare letter would just repeat it.
 */
export function CompanyMark({ company, size = "md", className }: CompanyMarkProps) {
  const box = SIZES[size];

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg font-semibold",
        size === "lg" ? "text-title-3" : "text-body-sm",
        TINT_CLASS[companyTint(company)],
        className
      )}
      style={{ width: box, height: box }}
    >
      {companyInitial(company)}
    </span>
  );
}
