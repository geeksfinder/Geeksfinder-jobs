-- 020: job posts the 6:00 run downloaded and rejected (senior, 4+ years asked, placeholder), so they aren't
-- downloaded again every morning. Rows older than 30 days are deleted by the run, so a re-posted job gets a fresh look.
-- No policies: only the service role (cron) uses it. Run once in the Supabase SQL editor.
create table if not exists public.rejected_postings (
  source text not null,
  source_id text not null,
  reason text not null,
  rejected_at timestamptz not null default now(),
  primary key (source, source_id)
);
alter table public.rejected_postings enable row level security;
