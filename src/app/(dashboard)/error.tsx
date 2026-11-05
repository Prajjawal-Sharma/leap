"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/leap/ErrorState";

// Route-group boundary: a page that throws renders this inside the shell, so
// the sidebar and tab bar stay usable. reset() re-renders the segment.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard] render failed", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="pt-2">
      <h1 className="sr-only">Something went wrong</h1>
      <ErrorState
        title="This page could not load"
        body="Something went wrong while loading it. Try again, or open another page from the menu."
        onRetry={reset}
      />
    </div>
  );
}
