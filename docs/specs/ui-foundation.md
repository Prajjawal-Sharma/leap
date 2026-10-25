# feat: UI foundation — tokens, theming, component kit (UI overhaul PR 1)
deep: false            # true → extra security pass

## Goal (one paragraph, user-visible outcome)

Lay the foundation for the redesign in `docs/DESIGN.md` (approved 22 Oct 2026) without changing how any existing page looks or behaves, apart from the font. After this PR the app has Leap's tokens (light, dark, glass, motion), the system font stack, a class-based theme layer that is forced dark for now, the Solid surfaces setting, a shadcn/ui kit on Base UI in `src/components/ui`, Leap's own components (FitMeter, CompanyMark, PageHeader, EmptyState, ErrorState), and a `/dev/ui` gallery that shows all of it in both themes. Pages are migrated in later PRs (shell = PR 2). The release bar in `docs/DESIGN.md` §9.1 applies in full: no console errors or warnings, no theme flash, no layout shift.

Read first: `docs/DESIGN.md` (all of it), the images in `docs/design/` (the foundations board is the visual target for `/dev/ui`), `CLAUDE.md`, `AGENTS.md` (Next 16 guides live in `node_modules/next/dist/docs/`).

## Context verified by recon
Verify each and report TRUE / FALSE with file:line:
- `package.json` `"test"` runs a single file (`tsx --test src/lib/auth/safe-next.test.ts`, 39 tests).
- `src/app/globals.css` has a `prefers-color-scheme: dark` variable swap and `body { font-family: Arial, Helvetica, sans-serif }`, which overrides Geist.
- `src/app/layout.tsx` loads Geist and Geist_Mono through `next/font/google`.
- `src/app/(dashboard)/layout.tsx` hardcodes `bg-[#0a0a0a] text-white`; unmigrated pages and `src/components/features/*` use literal colours (`#6366f1`, `neutral-*`, `white/10`).
- No `error.tsx`, `loading.tsx` or `not-found.tsx` exists under `src/app` (added in PR 2, not here).
- `.claude/settings.json` does not allow-list `npm install` / `npx shadcn` — the human approves those prompts.
- `CLAUDE.md` (after PR 0) allows shadcn/ui on Base UI and lucide-react and points to `docs/DESIGN.md`.

## Changes

1. **shadcn/ui on Base UI.** Run `npx shadcn@latest init` and choose Base UI (the default for new projects since July 2026; confirm the exact option with `npx shadcn@latest init --help`). Use npm (the repo has `package-lock.json`). `components.json`: components in `src/components/ui`, `cn` in `src/lib/utils.ts`, CSS `src/app/globals.css`, icon library lucide. Tailwind v4 is configured in CSS only — never create a `tailwind.config`; if the CLI tries to, stop and report. Generated components must import `@base-ui/react`, not Radix.
   Approved dependencies (DESIGN §12): `@base-ui/react`, `lucide-react`, `sonner`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`. Anything else the CLI pulls in: list it in the PR with the reason; if it isn't required by a component below, don't add it. No `motion`, no `react-markdown` in this PR.

2. **Components.** `npx shadcn@latest add` button input textarea label select checkbox switch card separator badge avatar skeleton sidebar sheet drawer dialog alert-dialog dropdown-menu popover tooltip tabs toggle-group sonner. If the registry's drawer is not Base UI-backed (e.g. it pulls in `vaul`), don't add vaul: build `drawer.tsx` on Base UI's Drawer (swipe to dismiss, snap points, returns focus to its trigger). Restyle to DESIGN.md: radius 8 (controls), 12 (cards, rows), 16 (floating chrome, sheets); desktop controls 36–40px tall, touch targets ≥ 44px on mobile; Button variants default / secondary / outline / ghost / destructive plus a `loading` prop that keeps the button's width and sets `aria-busy`; press feedback `scale(0.97)` with the motion tokens; `focus-visible` ring in `--ring`. Menus, popovers, dropdowns, tooltips and toasts use `glass`; dialog, sheet and drawer bodies are paper (`bg-card`), and a drawer footer may use `glass-bar`. No page uses these yet.

3. **Tokens in `globals.css`.**
   - DESIGN §5.1 colours on `:root, .light` and `.dark` — hex as given, or OKLCH that rounds back to the same hex (keep the hex in a comment). Supporting tokens: `--fit-track`, `--mk-{slate,teal,amber,sky}-{bg,fg}`, `--switch-off`, `--seg-thumb`, `--tab-on` (light `rgb(79 70 229 / 0.10)`, dark `rgb(129 140 248 / 0.16)`), `--scrim` for overlays behind dialogs and sheets (light `rgb(10 12 16 / 0.34)`, dark `rgb(0 0 0 / 0.55)`) — so shadcn's `bg-black/50` overlays become `bg-scrim`. Map shadcn's required names (including `sidebar-*`) onto these values.
   - `@theme inline` maps everything as `var()` references only; radius scale from `--radius: 12px`.
   - `@custom-variant dark (&:where(.dark, .dark *));`
   - Glass per §5.2: light `rgb(255 255 255 / 0.82)`, dark `rgb(24 27 34 / 0.78)`, blur 20px (12px below 640px), saturate 180%, top highlight, layered shadow. Two utilities via `@utility`: `glass` (floating: border + shadow) and `glass-bar` (edge-attached: hairline on the inner edge, no shadow; provide the top-edge variant for footers). Fallbacks: `@supports not (backdrop-filter: blur(1px))`, `@media (prefers-reduced-transparency: reduce)` and `html.solid` → background at 0.96 alpha, no blur.
   - Motion per §5.5, including the `linear()` spring. Under `prefers-reduced-motion: reduce`, transitions are opacity-only (no scale or translate).
   - Delete the `body { font-family: Arial … }` rule and the `prefers-color-scheme` block (theming is class-based now). Body uses `bg-background text-foreground font-sans`.

4. **Theme layer — no warnings, no flash.** Known issue: next-themes 0.4.6 makes React 19 log "Encountered a script tag while rendering React component" on Next 16.2 (pacocoursey/next-themes#387, still open). The `scriptProps={{ type: "application/json" }}` workaround stops the pre-paint script from running and brings back the theme flash, so don't use it. Build a small in-house layer in `src/lib/theme/` instead:
   - A pre-paint script injected with `next/script` `strategy="beforeInteractive"` in the root layout (or the Next 16 equivalent — check `node_modules/next/dist/docs`). It sets `dark` / `light` and `solid` on `<html>` from localStorage (`leap:theme`, `leap:solid-surfaces`) and `prefers-color-scheme`, inside try/catch. No React component may render a raw `<script>`.
   - `ThemeProvider` + `useTheme()` with theme `light | dark | system`, `resolvedTheme`, `setTheme`, a `matchMedia` listener and cross-tab sync through the `storage` event. `export const FORCED_THEME: "dark" | undefined = "dark"` in `src/lib/theme/config.ts`: while set, the script always applies dark and `setTheme` is a no-op. PR 7 sets it to `undefined`.
   - `useSolidSurfaces()` — get/set, keeps the `html.solid` class and storage in sync.
   - Server-render `<html className="dark">` while `FORCED_THEME` is set, so the first paint is right even without JS. `suppressHydrationWarning` on `<html>` only.
   - `color-scheme` follows the theme; `viewport` export with `themeColor` light `#F3F4F7` / dark `#0F1115` (media queries).
   - Switching theme must not animate (disable transitions for one frame while the class changes).
   - If you can prove next-themes gives zero warnings and no flash on Next 16.2.4 / React 19.2.4, you may use it instead — show the evidence.

5. **Font.** Remove Geist and Geist_Mono (`next/font`) from `layout.tsx`. `--font-sans` = the system stack in §5.3, `--font-mono` = `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`. Nothing downloaded.

6. **Leap components** in `src/components/leap/`, matching §7 and the foundations board:
   - `FitMeter`: sizes xs 40px / stroke 3, md 64 / stroke 5, lg 96 / stroke 7; ring rotated −90°, round caps; arc `--brand-text`, track `--fit-track`; tabular number (xs shows "68" with a smaller "%"); `role="img"`, `aria-label="68% fit"` (overridable label); fill animates `stroke-dasharray` with `--ease-spring` / `--dur-spring`, not under reduced motion; brand colour only — never amber or red.
   - `CompanyMark`: one initial (first letter or digit of the company name, uppercased), tint = stable hash of the name mod 4 over the four `--mk-*` tints; sizes 36 / 40 / 48; `aria-hidden` (the company name is always shown as text beside it).
   - `PageHeader` (title, one-line description, actions slot), `EmptyState` (title, body, one action), `ErrorState` (what happened, how to fix, Retry).

7. **Pure helpers + tests** in `src/lib/ui/`: `fit-meter.ts` (clamp 0–100, round, dash string for a radius) and `company-mark.ts` (initial and tint; deterministic; handles empty, whitespace-only, emoji-led and non-Latin names). Tests beside them. Change `npm test` to run every `src/**/*.test.ts` (check the glob works with tsx on the repo's Node version, or list the files explicitly); the existing 39 tests must still run — report the new total.

8. **`/dev/ui` gallery** (`src/app/dev/ui/page.tsx`): every component above in a `.light` panel and a `.dark` panel side by side (class-scoped tokens make this work while the app is forced dark), the Solid surfaces switch, a glass tab bar over scrolling rows, and motion demos (button press, segmented-control thumb on the spring, switch). Returns `notFound()` when `process.env.VERCEL_ENV === "production"` (stays available locally and on Vercel preview deploys); `robots: { index: false }`; not linked from anywhere. It meets §9.1 itself — no horizontal scroll at 375px.

9. **Token gate** in `.claude/hooks/gate.sh`: add `run "tokens" check_tokens`. It fails on hex / `rgb()` / `hsl()` literals, arbitrary colour values (`-[#…]`) and Tailwind palette colour classes (`bg|text|border|ring|fill|stroke|outline|from|via|to|shadow|divide|placeholder|decoration` + `-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)`) in files under `UI_TOKEN_PATHS=(src/components/ui src/components/leap src/app/dev)`, printing file:line for each hit. `globals.css` is exempt. Leave the doc-sync check exactly as it is. Later page PRs append their paths.

10. **No visual regressions in unmigrated code.** Before adding any global base style (for example shadcn's `* { border-color: var(--border) }`), grep `src/app`, `src/components/features` and `src/components/landing` for `border` / `divide` / `outline` / `ring` utilities with no explicit colour. If a global default would change how they render, scope the default to migrated code (e.g. `:where(.ui) *`) or give the legacy uses their current colour explicitly. Every unmigrated page must look exactly as it does in production, except for the font.

## Do NOT touch
API routes, `src/lib/ai`, `src/lib/jobs`, `src/lib/supabase*`, `src/middleware.ts`, `supabase/migrations`, `vercel.json`, auth logic, and every page and feature component — except the root `layout.tsx` (theme provider, script, font, `<html>` class, viewport) and `globals.css`. No page migration and no new routes besides `/dev/ui`. No `motion`, no `react-markdown`. Don't edit `docs/DESIGN.md`; if it is wrong or contradicts the code, stop and report.

## Acceptance (all required)
- `gate.sh` green, including the new `tokens` step and the new tests (total ≥ 39 + new).
- Every recon claim reported TRUE / FALSE with file:line.
- `npm run build`: First Load JS for `/`, `/jobs`, `/resume`, `/chat` before vs after. Unmigrated routes grow by no more than ~3 KB gzip (theme provider + script).
- `grep` proves no React component renders a raw `<script>`; the theme script is injected via `next/script` `beforeInteractive` (or the documented Next 16 equivalent).
- `/dev/ui` is unreachable on production deploys (`VERCEL_ENV=production`) — explain how this is guaranteed at build/runtime.
- **Human must do (list these in the PR):** on the Vercel preview and on `npm run dev`, with Chrome DevTools open —
  1. zero console errors or warnings on `/`, `/login`, `/jobs`, `/resume`, `/applications`, `/chat`, `/profile`, `/dev/ui`;
  2. hard reload (Cmd+Shift+R) shows no light flash;
  3. every existing page looks like production except the font, at 375px and 1280px;
  4. `/dev/ui` light and dark panels match `docs/design/` (foundations board);
  5. Solid surfaces survives a reload with no flash;
  6. Tab key reaches every `/dev/ui` control with a visible ring;
  7. macOS Reduce motion on → no scale/translate on press, sheets or switches.

## Review artifacts required in the PR
- Dependency table: name, version, why, and gzip size where relevant.
- `globals.css` token and utility blocks, verbatim.
- `gate.sh` diff, verbatim.
- The theme pre-paint script, verbatim.
- Test output summary (counts).
- First Load JS before/after table.
- Components added, and any that could not be Base UI-backed, with what you did instead.
- Deviations from this spec or from DESIGN.md, each with a reason.

## Migration sequencing (if any)
None — no database changes.
