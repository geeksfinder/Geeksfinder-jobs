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
