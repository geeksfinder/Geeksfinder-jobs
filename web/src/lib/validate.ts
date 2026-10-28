import { z } from "zod";
import { ADMIN_ROLES, FLAGS, SPEND_PROVIDERS } from "./admin/constants";
import { BRANCH_IDS } from "./skills";
import { PhoneSchema } from "./whatsapp/phone";

/** Request body schemas. Every API route parses its body with one of these. */

const text = (max: number) => z.string().trim().max(max);
const list = (maxItems: number, maxLen = 60) => z.array(text(maxLen).min(1)).max(maxItems);

export const uuid = z.string().uuid();

export const JobIdBody = z.object({ jobId: uuid });

export const TailorPdfBody = z.object({ accepted: z.record(z.string().max(40), text(1200)).optional() });

export const OutreachSentBody = z.object({
  jobId: uuid,
  channel: z.enum(["email", "linkedin"]),
  contactEmail: z.string().email().max(254).optional().nullable(),
});

/**
 * Longest text each profile field takes. One list for the schema below, the resume reader (which trims what it
 * reads from a PDF to fit, so a parsed profile always saves) and the form's maxLength.
 */
export const PROFILE_MAX = {
  education: { institution: 150, degree: 150, year: 40, score: 40 },
  projects: { name: 120, description: 1200 },
  experience: { company: 120, role: 120, duration: 60, bullet: 400 },
} as const;
const M = PROFILE_MAX;

export const ProfileBody = z.object({
  name: text(100),
  phone: z.string().trim().max(20).regex(/^[+\d\s-]*$/, "Use digits only"),
  skills: list(60),
  preferred_roles: list(10, 80),
  locations: list(10, 60),
  job_type: z.enum(["full-time", "internship", "both"]),
  branch: z.enum(BRANCH_IDS).nullable().optional(),
  experience_level: z.enum(["fresher", "0-1", "1-3"]),
  education: z
    .array(z.object({ institution: text(M.education.institution), degree: text(M.education.degree), year: text(M.education.year), score: text(M.education.score).optional() }))
    .max(6),
  projects: z.array(z.object({ name: text(M.projects.name), description: text(M.projects.description), tech: list(15).default([]) })).max(10),
  experience: z
    .array(z.object({ company: text(M.experience.company), role: text(M.experience.role), duration: text(M.experience.duration), bullets: z.array(text(M.experience.bullet)).max(8) }))
    .max(8),
});
export type ProfileInput = z.infer<typeof ProfileBody>;

const clip = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
/** What the resume reader found, trimmed to PROFILE_MAX so the profile form can always save it. */
export function fitParsedProfile(p: { education?: unknown[]; projects?: unknown[]; experience?: unknown[] }) {
  const rows = (xs: unknown[] | undefined, n: number) => (Array.isArray(xs) ? xs : []).slice(0, n).map((x) => (x ?? {}) as Record<string, unknown>);
  return {
    education: rows(p.education, 6).map((e) => ({
      institution: clip(e.institution, M.education.institution),
      degree: clip(e.degree, M.education.degree),
      year: clip(e.year, M.education.year),
      score: clip(e.score, M.education.score),
    })),
    projects: rows(p.projects, 10).map((x) => ({
      name: clip(x.name, M.projects.name),
      description: clip(x.description, M.projects.description),
      tech: (Array.isArray(x.tech) ? x.tech : []).slice(0, 15).map((t) => clip(t, 60)).filter(Boolean),
    })),
    experience: rows(p.experience, 8).map((x) => ({
      company: clip(x.company, M.experience.company),
      role: clip(x.role, M.experience.role),
      duration: clip(x.duration, M.experience.duration),
      bullets: (Array.isArray(x.bullets) ? x.bullets : []).slice(0, 8).map((b) => clip(b, M.experience.bullet)).filter(Boolean),
    })),
  };
}

const SECTION: Record<string, string> = { name: "Name", phone: "Phone", skills: "Skills", preferred_roles: "Roles", locations: "Cities", education: "Education", projects: "Project", experience: "Experience" };
const FIELD: Record<string, string> = { institution: "college", degree: "degree", year: "year", score: "score", name: "name", description: "description", tech: "tools", company: "company", role: "role", duration: "dates", bullets: "point" };

/** A profile form error in plain words: "Education 1 year is too long. Keep it under 40 characters." */
export function profileIssueText(issue: z.core.$ZodIssue) {
  const [section, index, field] = issue.path.map(String);
  const where = [SECTION[section] ?? "A field", index !== undefined && /^\d+$/.test(index) && field ? String(Number(index) + 1) : "", field ? FIELD[field] ?? field : ""]
    .filter(Boolean)
    .join(" ");
  if (issue.code === "too_big" && "maximum" in issue) return issue.origin === "array" ? `${where}: too many. Keep it to ${issue.maximum}.` : `${where} is too long. Keep it under ${issue.maximum} characters.`;
  if (issue.code === "too_small") return `${where} is empty. Fill it in or remove it.`;
  return section === "phone" ? issue.message : `${where} isn't valid. Check it and save again.`;
}

export const AlertsBody = z.object({
  frequency: z.enum(["daily", "weekly", "monthly"]),
  channels: z.array(z.enum(["telegram", "email"])).min(1).max(2),
  alert_hour: z.coerce.number().int().min(5).max(22),
  quiet_start: z.coerce.number().int().min(0).max(23),
  quiet_end: z.coerce.number().int().min(0).max(23),
});

export const TestAlertBody = z.object({ channel: z.enum(["telegram", "email"]) });

/** Admin: hide, expire or unhide a job, given its id or a link that contains it (/apply/<id>). */
export const AdminJobBody = z.object({
  job: z.string().trim().max(300).transform((s) => /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(s)?.[0]?.toLowerCase() ?? "").pipe(uuid),
  action: z.enum(["hide", "expired", "unhide"]),
  reason: z.enum(["scam", "duplicate", "other"]).default("other"),
});
/** Admin: add, pause, resume or remove a company job board. SmartRecruiters ids are case-sensitive, so case is kept. */
export const AdminBoardBody = z.object({
  action: z.enum(["add", "pause", "resume", "remove"]),
  provider: z.enum(["greenhouse", "lever", "ashby", "smartrecruiters"]),
  slug: z.string().trim().regex(/^[A-Za-z0-9_-]{2,80}$/, "Use the board's id from its job-list address, letters, digits, - and _ only."),
  company_name: text(120).optional(),
});
export const CoverLetterEditBody = z.object({ jobId: uuid, body: text(5000).min(50, "Your letter looks empty. Write a few lines first.") });
export const ReportBody = z.object({ jobId: uuid, reason: z.enum(["expired", "scam", "wrong_info", "other"]) });
export const StageBody = z.object({ jobId: uuid, stage: z.enum(["saved", "applied", "interview", "offer", "rejected"]) });

export const DraftEditBody = z.object({
  id: uuid,
  title: text(160).min(10),
  summary: text(300),
  body_md: text(20000).min(200),
});

export const ReviewBody = z.object({ id: uuid, action: z.enum(["approve", "reject"]) });

export const PublicToolBody = z.object({
  resume: text(15000).min(200, "Paste at least a few lines of your resume."),
  job: text(8000).min(100, "Paste the full job description."),
  turnstile: z.string().max(2048).optional(),
});

// Admin (SPEC.md §5). Kill switches need the switch name typed back, so one can't be flipped by accident.
export const FlagBody = z
  .object({ key: z.enum(FLAGS), enabled: z.boolean(), note: text(200).optional(), confirm: z.string().max(40) })
  .refine((b) => b.confirm === b.key, { message: "Type the switch name to confirm.", path: ["confirm"] });

export const SpendCapBody = z.object({
  provider: z.enum(SPEND_PROVIDERS),
  monthly_cap_inr: z.number().min(0).max(1_000_000),
  alert_pct: z.number().int().min(1).max(100).default(80),
});

export const GrantBody = z.object({
  days: z.number({ message: "Enter the number of days." }).int().min(1, "Grant at least 1 day.").max(365, "Grant at most 365 days."),
  reason: z.enum(["ambassador", "referral", "support", "other"], { message: "Pick a reason." }),
  includes_whatsapp: z.boolean().default(false),
});
export const EmptyBody = z.object({}).passthrough();
export const ChannelOffBody = z.object({ channel: z.enum(["telegram", "email", "whatsapp"], { message: "Pick a channel." }) });
export const DisableBody = z.object({ disabled: z.boolean() });
export const DeleteDataBody = z.object({ confirm: z.literal("delete", { message: 'Type "delete" to confirm.' }) });
const workEmail = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);
export const DncBody = z.object({ email: workEmail, action: z.enum(["add", "remove"]), from_recruiter: z.boolean().default(false) });
export const RoleBody = z.object({ email: workEmail, role: z.enum(ADMIN_ROLES).nullable() });
export const RemindBody = z.object({ user_id: uuid });

// WhatsApp verification (SPEC.md §3). Consent must be an explicit tick.
export const WaStartBody = z.object({ phone: PhoneSchema, consent: z.literal(true, { message: "Tick the box to agree to WhatsApp alerts." }) });
export const WaConfirmBody = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from WhatsApp.") });

/** Parse JSON safely; returns null on invalid JSON or schema mismatch. */
export async function parseJson<T extends z.ZodTypeAny>(req: Request, schema: T): Promise<z.infer<T> | null> {
  try {
    const r = schema.safeParse(await req.json());
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}
