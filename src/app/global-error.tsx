"use client";

import "./globals.css";

import { useEffect } from "react";

import { FORCED_THEME } from "@/lib/theme/config";

// Last-resort boundary: it replaces the root layout when that layout itself
// throws, so it renders its own <html> and <body>. It cannot read the theme
// cookie (client component, no layout above it), so it uses the forced theme,
// or follows the OS once the theme is user-controlled. Plain markup on purpose:
// it ships with every route, so it must not pull in the component kit.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] root layout failed", error.digest ?? error.message);
  }, [error]);

  return (
    <html
      lang="en"
      className={`${FORCED_THEME ?? ""} h-full antialiased`.trim()}
      data-theme={FORCED_THEME ? undefined : "system"}
    >
      <body className="min-h-full">
        <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-16">
          <div
            role="alert"
            className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card px-6 py-12 text-center"
          >
            <h1 className="text-title-3 text-foreground">Leap could not load</h1>
            <p className="max-w-[46ch] text-body-sm text-muted-foreground">
              Something went wrong while loading it. Try again in a moment.
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-1 inline-flex h-11 items-center rounded-sm border border-border bg-card px-4 text-body-sm font-medium text-foreground outline-hidden hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring md:h-9"
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
