# feat: app shell — floating sidebar, mobile tab bar, account menu (UI overhaul PR 2)
deep: false

Commit this spec verbatim as `docs/specs/ui-shell.md` in the PR.

## Goal (one paragraph, user-visible outcome)

Replace the dashboard frame with the shell in `docs/DESIGN.md` §6 and the mockups in `docs/design/` (01, 02, 03, 05). Desktop: a floating glass sidebar that collapses to a 56px icon rail (button and ⌘/Ctrl+B, state remembered without a flash), Insights shown as "Soon" instead of a 404 link, and an account menu pinned at the bottom with Theme, Solid surfaces and Sign out — sign-out no longer sits under the job list. Mobile: a floating glass 5-item tab bar, a slim top bar with the avatar menu, and no horizontal page scroll. Theme and Solid surfaces move from localStorage to cookies read on the server, so the first paint is always right and the PR #29 Solid-surfaces flash is gone. Page content inside the shell is NOT redesigned here (UI PRs 3–7); it must keep working and look no worse than today. The release bar in DESIGN §9.1 applies in full.

Read first: `docs/DESIGN.md` §6, §7, §9.1, §10; images in `docs/design/`; `CLAUDE.md`; `AGENTS.md`; the PR #29 code in `src/lib/theme/`, `src/components/ui/sidebar.tsx`, `src/app/globals.css`.

## Context verified by recon
Verify each and report TRUE / FALSE with file:line:
- `src/app/(dashboard)/layout.tsx` renders the old `aside` + `NAV_ITEMS` (order Jobs, Resume, Profile, Applications, Chat, Insights), links `/insights` (no page exists → 404), fetches the active-application count with `head: true`, and renders `SidebarFooter`.
- `src/components/features/SidebarFooter.tsx` owns sign-out: `supabase.auth.signOut()` → `router.push("/login")` → `router.refresh()`, with an inline error.
- `src/lib/theme/` stores theme and solid in localStorage and boots them through `next/script` `beforeInteractive`, which runs after first paint in the App Router (PR #29 finding).
- `src/components/ui/sidebar.tsx` is the shadcn Base UI sidebar from PR #29, not yet restyled; it persists open state in a `sidebar_state` cookie.
- Dashboard pages each render their own `h1` and legacy dark styling; `/jobs` overflows horizontally at 375px.
- No `error.tsx`, `loading.tsx` or `not-found.tsx` exists under `src/app`.
- `src/middleware.ts` `DASHBOARD_PREFIXES` includes `/insights`.

## Changes
1. **Theme and Solid surfaces via cookies (removes the pre-paint script).**
   - Cookies `leap-theme` (`light|dark|system`) and `leap-solid` (`1` or absent): `Path=/`, `SameSite=Lax`, `Max-Age` 1 year, not HttpOnly (the client writes them), `Secure` in production.
   - Root `layout.tsx` reads them with `cookies()` and renders `<html className>`: `dark` while `FORCED_THEME` is set; otherwise `dark` / `light` per cookie, or `system` → no theme class plus `data-theme="system"`; `solid` when `leap-solid=1`.
   - System mode without JS: extend the dark variant and the dark token block so `[data-theme="system"]` follows `@media (prefers-color-scheme: dark)` (Tailwind v4 block `@custom-variant dark { … @slot … }`). Keep the PR #29 `.light`-panel exclusion working.
   - `ThemeProvider` / `useTheme` / `useSolidSurfaces` write the cookie and toggle the class (no reload), keep cross-tab sync, keep `FORCED_THEME` behaviour.
   - Delete the `next/script` bootstrap and `src/lib/theme/script.ts`. Note in the PR that reading cookies makes the four static auth pages dynamic, and confirm the build output.
   - `themeColor`: unchanged while forced.
2. **Desktop shell (≥ 1024px; 768–1023 starts collapsed)** with `src/components/ui/sidebar.tsx`, `variant="floating"`, `collapsible="icon"`:
   - Restyle the sidebar to DESIGN and the mockup: `glass` surface, radius 16, 256 ↔ 56px, width animates on `--dur-3` / `--ease-out`, labels fade, collapsed items show tooltips, ⌘/Ctrl+B (the component's own shortcut — no other global key handlers).
   - Header: Leap mark + wordmark + collapse button; collapsed: mark with the expand button below it.
   - Nav in this order: Jobs, Applications (active count badge, existing query), Resume, Chat; group "You": Profile, Insights (non-interactive, "Soon" badge, `aria-disabled`, no link). Active item = `bg-brand-soft text-brand-text` via `usePathname`, `aria-current="page"`.
   - Remember the open state server-side (cookie read in the dashboard layout → `defaultOpen`), so a collapsed sidebar never flashes open on reload.
   - Content area: `main#main` with `max-w-[1200px]`, `min-w-0`, scrolls on its own; skip link "Skip to content" as the first focusable element; on route change move focus to `main` (`tabIndex={-1}`) without scrolling the page twice.
3. **Account menu** (`src/components/shell/AccountMenu.tsx`), the sidebar footer on desktop and the avatar in the mobile top bar:
   - Trigger: initials avatar + display name (`profiles.full_name`, else the part of the email before `@`), fetched in the dashboard layout alongside the badge query.
   - Contents: name + email (truncated); "View profile" → `/profile`; Theme segmented control Light / Dark / System — rendered disabled with the caption "Light theme arrives soon" while `FORCED_THEME` is set; Solid surfaces switch (works now); Sign out.
   - Sign out reuses `SidebarFooter`'s logic exactly (signOut → push /login → refresh), shows progress without changing width, errors as a toast. Delete `SidebarFooter.tsx` when nothing imports it.
   - Base UI menu/popover semantics: keyboard reachable, Escape closes, focus returns to the trigger; glass surface.
4. **Mobile shell (< 768px)** — replaces the scrolling top nav:
   - Slim top bar (`glass-bar`, sticky): Leap mark on the left, avatar menu trigger on the right (44px target).
   - Bottom tab bar: floating glass pill inset 12px, `padding-bottom: env(safe-area-inset-bottom)`, five items Jobs, Applications, Resume, Chat, Profile, icon over an 11px label. Inactive labels `text-foreground`; active = brand capsule (`bg-tab-on`), brand icon, semibold label (DESIGN §5.2 label rule — never muted text on glass).
   - `viewport` export adds `viewportFit: "cover"`; main content gets bottom padding so nothing hides under the tab bar; use `dvh`, never `vh`.
   - Fix the `/jobs` horizontal overflow at 375px: find the actual cause and fix it with the smallest class change (`min-w-0`, wrapping, `break-words` …) in the offending component — no redesign of JobCard.
5. **Boundaries and states**: `src/app/(dashboard)/error.tsx` (ErrorState + Retry via `reset()`), `src/app/(dashboard)/loading.tsx` (skeleton matching the shell's content area), `src/app/(dashboard)/not-found.tsx`, `src/app/not-found.tsx` and `src/app/global-error.tsx` (minimal, token-styled), and `src/app/(auth)/error.tsx`. Use the PR #29 Leap components.
6. **Toaster** mounted once in the root layout (remove the /dev/ui-only mount, or keep that one only if the gallery needs its own).
7. **Token gate**: add `src/components/shell` and `src/app/(dashboard)/layout.tsx` plus every new boundary file to `UI_TOKEN_PATHS`.
8. **Pages stay as they are** except: remove page-level wrappers that fight the shell (e.g. duplicated min-height or background) only if needed for correct layout, and keep every page's `h1`. List each such touch in the PR.

## Do NOT touch
API routes, `src/lib/ai`, `src/lib/jobs`, Supabase/migrations, `src/middleware.ts` (leave `/insights` in the prefixes), auth flows' logic, feature components' data logic (optimistic saves, apply tracking, tailoring, chat). No `motion`, no `react-markdown`, no new dependencies.

## Acceptance (all required)
- `gate.sh` green, including the token gate on the new paths.
- First Load JS before/after for `/jobs`, `/resume`, `/applications`, `/chat`, `/profile`, `/login` (same method as PR #29) — report the shell's cost honestly.
- `grep` proves no `next/script` theme bootstrap and no raw `<script>` remain.
- **Human must do (list in the PR):** on the Vercel preview, Brave Private window with extensions off, DevTools open —
  1. zero console errors or warnings on `/jobs`, `/applications`, `/resume`, `/chat`, `/profile`, `/login`;
  2. desktop 1280px: sidebar matches `docs/design/01` and `02` (expanded and collapsed); ⌘B toggles; reload keeps the collapsed state with no flash;
  3. account menu: Solid surfaces on → reload → still solid, no flash; Theme control disabled with its caption; Sign out lands on /login;
  4. Insights shows "Soon" and goes nowhere;
  5. phone width 375px (DevTools device mode, then a real phone): no sideways scroll on any page, tab bar labels readable over scrolled content, nothing hidden behind the tab bar, active tab correct;
  6. Tab key: skip link appears first, every shell control reachable with a visible ring, Escape closes the menu;
  7. macOS Reduce motion on → no sliding or scaling in the shell;
  8. every page's content still works: save a job, apply link opens, upload a resume, send a chat message.

## Review artifacts required in the PR
Layout and AccountMenu verbatim; the cookie read + `<html>` class code verbatim; globals.css diff for the system-theme variant; gate.sh diff; First Load JS table; list of page touches (item 8); the `/jobs` overflow cause and fix; deviations with reasons.

## Migration sequencing
None.
