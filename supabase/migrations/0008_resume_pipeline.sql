-- Résumé pipeline: promote after parse, path ownership, failure marker,
-- bucket limits.
--
-- Until now upload made the new row primary and demoted the working one
-- before anything was parsed, so a slow or failed parse left the user with a
-- primary résumé that had no content: an empty feed, a tailor route answering
-- 409 and a chat with no résumé. Parse also downloaded whatever storage_path
-- the row named, with the service role, and users may write that column on
-- their own rows.
--
-- This migration adds what the new upload and parse routes rely on:
--   1. resumes.parse_error — marks an upload that can never be processed.
--   2. resumes_storage_path_owner_check — a stored path must sit in its
--      owner's folder and be unable to resolve anywhere else.
--   3. promote_parsed_resume() — saves parse and score and moves the primary
--      flag in one transaction. Upload now inserts is_primary = false, and
--      this function is the only writer of is_primary = true.
--   4. The `resumes` bucket's settings, which until now existed only in the
--      dashboard, and a check that no storage policy opens it to users.
--
-- Apply BEFORE the code that uses it: the new routes select parse_error and
-- call promote_parsed_resume. It is safe under the code that is live today —
-- that code writes paths of the shape (2) requires and never touches the new
-- column or function. One visible effect: the bucket limit drops from 5 MB to
-- 4 MB, so until the new code ships a file between those sizes is refused by
-- Storage rather than accepted.
--
-- Idempotent: safe to run more than once. One transaction: if any statement
-- fails — including the check in (4) and a row that breaks constraint (2) —
-- nothing is applied. No row is changed or deleted.

begin;

-- ---------------------------------------------------------------------------
-- 1. Terminal parse failures
-- ---------------------------------------------------------------------------
-- null: no terminal failure. 'no_text': the PDF has no text layer (a scan).
-- 'unreadable': the file is not a PDF that can be opened. A failure that may
-- pass (a model error, a timeout) is not recorded: the row simply stays
-- unparsed and can be retried. Whether a row is parsed is read from
-- parsed_content and ats_score as before, so existing rows need no backfill.
alter table public.resumes
  add column if not exists parse_error text;

alter table public.resumes
  drop constraint if exists resumes_parse_error_check;
alter table public.resumes
  add constraint resumes_parse_error_check
  check (parse_error is null or parse_error in ('no_text', 'unreadable'));

-- ---------------------------------------------------------------------------
-- 2. A stored file path belongs to the row's owner
-- ---------------------------------------------------------------------------
-- The parse route downloads storage_path with the service role, and the
-- storage client puts the path into the request URL as it stands. A prefix
-- test is therefore not enough: '<me>/../<victim>/cv.pdf' starts with
-- '<me>/' and resolves to the victim's object ('%2e%2e' and '\' do the same).
-- The path must be the owner's id followed by one or more plain segments —
-- letters, digits, '.', '_' and '-', never starting with a dot. Null stays
-- allowed: tailored rows have no file (0006).
--
-- src/lib/resume/storage-path.ts applies the same grammar in the route;
-- change the two together. Every path the upload route has written fits it
-- ('<user id>/<epoch ms>-<name>' until now, '<user id>/checked/<epoch ms>-
-- <name>' from this change on, the name reduced to the same characters), and
-- a pre-flight count on 2026-11-16 found no row that does not.
alter table public.resumes
  drop constraint if exists resumes_storage_path_owner_check;
alter table public.resumes
  add constraint resumes_storage_path_owner_check
  check (
    storage_path is null
    or storage_path ~ ('^' || user_id::text || '(/[A-Za-z0-9_-][A-Za-z0-9._-]*)+$')
  );

-- ---------------------------------------------------------------------------
-- 3. Save a parse and make it the primary résumé, atomically
-- ---------------------------------------------------------------------------
-- Called by /api/resume/parse once the model's reply has passed validation.
-- One statement from the caller, one transaction here: the parse, the score
-- and the primary flag change together or not at all, so the feed, tailoring
-- and chat (which read is_primary = true) see the previous résumé until the
-- new one is complete, and never a primary without content.
--
-- security invoker, on purpose. The function needs nothing its caller lacks:
-- users already hold select and update on their own rows through the 0001
-- policies, and those policies keep applying inside it, so a mistake here
-- cannot reach another user's rows. It is the way to write is_primary = true,
-- not a privilege boundary. Every statement also names auth.uid() itself.
--
-- The advisory lock makes promotions for one user run one at a time. Without
-- it two parses finishing together would each demote "the others" from a
-- snapshot that does not yet contain the other's promotion, and both rows
-- would end up primary. The lock is released at commit.
--
-- A newer upload that has already been processed keeps the flag: the route
-- may run for up to five minutes, so an older upload can finish after a
-- newer one. Its parse and score are still saved ('saved'), it just does not
-- displace the newer résumé.
--
-- Returns 'promoted', 'saved', or 'not_found' when the row is not an uploaded
-- résumé of the caller's with a stored file (it may have been deleted while
-- the parse ran).
create or replace function public.promote_parsed_resume(
  p_resume_id uuid,
  p_parsed_content jsonb,
  p_ats_score int,
  p_ats_breakdown jsonb
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_created_at timestamptz;
  v_promote boolean;
begin
  if v_user_id is null then
    raise exception 'promote_parsed_resume: no authenticated user'
      using errcode = '28000';
  end if;

  if p_resume_id is null
     or p_parsed_content is null
     or jsonb_typeof(p_parsed_content) <> 'object'
     or p_ats_score is null
     or p_ats_score < 0
     or p_ats_score > 100
     or p_ats_breakdown is null
     or jsonb_typeof(p_ats_breakdown) <> 'object' then
    raise exception 'promote_parsed_resume: invalid arguments'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('public.resumes.primary:' || v_user_id::text, 0)
  );

  select r.created_at
    into v_created_at
    from public.resumes r
   where r.id = p_resume_id
     and r.user_id = v_user_id
     and r.kind = 'uploaded'
     and r.storage_path is not null
     for update;

  if not found then
    return 'not_found';
  end if;

  v_promote := not exists (
    select 1
      from public.resumes o
     where o.user_id = v_user_id
       and o.kind = 'uploaded'
       and o.is_primary
       and o.parsed_content is not null
       and o.id <> p_resume_id
       and o.created_at > v_created_at
  );

  -- Unset, then set (Pitfall 2): no moment at which two rows are primary,
  -- and compatible with a one-primary-per-user unique index later.
  if v_promote then
    update public.resumes
       set is_primary = false
     where user_id = v_user_id
       and id <> p_resume_id
       and is_primary;
  end if;

  update public.resumes
     set parsed_content = p_parsed_content,
         ats_score = p_ats_score,
         ats_breakdown = p_ats_breakdown,
         parse_error = null,
         is_primary = (is_primary or v_promote)
   where id = p_resume_id
     and user_id = v_user_id;

  return case when v_promote then 'promoted' else 'saved' end;
end;
$$;

-- Supabase's default privileges grant EXECUTE on new functions to anon,
-- authenticated and service_role directly, so revoking from PUBLIC alone
-- would leave them callable. Revoke from each role explicitly, then grant.
-- service_role gets no grant: it has no auth.uid() and no reason to call it.
revoke all on function public.promote_parsed_resume(uuid, jsonb, int, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.promote_parsed_resume(uuid, jsonb, int, jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The résumé bucket
-- ---------------------------------------------------------------------------
-- Private, 4 MB (4194304 bytes), PDF only. On 2026-11-16 the live bucket was
-- already private and PDF-only with a 5242880-byte limit; this lowers the
-- limit to match the app's own (Vercel refuses request bodies over 4.5 MB)
-- and puts the settings on record. A project built from these migrations
-- gets the bucket created.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resumes', 'resumes', false, 4194304, array['application/pdf']::text[])
on conflict (id) do update
  set public = false,
      file_size_limit = 4194304,
      allowed_mime_types = array['application/pdf']::text[];

-- Résumé files are read and written only by the server, with the service
-- role, after it has checked the path against the signed-in user. That holds
-- only while storage has row security on and no policy for anon,
-- authenticated or public — which is how the project stood on 2026-11-16.
-- This does not create or drop anything; it refuses to apply if that is no
-- longer true, so the difference is looked at instead of assumed away.
do $$
declare
  v_policies text;
begin
  if not (select c.relrowsecurity
            from pg_class c
           where c.oid = 'storage.objects'::regclass) then
    raise exception 'storage.objects has row security disabled; résumé files would be readable through the API';
  end if;

  select string_agg(format('%I on storage.%I', p.policyname, p.tablename), ', ')
    into v_policies
    from pg_policies p
   where p.schemaname = 'storage'
     and p.roles && array['anon', 'authenticated', 'public']::name[];

  if v_policies is not null then
    raise exception 'storage has policies for anon, authenticated or public (%); résumé files must be reachable through the service role only', v_policies;
  end if;
end;
$$;

commit;
