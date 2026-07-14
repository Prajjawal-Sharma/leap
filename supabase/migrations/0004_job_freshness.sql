-- 0004_job_freshness.sql — last_seen_at freshness model for ingested jobs.
--
-- Problem: ingest only ever upserts what it sees on a board; nothing marked
-- rows inactive, so the feed kept serving jobs that closed months ago (users
-- click through to 404s). Fix: track the most recent successful fetch each
-- job appeared in (last_seen_at, bumped by the ingest cron on every upsert)
-- and deactivate rows not seen for N days.
--
-- Time-based expiry, deliberately NOT a per-company set-difference: with a
-- set-difference, one transient Greenhouse fetch failure would wrongly
-- deactivate a whole company's jobs in a single run. With last_seen_at, a job
-- only expires after N consecutive days of absence.

alter table public.jobs
  add column if not exists last_seen_at timestamptz;

-- Backfill each existing row to its OWN ingested_at, NOT now(): backfilling
-- to now() would grant every currently-stale job a fresh N-day lease and keep
-- dead listings in the feed even longer. Note ingested_at is the row's
-- FIRST-ever insert time (upserts never bump it), so this deliberately puts
-- every pre-existing row past the sweep cutoff at once — the first ingest run
-- re-confirms live jobs (bumping last_seen_at) and expires the dead backlog
-- immediately. Safe against transient fetch failures because the runner
-- exempts companies whose fetch failed in the current run from the sweep.
update public.jobs
  set last_seen_at = ingested_at
  where last_seen_at is null;

alter table public.jobs
  alter column last_seen_at set default now(),
  alter column last_seen_at set not null;

-- The deactivation sweep filters on last_seen_at < cutoff; per-source/company
-- scans support freshness reporting and future non-greenhouse sources.
create index if not exists jobs_last_seen_at_idx on public.jobs (last_seen_at);
create index if not exists jobs_source_company_idx on public.jobs (source, company);
