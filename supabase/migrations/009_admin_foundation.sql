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
