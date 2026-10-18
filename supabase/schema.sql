-- GeeksFinder schema — run once in the Supabase SQL editor.
-- TRD data model + blog tables (§6) + security tables (§7).
-- RLS on every table: each user reads only their own rows. Sensitive columns
-- (plan, role, telegram link) are writable only by the service role (webhooks/server).

create extension if not exists "pgcrypto";

-- ───────────────────────── users & profile ─────────────────────────
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  phone text,
  telegram_chat_id bigint,
  telegram_link_code text unique,
  telegram_link_expires_at timestamptz,
  plan text not null default 'free' check (plan in ('free','pro')),
  role text not null default 'user' check (role in ('user','admin')),
  consent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  skills text[] not null default '{}',
  education jsonb not null default '[]',
  projects jsonb not null default '[]',
  experience jsonb not null default '[]',
  experience_level text default 'fresher',
  preferred_roles text[] not null default '{}',
  locations text[] not null default '{}',
  job_type text default 'full-time' check (job_type in ('full-time','internship','both')),
  raw_resume_url text,
  updated_at timestamptz not null default now()
);

create table if not exists public.alert_settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  frequency text not null default 'weekly' check (frequency in ('daily','weekly','monthly')),
  channels text[] not null default '{telegram}',     -- Telegram is the recommended default
  alert_hour smallint not null default 7 check (alert_hour between 5 and 22), -- IST; sent at :30
  quiet_hours text,                                   -- "[start,end)" in IST hours; may wrap midnight, e.g. [22,7)
  last_sent_at timestamptz
);

-- ───────────────────────── jobs & matching ─────────────────────────
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_id text,
  title text not null,
  company text not null,
  company_domain text,
  location text,
  remote boolean default false,
  description text,
  summary text,                       -- GeeksFinder's own summary (SEO: unique text above the copied JD)
  skills text[] not null default '{}',
  experience_min int,
  experience_max int,
  fresher_friendly boolean default false,
  enriched boolean default false,
  apply_url text,
  contact_email text,
  posted_at timestamptz,
  expires_at timestamptz,
  hash text unique not null,
  created_at timestamptz not null default now()
);
create index if not exists jobs_created_idx on public.jobs(created_at desc);
create index if not exists jobs_skills_idx on public.jobs using gin(skills);

create table if not exists public.matches (
  user_id uuid references public.users(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  score int not null,
  reasons jsonb not null default '{}',
  notified boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

create table if not exists public.tailored_resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  content jsonb not null,
  pdf_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.company_contacts (
  id uuid primary key default gen_random_uuid(),
  company_domain text not null,
  email text not null,
  name text,
  role text,
  source text,
  verified boolean default false,
  do_not_contact boolean default false,
  unique (company_domain, email)
);

create table if not exists public.outreach (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  contact_email text,
  channel text check (channel in ('email','linkedin')),
  status text default 'drafted',
  sent_at timestamptz,
  follow_up_at timestamptz
);

create table if not exists public.applications (
  user_id uuid references public.users(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  stage text not null default 'saved' check (stage in ('saved','applied','interview','offer','rejected')),
  notes text,
  updated_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

-- ───────────────────────── billing ─────────────────────────
create table if not exists public.subscriptions (
  user_id uuid primary key references public.users(id) on delete cascade,
  razorpay_subscription_id text unique,
  status text,
  current_period_end timestamptz,
  trial_end timestamptz
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  razorpay_payment_id text unique,
  amount int,
  status text,
  paid_at timestamptz
);

create table if not exists public.usage (
  user_id uuid references public.users(id) on delete cascade,
  period_start date not null,
  tailor_count int not null default 0,
  finder_count int not null default 0,
  emails_today int not null default 0,
  emails_day date,
  primary key (user_id, period_start)
);

-- ───────────────────────── security (§7) ─────────────────────────
-- Webhook idempotency: each provider event processed once
create table if not exists public.webhook_events (
  id text primary key,                -- e.g. razorpay x-razorpay-event-id
  provider text not null,
  received_at timestamptz not null default now()
);

-- Admin action log
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.users(id) on delete set null,
  action text not null,
  target_table text,
  target_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

-- Global AI spend cap (denial-of-wallet)
create table if not exists public.ai_usage (
  day date not null,
  provider text not null,
  calls int not null default 0,
  est_cost_usd numeric(10,4) not null default 0,
  primary key (day, provider)
);

create or replace function public.bump_ai_usage(p_provider text, p_cost numeric)
returns table (calls int, est_cost_usd numeric) language sql security definer set search_path = public as $$
  insert into public.ai_usage (day, provider, calls, est_cost_usd)
  values ((now() at time zone 'Asia/Kolkata')::date, p_provider, 1, p_cost)
  on conflict (day, provider) do update
    set calls = ai_usage.calls + 1, est_cost_usd = ai_usage.est_cost_usd + excluded.est_cost_usd
  returning ai_usage.calls, ai_usage.est_cost_usd;
$$;
revoke execute on function public.bump_ai_usage(text, numeric) from public, anon, authenticated;

-- Atomic usage counter (avoids read-then-write races on quotas)
create or replace function public.consume_usage(p_user uuid, p_period date, p_kind text, p_limit int)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  insert into public.usage (user_id, period_start) values (p_user, p_period) on conflict do nothing;
  if p_kind = 'tailor' then
    update public.usage set tailor_count = tailor_count + 1
      where user_id = p_user and period_start = p_period and tailor_count < p_limit returning tailor_count into v;
  else
    update public.usage set finder_count = finder_count + 1
      where user_id = p_user and period_start = p_period and finder_count < p_limit returning finder_count into v;
  end if;
  return coalesce(v, -1);  -- -1 = over limit
end $$;
revoke execute on function public.consume_usage(uuid, date, text, int) from public, anon, authenticated;

-- ───────────────────────── blog (§6) ─────────────────────────
create table if not exists public.news_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('rss','api','page')),
  url text not null unique,
  active boolean not null default true
);

create table if not exists public.news_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.news_sources(id) on delete cascade,
  url text not null unique,
  title text not null,
  published_at timestamptz,
  text text,
  text_hash text,
  cluster_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists news_items_cluster_idx on public.news_items(cluster_id);

create table if not exists public.article_drafts (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null,
  topic text,
  title text,
  summary text,
  facts jsonb not null default '[]',
  body_md text,
  overlap_score int,                  -- longest shared word run with any source
  factcheck_passed boolean,
  check_notes jsonb not null default '[]',
  status text not null default 'draft' check (status in ('draft','approved','rejected','published')),
  reviewer_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid references public.article_drafts(id) on delete set null,
  slug text not null unique,
  title text not null,
  summary text,
  topic text,
  body_html text not null,            -- sanitised server-side
  freshers_note text,
  sources jsonb not null default '[]',
  reviewer_name text not null,
  related_skills text[] not null default '{}',
  published_at timestamptz not null default now(),
  updated_at timestamptz,
  telegram_posted boolean not null default false
);

-- ───────────────────────── signup trigger ─────────────────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'))
  on conflict (id) do nothing;
  insert into public.alert_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── row-level security ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array['users','profiles','alert_settings','jobs','matches','tailored_resumes','company_contacts',
    'outreach','applications','subscriptions','payments','usage','webhook_events','audit_log','ai_usage',
    'news_sources','news_items','article_drafts','articles']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- users: read own row; update only harmless columns (never plan/role/telegram)
create policy "users read own" on public.users for select using (auth.uid() = id);
create policy "users update own" on public.users for update using (auth.uid() = id) with check (auth.uid() = id);
revoke update on public.users from authenticated, anon;
grant update (name, phone, consent_at) on public.users to authenticated;

create policy "own profiles" on public.profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "alerts read own" on public.alert_settings for select using (auth.uid() = user_id);
create policy "alerts update own" on public.alert_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke update on public.alert_settings from authenticated, anon;
grant update (frequency, channels, alert_hour, quiet_hours) on public.alert_settings to authenticated;

create policy "own matches" on public.matches for select using (auth.uid() = user_id);
create policy "own tailored" on public.tailored_resumes for select using (auth.uid() = user_id);
create policy "own outreach" on public.outreach for select using (auth.uid() = user_id);
create policy "own applications" on public.applications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own subscriptions" on public.subscriptions for select using (auth.uid() = user_id);
create policy "own payments" on public.payments for select using (auth.uid() = user_id);
create policy "own usage" on public.usage for select using (auth.uid() = user_id);

-- Jobs and published articles are public listings
create policy "read jobs" on public.jobs for select using (true);
create policy "read articles" on public.articles for select using (published_at <= now());

-- company_contacts, webhook_events, audit_log, ai_usage, news_*, article_drafts:
-- no client policy → only the service role (server) can touch them.

-- ───────────────────────── storage ─────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resumes', 'resumes', false, 2097152, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = array['application/pdf'];

create policy "own resume files" on storage.objects for all
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

-- ───────────────────────── seed: news sources (edit freely) ─────────────────────────
insert into public.news_sources (name, type, url) values
  ('Google News: fresher hiring', 'rss', 'https://news.google.com/rss/search?q=fresher+hiring+India&hl=en-IN&gl=IN&ceid=IN:en'),
  ('Google News: off campus drive', 'rss', 'https://news.google.com/rss/search?q=off+campus+drive+2026&hl=en-IN&gl=IN&ceid=IN:en'),
  ('Google News: campus placements IT', 'rss', 'https://news.google.com/rss/search?q=IT+companies+campus+hiring+freshers&hl=en-IN&gl=IN&ceid=IN:en'),
  ('Google News: internship program India', 'rss', 'https://news.google.com/rss/search?q=internship+program+India+students&hl=en-IN&gl=IN&ceid=IN:en')
on conflict (url) do nothing;

-- Make yourself admin after signing up:
--   update public.users set role = 'admin' where email = 'you@example.com';

-- ───────────────────────── 002 hardening (also in migrations/002_hardening.sql) ─────────────────────────
-- 002 — security hardening found in the audit (2026-10-17). Safe to run once on an existing database.

-- 1. HR contact emails must never be readable through the public API (plan: never share HR contact lists).
--    Column-level grants: every jobs column except contact_email.
revoke select on public.jobs from anon, authenticated;
grant select (id, source, source_id, title, company, company_domain, location, remote, description, summary, skills,
  experience_min, experience_max, fresher_friendly, enriched, apply_url, posted_at, expires_at, hash, created_at)
  on public.jobs to anon, authenticated;

-- 2. Students write their own profile directly through the API, so cap sizes in the database too (storage abuse).
alter table public.profiles drop constraint if exists profiles_size;
alter table public.profiles add constraint profiles_size check (
  cardinality(skills) <= 100 and cardinality(preferred_roles) <= 20 and cardinality(locations) <= 20
  and pg_column_size(education) + pg_column_size(projects) + pg_column_size(experience) < 100000
);

-- 3. HR opt-out requests (public "don't contact me" form) are stored with the contact row.
alter table public.company_contacts add column if not exists opted_out_at timestamptz;
create index if not exists company_contacts_email_idx on public.company_contacts (lower(email));

-- 4. Retention helpers used by the daily cron (free tier has 500 MB).
create index if not exists jobs_hash_created_idx on public.jobs (created_at);
create index if not exists news_items_created_idx on public.news_items (created_at);

-- 5. Daily cleanup so the free 500 MB tier doesn't fill up. Never deletes a job a student saved, applied to,
--    emailed HR about or tailored a resume for (those rows would cascade away from their tracker).
create or replace function public.cleanup_old_data() returns jsonb
language plpgsql security definer set search_path = public as $$
declare j int; n int; w int;
begin
  delete from public.jobs jb
   where jb.created_at < now() - interval '45 days'
     and not exists (select 1 from public.applications a where a.job_id = jb.id)
     and not exists (select 1 from public.tailored_resumes t where t.job_id = jb.id)
     and not exists (select 1 from public.outreach o where o.job_id = jb.id);
  get diagnostics j = row_count;
  delete from public.news_items ni
   where ni.created_at < now() - interval '30 days'
     and (ni.cluster_id is null or not exists (select 1 from public.article_drafts d where d.cluster_id = ni.cluster_id and d.status = 'published'));
  get diagnostics n = row_count;
  delete from public.webhook_events where received_at < now() - interval '90 days';
  get diagnostics w = row_count;
  delete from public.ai_usage where day < current_date - 180;
  return jsonb_build_object('jobs', j, 'news_items', n, 'webhook_events', w);
end $$;
revoke execute on function public.cleanup_old_data() from public, anon, authenticated;

-- 003 (also in migrations/003_quiet_hours_text.sql)
-- 003 — quiet hours like 22:00 → 07:00 wrap past midnight, which int4range rejects ("lower bound must be <= upper bound").
-- Store the "[start,end)" string as text; app and cron already parse it and handle the wrap.
alter table public.alert_settings drop constraint if exists alert_settings_quiet_hours_format;
alter table public.alert_settings add constraint alert_settings_quiet_hours_format
  check (quiet_hours is null or quiet_hours ~ '^\[([01]?[0-9]|2[0-3]),([01]?[0-9]|2[0-3])\)$');
-- Column-level update grant is unchanged by the type change (re-grant to be explicit)
grant update (frequency, channels, alert_hour, quiet_hours) on public.alert_settings to authenticated;

-- 004 — three paid plans (Hustle ₹10/15 days, Season ₹59/3 months, Year Pass ₹199/year), all UPI Autopay.
-- Features are identical (users.plan stays 'free' | 'pro'); the subscription remembers which plan was bought.
-- Only the service role (checkout route + Razorpay webhook) writes this table.
alter table public.subscriptions add column if not exists plan_code text;
alter table public.subscriptions drop constraint if exists subscriptions_plan_code_check;
alter table public.subscriptions add constraint subscriptions_plan_code_check check (plan_code is null or plan_code in ('hustle', 'season', 'yearpass'));
-- Everyone subscribed before this migration was on the 15-day plan
update public.subscriptions set plan_code = 'hustle' where plan_code is null and razorpay_subscription_id is not null;
-- Billing tables are written only by the service role (checkout route, Razorpay webhook). RLS already denies
-- client writes (no insert/update policy); revoking the grants is a second lock in case a policy is ever added by mistake.
revoke insert, update, delete, truncate on public.subscriptions, public.payments from anon, authenticated;

-- 005 — blog sources.
-- Google News wraps every story in a news.google.com link, so "2+ independent sources" never passed and the blog
-- could not produce a single draft. Store the real publisher, and add publishers' own feeds, which link straight
-- to the article so the full text can be read for facts.
alter table public.news_items add column if not exists publisher text;

-- Verified 2026-10-18: fresh, career/hiring news, article text readable.
insert into public.news_sources (name, type, url) values
  ('Economic Times: Jobs', 'rss', 'https://economictimes.indiatimes.com/jobs/rssfeeds/107115.cms'),
  ('Economic Times: Tech', 'rss', 'https://economictimes.indiatimes.com/tech/rssfeeds/13357270.cms'),
  ('Indian Express: Education', 'rss', 'https://indianexpress.com/section/education/feed/'),
  ('The Hindu: Careers', 'rss', 'https://www.thehindu.com/education/careers/feeder/default.rss'),
  ('BusinessLine: Info-tech', 'rss', 'https://www.thehindubusinessline.com/info-tech/feeder/default.rss'),
  ('Mint: Companies', 'rss', 'https://www.livemint.com/rss/companies'),
  ('Inc42: Startups', 'rss', 'https://inc42.com/feed/')
on conflict (url) do nothing;
