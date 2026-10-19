/**
 * Daily pipeline (TRD §Job ingestion). Run on GitHub Actions:
 *   npx tsx scripts/cron.ts ingest   # 06:00 IST: fetch → dedupe → enrich → match
 *   npx tsx scripts/cron.ts notify   # hourly at :30 IST: digests for users whose alert time is now, follow-ups, downgrades
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { withCronRun, type CronContext } from "@/lib/admin/cron-run";
import { getFlag } from "@/lib/admin/flags";
import { generateJSON, untrusted } from "@/lib/ai";
import { sendEmail } from "@/lib/email";
import { htmlToText, minYearsAsked } from "@/lib/jobtext";
import { eligible } from "@/lib/match-now";
import { MATCH_THRESHOLD, scoreMatch } from "@/lib/matching";
import { adminClient } from "@/lib/supabase/admin";
import { esc, sendTelegram } from "@/lib/telegram";
import { unsubscribeUrl } from "@/lib/unsubscribe";
import { alertEmailHtml, alertEmailSubject, sendTelegramAlert, type AlertMatch } from "@/lib/alerts";

/**
 * Unattended runs must survive network blips: retry dropped connections, 429 and 5xx up to 3 times with backoff.
 * Used for every job source and for the database client.
 */
async function fetchRetry(input: RequestInfo | URL, init?: RequestInit, tries = 3): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(input, init);
      if ((res.status === 429 || res.status >= 500) && attempt < tries) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      if (attempt >= tries || (e as Error).name === "AbortError" && init?.signal?.aborted) throw e;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
    }
  }
}

const db = adminClient({ fetch: (input, init) => fetchRetry(input, init) });
const APP = process.env.NEXT_PUBLIC_APP_URL ?? "";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

type RawJob = {
  source: string;
  source_id: string;
  title: string;
  company: string;
  company_domain: string | null;
  location: string | null;
  remote: boolean;
  description: string;
  apply_url: string | null;
  posted_at: string | null;
};

const INDIA_CITY = /india|bengaluru|bangalore|pune|mumbai|hyderabad|chennai|delhi|gurgaon|gurugram|noida|kolkata|ahmedabad|kochi|jaipur|indore|kolhapur|thiruvananthapuram|coimbatore|chandigarh/i;
/** India locations, or remote roles open to India (not "Remote - US"). */
const INDIA = { test: (loc: string) => INDIA_CITY.test(loc) || (/remote/i.test(loc) && (/apac|asia|anywhere|worldwide|global/i.test(loc) || /^\s*remote\s*$/i.test(loc))) };
const stripHtml = (s: string) => htmlToText(s);
const domainOf = (url?: string | null) => {
  try { return url ? new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "") : null; } catch { return null; }
};
const hashJob = (j: RawJob) => {
  const city = (j.remote ? "remote" : (j.location ?? "").split(",")[0]).toLowerCase().trim();
  return createHash("sha256").update(`${j.company.toLowerCase().trim()}|${j.title.toLowerCase().trim()}|${city}`).digest("hex");
};

const FRESHER_TITLE = /\b(intern|internship|trainee|graduate|fresher|entry[- ]level|junior|jr|associate|apprentice|campus|new grad|sde[- ]?(i|1)|engineer i|analyst i|level 1|l1)\b/i;
const SENIOR_TITLE = /\b(senior|sr|lead|staff|principal|manager|head|director|architect|vp|chief|expert|ii|iii|iv)\b/i;

/** Senior titles are never fresher roles, and neither is a post asking for 2+ years, whatever the model says. */
const isFresherFriendly = (title: string, minYears: number, aiSaysFresher: boolean) => !SENIOR_TITLE.test(title) && aiSaysFresher && minYears <= 1;

// ---------- Fetchers ----------

/**
 * JSearch (RapidAPI) — aggregated listings from many Indian job sites; the main source of fresher roles.
 * The free plan is a small monthly quota shared by every run (PC and cloud), so each run reads the quota
 * RapidAPI reports and spends only its fair share for the day: remaining ÷ days until the quota resets.
 */
async function fetchJSearch(queries: string[]): Promise<RawJob[]> {
  if (!process.env.RAPIDAPI_KEY) return [];
  const out: RawJob[] = [];
  const maxPerRun = Number(process.env.JSEARCH_MAX_QUERIES ?? 6);
  // 10 pages per request returns ~2.5x more jobs per quota unit than single pages (it's charged as ~3 units)
  const pages = Number(process.env.JSEARCH_PAGES ?? 10);
  let allowed = maxPerRun;
  let used = 0;
  let unitCost = pages > 1 ? 3 : 1; // replaced by the measured cost after the second request
  let lastRemaining: number | null = null;
  // Rotate which searches go first (2 runs a day), so every query gets its turn across the week
  const now = new Date(Date.now() + 5.5 * 3_600_000);
  const slot = Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 1)) / 86_400_000) * 2 + (now.getUTCHours() >= 12 ? 1 : 0);
  const ordered = queries.map((_, i) => queries[(i + slot) % queries.length]);
  for (const q of ordered) {
    if (used >= allowed) break;
    try {
      const url = `https://jsearch.p.rapidapi.com/search-v2?query=${encodeURIComponent(`${q} in India`)}&country=in&date_posted=week&num_pages=${pages}`;
      const res = await fetchRetry(url, { headers: { "X-RapidAPI-Key": process.env.RAPIDAPI_KEY, "X-RapidAPI-Host": "jsearch.p.rapidapi.com" }, signal: AbortSignal.timeout(90_000) });
      used++;
      // Fair share of what's left this month, in quota units (headers: units remaining, seconds until reset)
      const remaining = Number(res.headers.get("x-ratelimit-requests-remaining"));
      const resetDays = Number(res.headers.get("x-ratelimit-requests-reset")) / 86_400;
      if (Number.isFinite(remaining) && Number.isFinite(resetDays)) {
        if (lastRemaining !== null && lastRemaining > remaining) unitCost = lastRemaining - remaining;
        lastRemaining = remaining;
        const reserve = Number(process.env.JSEARCH_RESERVE ?? 10);
        const runsPerDay = Number(process.env.JSEARCH_RUNS_PER_DAY ?? 2);
        // This run's share includes what it already spent; at the end of the month it can drop to "stop now"
        const unitsShare = (remaining + used * unitCost - reserve) / Math.max(1, Math.ceil(resetDays)) / runsPerDay;
        allowed = Math.min(maxPerRun, Math.max(used, Math.floor(unitsShare / unitCost)));
      }
      if (!res.ok) { log("jsearch", res.status, (await res.text()).slice(0, 120)); break; }
      const data = await res.json();
      for (const j of (data.data?.jobs ?? data.data ?? []) as Record<string, unknown>[]) {
        if (!j.job_id || !j.job_title || !j.employer_name) continue;
        // Highlights hold the qualifications/responsibilities as lists; keep them for skill extraction
        const hl = (j.job_highlights ?? {}) as Record<string, string[]>;
        const lists = Object.entries(hl).map(([k, items]) => `${k}\n${(items ?? []).map((i) => `• ${i}`).join("\n")}`).join("\n\n");
        out.push({
          source: `jsearch:${j.job_publisher ?? ""}`,
          source_id: String(j.job_id),
          title: String(j.job_title),
          company: String(j.employer_name),
          company_domain: domainOf(j.employer_website as string | null),
          location: [j.job_city, j.job_state].filter(Boolean).join(", ") || String(j.job_location ?? "India"),
          remote: !!j.job_is_remote,
          description: [String(j.job_description ?? ""), lists].filter(Boolean).join("\n\n"),
          apply_url: (j.job_apply_link as string) ?? null,
          posted_at: (j.job_posted_at_datetime_utc as string) ?? null,
        });
      }
    } catch (e) { log("jsearch error", q, e); }
  }
  log(`jsearch: ${used} requests this run, ${out.length} jobs`);
  return out;
}

async function fetchAdzuna(queries: string[]): Promise<RawJob[]> {
  if (!process.env.ADZUNA_APP_ID) return [];
  const out: RawJob[] = [];
  for (const q of queries.slice(0, 8)) {
    try {
      const res = await fetchRetry(`https://api.adzuna.com/v1/api/jobs/in/search/1?app_id=${process.env.ADZUNA_APP_ID}&app_key=${process.env.ADZUNA_APP_KEY}&what=${encodeURIComponent(q)}&results_per_page=50&max_days_old=2&content-type=application/json`);
      const data = await res.json();
      for (const j of data.results ?? []) {
        out.push({
          source: "adzuna",
          source_id: String(j.id),
          title: j.title.replace(/<[^>]+>/g, ""),
          company: j.company?.display_name ?? "Unknown",
          company_domain: null,
          location: j.location?.display_name ?? "India",
          remote: /remote/i.test(j.title + j.description),
          description: stripHtml(j.description ?? ""),
          apply_url: j.redirect_url,
          posted_at: j.created ?? null,
        });
      }
    } catch (e) { log("adzuna error", q, e); }
  }
  return out;
}

async function fetchBoards(): Promise<RawJob[]> {
  const boards = JSON.parse(readFileSync(new URL("./boards.json", import.meta.url), "utf8")) as { greenhouse: string[]; lever: string[]; ashby?: string[] };
  const out: RawJob[] = [];
  for (const slug of boards.greenhouse) {
    try {
      const res = await fetchRetry(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) { log("greenhouse not found", slug); continue; }
      const data = await res.json();
      // The jobs list has no company display name; the board endpoint does
      const board = await fetchRetry(`https://boards-api.greenhouse.io/v1/boards/${slug}`).then((r) => r.json()).catch(() => ({}));
      data.meta = { name: board?.name || slug };
      for (const j of data.jobs ?? []) {
        const loc = j.location?.name ?? "";
        if (!INDIA.test(loc)) continue;
        out.push({
          source: "greenhouse", source_id: String(j.id), title: j.title, company: data.meta?.name ?? slug,
          company_domain: domainOf(j.absolute_url)?.includes("greenhouse") ? null : domainOf(j.absolute_url),
          location: loc, remote: /remote/i.test(loc),
          description: htmlToText(j.content ?? "", { encoded: true }), apply_url: j.absolute_url, posted_at: j.updated_at ?? null,
        });
      }
    } catch (e) { log("greenhouse error", slug, e); }
  }
  for (const slug of boards.lever) {
    try {
      const res = await fetchRetry(`https://api.lever.co/v0/postings/${slug}?mode=json`, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) { log("lever not found", slug); continue; }
      for (const j of await res.json()) {
        const locs = [j.categories?.location, ...(j.categories?.allLocations ?? [])].filter(Boolean) as string[];
        const loc = locs.find((l) => INDIA.test(l)) ?? "";
        if (!loc) continue;
        // Requirements live in "lists"; keep them so skills and experience can be read
        const lists = (j.lists ?? []).map((l: { text: string; content: string }) => `<h3>${l.text}</h3><ul>${l.content}</ul>`).join("");
        out.push({
          source: "lever", source_id: j.id, title: j.text, company: slug.charAt(0).toUpperCase() + slug.slice(1), company_domain: null,
          location: loc, remote: j.workplaceType === "remote" || /remote/i.test(loc),
          description: htmlToText(`${j.description ?? ""}${lists}${j.additional ?? ""}`) || (j.descriptionPlain ?? ""), apply_url: j.hostedUrl,
          posted_at: j.createdAt ? new Date(j.createdAt).toISOString() : null,
        });
      }
    } catch (e) { log("lever error", slug, e); }
  }
  for (const slug of boards.ashby ?? []) {
    try {
      const res = await fetchRetry(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) { log("ashby not found", slug); continue; }
      for (const j of (await res.json()).jobs ?? []) {
        if (j.isListed === false) continue;
        const locs = [j.location, ...(j.secondaryLocations ?? []).map((s: { location: string }) => s.location), j.address?.postalAddress?.addressCountry].filter(Boolean) as string[];
        const loc = locs.find((l) => INDIA.test(l)) ?? "";
        if (!loc) continue;
        out.push({
          source: "ashby", source_id: j.id, title: j.title, company: slug.charAt(0).toUpperCase() + slug.slice(1), company_domain: null,
          location: loc, remote: !!j.isRemote || j.workplaceType === "Remote",
          description: (j.employmentType === "Intern" ? "Employment type: Internship\n" : "") + (htmlToText(j.descriptionHtml ?? "") || j.descriptionPlain || ""),
          apply_url: j.jobUrl, posted_at: j.publishedAt ?? null,
        });
      }
    } catch (e) { log("ashby error", slug, e); }
  }
  return out;
}

/**
 * SmartRecruiters lists jobs cheaply but needs one call per job for the description, so only new jobs are
 * fetched in full — entry-level and internships first — capped per company per run. Senior levels are skipped.
 */
async function fetchSmartRecruiters(): Promise<RawJob[]> {
  const boards = JSON.parse(readFileSync(new URL("./boards.json", import.meta.url), "utf8")) as { smartrecruiters?: string[] };
  const cap = Number(process.env.SR_DETAIL_LIMIT ?? 120);
  const LEVEL_ORDER: Record<string, number> = { internship: 0, entry_level: 1, associate: 2, not_applicable: 3 };
  const out: RawJob[] = [];
  for (const company of boards.smartrecruiters ?? []) {
    try {
      type Posting = { id: string; name: string; company?: { name?: string }; location?: { city?: string; remote?: boolean }; releasedDate?: string; experienceLevel?: { id?: string; label?: string } };
      const list: Posting[] = [];
      for (let offset = 0; offset < 1000; offset += 100) {
        const res = await fetchRetry(`https://api.smartrecruiters.com/v1/companies/${company}/postings?country=in&limit=100&offset=${offset}`, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) break;
        const page = await res.json();
        list.push(...(page.content ?? []));
        if (!page.content?.length || list.length >= (page.totalFound ?? 0)) break;
      }
      const { data: have } = await db.from("jobs").select("source_id").eq("source", "smartrecruiters").in("source_id", list.map((p) => p.id).slice(0, 1000));
      const known = new Set((have ?? []).map((r) => r.source_id));
      const todo = list
        // Check the title before paying for the detail call; rejected jobs are never saved, so they'd look "new" every run
        .filter((p) => !known.has(p.id) && (p.experienceLevel?.id ?? "not_applicable") in LEVEL_ORDER && worthKeeping({ title: p.name, description: "" }))
        .sort((a, b) => LEVEL_ORDER[a.experienceLevel?.id ?? "not_applicable"] - LEVEL_ORDER[b.experienceLevel?.id ?? "not_applicable"])
        .slice(0, cap);
      for (const p of todo) {
        const d = await fetchRetry(`https://api.smartrecruiters.com/v1/companies/${company}/postings/${p.id}`, { signal: AbortSignal.timeout(20_000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (!d) continue;
        const s = d.jobAd?.sections ?? {};
        const html = ["jobDescription", "qualifications", "additionalInformation"].map((k) => (s[k]?.text ? `<h3>${s[k].title ?? ""}</h3>${s[k].text}` : "")).join("");
        out.push({
          source: "smartrecruiters", source_id: p.id, title: p.name, company: p.company?.name ?? company, company_domain: null,
          location: [p.location?.city ? p.location.city.replace(/\b\w/g, (c) => c.toUpperCase()) : "", "India"].filter(Boolean).join(", "),
          remote: !!p.location?.remote,
          description: `Experience level: ${p.experienceLevel?.label ?? "Not specified"}\n${htmlToText(html)}`,
          apply_url: d.postingUrl ?? d.applyUrl ?? null, posted_at: p.releasedDate ?? null,
        });
        await sleep(150);
      }
      log(`smartrecruiters ${company}: ${list.length} in India, ${todo.length} new fetched`);
    } catch (e) { log("smartrecruiters error", company, e); }
  }
  return out;
}

/** Quality gate before saving: drop senior roles and posts asking 4+ years. Students never see them; they'd only cost AI quota. */
const STRICT_SENIOR = /\b(senior|sr\.?|staff|principal|director|head of|vp|vice president|chief|architect|manager|lead)\b/i;
const JUNIOR_OVERRIDE = /\b(intern|internship|trainee|graduate|fresher|apprentice|campus|new grad)\b/i;
function worthKeeping(j: { title: string; description: string | null }) {
  if (STRICT_SENIOR.test(j.title) && !JUNIOR_OVERRIDE.test(j.title)) return false;
  return (minYearsAsked(j.description) ?? 0) < 4;
}

async function fetchRemotive(): Promise<RawJob[]> {
  try {
    const res = await fetchRetry("https://remotive.com/api/remote-jobs?category=software-dev&limit=100");
    const data = await res.json();
    return (data.jobs ?? [])
      .filter((j: { candidate_required_location: string }) => /worldwide|anywhere|india|asia/i.test(j.candidate_required_location))
      .map((j: Record<string, string>) => ({
        source: "remotive", source_id: String(j.id), title: j.title, company: j.company_name, company_domain: null,
        location: "Remote", remote: true, description: stripHtml(j.description ?? ""), apply_url: j.url, posted_at: j.publication_date,
      }));
  } catch (e) { log("remotive error", e); return []; }
}

// ---------- Pipeline ----------

async function ingest(ctx: CronContext) {
  const { data: profiles } = await db.from("profiles").select("preferred_roles");
  const roleCounts = new Map<string, number>();
  for (const p of profiles ?? []) for (const r of p.preferred_roles ?? []) roleCounts.set(r.toLowerCase(), (roleCounts.get(r.toLowerCase()) ?? 0) + 1);
  const queries = [...roleCounts.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => `${r} fresher`);
  // Always cover the core fresher searches and internships, after whatever roles students asked for
  for (const q of ["software engineer fresher", "internship", "data analyst fresher", "graduate engineer trainee", "web developer fresher", "fresher jobs"]) {
    if (!queries.includes(q)) queries.push(q);
  }

  const fetched = (await Promise.all([fetchJSearch(queries), fetchAdzuna(queries), fetchBoards(), fetchSmartRecruiters(), fetchRemotive()])).flat();
  const all = fetched.filter(worthKeeping);
  const bySource = new Map<string, number>();
  for (const j of all) bySource.set(j.source.split(":")[0], (bySource.get(j.source.split(":")[0]) ?? 0) + 1);
  log(`fetched ${fetched.length} jobs, kept ${all.length} after dropping senior roles:`, Object.fromEntries(bySource));

  // Dedupe within batch and against DB
  const byHash = new Map<string, RawJob>();
  for (const j of all) if (j.title && j.company) byHash.set(hashJob(j), j);
  const hashes = [...byHash.keys()];
  const existing = new Set<string>();
  for (let i = 0; i < hashes.length; i += 200) {
    const { data } = await db.from("jobs").select("hash").in("hash", hashes.slice(i, i + 200));
    data?.forEach((r) => existing.add(r.hash));
  }
  const fresh = hashes.filter((h) => !existing.has(h)).map((h) => ({ ...byHash.get(h)!, hash: h, description: byHash.get(h)!.description.slice(0, 12000) }));
  let inserted = 0;
  for (let i = 0; i < fresh.length; i += 100) {
    const { error } = await db.from("jobs").insert(fresh.slice(i, i + 100));
    if (error) ctx.warn(`insert failed: ${error.message}`);
    else inserted += Math.min(100, fresh.length - i);
  }
  log(`inserted ${inserted} of ${fresh.length} new jobs`);

  const { enriched } = await enrich();
  const { matched } = await match();
  const { data: cleaned, error } = await db.rpc("cleanup_old_data");
  log("cleanup", error ? `failed: ${error.message}` : JSON.stringify(cleaned));
  if (error) ctx.warn(`cleanup failed: ${error.message}`);
  return { fetched: fetched.length, kept: all.length, new: fresh.length, inserted, enriched, matched };
}

/** AI once per job, batched 15 per call. */
async function enrich() {
  // AI budget is limited: enrich likely-fresher roles first, senior titles last
  const { data: pending, error: pendingError } = await db.from("jobs").select("id, title, company, description").eq("enriched", false).order("created_at", { ascending: false }).limit(3000);
  if (pendingError) throw new Error(`could not read jobs to enrich: ${pendingError.message}`);
  const rank = (t: string) => (FRESHER_TITLE.test(t) ? 0 : SENIOR_TITLE.test(t) ? 2 : 1);
  const jobs = (pending ?? []).sort((a, b) => rank(a.title) - rank(b.title)).slice(0, Number(process.env.ENRICH_LIMIT ?? 1200));
  for (let i = 0; i < (jobs ?? []).length; i += 15) {
    const batch = jobs!.slice(i, i + 15);
    const prompt = `For each job below, extract: required technical skills (short canonical names, e.g. "React","Python","SQL"), experience range in years, whether it suits freshers/final-year students/0-1yr (fresher_friendly), and any recruiter/HR email literally present in the text (else null).
Also write "summary": one plain sentence (max 160 chars) in your own words saying what the role involves and who it suits — never copy the description.
Return JSON: {"jobs":[{"id":string,"skills":string[],"experience_min":number,"experience_max":number,"fresher_friendly":boolean,"contact_email":string|null,"summary":string}]}

${untrusted("jobs", batch.map((j) => `### id=${j.id}\n${j.title} at ${j.company}\n${(j.description ?? "").slice(0, 2500)}`).join("\n\n"), 45000)}`;
    try {
      const res = await generateJSON<{ jobs: { id: string; skills: string[]; experience_min: number; experience_max: number; fresher_friendly: boolean; contact_email: string | null; summary?: string }[] }>(prompt);
      for (const e of res.jobs ?? []) {
        if (!batch.some((b) => b.id === e.id)) continue;
        const email = e.contact_email && /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e.contact_email) ? e.contact_email.toLowerCase() : null;
        const job = batch.find((b) => b.id === e.id)!;
        // The post's own "N years of experience" wins over the model's guess
        const asked = minYearsAsked(job.description);
        const minYears = Math.max(e.experience_min ?? 0, asked ?? 0);
        await db.from("jobs").update({
          skills: (e.skills ?? []).slice(0, 25),
          experience_min: asked !== null || e.experience_min != null ? minYears : null,
          experience_max: e.experience_max ?? null,
          fresher_friendly: isFresherFriendly(job.title, minYears, !!e.fresher_friendly || (e.experience_min ?? 99) === 0),
          contact_email: email,
          summary: typeof e.summary === "string" ? e.summary.slice(0, 200) : null,
          enriched: true,
        }).eq("id", e.id);
      }
    } catch (err) {
      log("enrich batch failed", err);
      await sleep(5000);
    }
    await sleep(Number(process.env.AI_DELAY_MS ?? 4000)); // stay under free-tier RPM
  }
  log(`enriched ${(jobs ?? []).length} jobs`);
  return { enriched: (jobs ?? []).length };
}

async function match() {
  const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const { data: jobs } = await db.from("jobs").select("id, title, location, remote, skills, fresher_friendly, posted_at, experience_min").eq("enriched", true).gte("created_at", since);
  const { data: profiles } = await db.from("profiles").select("user_id, skills, preferred_roles, locations, job_type, experience_level");
  let saved = 0;
  for (const p of profiles ?? []) {
    if (!p.skills?.length) continue;
    const rows = [];
    for (const j of jobs ?? []) {
      if (!eligible(p, j)) continue;
      const { score, reasons } = scoreMatch(p, j);
      if (score >= MATCH_THRESHOLD) rows.push({ user_id: p.user_id, job_id: j.id, score, reasons });
    }
    if (rows.length) {
      await db.from("matches").upsert(rows, { onConflict: "user_id,job_id", ignoreDuplicates: true });
      saved += rows.length;
    }
  }
  log(`matched ${saved} user-job pairs`);
  return { matched: saved };
}

/** Hourly run at :30 IST. Due when it's the user's alert hour and the frequency matches. */
function isDue(frequency: string, plan: string, alertHour: number, lastSent: string | null) {
  const now = new Date(Date.now() + 5.5 * 3_600_000); // IST clock
  if (now.getUTCHours() !== alertHour && process.env.NOTIFY_ANY_HOUR !== "1") return false;
  const effective = frequency === "daily" && plan !== "pro" ? "weekly" : frequency; // daily is Pro-only
  const sentRecently = lastSent && Date.now() - new Date(lastSent).getTime() < 20 * 3_600_000;
  if (sentRecently) return false;
  if (effective === "daily") return true;
  if (effective === "weekly") return now.getUTCDay() === 1; // Monday
  return now.getUTCDate() === 1;
}

function inQuietHours(range: string | null) {
  const m = /\[(\d+),(\d+)\)/.exec(range ?? "");
  if (!m) return false;
  const [s, e] = [Number(m[1]), Number(m[2])];
  const h = new Date(Date.now() + 5.5 * 3_600_000).getUTCHours();
  return s < e ? h >= s && h < e : h >= s || h < e;
}

type MatchRow = AlertMatch & { job_id: string };

async function notify(ctx: CronContext) {
  // Kill switches, read once per run (SPEC.md §5). A paused channel leaves matches un-notified for the next run.
  const telegramOn = await getFlag("telegram_sends", db);
  const emailOn = await getFlag("email_sends", db);
  if (!telegramOn) ctx.warn("telegram_sends is off: no Telegram alerts this run");
  if (!emailOn) ctx.warn("email_sends is off: no email alerts this run");
  const { data: settings } = await db.from("alert_settings").select("user_id, frequency, channels, alert_hour, quiet_hours, last_sent_at, users(email, telegram_chat_id, plan, name)");
  let sent = 0;
  for (const s of settings ?? []) {
    const u = s.users as unknown as { email: string; telegram_chat_id: number | null; plan: string; name: string | null } | null;
    if (!u || !isDue(s.frequency, u.plan, s.alert_hour ?? 7, s.last_sent_at) || inQuietHours(s.quiet_hours as string | null)) continue;

    const limit = u.plan === "pro" ? 10 : 5;
    const { data } = await db.from("matches").select("job_id, score, jobs(id, title, company, location, remote, apply_url, fresher_friendly)").eq("user_id", s.user_id).eq("notified", false).order("score", { ascending: false }).limit(limit);
    const matches = (data ?? []) as unknown as MatchRow[];
    if (!matches.length) continue;

    let delivered = false;
    if (telegramOn && s.channels.includes("telegram") && u.telegram_chat_id) {
      delivered = await sendTelegramAlert(u.telegram_chat_id, { name: u.name, plan: u.plan, matches, app: APP });
    }
    if (emailOn && s.channels.includes("email") && u.email) {
      const unsub = unsubscribeUrl(APP, s.user_id);
      const html = alertEmailHtml(matches, { plan: u.plan, unsubscribeUrl: unsub, app: APP });
      delivered = (await sendEmail(u.email, alertEmailSubject(matches.length), html, { unsubscribeUrl: unsub })) || delivered;
    }
    if (delivered) {
      await db.from("matches").update({ notified: true }).eq("user_id", s.user_id).in("job_id", matches.map((m) => m.job_id));
      await db.from("alert_settings").update({ last_sent_at: new Date().toISOString() }).eq("user_id", s.user_id);
      sent++;
    }
  }
  log(`sent digests to ${sent} users`);
  const reminded = telegramOn ? await followUps() : 0;
  await downgradeExpired();
  return { digests: sent, follow_ups: reminded };
}

async function followUps() {
  let reminded = 0;
  const { data } = await db.from("outreach").select("id, user_id, contact_email, jobs(id, title, company), users(telegram_chat_id)").eq("status", "sent").lte("follow_up_at", new Date().toISOString());
  for (const o of data ?? []) {
    const job = o.jobs as unknown as { id: string; title: string; company: string };
    const chat = (o.users as unknown as { telegram_chat_id: number | null })?.telegram_chat_id;
    const { data: app } = await db.from("applications").select("stage").eq("user_id", o.user_id).eq("job_id", job.id).maybeSingle();
    if (chat && app?.stage === "applied") {
      reminded++;
      await sendTelegram(chat, `It's been 5 days since you emailed ${esc(o.contact_email ?? "HR")} about <b>${esc(job.title)}</b> at ${esc(job.company)}. A short, polite follow-up often gets a reply.`, [[{ text: "Open job", url: `${APP}/apply/${job.id}?tab=email` }]]);
    }
    await db.from("outreach").update({ status: "followup_reminded" }).eq("id", o.id);
  }
  return reminded;
}

async function downgradeExpired() {
  const { data } = await db.from("subscriptions").select("user_id").in("status", ["cancelled", "completed", "halted", "expired"]).lt("current_period_end", new Date().toISOString());
  const ids = (data ?? []).map((r) => r.user_id);
  if (ids.length) await db.from("users").update({ plan: "free" }).in("id", ids).eq("plan", "pro");
}

/**
 * One-off repairs: re-fetch board jobs saved before descriptions kept their structure,
 * and untag "fresher-friendly" jobs whose post asks for 2+ years.
 */
async function backfill() {
  let updated = 0;
  for (const j of await fetchBoards()) {
    if (!j.description.includes("\n")) continue;
    const { data } = await db.from("jobs").update({ description: j.description.slice(0, 12000) }).eq("source", j.source).eq("source_id", j.source_id).not("description", "like", "%\n%").select("id");
    updated += data?.length ?? 0;
  }
  log(`backfilled ${updated} job descriptions`);

  const { data: tagged } = await db.from("jobs").select("id, title, description, experience_min").eq("fresher_friendly", true);
  const wrong = (tagged ?? []).filter((j) => !isFresherFriendly(j.title, Math.max(j.experience_min ?? 0, minYearsAsked(j.description) ?? 0), true));
  for (const j of wrong) await db.from("jobs").update({ fresher_friendly: false, experience_min: Math.max(j.experience_min ?? 0, minYearsAsked(j.description) ?? 0) }).eq("id", j.id);
  log(`untagged ${wrong.length} of ${tagged?.length ?? 0} fresher-friendly jobs that ask for 2+ years`);
}

/** One-off: remove stored jobs the quality gate would now reject, unless a student already matched, saved, tailored or emailed about them. */
async function prune() {
  const { data: jobs } = await db.from("jobs").select("id, title, description, source").limit(10000);
  const reject = (jobs ?? []).filter((j) => !worthKeeping(j)).map((j) => j.id);
  const used = new Set<string>();
  for (let i = 0; i < reject.length; i += 200) {
    const ids = reject.slice(i, i + 200);
    for (const t of ["matches", "applications", "tailored_resumes", "outreach"]) {
      const { data } = await db.from(t).select("job_id").in("job_id", ids);
      data?.forEach((r) => used.add(r.job_id));
    }
  }
  const remove = reject.filter((id) => !used.has(id));
  for (let i = 0; i < remove.length; i += 200) await db.from("jobs").delete().in("id", remove.slice(i, i + 200));
  log(`pruned ${remove.length} senior jobs (kept ${used.size} that students already used)`);
  return { pruned: remove.length, kept_in_use: used.size };
}

const COMMANDS: Record<string, (ctx: CronContext) => Promise<Record<string, number> | void>> = { ingest, notify, enrich, match, backfill, prune };
const cmd = process.argv[2];
const run = COMMANDS[cmd];
if (!run) {
  console.error("usage: npx tsx scripts/cron.ts ingest|notify|enrich|match|backfill|prune");
  process.exit(1);
}
// Every run is logged in cron_runs; a failure alerts the owner on Telegram
withCronRun(cmd, run, db).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
