# How GeeksFinder fits together

A one-page map, so you can find your way around the code. The rule throughout: **one file owns each idea, and
everything else calls it.** If you're changing how skills, cities, matching or prices work, there is exactly one
place to change.

## The pieces

| Part | Where | What it is |
|---|---|---|
| Website and app | `web/` (Next.js on Vercel) | Public pages, the student app, admin, and the API routes |
| Database, login, files | Supabase | Postgres with row-level security, email-code login, resume PDFs in storage |
| Scheduled jobs | `web/scripts/` run by `.github/workflows/daily.yml` | The 6:00 job fetch, hourly alerts, the blog, the nightly report |
| Database changes | `supabase/migrations/` | Run by hand, in order, in the Supabase SQL editor |
| Look and copy | `DESIGN.md` + `web/src/app/globals.css` | The only colours, fonts and spacing the UI may use |

## How a job travels, from a company's site to a student's phone

1. **6:00 IST: fetch** (`scripts/cron.ts ingest`). Jobs come from JSearch (searches built from students' roles and
   every branch, `lib/branches.ts`), company job boards (`scripts/boards.json`), SmartRecruiters, Remotive and official
   Govt & PSU careers pages (`scripts/govt-sources.json`, `lib/govt.ts`).
2. **Quality gate.** Senior posts, posts asking 4+ years, placeholders and middleman links
   (`lib/job-quality.ts`) are dropped; what's dropped is remembered for 30 days so it isn't downloaded again.
   Duplicates are merged by company + title + city.
3. **AI reads each new job once** (`enrich`): skills, years asked, fresher-friendly, a one-line summary.
4. **Matching** (`lib/matching.ts`): every student's skills, roles and cities against every new job. Skills compare
   through `lib/skills.ts` (one name per skill, "ReactJS" = "React"), places through `lib/cities.ts`
   ("Bangalore" = "Bengaluru", Delhi NCR covers Noida). 60+ is a match; 45–59 is "Worth a look".
5. **Alerts** (`notify`, every hour): students whose alert time is now get their best unsent matches as one
   Telegram message and/or an email (`lib/alerts.ts`), five students at a time.
6. **On the site:** the dashboard lists matches; a job page has Tailor resume (AI rewrites wording only, never adds
   skills: `lib/resume.ts`), a cover letter written from that tailored resume, PDF downloads (`lib/pdf-styles.ts`),
   Email HR (`lib/finder.ts` finds the contact), and Report this job (`lib/job-reports.ts`).

## Folders in `web/src`

| Folder | What's in it |
|---|---|
| `app/` | Every page and API route. `(app)/` is the signed-in app (dashboard, tracker, resumes, alerts, billing); `admin/` is the admin panel; `jobs/`, `companies/`, `blog/`, `tools/` are public pages for Google |
| `app/api/` | Server routes. Each one checks the session first, validates its body (`lib/validate.ts`) and is rate limited (`lib/ratelimit.ts`) |
| `components/ui/` | The building blocks from DESIGN.md: Button, JobCard, MatchScore, ResumeDiff, Toast… |
| `components/app/` | Pieces of the signed-in app: tag input, branch select, resume upload, nav |
| `lib/` | All the logic, one idea per file (table below) |

## Who owns what (`web/src/lib`)

| Idea | File |
|---|---|
| Skills and their spellings, branch of a skill | `skills.ts` |
| Branches, their job searches, the role list | `branches.ts` |
| Cities, spellings, regions, "is this in India" | `cities.ts` |
| Match score | `matching.ts` (and `match-now.ts` right after onboarding) |
| AI prompts, the provider chain, waiting when every provider is busy | `ai.ts` |
| Plans, prices and Razorpay plan ids | `pricing.ts`; quotas in `plan.ts` |
| Job pages for Google (role × city) | `hubs.ts` |
| Govt & PSU notices | `govt.ts` |
| Reading a resume PDF (server and browser) | `resume.ts`, `pdf-text.ts` |
| Fetching any outside URL safely | `safe-fetch.ts` |
| Request bodies and their limits | `validate.ts` |

## Rules that keep it safe

- Secrets live only in `web/.env.local` and in Vercel / GitHub settings; the service-role key never reaches the browser.
- Text from resumes, job posts and websites goes to AI inside `<untrusted_…>` blocks and is treated as data.
- Students and visitors can read only the `jobs` columns that are granted (`002_hardening.sql`, `018_grant_deadline.sql`):
  **a new jobs column needs its own grant**, or every job list breaks.
- Only Razorpay webhooks change a student's plan. Admin pages answer 404 to non-admins and every admin change is audited.

## Everyday commands (from `web/`)

`npm run dev` · `npm run build` · `npm run lint` · `npx vitest run` · `npm run cron:ingest` (fetch now) ·
`npm run cron:notify` (alerts now) · `npx tsx --env-file=.env.local scripts/cron.ts govt --dry-run` (read Govt &
PSU pages without saving)
