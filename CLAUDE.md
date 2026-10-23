# CLAUDE.md — Leap Project Context

## What We Are Building
Leap is an AI job platform. We match people to roles by meaning — what the work
actually involves, and what the candidate can actually do — rather than by
keyword overlap, pedigree, or paid visibility.

India-first is a distribution decision, not a positioning one. It is where we
launch and where the early users are; it is not the product's story and it does
not belong in user-facing copy. Write for the value — better matches, less
wasted effort — and leave geography in the go-to-market plan.

Owner: Prajjawal Sharma (meprajjwalsharma@gmail.com)
Repo: github.com/Prajjawal-Sharma/leap
Working dir: `~/Prajjawal/Claude/leap`
Production: https://leap-five-delta.vercel.app

## Tech Stack (LOCKED — do not suggest alternatives)
- Framework: Next.js 16.4.2 App Router + React 19.2.4 + TypeScript strict mode
- UI: Tailwind CSS v4. The theme is defined in CSS — `@import "tailwindcss"`
  plus an `@theme inline` block in `src/app/globals.css`. There is **no**
  `tailwind.config` file in this repo; do not create one. PostCSS loads
  `@tailwindcss/postcss`.
- Components: UI is moving to shadcn/ui on Base UI primitives (src/components/ui,
  added in UI PR 1) plus Leap components in src/components/leap, following
  docs/DESIGN.md (approved 22 Oct 2026). Icons: lucide-react. `motion` only
  lazy-loaded for layout animations; `react-markdown` only in the chat PR.
  Hand-rolled components in src/components/features and src/components/landing
  stay until their page is migrated.
- Database: Supabase (Postgres + pgvector + Auth + Storage)
- AI: Gemini API — see "Model & key routing" below
- Embeddings: gemini-embedding-001, 768 dimensions, RETRIEVAL_DOCUMENT for
  jobs, RETRIEVAL_QUERY for resume
- Resume parsing: `pdf-parse` (with `@napi-rs/canvas`) server-side
- Job data: Greenhouse direct API — 20 curated company boards
  (`src/lib/jobs/companies.ts`). More sources in Phase 2.
- Hosting: Vercel Hobby. **Hobby allows 2 cron jobs and both are used**:
  `/api/cron/ingest-jobs` (daily 02:00 UTC) and `/api/cron/embed-jobs`
  (daily 03:00 UTC), per `vercel.json`. Anything else that needs a schedule
  requires a different mechanism or a plan upgrade — plan for that before
  proposing a third cron.
- Not installed, despite earlier notes claiming otherwise: Resend, Sentry,
  Vercel Analytics. Do not import or reference them as if they exist.
- `src/middleware.ts` still uses the deprecated Next.js `middleware.ts`
  convention; the rename to `proxy.ts` is tracked as its own change
  (`chore/middleware-to-proxy`), not something to fold into an unrelated PR.

## Design system
docs/DESIGN.md is the source of truth for tokens, components, motion, layout
and the release bar (§9.1); mockup exports live in docs/design/. Migrated code
uses semantic tokens only (bg-card, text-muted-foreground, …), enforced by a
token check that UI PR 1 adds to gate.sh. Legacy literal values (#0a0a0a,
#6366f1, neutral-*) remain only in pages not yet migrated. The app is forced
dark until UI PR 7. UI PR 1 replaces Geist with the system font stack.

## Model & key routing
There are three distinct call paths into Gemini. They are not interchangeable.
`src/lib/ai/gemini-client.ts` owns the rotation, cooldown and backoff
machinery; note that the model const is **not** centralised there — the tailor
route pins its own (see below).

- **Free multi-key rotation** (`callGemini` / `withGeminiKey`) — three
  consumers: the combined resume parse+score call, `/api/resume/score`
  (standalone re-score, its own separate call), and resume tailoring.
  Rotates over `GEMINI_KEY_2..GEMINI_KEY_8` with 60s cooldowns and exponential
  backoff. Model: **gemini-3.5-flash** (`DEFAULT_MODEL` in `gemini-client.ts`;
  `TAILOR_MODEL` in `src/app/api/resume/tailor/route.ts` holds the same value
  separately). Free tier is **20 requests/day per key** — roughly 140/day
  across the pool of 7, so treat every free-rotation call as scarce.
  `GEMINI_KEY_1` is deliberately excluded so free-tier work never bills the
  paid project.
- **Tier 1 paid, raw fetch** (`callGeminiTier1` / `getTier1Key`) — embeddings.
  Single key `GEMINI_KEY_1`, ~3000 RPM, 3-attempt tight backoff, no rotation.
- **Tier 1 paid via Vercel AI SDK** (`streamGemini`) — interactive chat.
  Streams `@ai-sdk/google` on `GEMINI_KEY_1`. Model: **gemini-2.5-flash**,
  pinned in its own `CHAT_MODEL` const so rotation-model changes never
  silently move chat.

Resume upload spends **one** Gemini call: parse and ATS scoring were merged
into a single prompt precisely because of the 20/day/key ceiling.
`/api/resume/score` still exists as a standalone re-score path and makes its
own free-rotation call — it is not part of the upload flow.

Model availability is **per-project, not per-model**: Google 404s older models
on projects with no prior usage, and `ListModels` still lists a model the
project cannot call. Only a real `generateContent` proves access. That is why
rotation skips per-key 404s mid-call rather than failing, and why model consts
are probed rather than assumed uniform.

Per-key availability pings are **off in production by default** — they run
when `NODE_ENV !== "production"`, or whenever `GEMINI_AVAILABILITY_CHECK=1` is
set. Setting that flag in production turns them on and burns ~7 requests of
the daily pool on every cold start, so leave it unset there.

### Definition of Done (every PR)
- `tsc --noEmit`, `eslint src --max-warnings=0`, `npm test`, `npm run build` all green (`.claude/hooks/gate.sh`).
- Every Gemini JSON output site: `JSON.parse → schema.safeParse` before any persistence; failure → 502 `{retryable:true}`, zero writes; schema composes existing ones; caps justified by that prompt's observed output.
- Every user- or job-derived string entering a prompt is fenced (BEGIN/END + guard line) with `===` runs collapsed.
- Every `resumes` read that expects a primary/uploaded resume filters `kind='uploaded'`; only the upload promote step writes `is_primary=true`.
- Migrations: next number, idempotent (`if not exists` / `drop ... if exists`), additive-first, applied by a human; PR states before/after-deploy.
- No new dependency without a spec-approved reason.
- PR body follows the template; review artifacts are verbatim.
- Never merge. Never push main. Always `gh pr create --base dev`.

### Pitfalls (append via /retro; keep one line each)
1. Supabase JS caps SELECT at 1,000 rows by default — paginate with stable ordering.
2. Multiple `is_primary=true` rows broke `maybeSingle` — unset-then-set; tailored rows are `kind='tailored'`, never primary.
3. Zod caps borrowed from another prompt 502'd real output (`keywords_missing` 115 chars vs 100) — calibrate per prompt; refines must accept sparse-real data.
4. Prompt fences can be escaped by a forged END marker or a tab between slashes — collapse `===` runs; reject C0/DEL in redirect targets.
5. "Model not available to new users" 404s vary per key/project — rotate past them; entitlement only shows at `generateContent`.
6. Free tier is 20 req/day/key; a proactive availability ping per cold start ate ~5% of the pool (~7 requests, one per free key). Pings run when `NODE_ENV !== "production"` OR `GEMINI_AVAILABILITY_CHECK=1` — that flag ENABLES them in production, it does not restrict them.
7. A daily cap counted from rows the user can delete resets on Clear chat — use a counter table or soft-delete.
8. Stacked PRs don't retarget when the base branch merges — always `--base dev`; delete merged branches.
9. `NEXT_PUBLIC_*` is baked at build time — set per environment before the deploy build, not after.
10. PKCE recovery links are same-browser only — use `token_hash`/`verifyOtp`; email templates live only in the Supabase dashboard.
11. Adding a route to `AUTH_ROUTES` bounces authenticated users — a recovery session is authenticated; leave reset out of both lists.
12. ROADMAP/CLAUDE.md drift (shadcn, Next 15, `onboarded_at`) — verify docs against code before building; `/retro` keeps docs true.
13. A freshness sweep must exempt companies whose fetch failed and skip entirely if zero boards returned — otherwise it mass-deactivates.
14. Don't re-run stale verifier agents on already-fixed code; run one fresh adversarial pass on the final diff.
15. `git` in the wrong clone/terminal looks like lost work — one repo, one path, check `pwd` first.

> Definition of Done and Pitfalls above are reproduced verbatim from
> `docs/SHIP_PIPELINE.md` §6. Append new pitfalls there via `/retro`.

## Database Schema (Supabase, public schema)
- `profiles`: id (= auth.users.id), full_name, phone, location, current_company,
  current_job_title, years_experience, target_roles[], target_companies[],
  notice_period_days, expected_salary_min/max/currency, linkedin_url,
  github_url, created_at, updated_at
- `resumes`: id, user_id, file_name, file_path, parsed_content (jsonb),
  ats_score, is_primary, kind ('uploaded' | 'tailored'), job_id, created_at
- `jobs`: id, source, source_id, title, company, location, is_remote,
  description, requirements, employment_type, apply_url, posted_at, is_active,
  last_seen_at, ingested_at
- `job_embeddings`: id, job_id (fk→jobs), embedding vector(768), created_at
- `applications`: id, user_id, job_id (fk→jobs), status
  (saved|applied|viewed|interviewing|offered|rejected|withdrawn), notes,
  tailored_resume_id, applied_at, updated_at
- `chat_messages`: per-user chat history (see `0005_chat_messages.sql`)
- RLS enabled on all tables

Migrations live in `supabase/migrations/` and are numbered sequentially
(`0001`…`0006`). Add the next number; never renumber an existing one.

## Current State
Shipped to `dev` through PR #24 — see ROADMAP.md for the full phase view.
Week 3 (Application Intelligence) is complete: applications tracker, AI career
chat, and one-click tailored resume are all merged. PDF export of a tailored
resume is still outstanding. Week 4 (digest email, insights dashboard,
onboarding flow, mobile pass) has not started.

## Coding Standards
- TypeScript strict mode — no `any` unless genuinely unavoidable
- Server components for data fetching, client components for interactivity
- Supabase server client in server components/routes, browser client in
  `"use client"` components
- All user-data queries run under the authenticated client so RLS filters by
  `user_id` implicitly — never hand-filter with a user id from the request body
- Anything user-derived that reaches a model prompt must be fenced and capped
  (see `src/lib/ai/chat-context.ts`) — a resume or a job title is data, never
  instructions
- Validate model JSON output against a zod schema before persisting it
- Error boundaries on every page; loading skeletons for all async data
- Mobile responsive: 375px minimum width, 44px touch targets
- No hardcoded user IDs anywhere

## Agent Instructions
- Read this file at the start of every session
- Read ROADMAP.md for feature context
- Before any UI change, read docs/DESIGN.md and look at the images in
  docs/design/.
- Prefer editing existing files over creating new abstractions
- After every task: run `npx tsc --noEmit` and `npm run lint`, report results
- Output a standard summary: files created, files modified, key decisions,
  things deferred
- Never suggest Spring Boot, Java, Redis, or paid services not already in use
- Token budget: batch related changes into single tasks; avoid separate tasks
  for lint/format

## Branch Strategy
- `main` — protected, auto-deploys to Vercel
- `dev` — integration branch, PRs merge here
- `feat/*`, `fix/*`, `chore/*` — one branch per change, PR into `dev`
