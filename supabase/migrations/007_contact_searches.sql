-- 007 — remember which company domains were already looked up for HR contacts (and how many were found),
-- so the HR pre-fill never spends a Hunter search twice on the same company within 30 days.
-- Service role only; never readable by students.
create table if not exists public.contact_searches (
  company_domain text primary key,
  searched_at timestamptz not null default now(),
  found int not null default 0
);
alter table public.contact_searches enable row level security;
revoke all on public.contact_searches from anon, authenticated;
