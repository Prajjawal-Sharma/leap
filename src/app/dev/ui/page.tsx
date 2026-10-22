import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Gallery } from "./gallery";

export const metadata: Metadata = {
  title: "Leap UI gallery",
  robots: { index: false, follow: false },
};

/**
 * Rendered per request, never prerendered — otherwise the guard below would be
 * baked into static HTML and the env could never be consulted again.
 */
export const dynamic = "force-dynamic";

// A literal `process.env.VERCEL_ENV` can be substituted with its build-time
// value by the bundler, which would freeze the answer at build time. Reading
// through a variable key is opaque to that substitution, so the lookup
// survives into the server bundle and resolves against the live environment on
// every request. Both forms are kept so either resolution path closes the
// route. Measured against `next start`: VERCEL_ENV=production serves 404,
// while preview and an unset environment serve 200.
const VERCEL_ENV_KEY = "VERCEL_ENV";

function isProductionDeploy(): boolean {
  return (
    process.env.VERCEL_ENV === "production" ||
    process.env[VERCEL_ENV_KEY] === "production"
  );
}

/**
 * Review surface for the design system: every component in both themes.
 *
 * Unreachable on production deploys. VERCEL_ENV is "production" only on a
 * production deployment — "preview" on preview deploys, unset locally — so the
 * gallery stays available where it is useful and 404s where it is not. The
 * route is not linked from anywhere in the app and is marked noindex.
 */
export default function DevUiPage() {
  if (isProductionDeploy()) {
    notFound();
  }

  return <Gallery />;
}
