-- Phase B: Govt & PSU openings and the student's branch. Run once in the Supabase SQL editor.

-- Last date to apply (Govt & PSU notices). A job past its last date is hidden by the 6:00 run.
alter table public.jobs add column if not exists deadline date;
create index if not exists jobs_deadline_idx on public.jobs (deadline) where deadline is not null;

-- Every official notice already read, so each one costs one AI read, ever (scripts/cron.ts govt step).
-- No policies: only the service role (cron) uses it.
create table if not exists public.govt_notices (
  url text primary key,
  source text not null,
  title text not null,
  status text not null check (status in ('job', 'not_a_job', 'closed', 'unreadable')),
  job_id uuid references public.jobs(id) on delete set null,
  checked_at timestamptz not null default now()
);
alter table public.govt_notices enable row level security;

-- The student's branch (lib/branches.ts), filled from their skills and changeable in onboarding and profile
alter table public.profiles add column if not exists branch text
  check (branch in ('cs', 'entc', 'electrical', 'mechanical', 'civil', 'chemical', 'general'));
