-- 008 — store the automatic review of each blog draft (SEO score, AI editor scores, auto-publish decision and
-- the reasons it was held), so the admin queue and the daily report can show why.
alter table public.article_drafts add column if not exists review jsonb;
alter table public.article_drafts add column if not exists auto_published boolean not null default false;
