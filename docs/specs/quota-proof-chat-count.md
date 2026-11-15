# fix: quota-proof chat cap (+ zod security bump)
deep: true             # touches a paid-key spend guard → extra security pass

Commit this spec verbatim as `docs/specs/quota-proof-chat-count.md` in the PR.

## Goal (one paragraph, user-visible outcome)

The 30-messages-a-day chat cap must hold no matter what the user does. Today it counts `chat_messages` rows with `role='user'` created since UTC midnight, and the same route's `DELETE` (Clear chat) deletes those rows — so clearing the chat resets the cap and gives unbounded spend on the paid `GEMINI_KEY_1` (Pitfall 7). Two parallel requests can also both pass the check (read-then-write race). After this PR, usage is counted in a dedicated table that users can read but never write directly, the increment is atomic, failed model calls refund the slot, and the limit message tells the user when it resets in their own time zone. Also bump zod to the patched release (GHSA-mrhx-c7xc-m3w5, high, zod < 4.6.6).

## Context verified by recon
Verify each and report TRUE / FALSE with file:line:
- `src/app/api/chat/route.ts`: `CHAT_DAILY_LIMIT = 30`; the cap counts `chat_messages` `role='user'` rows with `created_at >= UTC midnight`, before inserting the user row and before any Gemini call; `DELETE` deletes all of the user's `chat_messages`.
- `supabase/migrations/0005_chat_messages.sql`: RLS select/insert/delete-own policies on `chat_messages`; no update policy.
- Latest migration is `0006_tailored_resumes.sql` → this PR adds `0007`.
- `src/components/features/Chat.tsx` shows "You've reached today's chat limit (30 messages). It resets at midnight UTC." on a 429 `daily_limit_reached`.
- `package.json` has `zod ^4.3.6`; lockfile resolves 4.3.6; `npm audit --omit=dev` reports GHSA-mrhx-c7xc-m3w5.

## Changes
1. **Migration `supabase/migrations/0007_chat_usage.sql`** (idempotent, additive):
   - Table `public.chat_usage (user_id uuid references auth.users(id) on delete cascade, day date not null, count int not null default 0 check (count >= 0), updated_at timestamptz not null default now(), primary key (user_id, day))`.
   - RLS enabled; **select-own policy only**. No insert/update/delete policies for `authenticated` — users can read their usage but cannot change it.
   - `security definer` function `public.consume_chat_quota(p_limit int) returns int` with `set search_path = public`: uses `auth.uid()` (raise if null), `day = (now() at time zone 'utc')::date`, does one atomic `insert into chat_usage (user_id, day, count) values (auth.uid(), day, 1) on conflict (user_id, day) do update set count = chat_usage.count + 1, updated_at = now() where chat_usage.count < p_limit returning count`; returns the new count, or `-1` when the limit is already reached (no row returned). Rejects `p_limit` outside 1–1000.
   - `security definer` function `public.refund_chat_quota() returns void`: decrements today's row for `auth.uid()`, never below 0.
   - `revoke all on function … from public; grant execute … to authenticated;` for both. Comment the file explaining why users get no write policy.
   - Backfill is not needed (today's counts start fresh at deploy).
2. **`src/app/api/chat/route.ts`**:
   - Replace the row-count check with `supabase.rpc("consume_chat_quota", { p_limit: CHAT_DAILY_LIMIT })` before the user row is inserted and before any Gemini call. `-1` → 429 `{ error: "daily_limit_reached", limit, resets_at }` where `resets_at` is the next UTC midnight (ISO). RPC error → 500, no model call.
   - If the Gemini call fails before streaming any text (thrown error / non-2xx), call `refund_chat_quota()` (best effort, log on failure) and return the existing error response. A stream that fails midway is NOT refunded (tokens were spent).
   - Successful responses include headers `X-Chat-Used`, `X-Chat-Limit`, `X-Chat-Resets-At` so UI PR 6 can show "N left today" without another query.
   - `DELETE` stays as is (clearing chat no longer touches quota).
3. **`src/components/features/Chat.tsx`** — only the limit message: use `resets_at` from the 429 payload and format it in the viewer's local time (`toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })`), e.g. "You've used today's 30 messages. You can chat again at 5:30 AM." Fall back to the current text if `resets_at` is missing. No other UI changes (chat redesign is UI PR 6).
4. **zod**: bump to `^4.6.6` (or the lowest patched version npm reports), `npm install`, and prove the existing Gemini output schemas still parse: add `src/lib/ai/schemas.test.ts` with realistic fixtures for `ParsedResumeSchema`, `TailoredResumeSchema` and the parse+score schema — one valid sample each (including sparse-but-valid data per Pitfall 3) and one over-cap sample each that must fail.
5. **Tests**: unit-test whatever pure helper you add (e.g. `nextUtcMidnight()`, the reset-time formatter). The SQL function is verified by the human steps below.
6. **CLAUDE.md**: add `chat_usage` to the Database Schema section and update the migrations range to `0001…0007`. Do not touch Definition of Done or Pitfalls.

## Do NOT touch
Gemini prompts, `src/lib/ai/chat-context.ts`, models/keys routing, other API routes, UI beyond the single limit message, the theme layer and UI kit.

## Acceptance (all required)
- `gate.sh` green; new tests included in the count.
- `npm audit --omit=dev`: zero high/critical — paste before/after.
- Migration is idempotent (`create table if not exists`, `create or replace function`, `drop policy if exists` before create) and contains no destructive statement.
- Reasoning in the PR for: why users cannot write `chat_usage` (prove there is no insert/update/delete path for `authenticated`), why `security definer` + fixed `search_path` is safe, why the increment is race-free.
- **Human must do (list in the PR, in this order):**
  1. Supabase → SQL Editor → run `0007_chat_usage.sql` on production **before** merging (additive, safe for the current code).
  2. In the SQL editor, as a check: `select public.consume_chat_quota(30);` must error (no `auth.uid()` in the editor) — proves it refuses anonymous callers.
  3. On the Vercel preview: send 2 chat messages → Supabase Table Editor shows `chat_usage.count = 2` for your user today; Clear chat → count stays 2.
  4. Try to write the table from the browser console with the anon key (the PR gives the exact snippet) → must fail with an RLS error.
  5. Temporarily set your row to 30 in the Table Editor → next message shows the local-time reset message; reset it afterwards.

## Review artifacts required in the PR
Migration verbatim; route diff verbatim; RLS/function reasoning; audit before/after; test output; deviations with reasons.

## Migration sequencing
`0007_chat_usage.sql` applied by the human on production before merge (step 1). Code that calls the RPC must not deploy before the function exists.
