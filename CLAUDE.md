# GeeksFinder

Job alerts + resume tailoring SaaS for Indian freshers. App lives in `web/` (Next.js App Router, Supabase, Tailwind v4). Plan: `Job Alert & Resume Tailoring SaaS — Plan, PRD, TRD & Execution.pdf`.

## UI rules
Before creating or changing any UI, read DESIGN.md and follow it exactly.
Use only the tokens in `web/src/app/globals.css` (`@theme`). Never invent new colors, fonts, radii or shadows.
If a design decision is not covered by DESIGN.md, ask before choosing.

## Security rules (plan section 7)
- Every API route and server action checks the session first (`requireUser`).
- Plan, quotas and prices come only from the database; only webhooks change `plan`.
- Validate request bodies with zod (`web/src/lib/validate.ts`).
- AI/email/OTP routes are rate limited (`web/src/lib/ratelimit.ts`).
- Untrusted text (resumes, job descriptions, news pages) goes to AI inside delimited blocks and is treated as data.
- Outbound fetches of arbitrary URLs go through `safeFetch` (SSRF guard).
- Never use the service-role key in client code or `NEXT_PUBLIC_*` vars.

## Commands (from `web/`)
- `npm run dev` · `npm run build` · `npm run lint`
- `npm run cron:ingest` / `cron:notify` / `cron:news`


new feartures to include in web but later after my approve
Off-campus drive calendar,“Unlock” skill gaps using your own data.,Alumni referral bridge,
