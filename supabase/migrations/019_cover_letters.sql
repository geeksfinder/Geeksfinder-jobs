-- 019: cover letters (Phase C). One per student per job, written from that job's tailored resume and editable.
-- Students read their own; the server writes after the session check (service role), like tailored_resumes.
create table if not exists public.cover_letters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  tailored_id uuid references public.tailored_resumes(id) on delete set null,
  body text not null check (char_length(body) between 50 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);
alter table public.cover_letters enable row level security;
drop policy if exists "own cover letters" on public.cover_letters;
create policy "own cover letters" on public.cover_letters for select using (auth.uid() = user_id);
revoke all on public.cover_letters from anon;
grant select on public.cover_letters to authenticated;
