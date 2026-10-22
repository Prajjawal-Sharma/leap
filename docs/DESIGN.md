# Leap — Design System & UI Overhaul (v0.2, approved 22 Oct 2026)

> Source of truth for every UI change. Agents (Claude Code, Antigravity) read this and `CLAUDE.md` before touching UI.
> Status: APPROVED 22 Oct 2026. Binding once committed as `docs/DESIGN.md`; it overrides older UI notes in `CLAUDE.md` (PR 0 updates those). §12 records the approved decisions.
> Mockups: the "Leap UI Redesign" canvas (desktop Jobs light/dark, mobile Jobs, job sheet, chat, foundations), exported as PNGs into `docs/design/` in PR 0. The PNGs are the visual target; where they and this file disagree, this file wins.

---

## 1. Brief

- **Product:** AI job matching. Daily loop: *scan ranked roles → open one → judge fit → tailor → apply → track*.
- **Audience:** software engineers in India, job-hunting alongside a full-time job. Mostly on phones (often mid-range Android), desktop for focused sessions.
- **Requested feel:** information laid out like Notion / TUF (calm, scannable, functional); Apple-like material and fluid motion; light and dark themes with a user toggle; everything functional.
- **Constraint that shapes everything:** the USD 100–200 band is India's largest smartphone segment (~47% of shipments, IDC Q2 2026). Glass and motion must stay smooth on those phones.

## 2. Direction — "Glass chrome, paper content"

| Layer | Lives there | Material |
|---|---|---|
| **Chrome** (floats above) | sidebar, mobile tab bar, top bars once content scrolls under them, sheet action footers, menus, popovers, toasts | Frosted glass: blur + saturation, bright top edge, soft layered shadow |
| **Content** (paper) | job lists, job detail, sheets and dialogs (they hold content), resume analysis, forms, chat messages, board cards | Opaque surfaces, hairline borders, no blur, no gradients |

Density and hierarchy follow Notion/Linear: neutral surfaces, one brand colour, typography and spacing do the work. Motion follows Apple's fluid-interface rules: respond on touch, springs, always interruptible. Glass shows its material where content passes beneath it — the tab bar, a scrolled top bar, a sheet's action footer — so it never needs decorative backgrounds to read as glass.

**The one bold element — the Fit meter.** Leap's promise is fit. One consistent visual (ring + number) appears wherever fit or score shows: job rows, job detail, ATS score. Everything else stays quiet.

## 3. Research → decisions

| Finding | Decision for Leap |
|---|---|
| CSS `backdrop-filter` only blurs and recolours; it can't displace pixels, so Apple's refraction isn't reproducible on the web. Linear's Liquid Glass adaptation also skipped refraction. | Frosted glass with a specular top edge — no fake refraction, no SVG displacement filters. |
| Liquid Glass drew wide legibility criticism; accessibility reviewers say never put critical text or controls on a blur and always test with reduced transparency. | Glass on chrome only; all reading happens on paper. Text on glass must pass 4.5:1 against the worst background that can sit behind it. |
| `backdrop-filter` is GPU-heavy; large or stacked blurs over scrolling content drop frames on lower-end phones. | Max 3 blurred surfaces on screen, blur only fixed elements, solid fallback. |
| `prefers-reduced-transparency` works in Chrome/Edge 118+, not Safari. | Honour it, plus an in-app **Solid surfaces** setting (covers Safari). |
| Base UI (`@base-ui/react`) hit stable 1.0 in Dec 2025 and became the **default for new shadcn/ui projects on 3 Jul 2026**; Radix stays supported but development has slowed. | Use **shadcn/ui on Base UI primitives** — components are copied into the repo (we own the code), accessible by default, and every agent knows the API. This also restores the stack originally planned for Leap (Tailwind + shadcn). |
| shadcn's Sidebar supports `collapsible="icon"`, `floating`/`inset` variants, a mobile sheet and a ⌘/Ctrl+B shortcut. | The TUF-style collapsible sidebar comes almost for free. |
| Base UI Drawer supports swipe-to-dismiss and snap points. | Native-feeling bottom sheets on mobile without a separate drawer library. |
| CSS `linear()` easing (Chrome/Edge 113+, Firefox 112+, Safari 17.2+) approximates spring curves. | Springs as CSS tokens — zero JS for most motion. |
| Motion (`motion/react`) full bundle ~34 KB; `LazyMotion` + `m` starts ~4.6 KB; its `reducedMotion` defaults to "never". | Motion only where CSS can't (layout/FLIP: list filtering, board moves), lazy-loaded on those pages, `reducedMotion="user"`. |
| Next.js `viewTransition` is still experimental, "not recommended for production". | No route view transitions for now. |
| Apple's *Designing Fluid Interfaces*: feedback on pointer-down, springs over fixed timers, every animation interruptible. | Press states on pointer-down; transitions retarget from the current value; no blocking animations. |
| Linear derives light/dark themes from a few inputs in a perceptual colour space so surfaces stay consistent. | Tokens defined in OKLCH; surfaces as elevation steps, not ad-hoc greys. |
| Bottom tab bars suit 3–5 equal destinations with icon + label; scrollable tab bars are an anti-pattern. | Today's mobile nav is a scrollable tab row. Replace with a 5-item bottom tab bar. |
| Tailwind v4 class dark mode needs `@custom-variant dark (&:where(.dark, .dark *))`; `next-themes` sets the class before paint (no flash). | Exactly this setup. |

## 4. Principles

1. **Content on paper, chrome on glass.** Never blur behind text people read.
2. **One brand colour, used for intent.** Indigo = primary action, selection, fit. Status colours = status, never decoration.
3. **Respond on touch.** Every pressable reacts on pointer-down within a frame.
4. **Springs, not timers.** Interruptible, retargeting transitions; a little overshoot only for confirmations and gestures.
5. **Show what changed.** Motion answers an action. No decorative entrance animation on every section.
6. **Calm density.** Notion-like: generous line-height, tight chrome, grouping by whitespace before borders.
7. **Every state designed.** Loading (skeleton), empty (a next action), error (what happened + how to fix).
8. **Accessible by default.** WCAG AA in both themes, visible focus, keyboard paths, reduced motion/transparency honoured.

## 5. Tokens

Set up with `npx shadcn@latest init`, choosing Base UI (the default for new projects since July 2026 — confirm the exact option with `npx shadcn@latest init --help`; generated components must import `@base-ui/react`, not Radix), then replace its default palette with the values below. Variables live on `:root, .light` and `.dark` in `globals.css` (scoping by class lets the `/dev/ui` gallery show both themes side by side). Tailwind maps them via `@theme inline` **as `var()` references only**.

Components use semantic utilities only (`bg-card`, `text-muted-foreground`, `border-border`, `bg-primary`) — never hex values, never `neutral-*`/`indigo-*` palette classes, and avoid `dark:` variants.

> Naming follows shadcn: **`primary` is the brand**, **`accent` is the subtle hover fill** (not the brand). Leap extras are prefixed `brand-`, `glass-`, `fit-`.

### 5.1 Colour (hex for review; implement in OKLCH)

| Variable | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#F3F4F7` | `#0F1115` | App canvas |
| `--foreground` | `#14161B` | `#ECEEF2` | Primary text |
| `--card` | `#FFFFFF` | `#16191F` | Content surfaces |
| `--muted` | `#F6F7F9` | `#1C2027` | Inputs, subtle fills, skeletons |
| `--muted-foreground` | `#5E6472` (5.9:1) | `#9AA0AE` (6.7:1) | Secondary text |
| `--accent` | `#F0F1F4` | `#232731` | Hover / pressed row fill |
| `--primary` | `#4F46E5` | `#4F46E5` | Primary buttons (white text 6.3:1) |
| `--primary-foreground` | `#FFFFFF` | `#FFFFFF` | Text on primary |
| `--brand-text` | `#4F46E5` (6.3:1) | `#818CF8` (5.9:1) | Links, active nav label, fit numbers |
| `--brand-soft` | `#EEF0FF` | `rgb(129 140 248 / 0.14)` | Selected nav pill, selected row |
| `--border` | `rgb(16 18 24 / 0.08)` | `rgb(255 255 255 / 0.08)` | Hairlines |
| `--input` | `rgb(16 18 24 / 0.14)` | `rgb(255 255 255 / 0.14)` | Input borders |
| `--ring` | `#6366F1` | `#6366F1` | Focus ring (≥3:1 on both canvases) |
| `--destructive` | `#B91C1C` | `#F87171` | Destructive, errors |
| `--success` | `#15803D` | `#4ADE80` | Offered, confirmations |
| `--warning` | `#B45309` | `#FBBF24` | Needs attention only |
| `--faint` | `#8A909C` (3.2:1) | `#6B7280` (3.6:1) | **Disabled text and decorative icons only** — fails body-text contrast |

Contrast ratios are against `--card`. Why not keep `#6366F1` as the button fill: it measures **4.47:1** with white text — just under AA. It survives as the focus ring, where 3:1 is enough.

Supporting tokens (same files, same rules): `--fit-track` (ring track, foreground at 10% light / 12% dark), `--mk-{slate,teal,amber,sky}-{bg,fg}` (CompanyMark tints, every pair ≥ 6:1), `--switch-off`, `--seg-thumb` (segmented-control thumb), `--tab-on` (active tab capsule), `--scrim` (overlay behind dialogs and sheets: light `rgb(10 12 16 / 0.34)`, dark `rgb(0 0 0 / 0.55)`).

### 5.2 Glass material (chrome only)

```
--glass-bg         light rgb(255 255 255 / 0.82)   dark rgb(24 27 34 / 0.78)
--glass-blur       20px  (12px under 640px wide)
--glass-saturate   180%
--glass-border     1px solid var(--border)
--glass-highlight  inset 0 1px 0 rgb(255 255 255 / 0.65)   dark: / 0.07
--glass-shadow     0 1px 2px rgb(0 0 0 / .04), 0 12px 32px -8px rgb(0 0 0 / .12)   dark: .30 / .50
```

- Two utilities, defined once in `globals.css`: `.glass` for floating chrome (sidebar, tab bar, menus, popovers, toasts — border + shadow) and `.glass-bar` for edge-attached bars (top bars, sheet footers — hairline on the inner edge, no shadow). No ad-hoc blur values anywhere else.
- `@supports not (backdrop-filter: blur(1px))`, `@media (prefers-reduced-transparency: reduce)` and the **Solid surfaces** setting → `--glass-bg` at 0.96 alpha, blur 0.
- **Labels on glass that content scrolls under** (tab bar, top bars, sheet footers) use `--foreground` — the active tab included. Mark the active tab with a brand capsule (10% light / 16% dark), a `--brand-text` icon and a semibold label, not brand-coloured text. Never `--muted-foreground` there. Measured worst case, a primary button scrolled under the bar: muted labels fall to 3.8:1 at the earlier 0.72 alpha, and brand-coloured labels on the capsule fall to 4.2:1 (light) / 3.8:1 (dark) even at 0.82 / 0.78, while `--foreground` stays above 12:1. Re-check in the `/dev/ui` gallery.

### 5.3 Typography

- **Family:** system UI stack — `ui-sans-serif, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. SF on Apple devices, Roboto on Android, Segoe on Windows: native feel, nothing to download. Remove Geist and the `body { font-family: Arial }` override in the same change.
- **Numbers:** `tabular-nums` for fit %, scores, counts, dates.

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `display` | 40/44 (mobile 32/38) | 650 | Landing hero only |
| `title-1` | 28/34 | 650 | Page titles, mobile large title |
| `title-2` | 20/28 | 600 | Section titles, job title in detail |
| `title-3` | 16/22 | 600 | Row/card titles |
| `body` | 15/24 | 400 | Descriptions, chat |
| `body-sm` | 14/20 | 400 | Dense lists, meta |
| `caption` | 12/16 | 500 | Badges, timestamps |

Inputs ≥16px on mobile (stops iOS zoom-on-focus). Headings `text-wrap: balance`; paragraphs `text-pretty`; reading width ≤ 70ch.

### 5.4 Space, radius, elevation

- **Spacing (4px grid):** 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56.
- **Radius:** `--radius: 12px` → shadcn derives sm 8 (controls), md 10, lg 12 (rows, cards), xl 16 (floating chrome, sheets). Pills fully rounded.
- **Elevation:** content is flat (hairlines, no shadow). Shadows only on glass chrome and dragged items.

### 5.5 Motion

```
--ease-out      cubic-bezier(0.2, 0, 0, 1)                 /* critically damped feel */
--ease-spring   linear(0, 0.072, 0.235, 0.428, 0.611, 0.765, 0.882, 0.963, 1.013, 1.04, 1.049,
                       1.048, 1.041, 1.032, 1.022, 1.014, 1.008, 1.003, 1, 0.998, 1)   /* ~5% overshoot */
--dur-1  120ms   hover, tooltips, fades
--dur-2  200ms   controls, menus, tabs
--dur-3  300ms   panels, sidebar collapse, sheets
--dur-spring 500ms  confirmations (save, keep tailored), FitMeter fill
```

- Press: `scale(0.97)` + `--accent` fill on `:active` / pointer-down; release on `--ease-out`.
- Animate `transform` and `opacity` only (sidebar width is the one exception, `--dur-3`). Never `transition: all`.
- CSS transitions retarget from the current value, so they're interruptible by default — keep it that way; no `animationend`-gated logic.
- Gestures (sheet swipe) are handled by Base UI Drawer's own physics.
- Motion library only for layout animations (list filtering, board moves); lazy-loaded, `<MotionConfig reducedMotion="user">`.
- `prefers-reduced-motion: reduce` → opacity fades only, no scale/translate.

## 6. Layout & navigation

### 6.1 Desktop (≥ 1024px)

```
┌─ canvas ──────────────────────────────────────────────────────────────────┐
│ ╭─ glass sidebar ─╮  Jobs                                                 │
│ │ ◆ Leap       «  │  Ranked by fit with your resume                       │
│ │                 │  [Search…] [Location ▾] [Min fit ▾] [Saved] [Best ▾]  │
│ │ ▣ Jobs          │ ┌─ list (card) ─────────┐ ┌─ detail (card) ──────────┐│
│ │ ▤ Applications 2│ │ Senior SWE – Java  ◔68│ │ Senior Software Engineer ││
│ │ ▢ Resume        │ │ Squarespace · NYC     │ │ Squarespace · New York   ││
│ │ ◇ Chat          │ ├───────────────────────┤ │ ◔ 68%   Applied 15 Jul   ││
│ │                 │ │ Software Eng. 2    ◔68│ │ [Apply on site ↗]        ││
│ │ You             │ │ MongoDB · Dublin      │ │ [Tailor resume] [Saved]  ││
│ │ ◯ Profile       │ │ …                     │ │ Skill overlap · About    ││
│ │ ◔ Insights Soon │ └───────────────────────┘ └──────────────────────────┘│
│ │ (PS) Prajjawal ▾│                                                       │
│ ╰─────────────────╯                                                       │
└───────────────────────────────────────────────────────────────────────────┘
```

- **Sidebar:** shadcn Sidebar, `variant="floating"`, `collapsible="icon"`: 256px ↔ 56px icon rail, ⌘/Ctrl+B, state remembered. Glass. Active item = `--brand-soft` pill + `--brand-text` label. Groups: main (Jobs, Applications, Resume, Chat) and *You* (Profile, Insights "Soon").
- **Footer pinned** (never scrolls with content): user button → menu with Theme (Light / Dark / System), Solid surfaces, Sign out.
- **Content** scrolls on its own; max-width 1200; page header = title + one-line description + primary action.
- **Jobs = list + detail.** "View & Apply" no longer jumps off-site; **Apply on company site ↗** lives inside detail.
- Tablet (768–1023): sidebar starts collapsed.

### 6.2 Mobile (< 768px)

```
┌─────────────────────────┐
│ Jobs              (PS)  │ ← large title; collapses into a glass top bar on scroll
│ [Search…]     [Filters] │
│ ┌─────────────────────┐ │
│ │ Senior SWE – Java ◔ │ │
│ │ Squarespace · NYC   │ │
│ │ Applied 15 Jul      │ │
│ └─────────────────────┘ │
│ …                       │
│╭───────────────────────╮│
││ ▣    ▤    ▢    ◇    ◯ ││ ← glass tab bar, icon + label, safe-area inset
│╰───────────────────────╯│
└─────────────────────────┘
```

- **Bottom tab bar (5):** Jobs · Applications · Resume · Chat · Profile — a floating glass pill inset 12px from the screen edges, icon over an 11px label. Insights joins when built.
- **Job detail and filters open as bottom sheets** (swipe down or Close button to dismiss).
- **No horizontal page scrolling, ever.** Today `/jobs` overflows sideways on phones (cards wider than the viewport, buttons and match badge cut off). Fixed in the shell PR.
- Email + Sign out move out of the header (today they take a third of the first screen) into Profile and the avatar menu.

## 7. Components (`src/components/ui`, via `shadcn add`, Base UI primitives)

| Component | Source | Notes |
|---|---|---|
| Button, Input, Textarea, Label, Select, Checkbox, Switch | shadcn | variants via `cva`: default / secondary / ghost / outline / destructive; loading keeps width |
| Card, Separator, Badge, Avatar, Skeleton | shadcn | Card = paper; Badge for status only — neutral pill with a 6px dot (Applied = brand, Interviewing = warning, Offered = success, Viewed/Saved = faint); the label carries the meaning |
| Sidebar, Sheet | shadcn | floating + icon collapse; mobile uses Sheet |
| Drawer | Base UI Drawer | bottom sheets with swipe-to-dismiss and snap points; paper body, glass action footer |
| Dialog, AlertDialog, DropdownMenu, Popover, Tooltip, Tabs, ToggleGroup | shadcn | menus/popovers use `.glass` |
| Toast | shadcn `sonner` | glass, `aria-live` |
| **FitMeter** | custom SVG | ring + number; sizes xs (row) / md (detail) / lg (ATS); tabular nums |
| **CompanyMark** | custom | initials tile; tint picked from the company name out of the four `--mk-*` tints (no real logos) |
| **PageHeader, EmptyState, ErrorState** | custom | used by every page |

A dev-only `/dev/ui` route renders every component in both themes, for review screenshots.

**Fit tiers need calibration first.** Today's best matches sit at 67–68%, so a fixed "Strong ≥ 75%" label would never appear. PR 3 runs a percentile query over real match scores and sets tiers from it. Until then: number + ring in brand colour, plus the role's rank in the user's own feed ("Top match in your feed", "#4 of 20") — and never amber/red for an ordinary match (today's yellow "68% match" reads as a warning).

## 8. Page specs

| Page | Must change |
|---|---|
| **Shell** | Floating glass sidebar + mobile tab bar; pinned user menu; Insights → "Soon" (no 404); fix mobile overflow |
| **Jobs** | List + detail (desktop) / list + sheet (mobile). Rows: title, company · location, FitMeter, one status chip if set. Search + filters (role, location, remote, min fit, saved/applied) in URL params. **Keep tracking semantics:** *Apply on company site* records exactly what *View & Apply* records today (`JobCard.handleApplyClick`: native `target="_blank"` link, optimistic status `applied`, PATCH from `saved` or idempotent POST, silent rollback on failure); opening the in-app detail must not change application status |
| **Job detail** | Title, company, location, FitMeter + feed rank; actions Apply on company site ↗ / Tailor resume / Save; *Skill overlap* — resume skills found in the description, and common skills the description asks for that the resume lacks, computed by matching against the parsed resume (**no extra Gemini call**); description at reading width |
| **Resume** | Upload success becomes a toast, not a permanent banner; ATS FitMeter (lg) + verdict; strengths / improvements / missing keywords; past uploads show date + score, latest marked, collapsed after 3 (today: 13 identical "Updated Resume.pdf" rows, no dates) |
| **Tailor review** | Changed text highlighted; side-by-side on desktop, Current/Tailored tabs on mobile; sticky Keep / Discard bar |
| **Applications** | Desktop board without title truncation (horizontal scroll inside the board only); mobile = status segmented control + list; stat cards in sentence case |
| **Chat** | Rendered markdown (no raw `**`/`*`), assistant answers on paper, user messages as brand-tinted bubbles, composer pinned above the tab bar, daily limit shown subtly |
| **Profile** | Sentence-case section headings; sticky Save bar on mobile; warn on leaving with unsaved changes |
| **Auth** | Logo + one line of value; Google equal weight; 16px inputs |
| **Landing** | Same tokens/fonts as the app; a real product screenshot instead of icon tiles; fix the orphaned 5th feature card |

**Copy:** sentence case for headings and buttons (Notion convention — a deliberate deviation from Vercel's Title Case rule); no ALL-CAPS labels ("ACTIVE PIPELINE", "PERSONAL", "ATS SCORE" today); buttons say what happens ("Apply on company site", "Keep tailored resume"); errors say what happened and how to fix it; `…` not `...`.

## 9. Accessibility & performance budget

- WCAG AA in both themes, checked against glass's worst-case background.
- `:focus-visible` ring on everything interactive; skip link; logical heading order.
- Keyboard paths for sidebar, menus, sheets, board (drag has a "Move to…" menu alternative).
- `color-scheme` and `<meta name="theme-color">` per theme; native `<select>` explicitly themed.
- `touch-action: manipulation`; `overscroll-behavior: contain` on sheets/dialogs; safe-area insets on tab bar and sheets.
- Lighthouse mobile: Performance ≥ 90, Accessibility ≥ 95, CLS < 0.05.
- Motion lazy-loaded only on Jobs/Applications; no other new client chunk > 25 KB gzip without a stated reason.
- Test matrix: iPhone Safari, a real mid-range Android in Chrome, desktop Chrome/Safari — each with reduced motion on, reduced transparency on, both themes.

### 9.1 Release bar — no errors, no glitches (every UI PR)

- Zero console errors or warnings — React hydration warnings included — on every touched route under `npm run build && npm start`.
- No theme flash on hard reload; nothing renders unstyled or in the wrong theme first.
- No layout shift: images, skeletons and fit meters reserve their size; toasts, menus, popovers and sheets render in portals and never push content.
- Every async view has loading (skeleton), empty and error states; every route group has an `error.tsx` boundary and a `not-found` page.
- Buttons that start work disable and show progress without changing width; no double submits; optimistic updates roll back on failure with a visible message.
- Mobile: `100dvh`, never `100vh`; safe-area insets on the tab bar and sheets; sheets lock background scroll, close on Escape/swipe and return focus to their trigger; no horizontal scroll at 375px; inputs ≥ 16px.
- Navigation: returning to a list restores its scroll position and selection; focus moves to the new page's title.
- Behaviour is preserved: a UI PR keeps each feature's data logic (optimistic save, apply tracking, tailoring, chat cap) unchanged unless its spec says otherwise.
- Before any dev → main release: smoke test on a real Android phone and an iPhone, in both themes once the toggle is live.

## 10. Rules for agents (checked in review)

1. Read this file and `CLAUDE.md` before any UI change.
2. Colours only via tokens. No hex/`rgb()`/palette classes outside `globals.css`. *(PR 1 adds a `gate.sh` grep check.)*
3. Blur only via `.glass`, only on chrome.
4. Motion only via the tokens in §5.5; no `transition: all`; respect reduced motion.
5. Reuse `src/components/ui`; extend with variants — never fork a component per page.
6. No dependency beyond §12's approved list.
7. One PR per layer/page, branched off `dev`, `--base dev`, with before/after screenshots at 375px and 1280px **in both themes**.
8. Run the `web-design-guidelines` review on changed UI files; fix or justify each finding in the PR.
9. UI PRs never touch API routes, auth, database or Gemini prompts.

## 11. Build plan

| # | Branch | Owner | Contents |
|---|---|---|---|
| 0 | `docs/design-system` | You + Claude Code | Commit this as `docs/DESIGN.md` plus the canvas exports in `docs/design/`; point `AGENTS.md` and `CLAUDE.md` at it; replace CLAUDE.md's "no shadcn / lucide" rule, Brand Tokens and Geist notes |
| 1 | `feat/ui-foundation` | Claude Code `/ship` | `shadcn init` (Base UI), tokens (light/dark/glass/motion), system font, next-themes, Solid surfaces, components in §7, `/dev/ui` gallery, token gate check |
| 2 | `feat/ui-shell` | Claude Code `/ship` | Floating collapsible sidebar, mobile tab bar, large titles, user menu, Insights "Soon", overflow fix |
| 3 | `feat/ui-jobs` | Antigravity acct 1 | List + detail, mobile sheet, search/filters, FitMeter calibration |
| 4 | `feat/ui-applications` | Antigravity acct 2 | Board polish, mobile segmented list |
| 5 | `feat/ui-resume` | Antigravity acct 1 | Resume page, tailor diff view, past uploads |
| 6 | `feat/ui-chat` | Antigravity acct 2 | Markdown rendering (`react-markdown`, no raw HTML), bubbles, composer |
| 7 | `feat/ui-profile-auth-landing` | Antigravity acct 1 | Profile, auth, landing; **turn on the theme toggle** |
| 8 | `chore/ui-qa` | Claude Code | Guideline review, Lighthouse, device matrix fixes |
| — | `fix/ingest-entities` | Claude Code | "R&D" shows as "R D" — HTML entities stripped instead of decoded during ingest |

- **Theme rollout:** until PR 7, production is forced dark (`next-themes` `forcedTheme`) so half-migrated pages never show a broken light theme. Light/System go live together once every page uses tokens.
- PRs 1–2 are sequential. 3–7 can run two at a time, each in its own git worktree (`git worktree add ../leap-ui-jobs -b feat/ui-jobs dev`) so two agents never share a working tree.
- Review chain per PR: `gate.sh` → guidelines review → Gemini cross-review (`docs/GEMINI_REVIEW_PROMPT.md`) → PM review → merge → `/retro`.

## 12. Decisions (approved 22 Oct 2026)

| # | Decision | Approved |
|---|---|---|
| 1 | Font | System UI stack instead of Geist |
| 2 | Component foundation | shadcn/ui on Base UI primitives (copied into repo) |
| 3 | New dependencies | `next-themes`, `lucide-react`, `@base-ui/react`, `sonner`, plus shadcn's helpers (`class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`); `motion` (lazy, layout only); `react-markdown` in the chat PR |
| 4 | Glass scope | Chrome only |
| 5 | Jobs layout | List + detail on desktop, sheet on mobile |
| 6 | Theme | Default System; toggle in user menu; forced dark until PR 7 |

## 13. Sources

- Liquid Glass vs CSS — theplusaddons.com/blog/liquid-glass-ui
- Linear's Liquid Glass (no refraction) — linear.app/blog/linear-liquid-glass
- Legibility critique — infinum.com/blog/apples-ios-26-liquid-glass-sleek-shiny-and-questionably-accessible
- `backdrop-filter` performance — blog.openreplay.com/creating-blurred-backgrounds-css-backdrop-filter
- `prefers-reduced-transparency` — developer.chrome.com/blog/css-prefers-reduced-transparency
- shadcn default switched to Base UI — blog.openreplay.com/shadcn-ui-radix-base-ui-switch
- shadcn Sidebar (Base UI) — ui.shadcn.com/docs/components/base/sidebar
- Base UI Drawer — base-ui.com/react/components/drawer
- CSS `linear()` easing — developer.chrome.com/docs/css-ui/css-linear-easing-function
- Motion bundle & reduced motion — uithings.com/framer-motion
- Next.js `viewTransition` (experimental) — nextjs.org/docs/app/api-reference/config/next-config-js/viewTransition
- Fluid interfaces for the web — open-design.ai/skills/apple-design
- Linear theming in LCH — linear.app/blog/how-we-redesigned-the-linear-ui
- Bottom navigation — uxpin.com/studio/blog/mobile-navigation-examples; uxplanet.org/bottom-tab-bar-design-best-practices-ef3ee71de0fc
- Tailwind v4 dark mode + next-themes — sujalvanjare.vercel.app/blog/dark-mode-nextjs15-tailwind-v4
- India price bands (IDC Q2 2026) — 91mobiles.com/updates/india-smartphone-market-shrinks-11-percent-q2-2026-idc
- Vercel Web Interface Guidelines — github.com/vercel-labs/web-interface-guidelines
