"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/leap/ErrorState";

// Route-group boundary: a page that throws renders this inside the shell, so
// the sidebar and tab bar stay usable.
export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  /** Re-fetches and re-renders the segment (Next 16); reset() would only re-render. */
  retry: () => void;
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
        onRetry={retry}
      />
    </div>
  );
}
