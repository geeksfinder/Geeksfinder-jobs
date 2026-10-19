-- 012 — When each subscription row was created, for "new in the last 30 days" on the admin Payments page (A11).
-- Rows that existed before this migration get the migration time; there were none with a live mandate.
alter table public.subscriptions add column if not exists created_at timestamptz not null default now();
