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

-- 006 — evergreen guides alongside news.
-- Guides come from a topic list, not a news cluster, so cluster_id becomes optional.
-- guide_key stops the same guide topic being drafted twice.
alter table public.article_drafts alter column cluster_id drop not null;
alter table public.article_drafts add column if not exists kind text not null default 'news';
alter table public.article_drafts drop constraint if exists article_drafts_kind_check;
alter table public.article_drafts add constraint article_drafts_kind_check check (kind in ('news', 'guide'));
alter table public.article_drafts add column if not exists guide_key text;
create unique index if not exists article_drafts_guide_key on public.article_drafts (guide_key) where guide_key is not null;
alter table public.article_drafts drop constraint if exists article_drafts_news_has_cluster;
alter table public.article_drafts add constraint article_drafts_news_has_cluster check (kind = 'guide' or cluster_id is not null);

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

-- 008 — store the automatic review of each blog draft (SEO score, AI editor scores, auto-publish decision and
-- the reasons it was held), so the admin queue and the daily report can show why.
alter table public.article_drafts add column if not exists review jsonb;
alter table public.article_drafts add column if not exists auto_published boolean not null default false;

-- 009 — Admin foundation (docs/whatsapp-admin/SPEC.md §6, migration A).
-- Adapted to this database: audit_log already exists with target_table/target_id (kept as is), admins were
-- users.role = 'admin' (copied into admin_users as owners), and flag/cap changes go through functions that write
-- the audit row in the same transaction. Nothing existing is renamed or dropped.

-- ───────── roles ─────────
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','ops','marketing','reviewer')),
  created_at timestamptz not null default now()
);
insert into public.admin_users (user_id, role)
  select id, 'owner' from public.users where role = 'admin'
on conflict (user_id) do nothing;

create index if not exists audit_log_created_idx on public.audit_log (created_at desc);

-- ───────── kill switches and spend caps ─────────
create table if not exists public.app_flags (
  key text primary key,
  enabled boolean not null default true,
  note text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.app_flags (key) values
  ('whatsapp_sends'),('telegram_sends'),('email_sends'),('ai_generation'),
  ('article_pipeline'),('paid_contact_lookups'),('signups'),('campaign_sends')
on conflict do nothing;

create table if not exists public.spend_caps (
  provider text primary key check (provider in ('whatsapp','anthropic','hunter','apollo')),
  monthly_cap_inr numeric(10,2) not null,
  alert_pct integer not null default 80 check (alert_pct between 1 and 100),
  alerted_at timestamptz,
  stopped_at timestamptz
);

-- ───────── cron health ─────────
create table if not exists public.cron_runs (
  id bigserial primary key,
  job text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','ok','warning','failed')),
  counts jsonb not null default '{}'::jsonb,
  error text
);
create index if not exists cron_runs_job_idx on public.cron_runs (job, started_at desc);

-- ───────── funnel, attribution, rollups ─────────
create table if not exists public.events (
  id bigserial primary key,
  name text not null,
  user_id uuid references auth.users(id) on delete set null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_name_time_idx on public.events (name, created_at);
create index if not exists events_user_idx on public.events (user_id);
create unique index if not exists events_first_once_uidx on public.events (user_id, name)
  where name in ('signup','profile_ready','prefs_saved','channel_connected',
                 'first_alert_delivered','first_action','trial_started','paid_first','renewed');

create table if not exists public.attributions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  utm_source text, utm_medium text, utm_campaign text, utm_content text,
  referrer_host text,
  ref_code text,
  landing_path text,
  college text,
  city text,
  first_seen_at timestamptz
);
create index if not exists attributions_source_idx on public.attributions (utm_source, utm_campaign);
create index if not exists attributions_ref_idx on public.attributions (ref_code);

create table if not exists public.metrics_daily (
  day date not null,
  metric text not null,
  dim text not null default 'all',
  value numeric not null,
  primary key (day, metric, dim)
);

create table if not exists public.seo_daily (
  day date primary key,
  clicks integer, impressions integer,
  indexed_pages integer,
  cwv_good_pct numeric(5,2)
);

-- ───────── plans and grants ─────────
-- Same quotas as web/src/lib/plan.ts today (tailor 1 / 10, HR email finder 0 / 30). finder_per_cycle is ours;
-- the spec's columns are kept unchanged. The app switches to reading this table in PR 4.
create table if not exists public.plan_limits (
  plan text primary key check (plan in ('free','pro','pro_wa')),
  price_paise integer not null,
  daily_alerts boolean not null,
  whatsapp boolean not null,
  tailor_per_cycle integer not null,
  li_messages_per_cycle integer not null,
  finder_per_cycle integer not null default 0
);
insert into public.plan_limits values
  ('free',      0, false, false,  1,  3,  0),
  ('pro',    1000, true,  false, 10, 30, 30),
  ('pro_wa', 2900, true,  true,  10, 30, 30)
on conflict (plan) do nothing;

create table if not exists public.pro_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  days integer not null check (days between 1 and 365),
  includes_whatsapp boolean not null default false,
  reason text not null check (reason in ('ambassador','referral','support','other')),
  granted_by uuid references auth.users(id) on delete set null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null
);
create index if not exists pro_grants_user_idx on public.pro_grants (user_id, ends_at desc);

-- ───────── growth ─────────
create table if not exists public.ambassadors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  college text not null,
  city text not null,
  code text not null unique check (code ~ '^[A-Z0-9-]{4,24}$'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.users
  add column if not exists marketing_opt_in boolean not null default false,
  add column if not exists disabled_at timestamptz,
  add column if not exists referral_code text unique;

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referee_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','qualified','rewarded','blocked')),
  qualified_at timestamptz,
  rewarded_at timestamptz,
  created_at timestamptz not null default now(),
  check (referrer_id <> referee_id)
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email','telegram')),
  segment text not null check (segment in ('no_resume','no_channel','trial_ends_tomorrow','free_active_30d','cancelled_30d','halted')),
  subject text,
  body text not null check (char_length(body) <= 4000),
  status text not null default 'draft' check (status in ('draft','scheduled','sending','sent','cancelled')),
  scheduled_at timestamptz,
  sent_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_recipients (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','sent','failed','skipped')),
  sent_at timestamptz,
  primary key (campaign_id, user_id)
);

create table if not exists public.channel_posts (
  id uuid primary key default gen_random_uuid(),
  post_date date not null unique,
  body text not null check (char_length(body) <= 4096),
  job_ids uuid[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','skipped','posted','failed')),
  telegram_message_id bigint,
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  body text not null check (char_length(body) <= 2000),
  tags text[] not null default '{}',
  status text not null default 'new' check (status in ('new','planned','fixed','wontfix')),
  created_at timestamptz not null default now()
);

-- ───────── jobs ─────────
alter table public.jobs
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_reason text check (hidden_reason in ('scam','expired','duplicate','other'));
-- A hidden job disappears for every student and every public page
drop policy if exists "read jobs" on public.jobs;
create policy "read jobs" on public.jobs for select using (hidden_at is null);

create table if not exists public.job_reports (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  reason text not null check (reason in ('scam','expired','wrong_info','other')),
  created_at timestamptz not null default now(),
  unique (job_id, user_id)
);

create table if not exists public.board_sources (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('greenhouse','lever','ashby')),
  slug text not null,
  company_name text not null,
  active boolean not null default true,
  unique (provider, slug)
);

create table if not exists public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null,
  requested_by text not null check (requested_by in ('user','admin')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

-- ───────── RLS ─────────
-- Own-row reads only where students need them; admin tables have no policies, so only the service role
-- (server routes after requireAdmin, and the cron scripts) can use them.
do $$
declare t text;
begin
  foreach t in array array['admin_users','app_flags','spend_caps','cron_runs','events','attributions','metrics_daily',
    'seo_daily','plan_limits','pro_grants','ambassadors','referrals','campaigns','campaign_recipients','channel_posts',
    'feedback','job_reports','board_sources','deletion_requests']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

drop policy if exists "plan limits readable" on public.plan_limits;
create policy "plan limits readable" on public.plan_limits for select to authenticated using (true);
drop policy if exists "own grants" on public.pro_grants;
create policy "own grants" on public.pro_grants for select using (user_id = auth.uid());
drop policy if exists "own referrals" on public.referrals;
create policy "own referrals" on public.referrals for select using (referrer_id = auth.uid());

-- New columns on users are server-only: the column grant from schema.sql (name, phone, consent_at) is unchanged,
-- so students can't set disabled_at or referral_code. marketing_opt_in is set through a server route (PR 8).

-- ───────── audited writes (change + audit row in one transaction) ─────────
create or replace function public.admin_set_flag(p_actor uuid, p_key text, p_enabled boolean, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b public.app_flags; a public.app_flags;
begin
  select * into b from public.app_flags where key = p_key for update;
  if not found then raise exception 'unknown flag %', p_key; end if;
  update public.app_flags set enabled = p_enabled, note = p_note, updated_by = p_actor, updated_at = now()
    where key = p_key returning * into a;
  insert into public.audit_log (actor_id, action, target_table, target_id, before, after)
    values (p_actor, 'flag.set', 'app_flags', p_key,
            jsonb_build_object('enabled', b.enabled, 'note', b.note), jsonb_build_object('enabled', a.enabled, 'note', a.note));
  return to_jsonb(a);
end $$;

create or replace function public.admin_set_spend_cap(p_actor uuid, p_provider text, p_cap numeric, p_alert_pct integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b public.spend_caps; a public.spend_caps;
begin
  select * into b from public.spend_caps where provider = p_provider for update;
  -- Raising or changing a cap re-arms the alert and lifts a stop; spend.ts stops again if still over
  insert into public.spend_caps (provider, monthly_cap_inr, alert_pct) values (p_provider, p_cap, p_alert_pct)
    on conflict (provider) do update set monthly_cap_inr = excluded.monthly_cap_inr, alert_pct = excluded.alert_pct,
      alerted_at = null, stopped_at = null
    returning * into a;
  insert into public.audit_log (actor_id, action, target_table, target_id, before, after)
    values (p_actor, 'spend_cap.set', 'spend_caps', p_provider,
            case when b.provider is null then null else jsonb_build_object('monthly_cap_inr', b.monthly_cap_inr, 'alert_pct', b.alert_pct) end,
            jsonb_build_object('monthly_cap_inr', a.monthly_cap_inr, 'alert_pct', a.alert_pct));
  return to_jsonb(a);
end $$;

revoke execute on function public.admin_set_flag(uuid, text, boolean, text) from public, anon, authenticated;
revoke execute on function public.admin_set_spend_cap(uuid, text, numeric, integer) from public, anon, authenticated;

-- ───────── signups kill switch ─────────
-- Enforced where accounts are created, so no route can skip it. Existing users still sign in.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.app_flags where key = 'signups' and not enabled) then
    raise exception 'Sign-ups are paused for a short while. Please try again later.';
  end if;
  insert into public.users (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'))
  on conflict (id) do nothing;
  insert into public.alert_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

-- 010 — Honest bylines and schema for the blog (SPEC.md §10 byline rule, shipped early for SEO).
-- auto_published: "GeeksFinder Desk" byline, no human reviewer named. kind: guides use Article schema, news NewsArticle.
-- auto_published matches the definition in SPEC.md §10's content_quality migration, so that migration's
-- "add column" becomes a no-op when it runs with "if not exists".
alter table public.articles
  add column if not exists auto_published boolean not null default false,
  add column if not exists kind text not null default 'news' check (kind in ('news','guide'));

update public.articles a set
  auto_published = coalesce(d.auto_published, false),
  kind = case when d.kind = 'guide' then 'guide' else 'news' end
from public.article_drafts d
where d.id = a.draft_id;

-- 011 — Admin overview numbers and audited role changes (SPEC.md §4 A1, §5 Admin API "roles").
-- Service role only. The overview reads live counts until the 02:00 IST rollup into metrics_daily ships (PR 7).

create or replace function public.admin_overview() returns jsonb
language sql stable security definer set search_path = public as $$
  with
    ist_today as (select (date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata') as t),
    ready as (select user_id from public.profiles where cardinality(skills) > 0),
    channel as (
      select u.id as user_id from public.users u join public.alert_settings a on a.user_id = u.id
      where u.telegram_chat_id is not null or 'email' = any(a.channels)
    ),
    -- Active this week = signed in, tailored a resume, emailed HR or moved a tracker card in the last 7 days
    active as (
      select id as user_id from auth.users where last_sign_in_at > now() - interval '7 days'
      union select user_id from public.tailored_resumes where created_at > now() - interval '7 days'
      union select user_id from public.outreach where sent_at > now() - interval '7 days'
      union select user_id from public.applications where updated_at > now() - interval '7 days'
    )
  select jsonb_build_object(
    'first_signup_at', (select min(created_at) from public.users),
    'signups', (select count(*) from public.users),
    'signups_today', (select count(*) from public.users, ist_today where created_at >= ist_today.t),
    'signups_7d', (select count(*) from public.users where created_at > now() - interval '7 days'),
    'profile_ready', (select count(*) from ready),
    'activated', (select count(*) from ready join channel using (user_id)),
    'weekly_active', (select count(*) from active a join public.users u on u.id = a.user_id),
    'paid', (select count(*) from public.subscriptions where status in ('active','authenticated')),
    'paid_within_60d', (
      select count(*) from public.subscriptions s join public.users u on u.id = s.user_id
      where s.status in ('active','authenticated') and coalesce(s.trial_end, now()) - u.created_at <= interval '67 days'
    ),
    'debits_ok_30d', (select count(*) from public.payments where status = 'captured' and paid_at > now() - interval '30 days'),
    'debits_failed_30d', (select count(*) from public.payments where status = 'failed' and paid_at > now() - interval '30 days'),
    'halted', (select count(*) from public.subscriptions where status = 'halted'),
    'tailored_7d', (select count(*) from public.tailored_resumes where created_at > now() - interval '7 days'),
    'alerts_today', (select count(*) from public.alert_settings, ist_today where last_sent_at >= ist_today.t),
    'jobs_today', (select count(*) from public.jobs, ist_today where created_at >= ist_today.t),
    'last_job_at', (select max(created_at) from public.jobs),
    'enrich_backlog', (select count(*) from public.jobs where not enriched),
    'drafts_waiting', (select count(*) from public.article_drafts where status = 'draft')
  );
$$;
revoke execute on function public.admin_overview() from public, anon, authenticated;

-- Add, change or remove an admin. Owners only (checked in the route); never leaves the panel without an owner.
create or replace function public.admin_set_role(p_actor uuid, p_user uuid, p_role text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b text; owners int;
begin
  if p_role is not null and p_role not in ('owner','ops','marketing','reviewer') then raise exception 'unknown role %', p_role; end if;
  select role into b from public.admin_users where user_id = p_user for update;
  if b = 'owner' and coalesce(p_role, '') <> 'owner' then
    select count(*) into owners from public.admin_users where role = 'owner';
    if owners <= 1 then raise exception 'last_owner'; end if;
  end if;
  if p_role is null then
    delete from public.admin_users where user_id = p_user;
  else
    insert into public.admin_users (user_id, role) values (p_user, p_role)
      on conflict (user_id) do update set role = excluded.role;
  end if;
  insert into public.audit_log (actor_id, action, target_table, target_id, before, after)
    values (p_actor, 'role.set', 'admin_users', p_user::text,
            case when b is null then null else jsonb_build_object('role', b) end,
            case when p_role is null then null else jsonb_build_object('role', p_role) end);
  return jsonb_build_object('user_id', p_user, 'role', p_role);
end $$;
revoke execute on function public.admin_set_role(uuid, uuid, text) from public, anon, authenticated;

-- 012 — When each subscription row was created, for "new in the last 30 days" on the admin Payments page (A11).
-- Rows that existed before this migration get the migration time; there were none with a live mandate.
alter table public.subscriptions add column if not exists created_at timestamptz not null default now();

-- 013 — WhatsApp core (docs/whatsapp-admin/SPEC.md §6, migration B; PR 3).
-- Adapted: subscriptions.plan_code already holds hustle / season / yearpass (migration 004), so the spec's
-- pro / pro_wa plan_code change waits for PR 4, once the WhatsApp price per plan is decided.

-- users.plan gains pro_wa (constraint name checked: users_plan_check)
alter table public.users drop constraint if exists users_plan_check;
alter table public.users add constraint users_plan_check check (plan in ('free','pro','pro_wa'));

create table if not exists public.whatsapp_contacts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  status text not null default 'pending' check (status in ('pending','verified')),
  consent_at timestamptz not null,
  consent_version text not null,
  verified_at timestamptz,
  opted_out_at timestamptz,
  paused boolean not null default false,
  fail_streak integer not null default 0,
  last_auto_reply_at timestamptz,
  updated_at timestamptz not null default now()
);
-- W1.3: a number can be verified on only one account
create unique index if not exists whatsapp_verified_phone_uidx on public.whatsapp_contacts (phone_e164) where status = 'verified';

create table if not exists public.whatsapp_otps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phone_e164 text not null,
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists whatsapp_otps_user_idx on public.whatsapp_otps (user_id, created_at desc);

-- Meta's prices live here, never in code. Add a new row when Meta changes prices; never edit old rows.
create table if not exists public.wa_rate_card (
  category text not null check (category in ('marketing','utility','authentication','service')),
  inr_per_msg numeric(8,4) not null,
  gst_pct numeric(5,2) not null default 18,
  effective_from date not null,
  primary key (category, effective_from)
);
insert into public.wa_rate_card (category, inr_per_msg, effective_from) values
  ('marketing', 0.8631, '2026-10-01'),
  ('utility', 0.1150, '2026-10-01'),
  ('authentication', 0.1150, '2026-10-01'),
  ('service', 0.1150, '2026-10-01')
on conflict do nothing;

create table if not exists public.wa_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('digest','verify','stop_confirm','auto_reply')),
  template text,
  send_date date not null,
  meta_message_id text unique,
  status text not null default 'queued' check (status in ('queued','sent','delivered','read','failed')),
  category text,
  billable boolean,
  cost_inr numeric(10,4) not null default 0,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One digest per student per IST day, even if the cron runs twice
create unique index if not exists wa_one_digest_per_day_uidx on public.wa_messages (user_id, send_date) where kind = 'digest';
create index if not exists wa_messages_date_idx on public.wa_messages (send_date, status);

create table if not exists public.wa_inbound (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  phone_hash text not null,
  body text check (char_length(body) <= 1000),
  keyword text check (keyword in ('stop','start')),
  meta_message_id text not null unique,
  received_at timestamptz not null default now()
);

create table if not exists public.wa_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  quality_rating text,
  messaging_limit_tier text,
  templates jsonb not null default '[]'::jsonb,
  captured_at timestamptz not null default now()
);

alter table public.whatsapp_contacts enable row level security;
alter table public.whatsapp_otps enable row level security;
alter table public.wa_rate_card enable row level security;
alter table public.wa_messages enable row level security;
alter table public.wa_inbound enable row level security;
alter table public.wa_health_snapshots enable row level security;
drop policy if exists "own whatsapp contact" on public.whatsapp_contacts;
create policy "own whatsapp contact" on public.whatsapp_contacts for select using (user_id = auth.uid());
-- No other policies: all writes and every other read go through server routes with the service role.

-- Daily cleanup also drops WhatsApp inbound messages after 90 days and spent codes after a day (SPEC.md §6 notes)
create or replace function public.cleanup_old_data() returns jsonb
language plpgsql security definer set search_path = public as $$
declare j int; n int; w int; i int;
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
  delete from public.wa_inbound where received_at < now() - interval '90 days';
  get diagnostics i = row_count;
  delete from public.whatsapp_otps where created_at < now() - interval '1 day';
  return jsonb_build_object('jobs', j, 'news_items', n, 'webhook_events', w, 'wa_inbound', i);
end $$;
revoke execute on function public.cleanup_old_data() from public, anon, authenticated;

-- 014 — Two prices per period instead of three plans (user's choice, 19 Oct 2026):
--   pro_15 ₹10 every 15 days · pro_30 ₹20 a month · pro_wa_15 ₹29 every 15 days · pro_wa_30 ₹59 a month.
-- Replaces Hustle / Season / Year Pass (migration 004). No subscription existed when this ran; any old code is mapped
-- to the closest new one so the check can't fail.
alter table public.subscriptions drop constraint if exists subscriptions_plan_code_check;
update public.subscriptions set plan_code = case plan_code when 'hustle' then 'pro_15' when 'season' then 'pro_30' when 'yearpass' then 'pro_30' else plan_code end
  where plan_code in ('hustle','season','yearpass');
alter table public.subscriptions add constraint subscriptions_plan_code_check
  check (plan_code is null or plan_code in ('pro_15','pro_30','pro_wa_15','pro_wa_30'));

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

-- 016 — Remember who finished onboarding and when they were last here, so returning students go straight to the
-- dashboard instead of through login and the setup steps again (user feedback, 19 Oct 2026).
-- Both are written only by the server (no client column grant), like plan and role.
alter table public.users
  add column if not exists onboarded_at timestamptz,
  add column if not exists last_seen_at timestamptz;

-- Students who already uploaded a resume count as onboarded
update public.users u set onboarded_at = coalesce(p.updated_at, u.created_at)
  from public.profiles p
  where p.user_id = u.id and cardinality(p.skills) > 0 and u.onboarded_at is null;
update public.users set last_seen_at = now() where last_seen_at is null;
