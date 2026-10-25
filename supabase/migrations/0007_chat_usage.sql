-- Quota-proof daily chat cap.
--
-- Until now the 30-messages-a-day cap counted chat_messages rows with
-- role='user' since UTC midnight. Users may delete their own chat_messages
-- (0005 grants delete-own, and Clear chat uses it), so clearing the chat
-- reset the cap and gave unbounded spend on the paid Gemini key (Pitfall 7).
-- Counting was also read-then-write, so two parallel requests could both
-- pass the check.
--
-- chat_usage holds one counter row per user per UTC day. Users can READ
-- their own row and nothing else: there is deliberately no insert, update or
-- delete policy for `authenticated`, and the table privileges for those verbs
-- are revoked as well, so neither PostgREST nor the JS client has a write
-- path. The only ways the count moves are:
--   * consume_chat_quota(p_limit) — security definer, callable by
--     `authenticated`, acts only on auth.uid()'s row, can only increment, and
--     refuses once the limit is reached. Calling it directly only burns the
--     caller's own quota.
--   * refund_chat_quota(p_user_id, p_day) — callable by `service_role` only
--     (the chat route's admin client, after a model call failed before
--     streaming any text). If `authenticated` could call it, any user could
--     loop it from the browser and never hit the cap. Refunds are also capped
--     at 5 per user per day, so even a failure a user can provoke on purpose
--     buys at most 5 extra model calls a day.
--
-- Additive and idempotent: safe to run more than once, and safe to apply
-- while the previous code (which never touches this table) is still live.
-- No backfill: today's counts start fresh at deploy.

create table if not exists public.chat_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  count int not null default 0 check (count >= 0),
  refunds int not null default 0 check (refunds >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- No-op on a fresh apply; keeps a re-run idempotent against a draft of this
-- file that predates the column.
alter table public.chat_usage
  add column if not exists refunds int not null default 0 check (refunds >= 0);

alter table public.chat_usage enable row level security;

drop policy if exists "chat_usage_select_own" on public.chat_usage;
create policy "chat_usage_select_own"
  on public.chat_usage
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Belt and braces on top of RLS. Supabase's default privileges grant every
-- verb on new public tables to anon and authenticated; RLS already blocks
-- insert/update/delete (no policy), but TRUNCATE (and MAINTAIN on PG17) is
-- not subject to RLS at all. Revoke everything, then grant back SELECT.
revoke all on table public.chat_usage from anon, authenticated;
grant select on table public.chat_usage to authenticated;
grant select, insert, update on table public.chat_usage to service_role;

-- Atomic check-and-increment. One statement: the INSERT takes the row (or
-- waits on the primary-key lock held by a concurrent call), and ON CONFLICT
-- DO UPDATE re-evaluates `count < p_limit` against the latest committed row
-- under that lock. Two parallel requests at 29 therefore serialise: one gets
-- 30, the other gets no row back and -1. There is no read-then-write window.
--
-- Returns the new count (1..p_limit), or -1 when the limit was already
-- reached. Every object is schema-qualified, so the fixed search_path is a
-- second guard rather than the only one (pg_catalog is always searched first,
-- and a qualified name cannot be shadowed by a pg_temp table).
create or replace function public.consume_chat_quota(p_limit int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_day date := (now() at time zone 'utc')::date;
  v_count int;
begin
  if v_user_id is null then
    raise exception 'consume_chat_quota: no authenticated user'
      using errcode = '28000';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'consume_chat_quota: p_limit must be between 1 and 1000'
      using errcode = '22023';
  end if;

  insert into public.chat_usage as u (user_id, day, count)
  values (v_user_id, v_day, 1)
  on conflict (user_id, day) do update
    set count = u.count + 1,
        updated_at = now()
    where u.count < p_limit
  returning u.count into v_count;

  -- No row returned: the conflict row was already at the limit.
  return coalesce(v_count, -1);
end;
$$;

-- Refund one slot for a user on a given UTC day, never below zero and at
-- most 5 times per user per day. The cap exists because "the call failed
-- before any text" is partly in the user's hands (they control their chat
-- history); without it a provoked failure would be an unmetered call loop.
-- The day is passed in: the day the route charged against.
--
-- security invoker on purpose: service_role already bypasses RLS and holds
-- the table grants above, so definer rights would add nothing. If this
-- function's grant were ever widened by mistake, an `authenticated` caller
-- would still hit RLS (no update policy) and the revoked UPDATE privilege.
create or replace function public.refund_chat_quota(p_user_id uuid, p_day date)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_user_id is null or p_day is null then
    raise exception 'refund_chat_quota: p_user_id and p_day are required'
      using errcode = '22023';
  end if;

  update public.chat_usage
    set count = count - 1,
        refunds = refunds + 1,
        updated_at = now()
    where user_id = p_user_id
      and day = p_day
      and count > 0
      and refunds < 5;
end;
$$;

-- Supabase's default privileges grant EXECUTE on new functions to anon,
-- authenticated and service_role directly, so revoking from PUBLIC alone
-- would leave them callable. Revoke from each role explicitly, then grant.
revoke all on function public.consume_chat_quota(int)
  from public, anon, authenticated, service_role;
grant execute on function public.consume_chat_quota(int) to authenticated;

revoke all on function public.refund_chat_quota(uuid, date)
  from public, anon, authenticated, service_role;
grant execute on function public.refund_chat_quota(uuid, date) to service_role;
