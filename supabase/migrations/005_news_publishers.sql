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
