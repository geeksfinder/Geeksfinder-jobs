-- 018: let pages read jobs.deadline (added in 017). Reads of jobs use a column grant (002_hardening.sql), so every
-- new column students or visitors may see has to be granted here too, or every job list fails with
-- "permission denied for table jobs". Run once in the Supabase SQL editor.
grant select (deadline) on public.jobs to anon, authenticated;
