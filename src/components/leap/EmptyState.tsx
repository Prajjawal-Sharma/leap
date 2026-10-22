import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: string;
  /** Why it is empty and what fills it. */
  body: string;
  /** Exactly one action — the next thing to do (DESIGN principle 7). */
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
};

/**
 * Empty state: an explanation and one way forward, never a bare "No results".
 */
export function EmptyState({
  title,
  body,
  action,
  icon,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card px-6 py-12 text-center",
        className
      )}
    >
      {icon ? (
        <span className="text-faint [&_svg]:size-6" aria-hidden>
          {icon}
        </span>
      ) : null}
      <div className="space-y-1">
        <h2 className="text-title-3 text-foreground">{title}</h2>
        <p className="mx-auto max-w-[46ch] text-body-sm text-muted-foreground">
          {body}
        </p>
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
