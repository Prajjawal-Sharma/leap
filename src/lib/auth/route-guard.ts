import { safeNext } from "./safe-next";

// The route decision src/proxy.ts makes on every matched request, kept pure
// so it can be unit-tested without a request, a runtime or Supabase. The
// lists and the startsWith matching are exactly what the proxy used inline.

// /auth/reset-password is deliberately absent: this list bounces
// authenticated users away, and a recovery-link user gains a session the
// moment the code is exchanged — bouncing them would break the reset flow.
export const AUTH_ROUTES = ["/login", "/signup", "/forgot-password"];
export const DASHBOARD_PREFIXES = [
  "/dashboard",
  "/jobs",
  "/resume",
  "/applications",
  "/chat",
  "/insights",
];

export type RouteDecision =
  | { action: "allow" }
  /** Signed out on a dashboard route: send to /login, remembering where. */
  | { action: "to-login"; next: string }
  /** Signed in on an auth route: send on to a safe internal path. */
  | { action: "to-app"; pathname: string };

export function decideRoute(
  pathname: string,
  nextParam: string | null,
  hasUser: boolean
): RouteDecision {
  const isAuthRoute = AUTH_ROUTES.some((p) => pathname.startsWith(p));
  const isDashboardRoute = DASHBOARD_PREFIXES.some((p) => pathname.startsWith(p));

  if (!hasUser && isDashboardRoute) {
    return { action: "to-login", next: pathname };
  }

  if (hasUser && isAuthRoute) {
    // Setting .pathname alone can't change the host, but route ?next=
    // through the shared guard anyway: one rule for every read site, and it
    // also blocks attacker-forced internal paths like "/\evil.com".
    return { action: "to-app", pathname: safeNext(nextParam) };
  }

  return { action: "allow" };
}
