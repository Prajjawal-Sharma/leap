import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  /** One line. Anything longer belongs in the page body. */
  description?: string;
  /** Primary action for the page, shown opposite the title. */
  actions?: React.ReactNode;
  className?: string;
};

/**
 * Title, one-line description, actions slot — DESIGN §6.1. Every page uses it,
 * so page titles stay the same size and in the same place.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
    >
      <div className="min-w-0 space-y-1">
        <h1 className="text-title-1 text-foreground">{title}</h1>
        {description ? (
          <p className="max-w-[70ch] text-body text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
