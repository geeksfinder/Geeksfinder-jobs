-- 015 — Company profiles and better HR contacts (HR contact sheet import, 19 Oct 2026).
-- companies: one row per organisation, keyed by its root domain ("bosch.com"), with every email domain its HR uses
-- ("in.bosch.com") and the names jobs arrive with ("bosch group"). Public: it holds no personal data.
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,80}$'),
  name text not null,
  email_domains text[] not null default '{}',
  aliases text[] not null default '{}',
  industry text,
  city text,
  source text not null default 'jobs' check (source in ('jobs','hr sheet','known','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists companies_aliases_idx on public.companies using gin (aliases);
create index if not exists companies_email_domains_idx on public.companies using gin (email_domains);
alter table public.companies enable row level security;
drop policy if exists "companies are public" on public.companies;
create policy "companies are public" on public.companies for select using (true);

-- Where each contact came from and how far to trust it. The finder prefers verified, then recent, then older.
alter table public.company_contacts
  add column if not exists category text check (category in ('hr_team','generic_mailbox')),
  add column if not exists quality text check (quality in ('verified','recent','older')),
  add column if not exists imported_at timestamptz;

-- Public pages may say whether an HR email is on file for a company, never who or how many (no personal data)
create or replace function public.company_has_hr(p_domains text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.company_contacts where company_domain = any(p_domains) and not do_not_contact);
$$;
revoke execute on function public.company_has_hr(text[]) from public;
grant execute on function public.company_has_hr(text[]) to anon, authenticated;
