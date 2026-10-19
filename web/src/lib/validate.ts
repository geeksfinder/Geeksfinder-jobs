import { z } from "zod";
import { FLAGS, SPEND_PROVIDERS } from "./admin/constants";

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

export const ProfileBody = z.object({
  name: text(100),
  phone: z.string().trim().max(20).regex(/^[+\d\s-]*$/, "Use digits only"),
  skills: list(60),
  preferred_roles: list(10, 80),
  locations: list(10, 60),
  job_type: z.enum(["full-time", "internship", "both"]),
  experience_level: z.enum(["fresher", "0-1", "1-3"]),
  education: z.array(z.object({ institution: text(150), degree: text(150), year: text(20), score: text(20).optional() })).max(6),
  projects: z.array(z.object({ name: text(120), description: text(1200), tech: list(15).default([]) })).max(10),
  experience: z
    .array(z.object({ company: text(120), role: text(120), duration: text(60), bullets: z.array(text(400)).max(8) }))
    .max(8),
});
export type ProfileInput = z.infer<typeof ProfileBody>;

export const AlertsBody = z.object({
  frequency: z.enum(["daily", "weekly", "monthly"]),
  channels: z.array(z.enum(["telegram", "email"])).min(1).max(2),
  alert_hour: z.coerce.number().int().min(5).max(22),
  quiet_start: z.coerce.number().int().min(0).max(23),
  quiet_end: z.coerce.number().int().min(0).max(23),
});

export const TestAlertBody = z.object({ channel: z.enum(["telegram", "email"]) });

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

/** Parse JSON safely; returns null on invalid JSON or schema mismatch. */
export async function parseJson<T extends z.ZodTypeAny>(req: Request, schema: T): Promise<z.infer<T> | null> {
  try {
    const r = schema.safeParse(await req.json());
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}
