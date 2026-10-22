import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Gallery } from "./gallery";

export const metadata: Metadata = {
  title: "Leap UI gallery",
  robots: { index: false, follow: false },
};

/**
 * Rendered per request, never prerendered — otherwise the guard below would be
 * baked into static HTML and the environment could never be consulted again.
 */
export const dynamic = "force-dynamic";

/**
 * Review surface for the design system: every component in both themes.
 *
 * Closed on any production build, not just a Vercel one. VERCEL_ENV alone
 * would be a single point of failure: it only exists while "Automatically
 * expose System Environment Variables" is on, and it is absent entirely when
 * the app runs anywhere other than Vercel — either of which would quietly open
 * an unauthenticated route (/dev/ui is deliberately not in middleware's
 * DASHBOARD_PREFIXES). NODE_ENV is set to "production" by `next build`, so the
 * second arm fails closed wherever the first is missing. Preview deploys keep
 * the gallery because VERCEL_ENV is "preview" there — see the dev-dependency
 * note in the PR for how that interacts with NODE_ENV.
 *
 * Verified against `next start`: VERCEL_ENV=production -> 404,
 * VERCEL_ENV=preview -> 200, unset -> 404 on a production build.
 *
 * The route is not linked from anywhere and is marked noindex.
 */
export default function DevUiPage() {
  const vercelEnv = process.env.VERCEL_ENV;

  if (vercelEnv === "production") {
    notFound();
  }
  // Not a Vercel deploy at all: close unless this is a dev server.
  if (!vercelEnv && process.env.NODE_ENV === "production") {
    notFound();
  }

  return <Gallery />;
}
