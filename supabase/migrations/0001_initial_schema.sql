-- Leap initial schema
-- Extensions

create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- =========================================================================
-- Shared trigger functions
-- =========================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- =========================================================================
-- profiles
-- =========================================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  location text,
  current_company text,
  current_job_title text,
  years_experience int,
  target_roles text[],
  target_companies text[],
  notice_period_days int,
  expected_salary_min numeric,
  expected_salary_max numeric,
  expected_salary_currency text default 'INR',
  linkedin_url text,
  github_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- =========================================================================
-- resumes
-- =========================================================================

create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  file_size_bytes int,
  parsed_content jsonb,
  ats_score int check (ats_score between 0 and 100),
  ats_breakdown jsonb,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create index resumes_user_id_idx on public.resumes (user_id);

alter table public.resumes enable row level security;

create policy "resumes_select_own"
  on public.resumes
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "resumes_insert_own"
  on public.resumes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "resumes_update_own"
  on public.resumes
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "resumes_delete_own"
  on public.resumes
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- =========================================================================
-- jobs
-- =========================================================================

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('jsearch','adzuna','arbeitnow','greenhouse','lever')),
  source_id text not null,
  title text not null,
  company text not null,
  location text,
  is_remote boolean not null default false,
  description text,
  requirements text,
  salary_min numeric,
  salary_max numeric,
  salary_currency text default 'USD',
  employment_type text,
  experience_min_years int,
  experience_max_years int,
  apply_url text not null,
  posted_at timestamptz,
  ingested_at timestamptz not null default now(),
  is_active boolean not null default true,
  unique (source, source_id)
);

create index jobs_posted_at_idx on public.jobs (posted_at desc);
create index jobs_is_active_idx on public.jobs (is_active);
create index jobs_is_remote_idx on public.jobs (is_remote);

alter table public.jobs enable row level security;

create policy "jobs_select_authenticated"
  on public.jobs
  for select
  to authenticated
  using (true);

create policy "jobs_insert_service_role"
  on public.jobs
  for insert
  to service_role
  with check (true);

create policy "jobs_update_service_role"
  on public.jobs
  for update
  to service_role
  using (true)
  with check (true);

create policy "jobs_delete_service_role"
  on public.jobs
  for delete
  to service_role
  using (true);

-- =========================================================================
-- job_embeddings
-- =========================================================================

create table public.job_embeddings (
  job_id uuid primary key references public.jobs(id) on delete cascade,
  embedding vector(768) not null,
  embedded_at timestamptz not null default now()
);

create index job_embeddings_embedding_idx
  on public.job_embeddings
  using hnsw (embedding vector_cosine_ops);

alter table public.job_embeddings enable row level security;

create policy "job_embeddings_select_authenticated"
  on public.job_embeddings
  for select
  to authenticated
  using (true);

create policy "job_embeddings_insert_service_role"
  on public.job_embeddings
  for insert
  to service_role
  with check (true);

create policy "job_embeddings_update_service_role"
  on public.job_embeddings
  for update
  to service_role
  using (true)
  with check (true);

create policy "job_embeddings_delete_service_role"
  on public.job_embeddings
  for delete
  to service_role
  using (true);

-- =========================================================================
-- applications
-- =========================================================================

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  status text not null default 'applied' check (status in ('applied','viewed','interviewing','offered','rejected','withdrawn')),
  tailored_resume_id uuid references public.resumes(id),
  notes text,
  applied_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);

create index applications_user_status_idx on public.applications (user_id, status);

alter table public.applications enable row level security;

create policy "applications_select_own"
  on public.applications
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "applications_insert_own"
  on public.applications
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "applications_update_own"
  on public.applications
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "applications_delete_own"
  on public.applications
  for delete
  to authenticated
  using (auth.uid() = user_id);

create trigger applications_set_updated_at
  before update on public.applications
  for each row
  execute function public.set_updated_at();
