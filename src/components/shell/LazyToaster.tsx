"use client";

import { lazy, Suspense } from "react";

const Toaster = lazy(() =>
  import("@/components/ui/sonner").then((m) => ({ default: m.Toaster }))
);

/**
 * The dashboard's single Toaster, code-split: sonner only matters once a toast
 * fires, so it stays off the first load. Toasts render in a portal, so mounting
 * a moment later never shifts content.
 */
export function LazyToaster() {
  return (
    <Suspense fallback={null}>
      <Toaster />
    </Suspense>
  );
}
