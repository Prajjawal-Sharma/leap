# Leap — pre-launch audit (November 2026)

Read-only audit ahead of onboarding the first five users. The bar is ROADMAP's
"Week 4 Launch Criteria": signup → onboard → upload → match → apply → track,
zero P0 bugs, Sentry live, privacy policy and terms.

**Result: not ready to invite users yet.** Nine findings block launch. They fall
into five groups: auth email cannot reach real users on Supabase's built-in
mailer; there is no privacy policy, terms or sign-up notice; the Gemini paths
send résumé text to the unpaid tier and have no per-user limits; a failed
résumé parse leaves the user with a dead job feed; and nothing reports errors
to the owner. One date matters inside the launch window: the chat model is
retired on 1 December 2026 (P1-6).

## How to read this

- **Audited:** `dev` at `5a98588` on 16 November 2026. `main` (`d321f53`,
  release #39) has an identical tree, so every finding describes production too.
- **Method:** every route, library, migration, auth page and cron runner was
  read in full and is cited as `file:line`. Three things were also run against
  a local production build: all 20 API handler and method pairs return 401
  without a session, the signed-out page redirects, and how the server answers
  a path that begins with two slashes (P1-1). Platform limits were read from
  vendor documentation on the audit date; sources are at the end.
- **[Unverified]** marks anything that lives only in a dashboard or the live
  database. The check to run is under "Owner checks".
- **[Known]** marks the items that were already known, with their current status.
- **Priority:** **P0** — do not invite users until fixed or consciously
  accepted: it breaks the flow for a real user, mishandles their data, can take
  the product down or drain the paid key, or is an explicit launch criterion.
  **P1** — fix in the first week. **P2** — later.
- **Size:** S is under half a day, M is one to two days, L is more.
- **PR:** `1`–`6` are the PRs proposed below. `#37` is the open app-shell PR.
  `Ops` is a dashboard or configuration task with no PR. `Roadmap` is a branch
  the roadmap already plans. `Docs` goes through `/retro`.

## Findings

| ID | Area | Finding | Where | Impact | Fix | Size | PR |
|---|---|---|---|---|---|---|---|
| P0-1 | Email | **[Unverified]** Email sign-up and password reset rely on Supabase's built-in mailer. Without custom SMTP it delivers only to addresses on the project's own team, at 2 messages an hour, and is documented as not for production. Nothing in the repo configures a provider, and ROADMAP still lists custom SMTP as a manual step. | `src/app/(auth)/signup/page.tsx:21-28`<br>`src/app/(auth)/forgot-password/page.tsx:19-21`<br>`ROADMAP.md:206` | A real user who signs up by email sees "Email address not authorized", gets no confirmation mail, and cannot reset a password. | Set custom SMTP in Supabase with a sender domain you own (a `vercel.app` address cannot be one), raise the Auth email limit above the 30-an-hour default, and run sign-up and reset end to end with an address outside the team (check 1). With no domain before launch: Google sign-in only, and hide the email forms. | S | Ops (forms: 4) |
| P0-2 | Privacy | No privacy policy, no terms, and no notice or consent on sign-up. `/privacy` and `/terms` return 404, and neither the landing footer nor the auth pages link to them. | `src/components/landing/LandingPage.tsx:223-240`<br>`src/app/(auth)/signup/page.tsx:89-155`<br>`ROADMAP.md:201` | A stated launch criterion is unmet, and users hand over a résumé, phone number and salary expectations without being told who processes them. | Publish both pages (data collected; the processors Supabase, Vercel and Google Gemini; retention; deletion; contact; 18 and over), link them from the footer and auth pages, and add an acceptance line on sign-up with the time recorded. | M | 4 |
| P0-3 | Privacy, spend | Résumé text goes to Gemini's unpaid tier. Parse, score and tailor use the unbilled keys. Google's terms for unpaid use allow product-improvement use and human review, and say not to submit personal information. Rotating seven unbilled projects also sits badly with the API-limits clause in Google's API terms. | `src/lib/ai/gemini-client.ts:70-73,481-514`<br>`src/lib/ai/resume-analysis.ts:143-173`<br>`src/app/api/resume/tailor/route.ts:92-113` | Every résumé, with contact details and full work history, is sent under terms that permit human review, and the keys the upload flow depends on can be withdrawn. | Send parse, score and tailor through the billed key (paid use is excluded from product improvement and covered by Google's data-processing terms), behind the caps in P0-5, and name the processor in the policy. This reverses the cost rule in CLAUDE.md "Model & key routing", so it is the owner's decision. | S | 2 |
| P0-4 | Spend, reliability | Every job-feed view makes a paid embedding call for the same résumé text. There is no cache and no cap. | `src/lib/jobs/match-engine.ts:144-145`<br>`src/app/api/jobs/match/route.ts:23-45`<br>`src/app/(dashboard)/jobs/page.tsx:20-39` | Any account can call it in a loop, and when the paid key is out of credit (HTTP 402, already seen in production) the main page fails for every user. | Embed the résumé query once, store it with the résumé, and recompute only when the parsed text changes. The feed then needs no Gemini call. | M | 2 |
| P0-5 | Spend | No per-user cap on parse, score, tailor or upload. Only chat has a counter. These routes share about 140 requests a day, `/api/resume/score` is called by no UI, and sign-up is open to any Google account. | `src/app/api/resume/parse/route.ts:34-132`<br>`src/app/api/resume/score/route.ts:38-112`<br>`src/app/api/resume/tailor/route.ts:115-232`<br>`src/app/api/resume/upload/route.ts:14-131` | Five users tailoring normally, or one account in a loop, use up the day's pool; every upload and tailor then fails until the quota resets. | Add per-user, per-day, per-feature counters with an atomic consume function (the `chat_usage` design: readable but never writable by users), and consume before each Gemini call and each upload. Delete or cap the unused score route. Until this ships, switch off new sign-ups in Supabase once the five users are in. | M | 2 |
| P0-6 | Spend | Profile fields reach the paid chat prompt at any length. History is budgeted and the résumé block is schema-capped, but name, title, company, location and both target lists are stored and interpolated unbounded, and users can also write their own row directly. | `src/app/api/profile/route.ts:33-45,110-122`<br>`src/lib/ai/chat-context.ts:33-63,189-200`<br>`supabase/migrations/0001_initial_schema.sql:21-39,45-63,73-78` | The 30-a-day cap bounds calls, not tokens: one account can make each call carry megabytes of prompt and drain the prepaid balance, which takes chat and embeddings down for everyone. | Cap every field and list in the API, add matching CHECK constraints (the API is not the only writer), and truncate again in `formatProfile`. | S | 2 |
| P0-7 | Reliability | A failed or slow parse strands the user. Upload makes the new file primary and demotes the working one before parsing. Parsing has a 30-second limit, up to five attempts with no per-call timeout, and fails outright on image-only PDFs. After a reload the retry button is gone, and the Resume page shows the older résumé as current while the feed, tailoring and chat read the unparsed one. | `src/app/api/resume/upload/route.ts:84-93,104-119`<br>`src/app/api/resume/parse/route.ts:23,114-119`<br>`src/lib/ai/gemini-client.ts:140,491-514`<br>`src/app/(dashboard)/jobs/page.tsx:142-144`<br>`src/app/(dashboard)/resume/page.tsx:142-153,184-204,272-280` | The feed says "Upload your resume first… still being processed" indefinitely and tailoring returns 409; a returning user loses a feed that worked. | Promote to primary only once parse and score are saved. Raise the parse limit (the platform allows 300 s) and bound each attempt. Let the Resume page retry an unparsed upload after a reload. Say plainly when a PDF has no text layer. Remove abandoned rows and files. The Definition of Done line on who writes `is_primary` changes with it. | M | 1 |
| P0-8 | Reliability | No error tracking or alerting. Failures go to `console.error`, Vercel Hobby keeps runtime logs for about an hour, and Sentry is a launch criterion that is not installed. | `package.json:12-30`<br>`ROADMAP.md:200`<br>`src/app/api/jobs/match/route.ts:68`<br>`src/app/api/chat/route.ts:213-215` | A paid-key outage, a failing cron or a crashing page is found only when a user reports it, as with the 402 in production. | Install Sentry for server, client and the error boundaries from #37. Report every handled 5xx and 502 path. Alert by email on new issues and on Gemini 401, 402 and 403. Set a low-balance alert on the Gemini billing account. This is a new dependency and needs a spec. | M | 3 |
| P0-9 | Reliability | No error boundaries, global error page or not-found page on `dev`. This is the first item of the launch-gating backlog. | `src/app/` (no `error.tsx`, `global-error.tsx` or `not-found.tsx`)<br>`ROADMAP.md:109`<br>`docs/DESIGN.md:250` | An exception in any page shows the framework's bare error screen with no way back. | Already written in open PR #37. Review and merge it before launch. | S | #37 |
| P1-1 | Auth | `safeNext` still accepts targets that a URL parser turns into a path beginning with two slashes, or into Next's internals. #33 added the canonical check to the route guard only. The login page and the callback are protected today by things outside the function: the server answers a double-slash path with a 308 to the single-slash path (confirmed locally), and no flow yet carries `next` through a successful callback. Next 16.4.2's client router gives `location.replace` a relative address on same-origin hard navigations (`completeHardNavigation`), so that redirect is the last line of defence. | `src/lib/auth/safe-next.ts:35-45`<br>`src/lib/auth/route-guard.ts:41-50,69-73`<br>`src/app/(auth)/login/page.tsx:35`<br>`src/app/auth/callback/route.ts:11,24` | A hosting change, or carrying `next` through OAuth (P2-6), reopens the open redirect that #20 and #33 set out to close. | Canonicalise inside `safeNext`: resolve against a fixed dummy origin, require the same origin, reject a resolved path that starts with two slashes or sits under `/_next`, and return the resolved path. Move the route-guard test classes into `safe-next.test.ts`. | S | 5 |
| P1-2 | Auth | A recovery link is verified the moment the page loads, even when someone else is already signed in (launch-gating backlog item 4). | `src/app/auth/reset-password/page.tsx:59-68`<br>`ROADMAP.md:115` | A signed-in user who opens another account's recovery link is moved into that account without notice, and what they upload next lands there. | Show "Reset the password for …?" and verify only on click, either always or whenever a session already exists. | S | 5 |
| P1-3 | Auth | Any signed-in session can set a new password with no current password and no re-authentication (launch-gating backlog item 2). | `src/app/auth/reset-password/page.tsx:91-103,148`<br>`ROADMAP.md:110` | A few minutes with an unlocked browser, or a stolen session, becomes a permanent takeover. | Turn on Supabase's secure password change and add the re-authentication step for sessions that did not come from a recovery link (check 2). | M | 5 + Ops |
| P1-4 | Auth | Sign-up confirmation links only work in the browser that started the sign-up. The callback handles a PKCE `code` and nothing else. | `src/app/(auth)/signup/page.tsx:26`<br>`src/app/auth/callback/route.ts:8-22`<br>`src/app/(auth)/login/page.tsx:62-66` | Sign up on a laptop, tap the email on a phone, and the first screen is "Sign in failed. Please try again." | Add a confirmation route that verifies a `token_hash`, as the reset flow does, switch the "Confirm signup" template to it, and land on "Email confirmed — sign in". | S | 5 + Ops |
| P1-5 | Auth, abuse | **[Unverified]** Nothing in the forms carries a CAPTCHA token, and nothing limits who can sign up. | `src/app/(auth)/signup/page.tsx:21-28`<br>`src/app/(auth)/forgot-password/page.tsx:19-21`<br>`src/app/(auth)/login/page.tsx:25-28` | An outsider can use up the hourly email allowance, so real users get no confirmation or reset mail, or can create accounts at will. | Enable CAPTCHA for sign-up, sign-in and reset in Supabase and pass the token from the three forms. For the private launch, close sign-ups once the invited users are in (check 2). | S | 5 + Ops |
| P1-6 | Reliability | Chat is pinned to `gemini-2.5-flash`, which Google retires on 1 December 2026; requests are then routed to `gemini-3.5-flash-lite`. `gemini-3.5-flash`, used for parse, score and tailor, is already served by `gemini-3.6-flash`. | `src/lib/ai/gemini-client.ts:132,138`<br>`src/app/api/resume/tailor/route.ts:23`<br>`CLAUDE.md:64,73` | Chat changes to a lite model in launch fortnight without anyone choosing it, and the zod caps were calibrated on a model that no longer answers. | Choose and pin the replacements, prove each with a real `generateContent` on the key that will use it (Pitfall 5), re-check JSON-mode behaviour and the caps, and update CLAUDE.md. | S | 2 |
| P1-7 | Data | **[Unverified]** The feed query asks for 150 neighbours through an HNSW index and filters `is_active` afterwards. pgvector returns at most `hnsw.ef_search` rows from such a scan (40 by default) and applies filters after it. Deactivated jobs keep their embeddings, so they take a growing share of those 40. | `supabase/migrations/0002_match_function.sql:16-24`<br>`supabase/migrations/0001_initial_schema.sql:204-206`<br>`src/lib/jobs/match-engine.ts:70,147-151`<br>`src/lib/jobs/ingest-runner.ts:135-140` | If the planner uses the index, a user sees at most 40 matches minus the inactive ones, and fewer every week. | Run check 4. If confirmed, set `hnsw.ef_search` for the function or enable iterative scans, and delete a job's embedding when it is deactivated (re-embed on reactivation). If the feed already shows fewer than 20 roles, treat this as P0. | S | 6 |
| P1-8 | Data | **[Known — open]** Embeddings are never refreshed when a job's text changes. Ingest rewrites title and description daily, the embed run only picks jobs with no vector, and nothing records which text a vector came from. #35 changed how every description is decoded, so all stored vectors now describe the old text. | `src/lib/jobs/ingest-runner.ts:100-104`<br>`src/lib/jobs/embed-runner.ts:43-101`<br>`supabase/migrations/0001_initial_schema.sql:198-202` | Scores are computed from text the user never sees, and an employer's edits never reach the ranking. | Store a hash of the embedded text with each vector, re-embed when it differs, and re-embed the whole table once after deploy. | M | 6 |
| P1-9 | Chat | The chat page loads the oldest 50 messages, not the newest. | `src/app/(dashboard)/chat/page.tsx:9,18-23` | After 50 rows, which is possible on the first busy day, a reload hides the latest conversation. | Order newest first, take 50, then reverse, as the API route already does (`src/app/api/chat/route.ts:150-164`). | S | 2 |
| P1-10 | Injection | **[Known — open]** The chat context fence is not neutralised. Profile fields, résumé fields and job titles go between the BEGIN and END markers without collapsing `===` runs or flattening line breaks. The tailor route does this correctly. | `src/lib/ai/chat-context.ts:23-24,33-63,68-101,112-125,189-200`<br>`src/app/api/resume/tailor/route.ts:47,92-113` | Text in a résumé, a profile field or an employer-controlled job title can close the fence and speak with system-prompt authority in that user's chat. | Move the tailor route's marker neutralisation into a shared helper, apply it with line-break flattening and a length cap to every interpolated value, and test that a forged END marker cannot survive. | S | 2 |
| P1-11 | Injection | The parse and score prompts are not fenced. Résumé text sits between triple quotes with no markers, no guard line and no neutralisation, all of which the Definition of Done requires. | `src/lib/ai/resume-analysis.ts:149-173`<br>`src/app/api/resume/score/route.ts:24-29,110` | Text hidden in a PDF can steer the parsed fields and the ATS score; the schema bounds the shape, not the content. | Use the shared fence helper from P1-10 in both prompts and keep the schema gate. | S | 2 |
| P1-12 | Authorization | Parse downloads whatever path the résumé row names, using the service role. Users may insert and update their own rows, `storage_path` included. | `src/app/api/resume/parse/route.ts:59-63,82-85`<br>`supabase/migrations/0001_initial_schema.sql:117-128` | Only the unguessability of paths stops one user's parse request from reading another user's PDF into their own row. | Refuse any path outside the caller's own user-id folder, and enforce the same rule in the database with a CHECK constraint. | S | 1 |
| P1-13 | Authorization | **[Unverified]** The `resumes` bucket and its policies exist only in the dashboard. | `src/app/api/resume/upload/route.ts:9,66-73`<br>`src/app/api/resume/parse/route.ts:25`<br>`supabase/migrations/` (no `storage` statement) | Nobody can tell from the repo whether résumé PDFs are private; a public bucket would make each one readable by URL. | Confirm the bucket is private with no policies for `anon` or `authenticated` (check 3), set a 5 MB limit and PDF-only type on it, and record that in a migration. | S | Ops + 1 |
| P1-14 | Privacy | No account deletion, no résumé deletion and no export. Storage files sit outside the foreign-key cascades, and each re-upload keeps the previous PDF and its full extracted text. | `src/app/api/resume/` (upload, list, parse, score and tailor only)<br>`src/app/api/resume/parse/route.ts:173`<br>`supabase/migrations/0001_initial_schema.sql:46,96,241` | A user cannot remove a résumé or leave. A deletion request is manual SQL that leaves the PDFs behind, and India's DPDP erasure duties become enforceable around May 2027. | Add "delete this résumé" (row and file), "delete my account" (the Storage folder, then the auth user; cascades do the rest) and "download my data". State retention in the policy. A documented manual procedure is acceptable for the first five users if the policy says so. | M | 4 |
| P1-15 | Reliability | **[Unverified]** No database backups. ROADMAP treats the project as on Supabase's Free plan, which includes no automatic backups. | `ROADMAP.md:418`<br>`supabase/migrations/` (applied by hand) | A bad migration or an accidental delete cannot be undone, and "no data loss" is a launch criterion. | Schedule a daily `pg_dump` to private storage (a scheduled GitHub Action is enough) and restore one to prove it works. | S | Ops |
| P1-16 | Reliability | Cron runs leave no record and answer 200 when they fail. A missing `CRON_SECRET` is a silent daily 401. Ingest's worst case, four waves of 15-second timeouts, already equals its 60-second limit. Vercel does not retry a failed run and may deliver one twice. | `src/app/api/cron/ingest-jobs/route.ts:7,10-27`<br>`src/app/api/cron/embed-jobs/route.ts:7,14-35`<br>`src/lib/jobs/ingest-runner.ts:14`<br>`src/lib/jobs/greenhouse.ts:13`<br>`vercel.json:2-11` | Ingest or embedding can stop for days, so closed jobs stay in the feed and new ones never arrive, with no signal. | Return 500 when the summary is not ok, raise both limits to 300 s, record each run (a small table or Sentry cron check-ins), and alert on a missed or failed run. | S | 3 |
| P1-17 | Reliability | **[Known — chat fixed, feed open]** Upstream and database error text reaches users. Chat has been sanitised since #32 and is live in release #39. The job feed still forwards the raw message, which embeds 200 characters of Google's reply. Parse, score and tailor do the same, and several routes return raw Supabase messages. | `src/app/api/jobs/match/route.ts:67-72`<br>`src/app/(dashboard)/jobs/page.tsx:69-72,128-137`<br>`src/lib/ai/gemini-client.ts:290-296,376-382`<br>`src/app/api/resume/parse/route.ts:151-156`<br>`src/app/api/applications/route.ts:81-83`<br>`src/app/api/chat/route.ts:31-37,211-222` (fixed) | A paid-key outage prints Google's billing JSON on the main page, and SQL detail reaches the browser. | Write one helper that sends the detail to the log and Sentry and returns a fixed message per failure class, and use it in every route. | S | 3 |
| P1-18 | Launch gap | A kept tailored résumé cannot be reopened, copied or exported. The preview has Keep and Discard only, the API returns ids, and "Re-tailor" regenerates and overwrites. | `src/components/features/TailorResumeModal.tsx:205-231`<br>`src/app/api/resume/tailor/route.ts:373-399`<br>`src/components/features/JobCard.tsx:409-413` | The headline feature ends in a preview the user cannot take to an application, and looking again costs another Gemini call. | Add "view" and "copy as text" for the stored version now, and PDF export as planned. | M | Roadmap (`feat/tailored-pdf-export`) |
| P1-19 | Launch gap | "Insights" in the sidebar links to a page that does not exist. | `src/app/(dashboard)/layout.tsx:22`<br>`src/lib/auth/route-guard.ts:17` | A new user clicking through the navigation hits a 404. | #37 shows it as "Soon" with no link. | S | #37 |
| P1-20 | Launch gap | There is no onboarding step. `feat/onboarding` has not started and `onboarded_at` exists in no migration. A new user is carried by one empty-state card, and nothing leads from a finished upload to the feed. | `ROADMAP.md:157-168,197`<br>`src/app/(dashboard)/jobs/page.tsx:108-126`<br>`src/app/(dashboard)/resume/page.tsx:504-537` | The "onboard" step of the launch criterion does not exist. | Either reword the criterion for the first five users and add a "See your matches" action after upload, or build `feat/onboarding` after its migration. | S or M | Roadmap (`feat/onboarding`) |
| P1-21 | Launch gap | Mobile: DESIGN.md records `/jobs` overflowing sideways on phones. This was not re-tested in the audit. | `docs/DESIGN.md:196`<br>`src/app/(dashboard)/layout.tsx:61-66`<br>`ROADMAP.md:199` | "Mobile and desktop both functional" is a launch criterion. | The shell fix is in #37. Test at 375 px on a real phone before inviting anyone. | S | #37 |
| P2-1 | UI | **[Known — open]** The Applications badge is counted once in the server layout, and nothing refreshes it after a save, an apply or a status change. #37 keeps the same query. | `src/app/(dashboard)/layout.tsx:25-42,58`<br>`src/components/features/JobCard.tsx:150-253`<br>`src/components/features/ApplicationsDashboard.tsx:158-200` | The badge is wrong until a hard reload. | Call `router.refresh()` after a successful change, or count on the client. | S | Roadmap (UI PR 3 or 4) |
| P2-2 | Performance | **[Known — open on dev, fixed in #37]** Sign-out imports supabase-js statically in a component the layout renders on every dashboard page. | `src/components/features/SidebarFooter.tsx:6`<br>`src/app/(dashboard)/layout.tsx:4,89` | Every dashboard page ships the Supabase client for a button that is rarely pressed. | #37 loads the account menu panel lazily. | S | #37 |
| P2-3 | Performance | **[Known — open, unverified]** No function region is set anywhere in the repo. Each signed-in page view makes two to four `getUser()` round trips, and the jobs and applications pages call their own API over HTTP. | `vercel.json:1-12` (no `regions`)<br>`src/proxy.ts:30-32`<br>`src/app/(dashboard)/layout.tsx:49-52`<br>`src/app/(dashboard)/jobs/page.tsx:20-39`<br>`src/app/(dashboard)/applications/page.tsx:15-28` | If functions and database are in different regions, every round trip crosses the globe several times per page. | Set the function region to the Supabase region in Vercel (check 7), and call the match and applications code directly from the server components. | S | Ops + 6 |
| P2-4 | Auth | **[Unverified]** Other sessions after a password change: the code only calls `updateUser`, then assumes the session that made the change is still signed in. Supabase documents that a password change terminates the user's sessions. Access tokens already issued stay valid until they expire, up to an hour by default, against the database API; Leap's own routes re-check each request with `getUser()`. | `src/app/auth/reset-password/page.tsx:121-128,148`<br>`src/proxy.ts:30-32` | Until the two-browser test is run, this is documented behaviour rather than observed behaviour. | Run check 6. If another browser stays signed in, add an explicit sign-out of other sessions after the update. | S | 5 |
| P2-5 | Auth | Route gating loose ends. The proxy's redirect responses do not carry cookies that `getUser()` refreshed, and `/profile` is missing from the protected prefixes, so it is guarded by the layout alone and loses its return path. | `src/proxy.ts:37-49`<br>`src/lib/auth/route-guard.ts:11-18`<br>`src/app/(dashboard)/layout.tsx:54-56` | Rare surprise sign-outs after a redirect, and `/profile` visitors return to `/jobs` after signing in. | Copy the refreshed cookies onto every redirect response, and add `/profile` to the prefixes. | S | 5 |
| P2-6 | Auth | Redirects after sign-in. Google sign-in drops `next` (backlog `fix/oauth-chain`), and all four redirect URLs come from a build-time variable with no check that it is set. | `src/app/(auth)/login/page.tsx:43-48`<br>`src/app/(auth)/signup/page.tsx:26,45`<br>`src/app/(auth)/forgot-password/page.tsx:20` | Google users always land on `/jobs`, and a build without the variable sends them to "undefined/auth/callback". | Carry `next` through the callback once P1-1 is in, build the URLs from the current origin, fail the build when required variables are missing, and add `.env.example`. | S | 5 |
| P2-7 | Auth | Password rules differ and exist only in the browser: sign-up needs eight characters, reset needs eight plus a letter and a digit. The reset page also still has the `?code=` branch marked for removal. | `src/app/(auth)/signup/page.tsx:127`<br>`src/app/auth/reset-password/page.tsx:75-89,134-141` | The server accepts whatever Supabase's default allows. | Set the policy in Supabase, mirror it in one shared check, and delete the legacy branch. | S | 5 + Ops |
| P2-8 | Hardening | No security headers are set, and the session cookies are readable by script, which is the `@supabase/ssr` default. | `next.config.ts:3-5`<br>`src/lib/supabase-server.ts:10-21` | One injected script could read a session, and pages can be framed. | Add a content security policy (at least `frame-ancestors 'none'`), `nosniff` and a referrer policy, and drop `X-Powered-By`. | S | 3 |
| P2-9 | Abuse | The database has no size limits, and users can write several tables directly: chat rows of any length and role, application notes and résumé JSON. | `supabase/migrations/0005_chat_messages.sql:11,26-30`<br>`supabase/migrations/0001_initial_schema.sql:100,245`<br>`src/app/api/applications/route.ts:134-137` | One account can fill the 500 MB Free-plan database. | Add length CHECK constraints in the same migration as P0-6. | S | 2 |
| P2-10 | Reliability | Upload details. The 5 MB limit is above Vercel's 4.5 MB request cap, so larger files fail with a platform error the page cannot parse. The type check trusts the declared MIME type. The full extracted text is stored uncapped and returned for every upload. | `src/app/api/resume/upload/route.ts:8,42`<br>`src/app/(dashboard)/resume/page.tsx:71,189,255`<br>`src/app/api/resume/parse/route.ts:173`<br>`src/app/api/resume/list/route.ts:21-24` | Confusing failures near the limit, and a growing payload on each Resume page load. | Limit uploads to 4 MB on both sides, check the `%PDF-` signature, cap the stored text at the prompt's 16,000 characters, and leave it out of the list response. | S | 1 |
| P2-11 | Spend | Rotation details. With no free keys configured, the rotation silently uses the paid key. Keys travel in the URL query. A spent daily quota is reported as "retry in 60s". | `src/lib/ai/gemini-client.ts:73,202-209,251-257,433,492`<br>`src/lib/ai/embeddings.ts:53,99` | A misconfigured environment bills the paid key without notice, and users retry all day against a quota that resets tomorrow. | Fail loudly instead of falling back, send keys in the `x-goog-api-key` header, and tell users when the daily limit is reached. | S | 2 |
| P2-12 | Chat | Chat robustness. After the first chunk nothing bounds the stream, so a reply still streaming at 60 s is cut off unsaved. The save's result is never checked and its exception is swallowed unlogged. A failed context query is read as "no profile, no résumé". A 402 from the paid key costs the user a daily slot. | `src/app/api/chat/route.ts:17,29,216-218,256-266,280-284`<br>`src/lib/ai/chat-context.ts:141-169` | Replies vanish from history, the model answers as if the user had no résumé, and users pay for an outage that is ours. | Stop the stream before the limit and save what exists, check and log the insert, fail the request when a context query errors, and refund billing and auth failures. | S | 2 |
| P2-13 | Data | Inactive jobs and their embeddings are never purged, and the embed run also embeds inactive jobs. | `src/lib/jobs/ingest-runner.ts:127-163`<br>`src/lib/jobs/embed-runner.ts:71-84` | The table and index grow without bound on a 500 MB plan, and paid calls embed dead jobs. | Embed only active jobs, and purge inactive jobs that no application refers to after a retention period. | S | 6 |
| P2-14 | Data | Applications data. `applied_at` is the row's creation time and is not stamped when a saved job becomes applied. Ids and `job_id` are not validated, so bad input returns raw database errors. `tailored_resume_id` is written by nothing, has no ownership check and blocks deletes. | `supabase/migrations/0001_initial_schema.sql:244,246`<br>`src/app/api/applications/route.ts:112-118,200-203,205-241`<br>`src/components/features/JobCard.tsx:76-86` | "Applied on" shows the day the job was saved. | Stamp `applied_at` on the first move to applied, validate UUIDs, and settle the foreign key's delete rule together with PDF export. | S | 6 |
| P2-15 | UI | Feed gaps. Only the first 20 matches are ever shown, with no paging or filters, and a failed apply-tracking call reverts silently. | `src/components/features/JobFeed.tsx:91-95`<br>`src/app/(dashboard)/jobs/page.tsx:10`<br>`src/components/features/JobCard.tsx:245-251` | Users cannot get past the top 20, and an application can go untracked without notice. | Planned in UI PR 3 (list and filters); add a visible failure state there. | M | Roadmap (UI PR 3) |
| P2-16 | Product | Matching ignores the profile and assumes engineering. The query text is built from the résumé alone with "software engineer" hard-coded, while the profile page says the profile shapes matches. The landing page states "3,000+ live roles". | `src/lib/jobs/match-engine.ts:72-102`<br>`src/app/(dashboard)/profile/profile-form.tsx:193`<br>`src/components/landing/LandingPage.tsx:152` | Target roles and locations change nothing, and two public claims are unverified. | Use target roles in the query text or change the copy, and confirm the live job count (check 5). | S | Roadmap |
| P2-17 | Docs | Documentation drift. Vercel Hobby now allows 100 cron jobs per project (once a day, within the scheduled hour), so the digest is not blocked on a cron slot. The schema section names columns that do not exist. The model lines predate the routing in P1-6. After this PR, SHIP_PIPELINE still shows the reviewers on `inherit`. | `CLAUDE.md:37,64,73,128,133`<br>`ROADMAP.md:130`<br>`docs/SHIP_PIPELINE.md:23,213,239,257,278,458,532` | Plans are made on limits that no longer apply. | Correct through `/retro`, keeping the two gate-synced sections identical. | S | Docs |
| P2-18 | Email | Digest prerequisites. It is not blocked by cron slots (P2-17). It needs: a verified sender domain (P0-1); an opt-in column, an unsubscribe link that works signed out and the `List-Unsubscribe` header; one-send-per-user-per-day idempotency, because Vercel can deliver a run twice and never retries; a service-role job that reads only what it mails; the cached résumé embedding (P0-4), so each user costs no Gemini call; and a rank-based threshold, because today's best matches score 67–68% and "above 70%" would send nothing. | `ROADMAP.md:129-143`<br>`vercel.json:2-11`<br>`docs/DESIGN.md:215` | Built as written, the digest would send empty mail or duplicates, with no way to opt out. | Spec `feat/digest` with these as acceptance items. Resend's free tier (100 a day) covers the first hundred recipients. | M | Roadmap (`feat/digest`) |
| P2-19 | Launch gap | The Insights dashboard itself is not built. | `ROADMAP.md:145-155` | None for launch once P1-19 is in. | Keep it on the roadmap. | M | Roadmap (`feat/insights`) |
| P2-20 | Platform | **[Unverified]** Settings to confirm. Vercel Hobby is for non-commercial use, which matters before any paid tier. Free Supabase projects pause after a week idle and stop at 500 MB. Preview deployments may share production keys. The Google consent screen must be published, or only listed test users can sign in. | `vercel.json:1-12`<br>`src/lib/supabase-admin.ts:3-10`<br>`src/app/(auth)/login/page.tsx:43-48` | Each can stop sign-in or the whole app without a code change. | Work through checks 7 to 9. | S | Ops |

## Proposed PR grouping

Six PRs, each off `dev` with `--base dev`. Migrations take the next free number
at merge time (`0008` is next) and are applied by a human before the deploy
that needs them.

### 1. `fix/resume-pipeline` — P0, size M

- **Covers:** P0-7, P1-12, P1-13 (the migration half), P2-10. Absorbs backlog
  `fix/parse-timeout`.
- **Scope:** promote a résumé to primary only after parse and score are saved;
  raise the parse limit; retry or resume an unparsed upload after a reload; a
  clear message for PDFs with no text layer; cleanup of abandoned rows and
  files; the storage-path ownership check in the route and as a CHECK
  constraint; bucket size and type limits; the 4 MB limit, the PDF signature
  check and the cap on stored text.
- **Depends on:** nothing, so it goes first. It changes the Definition of Done
  line about who writes `is_primary`, which must be edited identically in
  CLAUDE.md and `docs/SHIP_PIPELINE.md` §6 or the gate's doc-sync check fails.
  Check 3 should be run before the bucket migration is written.

### 2. `fix/gemini-spend-and-prompts` — P0, size L, `deep: true`

- **Covers:** P0-3, P0-4, P0-5, P0-6, P1-6, P1-9, P1-10, P1-11, P2-9, P2-11,
  P2-12.
- **Scope:** a per-user daily counter table and consume function for parse,
  score, tailor and upload; the cached résumé embedding, so the feed makes no
  Gemini call; length caps in the profile API, in the database and in
  `formatProfile`; routing parse, score and tailor to the billed key; pinned
  replacement models; a per-attempt timeout on every Gemini request; one shared
  fence helper used by chat, parse, score and tailor; the chat page ordering
  fix and the chat robustness items.
- **Depends on:** PR 1 merged first, because both edit the parse route. Two
  owner decisions: whether résumé calls move to the billed key, and the cap
  values. The migration is applied before deploy. The prepaid balance should be
  topped up and its low-balance alert set first (check 9). The model pin must
  land before 1 December 2026.

### 3. `feat/observability` — P0, size M

- **Covers:** P0-8, P1-16, P1-17, P2-8.
- **Scope:** Sentry on server and client; one error helper used by every route,
  so users see fixed messages and the detail goes to Sentry; cron routes return
  500 on failure, run up to 300 s and check in on every run; alerts for failed
  or missed crons and for Gemini billing and auth errors; security headers.
- **Depends on:** #37 merged first, because the error boundaries it adds are
  where client errors are captured. If #37 cannot merge in time, lift its
  boundary files into this PR. `@sentry/nextjs` is a new dependency and needs a
  spec-approved reason. The DSN must be set in Vercel before the build
  (Pitfall 9). It follows PR 2, because both touch the same catch blocks.

### 4. `feat/legal-and-account` — P0, size M, `deep: true`

- **Covers:** P0-2, P1-14, and the hidden email forms if P0-1 is resolved by
  launching with Google sign-in only.
- **Scope:** `/privacy` and `/terms`; links from the landing footer and auth
  pages; the acceptance line on sign-up with its timestamp; delete a résumé;
  delete the account, removing Storage files and then the auth user; download
  my data.
- **Depends on:** policy text from the owner; the routing decision in PR 2,
  because the policy must name the Gemini tier that is really used; check 3,
  because deletion must know how the bucket is configured. Account deletion
  uses the service role on a user path, hence the deep review.

### 5. `fix/auth-hardening` — P1, size M, `deep: true`

- **Covers:** P1-1 to P1-5 and P2-4 to P2-7. Absorbs backlog
  `fix/reauth-on-password-change`, `fix/reset-drive-by` and `fix/oauth-chain`.
- **Scope:** canonicalisation inside `safeNext`; a confirm step before a
  recovery link is verified; re-authentication before a password change;
  cross-device sign-up confirmation; CAPTCHA tokens on the three forms; cookies
  copied onto proxy redirects; `/profile` in the protected prefixes; `next`
  carried through OAuth; redirect URLs from the current origin and a build-time
  check for required variables; one password policy.
- **Depends on:** Supabase settings in check 2 (email templates, secure
  password change, CAPTCHA keys, redirect allow-list, password policy) and the
  two-browser test in check 6. The `next` round trip must not ship before the
  `safeNext` change in the same PR.

### 6. `fix/job-data-integrity` — P1, size M

- **Covers:** P1-7, P1-8, P2-3 (the code half), P2-13, P2-14.
- **Scope:** `match_jobs` returns what it is asked for; a content hash on each
  job embedding and re-embedding when the text changes; only active jobs
  embedded, embeddings removed on deactivation, and old inactive jobs purged;
  server components call the match and applications code directly; `applied_at`
  stamped on the first move to applied; UUID validation.
- **Depends on:** check 4 run first, since it decides the shape of the
  `match_jobs` change. The migration is applied before deploy. A one-time
  re-embed of every job runs on the paid key after deploy. It follows PR 2,
  because both edit the match engine.

### Outside the six

- **#37 (open):** P0-9, P1-19, P1-21, P2-2. Review and merge before launch.
- **Ops, no PR:** P0-1, P1-15, P2-20, the dashboard halves of P1-3, P1-4, P1-5,
  P1-13, P2-3 and P2-7, and the checks below.
- **Roadmap branches:** P1-18, P1-20, P2-1, P2-15, P2-16, P2-18, P2-19.
- **Docs:** P2-17.

**Order:** checks 1 to 4 today → merge #37 → PR 1 → PR 2 → PR 3 → PR 4 → invite
the first users → PR 5 and PR 6 within the first week.

## Owner checks

These are the questions the repository cannot answer.

1. **Auth email (P0-1).** Supabase → Authentication → Emails → SMTP settings:
   is custom SMTP on? Sign up and request a reset with an address that is not
   on the Supabase team.
2. **Auth settings (P1-3, P1-4, P1-5, P2-7).** Site URL and redirect URLs hold
   exactly the production `/auth/callback` and `/auth/reset-password`; the
   recovery template uses `token_hash` (Pitfall 10); secure password change;
   CAPTCHA; password policy; "Allow new users to sign up".
3. **Storage, RLS and the profile trigger (P1-13).** Expect the `resumes`
   bucket with `public = false`, no storage policies for `anon` or
   `authenticated`, row security on all seven public tables, the policies from
   migrations 0001, 0005 and 0007, and the sign-up trigger present.

   ```sql
   select id, public, file_size_limit, allowed_mime_types from storage.buckets;
   select policyname, cmd, roles from pg_policies where schemaname = 'storage';
   select c.relname, c.relrowsecurity
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' order by 1;
   select tablename, policyname, cmd, roles
     from pg_policies where schemaname = 'public' order by 1, 2;
   select tgname from pg_trigger where tgname = 'on_auth_user_created';
   ```

4. **Feed query (P1-7).** Quick look first: the feed header reads "Showing top
   20 of N matched roles". N should be 150; 40 or less means the cap applies.
   Then:

   ```sql
   select j.is_active, count(*)
     from public.job_embeddings e join public.jobs j on j.id = e.job_id
    group by 1;

   explain (analyze)
   select e.job_id
     from public.job_embeddings e join public.jobs j on j.id = e.job_id
    where j.is_active
    order by e.embedding <=> (select embedding from public.job_embeddings limit 1)
    limit 150;
   ```

   An index scan on `job_embeddings_embedding_idx` that yields about 40 rows
   confirms the finding. A sequential scan with a sort means the result is
   exact today, though the planner can change its mind as the table grows.
5. **Job counts and last cron runs (P1-16, P2-16).**

   ```sql
   select count(*) from public.jobs where is_active;
   select max(last_seen_at) from public.jobs;
   select max(embedded_at) from public.job_embeddings;
   ```

6. **Sessions (P2-4).** Sign in on two browsers, change the password on one,
   reload the other and expect a sign-out. Run ROADMAP's cross-device reset
   test at the same time.
7. **Vercel (P2-3, P1-16, P2-20).** Functions: Fluid compute is on (the 300 s
   limits assume it) and the function region matches the Supabase region. Cron
   Jobs tab: both jobs listed with recent runs. Environment variables:
   `CRON_SECRET` is set for Production, and note which keys Preview has.
8. **Google sign-in (P2-20).** Google Cloud → OAuth consent screen is "In
   production", with the app name, a support email and, once they exist, the
   privacy and terms links.
9. **Gemini billing (P0-8).** The prepaid balance on the billed project, and a
   low-balance alert or automatic top-up.

## Checked and found sound

- Every user-facing handler under `src/app/api` calls `getUser()` before
  touching data:
  `src/app/api/chat/route.ts:86,310`, `src/app/api/resume/parse/route.ts:38`,
  `src/app/api/resume/score/route.ts:42`,
  `src/app/api/resume/tailor/route.ts:119,377,408`,
  `src/app/api/resume/list/route.ts:11`, `src/app/api/resume/upload/route.ts:18`,
  `src/app/api/profile/route.ts:131,157`,
  `src/app/api/applications/route.ts:69,99,187`,
  `src/app/api/applications/[id]/route.ts:15` and
  `src/app/api/jobs/match/route.ts:27`. All 20 handler and method pairs, the
  cron routes included, returned 401 without a session.
- Both cron routes fail closed when `CRON_SECRET` is unset and reject a wrong
  bearer (`src/app/api/cron/ingest-jobs/route.ts:10-15`,
  `src/app/api/cron/embed-jobs/route.ts:14-19`).
- The chat cap cannot be reset by the user. `chat_usage` is read-only for
  users, the increment is one atomic statement, and the refund is service-role
  only and limited to five a day
  (`supabase/migrations/0007_chat_usage.sql:57-59,71-103,115-147`). Clear chat
  does not touch it (`src/app/api/chat/route.ts:306-329`).
- Row security is enabled on all seven tables in the migrations, with own-row
  policies on user tables and service-role-only writes on jobs and embeddings.
- The service role is used in five places only: the chat refund, the résumé
  upload and its cleanup, the parse download (P1-12) and the two crons.
- Every read of the primary résumé filters `kind = 'uploaded'`
  (`src/lib/ai/chat-context.ts:149-159`, `src/lib/jobs/match-engine.ts:119-126`,
  `src/app/api/resume/tailor/route.ts:146-153`), and tailored rows are written
  with `is_primary: false` (`src/app/api/resume/tailor/route.ts:314`).
- All three Gemini JSON sites validate with zod before any write and answer
  502 retryable on failure (`src/app/api/resume/parse/route.ts:133-147`,
  `src/app/api/resume/score/route.ts:113-127`,
  `src/app/api/resume/tailor/route.ts:232-251`). The tailor prompt is fenced
  with its markers neutralised (`src/app/api/resume/tailor/route.ts:47,92-113`).
- The freshness sweep exempts boards that failed and skips entirely when no
  board returned a job (`src/lib/jobs/ingest-runner.ts:201-210`). Ingest and
  embedding are upserts, so a cron delivered twice does no harm.
- No secrets in the tree or its history; `.env*` is ignored and was never
  committed. `npm audit --omit=dev` reports no vulnerabilities. `/dev/ui`
  returns 404 on a production build.

## Sources for platform facts

Read on 16 November 2026. The DPDP timeline is from secondary sources and is
not legal advice.

- Supabase built-in mailer limits — https://supabase.com/docs/guides/auth/auth-smtp
- Supabase session termination — https://supabase.com/docs/guides/auth/sessions
- Supabase Free plan (no automatic backups, pause after a week, 500 MB) — https://supabase.com/pricing
- Vercel function limits (Hobby 300 s, 4.5 MB bodies) — https://vercel.com/docs/functions/limitations
- Vercel cron limits and delivery — https://vercel.com/docs/cron-jobs/usage-and-pricing and https://vercel.com/docs/cron-jobs/manage-cron-jobs
- Vercel Hobby plan terms — https://vercel.com/legal/terms
- Gemini API terms for unpaid and paid use — https://ai.google.dev/gemini-api/terms
- Google APIs terms, API limitations — https://developers.google.com/terms
- Gemini model retirement dates — https://ai.google.dev/gemini-api/docs/deprecations
- Gemini 402 for depleted prepaid credit — https://ai.google.dev/gemini-api/docs/troubleshooting
- pgvector HNSW result limits and filtering — https://github.com/pgvector/pgvector
- Resend free tier and verified domains — https://resend.com/pricing and https://resend.com/docs/dashboard/domains/introduction
- DPDP Rules 2025 commencement — https://dpdpaforum.org/bulletin/the-rules-2025-notified and https://legismith.com/dpdp-rules-2025-timeline/
