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
