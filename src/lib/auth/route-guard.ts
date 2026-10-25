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

const FALLBACK = "/jobs";

// The proxy applies the target with `url.pathname = target`. The URL path
// setter resolves dot segments, so a target safeNext accepts as internal —
// "/..//evil.com", "/%2e%2e//evil.com", "/x/../..//evil.com" — comes out as
// "//evil.com", and Next shortens a same-host Location to that relative,
// protocol-relative form, which browsers send off-site. Run the same setter
// here and refuse anything that lands on "//". Every other target is returned
// exactly as before, so legitimate redirects are unchanged.
function landsInternal(target: string): boolean {
  const probe = new URL("http://route-guard.invalid/");
  probe.pathname = target;
  return !probe.pathname.startsWith("//");
}

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
    // ?next= is attacker-supplied: safeNext screens it (one rule for every
    // read site — protocol-relative, backslash, control chars, schemes), and
    // landsInternal closes the dot-segment escape that only appears once the
    // proxy assigns the value to url.pathname.
    const target = safeNext(nextParam);
    return {
      action: "to-app",
      pathname: landsInternal(target) ? target : FALLBACK,
    };
  }

  return { action: "allow" };
}
