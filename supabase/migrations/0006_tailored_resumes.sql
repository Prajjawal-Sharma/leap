-- One-Click Tailored Resume — store Gemini-generated per-job rewrites in
-- the existing resumes table instead of a parallel table, so
-- applications.tailored_resume_id (FK → resumes) keeps working unchanged.
--
-- resumes originally modeled an uploaded PDF: storage_path / file_name were
-- NOT NULL. A generated resume has no file until PDF export ships, so both
-- go nullable, and a `kind` discriminator separates uploads from tailored
-- rows. Existing rows are all uploads and are covered by the column default
-- — no backfill needed or wanted.
--
-- Idempotent by construction (0005 was not, and errored on replay):
-- DROP NOT NULL is a no-op on an already-nullable column, ADD COLUMN /
-- CREATE INDEX are guarded with IF NOT EXISTS, and the check constraint is
-- declared inline on the column so it is skipped whenever the column
-- already exists.

alter table public.resumes
  alter column storage_path drop not null;

alter table public.resumes
  alter column file_name drop not null;

alter table public.resumes
  add column if not exists kind text not null default 'uploaded'
    constraint resumes_kind_check check (kind in ('uploaded', 'tailored'));

-- Provenance: which job this resume was tailored for. Uploaded resumes
-- leave it null. If the job is purged by ingestion cleanup, the tailored
-- resume survives with job_id null rather than cascading away.
alter table public.resumes
  add column if not exists job_id uuid
    references public.jobs(id) on delete set null;

create index if not exists resumes_user_kind_idx
  on public.resumes (user_id, kind);

-- The tailor route promises at most one tailored row per (user, job) via
-- select-then-upsert; this partial unique index is the DB backstop for the
-- race two concurrent generations can hit. Uploaded rows are exempt (their
-- job_id is null anyway). The route maps 23505 back onto its update path.
create unique index if not exists resumes_tailored_user_job_uidx
  on public.resumes (user_id, job_id)
  where kind = 'tailored';
