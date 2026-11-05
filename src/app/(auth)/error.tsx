"use client";

import { lazy, Suspense, useEffect } from "react";

// The Leap ErrorState loads only when an error actually happens: this
// boundary ships with every auth page, which otherwise never loads the
// component kit. The fallback is the same message with a working retry, so
// the page is never stuck while the chunk loads (or if it cannot).
const ErrorState = lazy(() =>
  import("@/components/leap/ErrorState").then((m) => ({ default: m.ErrorState }))
);

const TITLE = "This page could not load";
const BODY = "Check your connection and try again. Your account is unaffected.";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[auth] render failed", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-16">
      <h1 className="sr-only">Something went wrong</h1>
      <Suspense
        fallback={
          <div
            role="alert"
            className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card px-6 py-12 text-center"
          >
            <h2 className="text-title-3 text-foreground">{TITLE}</h2>
            <p className="max-w-[46ch] text-body-sm text-muted-foreground">{BODY}</p>
            <button
              type="button"
              onClick={reset}
              className="mt-1 inline-flex h-11 items-center rounded-sm border border-border bg-card px-4 text-body-sm font-medium text-foreground outline-hidden hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring md:h-9"
            >
              Try again
            </button>
          </div>
        }
      >
        <ErrorState title={TITLE} body={BODY} onRetry={reset} />
      </Suspense>
    </main>
  );
}
