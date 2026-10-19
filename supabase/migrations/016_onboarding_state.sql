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
