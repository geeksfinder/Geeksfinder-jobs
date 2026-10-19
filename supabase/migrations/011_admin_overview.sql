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
