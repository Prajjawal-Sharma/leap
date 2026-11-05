"use client";

import { lazy, Suspense } from "react";

import { ChunkBoundary } from "./ChunkBoundary";

const Toaster = lazy(() =>
  import("@/components/ui/sonner").then((m) => ({ default: m.Toaster }))
);

/**
 * The dashboard's single Toaster, code-split: sonner only matters once a toast
 * fires, so it stays off the first load. Toasts render in a portal, so mounting
 * a moment later never shifts content. If the chunk fails, toasts are lost but
 * the page is not.
 */
export function LazyToaster() {
  return (
    <ChunkBoundary fallback={null}>
      <Suspense fallback={null}>
        <Toaster />
      </Suspense>
    </ChunkBoundary>
  );
}
