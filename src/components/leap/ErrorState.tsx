"use client";

import { RotateCcwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ErrorStateProps = {
  /** What happened, in plain words. */
  title?: string;
  /** How to fix it — DESIGN §8 copy rule: errors say what to do next. */
  body?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
};

/**
 * Error state: what happened, how to fix it, and a way to try again. Paper, not
 * glass, and never a bare stack trace.
 */
export function ErrorState({
  title = "Something went wrong",
  body = "The page could not load. Check your connection and try again.",
  onRetry,
  retryLabel = "Try again",
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card px-6 py-12 text-center",
        className
      )}
    >
      <div className="space-y-1">
        <h2 className="text-title-3 text-foreground">{title}</h2>
        <p className="mx-auto max-w-[46ch] text-body-sm text-muted-foreground">
          {body}
        </p>
      </div>
      {onRetry ? (
        <Button variant="outline" onClick={onRetry} className="mt-1">
          <RotateCcwIcon aria-hidden />
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
