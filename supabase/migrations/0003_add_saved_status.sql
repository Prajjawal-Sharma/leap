-- Add 'saved' as a valid value for applications.status.
--
-- The schema's CHECK constraint is an inline anonymous constraint; we recreate
-- it with the expanded value list. Wrapping in a transaction so a partial run
-- (drop succeeds, add fails) doesn't leave the table without any constraint.

begin;

alter table public.applications
  drop constraint if exists applications_status_check;

alter table public.applications
  add constraint applications_status_check
  check (status in (
    'saved',
    'applied',
    'viewed',
    'interviewing',
    'offered',
    'rejected',
    'withdrawn'
  ));

commit;
