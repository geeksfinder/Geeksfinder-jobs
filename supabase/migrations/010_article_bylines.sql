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
