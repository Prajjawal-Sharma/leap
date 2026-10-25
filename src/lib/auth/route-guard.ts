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

// The proxy applies the target with `url.pathname = target`, and Next then
// re-parses the Location it returns before shortening a same-host URL to a
// relative one (next/dist/server/web/adapter.js). Two steps can turn a target
// safeNext accepts as internal into a protocol-relative "//host", which
// browsers send off-site:
//   - the URL path setter resolves dot segments: "/..//evil.com",
//     "/%2e%2e//evil.com" and "/x/../..//evil.com" all become "//evil.com";
//   - the re-parse strips a "/_next/data/<buildId>/…json" wrapper, and an
//     empty buildId leaves "//evil.com" ("/_next/data///evil.com.json").
// Run the same setter here and refuse anything that lands on "//" or under
// /_next — no page redirect ever legitimately targets Next's internals.
// Every other target is returned exactly as before.
function landsInternal(target: string): boolean {
  const probe = new URL("http://route-guard.invalid/");
  probe.pathname = target;
  const resolved = probe.pathname.toLowerCase();
  return (
    !resolved.startsWith("//") &&
    resolved !== "/_next" &&
    !resolved.startsWith("/_next/")
  );
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
