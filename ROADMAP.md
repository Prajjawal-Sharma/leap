# Leap — Product Roadmap

> **Vision:** Leap is the AI job platform for anyone, anywhere. We match
> candidates to opportunities by meaning — what the work actually involves and
> what the candidate can actually do — not keywords, not pedigree, not paid
> visibility. India-first is where we launch and acquire, not what the product
> is about; the architecture is global from day one and the copy is value-led.

---

## Current State (shipped to `dev` through PR #24)

**Weeks 1-2 — Foundation:**
- Authentication (email + Google OAuth via Supabase) — PR #5
- Resume upload, PDF parsing, ATS scoring with Gemini analysis — PR #6
- Profile management (current role, target search, salary expectations) — PR #7
- Greenhouse job ingestion — PR #8, audited down to 20 live company boards in
  PR #14 (seven original slugs had never returned a job)
- 768-dimension semantic embeddings via gemini-embedding-001
- pgvector cosine similarity match engine
- Personalized job feed with match scores
- Daily cron infrastructure for ingest + embedding refresh (both Vercel Hobby
  cron slots now in use)

**Week 3 — Application Intelligence (complete):** see Phase 1 below.

**Hardening shipped alongside:** embed-pipeline data-loss fixes (PR #12), job
freshness via `last_seen_at` (PR #13), Gemini JSON validation boundary
(PR #15), per-key model-availability rotation (PR #18), quota-driven
single-call parse+score (PR #19), open-redirect guard (PR #20), full
password-reset flow (PRs #21/#24), per-user daily chat cap (PR #23), marketing
landing page (PR #22).

**Tech foundation:** Next.js 16 App Router · React 19 · TypeScript · Tailwind
v4 (CSS-first theme, no config file) · Supabase (Postgres + pgvector + Auth +
Storage) · Gemini API (free rotation + Tier 1 paid) · Vercel Hobby.
Resend and Sentry are planned, not yet installed.

---

## Phase Summary

| Phase | Timeline | Goal |
|---|---|---|
| **MVP Completion** | Weeks 3-4 | Ship usable product to 5 real users |
| **Phase 2 — Expansion** | Months 2-3 | Reach 500 active users, validate paid tier |
| **Phase 3 — Scale** | Months 4-6 | 50+ paying users, expand to non-engineering verticals |
| **Phase 4 — Platform** | Months 7-12 | Career Graph as identity layer, recruiter side |

---

## Phase 1 — MVP Completion (Weeks 3-4)

### Week 3: Application Intelligence — complete

**1. Kanban Application Tracker** — ✅ **SHIPPED** (PR #10)
- *What:* Drag-drop board with 6 columns: Saved · Applied · Viewed · Interviewing · Offered · Rejected/Withdrawn
- *Why:* Users currently track applications in spreadsheets or Teal. Keeping
  them in Leap closes the loop and feeds our recommendation engine
  (which jobs they apply to signals what they actually want).
- *Tech:* New `applications` rows tied to user_id and job_id. React DnD or
  native HTML5 drag/drop. No real-time sync needed (single user per board).
- *Integrates with:* Existing `public.applications` table (already in schema),
  `/jobs` feed (add "Save" and "Mark as applied" buttons on JobCard).
- *Effort:* 1.5 days

**2. AI Career Chat** — ✅ **SHIPPED** (PR #16)
- *What:* Persistent conversation with Gemini 2.5 Flash that has full user
  context: profile, resume, applications, recently viewed jobs.
- *Why:* Career questions are personal and contextual. ChatGPT can answer
  generally but doesn't know your situation. Leap's chat does.
- *Tech:* New `chat_messages` table. System prompt includes user context
  built from profile + parsed_content + recent applications. Streaming via
  Vercel AI SDK. Conversation history persists.
- *Integrates with:* All existing user data (profile, resume, applications).
  Surfaces as `/chat` route in dashboard.
- *Effort:* 2 days
- *As built:* streams gemini-2.5-flash on the paid Tier 1 key via the Vercel AI
  SDK. User context is fenced as data (`chat-context.ts`) and `parsed_content`
  is re-validated before it reaches the prompt. Capped at 30 user messages per
  day (PR #23).

**3. One-Click Tailored Resume** — ✅ **SHIPPED** (PR #17), PDF export still outstanding
- *What:* On any job card, "Tailor my resume for this role" button generates
  a JD-optimized version of the user's resume. Preview, edit, accept/reject.
- *Why:* The single most-asked-for feature from candidate research. Saves
  20-30 min per application.
- *Tech:* Gemini 2.5 Pro for the rewrite (better quality than Flash for
  this). Stores tailored versions in `resumes` table linked to job_id via
  the `applications.tailored_resume_id` foreign key (already in schema).
  Export as PDF using `react-pdf` or server-side `puppeteer-core` (lighter
  than full Puppeteer for Vercel serverless).
- *Integrates with:* Existing resume parser (uses parsed_content as input),
  applications tracker (auto-creates application row when user applies with
  tailored resume).
- *Effort:* 2 days
- *As built:* the rewrite runs on the free rotation (gemini-3.5-flash), not
  Gemini 2.5 Pro — pro-class models are 404/429 on every key in this project.
  Tailored versions are stored in `resumes` with `kind = 'tailored'` and a
  `job_id`. **PDF export is not built yet** and is the one open item from
  Week 3.

### Launch-gating backlog — not started

Ordered queue from `docs/SHIP_PIPELINE.md` §10; one branch each, spec written
from this roadmap plus that backlog. These gate launch and come before the
Week 4 feature work.

1. `fix/error-boundaries` (`#11`) — every page and the dashboard layout.
2. `fix/reauth-on-password-change` — Supabase secure-password-change +
   `reauthenticate()` flow.
3. `fix/quota-proof-chat-count` — counter table migration; Clear chat no longer
   resets the cap. (Today's cap counts `chat_messages` rows the user can
   delete — see Pitfall 7 in CLAUDE.md.)
4. `fix/reset-drive-by` — confirm step before `verifyOtp` when a session
   already exists.
5. `fix/oauth-chain` (`#13`) and `fix/parse-timeout` (`#23`).
6. `chore/middleware-to-proxy` — `src/middleware.ts` uses the deprecated
   convention; rename is its own PR.

The `#11` / `#13` / `#23` markers come verbatim from SHIP_PIPELINE §10. They
are **not** GitHub issue or PR numbers — this repo has no issues, and PRs
#11/#13/#23 are the Vertex research brief, the job-freshness fix and the chat
rate-limit fix respectively. Treat them as references into the PM's own
findings list until that list is linked here.

### Week 4: Activation and Launch — not started

Branch names and sequencing constraints below are from SHIP_PIPELINE §10.

**4. Daily Digest Email** — `feat/digest`
- *Blocked on a decision:* needs a **3rd cron**, but Vercel Hobby allows 2 and
  both are used (ingest + embed). Either drop a plan upgrade in, fold the
  digest into an existing cron, or trigger it externally — decide before
  speccing.
- *What:* Personalized morning email with 5-10 new matches above 70% match
  threshold, summary of application status changes, one career tip.
- *Why:* Re-engagement loop. The marginal user signs up, browses once,
  forgets. The daily email pulls them back when there's real signal.
- *Tech:* Vercel cron at 7 AM IST runs `/api/cron/send-digest`. Queries
  jobs ingested in last 24h that match each user's resume above threshold.
  Resend handles delivery (free tier 3000/mo covers our first 100 users).
- *Integrates with:* Match engine (re-runs match per user nightly), existing
  Supabase auth (uses verified email).
- *Effort:* 1 day

**5. Insights Dashboard** — `feat/insights`
- *What:* Personal analytics: skill coverage heatmap vs target roles, salary
  expectations vs market range, application funnel (sent → viewed →
  interviewed → offered), strengths and gaps.
- *Why:* Helps users understand *why* they're matching or not matching, and
  what to learn next. Shifts the relationship from transactional to advisory.
- *Tech:* Server-side aggregation queries over jobs + applications + match
  history. No new tables. Recharts for visualization.
- *Integrates with:* Match scores from `/jobs`, application outcomes from
  tracker, parsed resume skills.
- *Effort:* 1.5 days

**6. Onboarding Flow** — `feat/onboarding`
- *Blocked on:* `profiles.onboarded_at` does not exist in any migration. Add it
  (next number, idempotent, additive) before this work starts.
- *What:* First-time user wizard: upload resume → confirm profile auto-fill
  → set target roles + locations → see first 5 matches → guided tour.
- *Why:* First 60 seconds determines retention. Friction here kills 80% of
  signups.
- *Tech:* Multi-step component in `/onboarding`. Triggered by middleware
  when `profile.onboarded_at IS NULL`. Skip option always visible.
- *Integrates with:* All existing forms (resume upload, profile form) but
  re-styled as wizard steps.
- *Effort:* 1 day

**7. Mobile Responsive Pass** — `feat/mobile-pass`
- *What:* Every page works at 375px width. Touch targets minimum 44px.
  Kanban tracker becomes vertical list on mobile.
- *Why:* India is mobile-first. ~70% of LinkedIn India traffic is mobile.
- *Tech:* Audit each page with Chrome DevTools mobile mode. Tailwind
  responsive prefixes (`sm:`, `md:`, `lg:`). No PWA shell yet (Phase 3).
- *Integrates with:* All existing pages. No new logic.
- *Effort:* 1 day

**8. Tailored Resume PDF Export** — `feat/tailored-pdf-export`
- *What:* Export a generated tailored resume as PDF. This is the one item left
  open from Week 3 (PR #17 shipped generate/preview/store without export).
- *Why:* Without export the tailored resume can't actually be submitted
  anywhere, so the feature stops one step short of the user's goal.
- *Tech:* No PDF generation exists in the repo today — `pdf-parse` is
  read-only, for parsing uploads. Needs a renderer chosen with the Vercel
  serverless size limit in mind.

**9. India Remote Filter** — `feat/india-remote-filter`
- *What:* Filter the job feed to roles that are remote-friendly for
  India-based candidates.
- *Why:* Distribution fit for the launch market — the 20 Greenhouse boards are
  mostly US/EU companies, so "remote" is what makes them reachable at all.
- *Tech:* Builds on the existing `is_remote` and `location` columns on `jobs`;
  no new source needed.

**Week 4 Launch Criteria:**
- 5 real users complete full flow: signup → onboard → upload → match → apply → track
- Zero P0 bugs (data loss, broken auth, payment placeholder errors)
- Mobile + desktop both functional
- Sentry error tracking live (not installed yet — see CLAUDE.md tech stack)
- Privacy policy + terms drafted

**Manual, outside the `/ship` pipeline** (SHIP_PIPELINE §10) — a human does
these, no PR covers them:
- the `dev` → `main` deploy
- Supabase URL config and custom SMTP
- Vercel environment variables (`NEXT_PUBLIC_*` is baked at build time — set
  before the deploy build, not after)
- the cross-device password reset test

---

## Phase 2 — Expansion (Months 2-3)

Goal: Grow to 500 active users. Validate ₹499/month paid tier with 5-10
paying users. Expand job inventory 10×.

### Job Source Diversification
- **Lever direct API** (parallel to Greenhouse) — adds ~30 more startups
- **Arbeitnow** (free, remote-focused) — adds 2,000+ remote roles globally
- **JSearch via RapidAPI** (200/month free tier) — adds Indeed/LinkedIn-aggregated coverage
- **Adzuna** (free with registration) — strong India market coverage
- **Custom Greenhouse expansion** — onboarding 50 more companies via curated list

*Why:* 4,000 jobs is enough to validate matching. 50,000+ is the threshold
where users discover roles they wouldn't have found themselves.

*Integrates with:* The existing `NormalizedJob` interface — each source is
a drop-in adapter under `src/lib/jobs/`. No DB schema changes needed.

### Paid Tier (Leap+)
- ₹499/month in India, $15/month globally
- Unlocks: unlimited tailored resumes, AI mock interviews, deep skill gap
  analysis, priority job alerts (real-time vs daily)
- Stripe or Razorpay (RBI-compliant for India) for billing
- Free tier remains: 5 tailored resumes/month, daily digest, basic matching

### Salary Negotiation Coach
- *What:* User pastes offer letter or compensation breakdown. AI analyzes
  against market data (Levels.fyi paste + AmbitionBox crowdsourced), gives
  a negotiation script with specific counter-offer language.
- *Tech:* Gemini 2.5 Pro for analysis. Levels.fyi data via user-paste (no
  scraping). Optional: integrate with PayBuddy/4-day-week APIs if available.

### Skill Gap to Learning Path
- *What:* Compare user's resume embeddings against top 100 jobs in their
  target role. Identify the skills present in matches but absent in resume.
  Generate a learning path: "Learn Kubernetes (30 hours, free on KodeKloud
  → 2 weeks of evening study unlocks 40% more matches)."
- *Tech:* Vector arithmetic — cluster embeddings of jobs user is missing,
  identify cluster topic via Gemini. Cross-reference with curated free
  learning resources.
- *Integrates with:* Match engine, profile.target_roles.

### Application Status via Email Forwarding
- *What:* Users forward recruiter emails to `track@leap.app` (Resend
  inbound). Gemini parses the email, updates application status
  automatically.
- *Tech:* Resend inbound webhook → Gemini extracts: company, role, status
  change (interview scheduled, rejected, offer extended). Matches to existing
  application row via fuzzy company + role match.

### Settings & Notifications Preferences
- Email digest frequency (daily / weekly / off)
- Match threshold for alerts (default 70%, configurable)
- Account deletion + data export (GDPR/DPDP compliance)
- Quiet hours for notifications

### Mock Interview Agent (Premium feature)
- *What:* Voice-based AI interviewer that asks role-specific questions,
  evaluates answers, gives detailed feedback.
- *Tech:* Browser MediaRecorder API for voice capture. Gemini multimodal
  for evaluation. Question banks generated from job description + role
  taxonomy.

---

## Phase 3 — Scale (Months 4-6)

Goal: 50+ paying users. Expand beyond engineering. Begin platform monetization
via recruiter side.

### Resume Builder + Chrome Extension
- (Detailed in `PHASE_3_FEATURES.md`)
- Full editor with ATS-safe templates
- Chrome extension injects "Tailor with Leap" on LinkedIn, Greenhouse, Lever, Naukri job pages
- PDF + DOCX export with proper kerning

### Cross-Industry Expansion
- Current matching works for any field — semantic embeddings are field-agnostic
- Expansion is primarily about job sources and curated company lists
- Add: Marketing, Sales, Design, Product Management, Finance, Operations
- Per-vertical taxonomy enrichment for skill gap analysis

### Company Dashboard (Recruiter Side)
- *What:* Companies post jobs directly on Leap. View matched candidates ranked
  by semantic fit. Reach out to candidates who opt in.
- *Why:* Candidate-side product creates supply. Recruiter side captures
  monetization. Aligns with the "outcomes not visibility" pricing model.
- *Pricing:* Pay-per-accepted-interview, not pay-per-post (eliminates ghost
  jobs by design).

### Interview Preparation Agent
- Company-specific and role-specific prep
- Pulls interview question patterns from Glassdoor and LeetCode
- Generates personalized study plan for upcoming interview

### Offer Comparison Tool
- Side-by-side comparison of multiple offers
- Total comp normalization across India/US/Europe
- Equity vesting visualization
- "Which offer fits your stated career goals?" AI analysis

### WhatsApp Notifications
- Replace email digest with WhatsApp for India users (60%+ open rates vs 20% for email)
- Requires WhatsApp Business API (~₹500/month, justified at 50+ paying users)

### Mobile PWA Enhancement
- Service worker for offline browsing of saved jobs
- Push notifications for new high-match roles
- Install banner on Android Chrome
- Defer native iOS/Android apps to Phase 4 if PWA hits engagement ceiling

---

## Phase 4 — Platform (Months 7-12)

Goal: Leap as the verified career identity layer of the internet.

### The Career Graph
- *What:* User's professional identity is no longer a static resume PDF. It
  becomes a dynamic graph: verified work history, GitHub contributions,
  public projects, course completions, certifications, peer endorsements.
- *Why:* LinkedIn profiles are easily falsified, increasingly cluttered, and
  optimized for the platform's ads. The Career Graph is verified and
  semantically queryable.
- *Tech:* Extend the schema with `career_events` table (work, education,
  project, certification, endorsement). Each event has a verification source
  (GitHub OAuth, email domain, peer attestation). Embedding per career event.

### Multi-Source Profile Aggregation
- GitHub OAuth — verified commit history, language proficiency from real code
- Public project URLs — Leap fetches and summarizes
- LinkedIn paste-import — extract experience without scraping
- DigiLocker integration (India) — verified education credentials

### Real-Time Skill Verification
- LeetCode/HackerRank API for coding skill scores
- Coding challenges hosted by Leap (recruiter-funded)
- AI-evaluated portfolio reviews
- Output: per-skill confidence score (e.g., "React: verified expert,
  Kubernetes: claimed but unverified")

### API for Third-Party Integrations
- ATS providers (Greenhouse, Lever, Ashby) consume Career Graph data via API
- Educational institutions use Leap to identify skill gaps in their curriculum
- Companies use Leap to identify hiring gaps in their internal talent

### International Expansion Beyond Tech
- Healthcare, legal, finance, education verticals
- Region-specific career graphs (India DigiLocker, US degree verification,
  EU regulated profession registries)

---

## Architectural Principles (All Phases)

- **Single source of truth: Supabase Postgres.** No data duplication.
- **AI-first, not AI-bolted-on.** Every feature should leverage Gemini or
  pgvector if it makes the experience meaningfully better.
- **Privacy by default.** Users can export everything, delete everything,
  in one click. No data sales to third parties, ever.
- **Mobile parity.** Every desktop feature must work on mobile from day one.
  India is mobile-first.
- **Cost discipline.** Every new dependency requires justification. Free
  tiers preferred until revenue.
- **Test the boring stuff.** Auth, payments, data deletion, account
  recovery — these break trust when they fail.

---

## Success Metrics by Phase

| Phase | North Star Metric | Secondary Metrics |
|---|---|---|
| MVP (Wk 4) | 5 users complete full signup → apply flow | <2s page load, zero P0 bugs, mobile parity |
| Phase 2 (M3) | 500 weekly active users | 10 paying users, 30% week-2 retention, <$50/mo infra cost |
| Phase 3 (M6) | 50 paying users (₹25K MRR) | First recruiter customer, 60% week-4 retention |
| Phase 4 (M12) | 5,000 active users | Career Graph adopted by 1+ external partner |

---

## What We Will NOT Build (And Why)

These come up regularly but we deliberately exclude them:

- **Auto-apply to 100 jobs at once.** Sonara tried it. 5% interview rate.
  Volume without quality breaks trust with recruiters and candidates.
- **LinkedIn scraping.** Legally fraught, technically fragile, ToS violation.
- **Glassdoor salary scraping.** Same legal issues. Use Levels.fyi paste
  and AmbitionBox API instead.
- **Generic ATS optimization tips ("add more keywords").** Modern ATSs
  parse semantically. Outdated advice that erodes user trust.
- **Pay-for-visibility on the candidate side.** This is Naukri's model and
  exactly what we're disrupting.
- **Crypto, NFT credentials, Web3 anything.** Adds complexity, no demand.
- **Generic chatbots without context.** ChatGPT does this already and free.
  Our chat must use user context or it has no reason to exist.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Gemini pricing increase or model deprecation | Medium | High | Multi-model abstraction layer, fallback to Claude Haiku |
| Greenhouse ToS change | Low | High | Diversify sources early (Phase 2 priority) |
| Supabase free tier limit hit | Medium | Medium | Migrate to paid Supabase ($25/mo) at 1000+ users |
| Slow embedding throughput | Resolved | — | Tier 1 unlocked, 50 RPS sustained |
| User trust erosion from AI errors | Medium | High | Always show "AI generated" badges, human-in-loop for critical actions |
| Indian payment compliance (RBI) | Medium | Medium | Use Razorpay (RBI-compliant) instead of Stripe for India |

---

## Decision Log

Critical decisions documented as we go. Key entries so far:

- **Apr 28:** Chose Next.js 15 over Spring Boot for MVP iteration speed
- **Apr 29:** Made architecture global from day 1 (India-first launch only)
- **Apr 30:** Adopted 5-key Gemini rotation for free tier — superseded later
- **May 2:** Upgraded GEMINI_KEY_1 to Tier 1 paid (₹1000 deposit) after free
  tier rate limits made development unviable
- **May 13:** Phase 1 match engine shipped — semantic matching live
- **Jul 14:** Greenhouse slug audit — 25 boards down to 20 that actually
  return jobs; freshness now tracked via `last_seen_at`
- **Jul 18:** Free rotation moved to gemini-3.5-flash after per-key
  `generateContent` probes showed 2.5-flash 404s on newer free projects.
  Chat stays pinned to gemini-2.5-flash on the paid key.
- **Upgraded to Next.js 16 + React 19**; Tailwind v4 with a CSS-first theme and
  no `tailwind.config`. UI primitives are hand-rolled — shadcn/ui, Framer
  Motion and lucide were evaluated and deliberately not adopted.
- **Positioning:** dropped the "service company to product company" framing.
  Leap is an AI job platform that matches by meaning; India-first is
  distribution, not copy.

---

## How to Use This Roadmap

- **Weekly:** Review what's shipped vs planned. Adjust next week's scope.
- **Monthly:** Re-evaluate phase boundaries based on user feedback.
- **Quarterly:** Reassess long-term direction. Phase 4 in particular may
  shift based on Phase 2-3 learnings.

This is a living document. Edit freely. Add new ideas to the appropriate
phase. Move features between phases as priorities shift.

Updated: September 17, 2026