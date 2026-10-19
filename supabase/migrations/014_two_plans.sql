-- 014 — Two prices per period instead of three plans (user's choice, 19 Oct 2026):
--   pro_15 ₹10 every 15 days · pro_30 ₹20 a month · pro_wa_15 ₹29 every 15 days · pro_wa_30 ₹59 a month.
-- Replaces Hustle / Season / Year Pass (migration 004). No subscription existed when this ran; any old code is mapped
-- to the closest new one so the check can't fail.
alter table public.subscriptions drop constraint if exists subscriptions_plan_code_check;
update public.subscriptions set plan_code = case plan_code when 'hustle' then 'pro_15' when 'season' then 'pro_30' when 'yearpass' then 'pro_30' else plan_code end
  where plan_code in ('hustle','season','yearpass');
alter table public.subscriptions add constraint subscriptions_plan_code_check
  check (plan_code is null or plan_code in ('pro_15','pro_30','pro_wa_15','pro_wa_30'));
