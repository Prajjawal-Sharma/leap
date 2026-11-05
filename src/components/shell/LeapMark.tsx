import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

/** The Leap mark: a brand tile with the arrow. Decorative; label the link. */
export function LeapMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground",
        className
      )}
    >
      <ArrowUpRight className="size-5" strokeWidth={2.5} />
    </span>
  );
}
