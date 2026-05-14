# Leap — Product Roadmap

> **Vision:** Leap is the semantic job matching platform for anyone, anywhere.
> We match candidates to opportunities based on actual fit — not keywords,
> not pedigree, not paid visibility. India-first launch, global architecture
> from day one.

---

## Current State (May 2026)

**Shipped (Weeks 1-2):**
- Authentication (email + Google OAuth via Supabase)
- Resume upload, PDF parsing, ATS scoring with Gemini analysis
- Profile management (current role, target search, salary expectations)
- Greenhouse job ingestion across 25 companies (~3,800 active jobs)
- 768-dimension semantic embeddings via Gemini Embedding 001
- pgvector cosine similarity match engine
- Personalized job feed with match scores and reasoning placeholders
- Daily cron infrastructure for ingest + embedding refresh

**Tech foundation:** Next.js 15 App Router · TypeScript · Supabase (Postgres
+ pgvector + Auth + Storage) · Gemini API (Tier 1) · Vercel · Resend.

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

### Week 3: Application Intelligence

**1. Kanban Application Tracker**
- *What:* Drag-drop board with 6 columns: Saved · Applied · Viewed · Interviewing · Offered · Rejected/Withdrawn
- *Why:* Users currently track applications in spreadsheets or Teal. Keeping
  them in Leap closes the loop and feeds our recommendation engine
  (which jobs they apply to signals what they actually want).
- *Tech:* New `applications` rows tied to user_id and job_id. React DnD or
  native HTML5 drag/drop. No real-time sync needed (single user per board).
- *Integrates with:* Existing `public.applications` table (already in schema),
  `/jobs` feed (add "Save" and "Mark as applied" buttons on JobCard).
- *Effort:* 1.5 days

**2. AI Career Chat**
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

**3. One-Click Tailored Resume**
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

### Week 4: Activation and Launch

**4. Daily Digest Email**
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

**5. Insights Dashboard**
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

**6. Onboarding Flow**
- *What:* First-time user wizard: upload resume → confirm profile auto-fill
  → set target roles + locations → see first 5 matches → guided tour.
- *Why:* First 60 seconds determines retention. Friction here kills 80% of
  signups.
- *Tech:* Multi-step component in `/onboarding`. Triggered by middleware
  when `profile.onboarded_at IS NULL`. Skip option always visible.
- *Integrates with:* All existing forms (resume upload, profile form) but
  re-styled as wizard steps.
- *Effort:* 1 day

**7. Mobile Responsive Pass**
- *What:* Every page works at 375px width. Touch targets minimum 44px.
  Kanban tracker becomes vertical list on mobile.
- *Why:* India is mobile-first. ~70% of LinkedIn India traffic is mobile.
- *Tech:* Audit each page with Chrome DevTools mobile mode. Tailwind
  responsive prefixes (`sm:`, `md:`, `lg:`). No PWA shell yet (Phase 3).
- *Integrates with:* All existing pages. No new logic.
- *Effort:* 1 day

**Week 4 Launch Criteria:**
- 5 real users complete full flow: signup → onboard → upload → match → apply → track
- Zero P0 bugs (data loss, broken auth, payment placeholder errors)
- Mobile + desktop both functional
- Sentry error tracking live
- Privacy policy + terms drafted

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

---

## How to Use This Roadmap

- **Weekly:** Review what's shipped vs planned. Adjust next week's scope.
- **Monthly:** Re-evaluate phase boundaries based on user feedback.
- **Quarterly:** Reassess long-term direction. Phase 4 in particular may
  shift based on Phase 2-3 learnings.

This is a living document. Edit freely. Add new ideas to the appropriate
phase. Move features between phases as priorities shift.

Updated: May 13, 2026