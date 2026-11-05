chore: rename middleware.ts to proxy.ts (Next 16 convention)
deep: true

Commit this spec verbatim as docs/specs/middleware-to-proxy.md in the PR.

## Goal
Next 16 deprecates the `middleware` file convention in favour of `proxy` and warns on every build. Move src/middleware.ts to the proxy convention with zero behaviour change: the same routes stay protected, the same redirects happen, the same Supabase session refresh runs, the same matcher applies.

## Context verified by recon (TRUE/FALSE with file:line)
- src/middleware.ts: AUTH_ROUTES, DASHBOARD_PREFIXES (incl. /insights), the Supabase SSR cookie refresh, redirect rules, and the matcher excluding _next/static, _next/image, favicon.ico and image extensions.
- `next build` on dev prints the "middleware file convention is deprecated" warning.
- The exact proxy API in node_modules/next/dist/docs (file name, exported function name, config/matcher export, runtime — note any difference such as Node vs Edge runtime and its effect on @supabase/ssr).
- CLAUDE.md mentions the rename as a separate tracked change (`chore/middleware-to-proxy`).

## Changes
1. git mv src/middleware.ts → src/proxy.ts and adapt only what the documented proxy API requires (export name, config). Logic, route lists, cookie handling and matcher stay byte-identical where the API allows.
2. If the proxy runtime differs from middleware's, prove @supabase/ssr session refresh still works (cookies read and set on the response) — explain in the PR.
3. Add src/lib/auth/route-guard.ts only if needed to unit-test the route decision (pure function: pathname + hasUser → allow | redirect target) and test it: every dashboard prefix redirects unauthenticated users to /login with ?next=, auth routes redirect signed-in users away, /auth/reset-password and /auth/callback are in neither list (Pitfall 11), /dev/ui and / untouched.
4. CLAUDE.md: replace the "src/middleware.ts still uses the deprecated…" bullet with one line stating proxy.ts is in use; update any other doc mentioning src/middleware.ts. Definition of Done and Pitfalls untouched.

## Do NOT touch
Auth flows, API routes, Supabase clients, theme/UI, chat, migrations, package.json.

## Acceptance
- gate.sh green; build output no longer shows the deprecation warning — paste before/after.
- Route decision tests cover every prefix and both auth directions.
- Human must do (in the PR): on the preview, signed out — open /jobs, /resume, /applications, /chat, /profile → each lands on /login; sign in → lands back on the page from ?next=; signed in — open /login → redirected to /jobs; password reset link from email still opens /auth/reset-password; console clean.
