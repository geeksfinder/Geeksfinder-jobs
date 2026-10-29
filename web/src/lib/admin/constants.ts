/**
 * Admin names shared by server code, scripts, tests and zod schemas. No imports on purpose: validate.ts uses these
 * and is imported by client components, so nothing server-only may be pulled in from here.
 */

/** Roles (SPEC.md §4). */
export const ADMIN_ROLES = ["owner", "ops", "marketing", "reviewer"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/** Who may open each admin area or call each admin route (SPEC.md §4 roles, §5 Admin API). Owners can do everything. */
export const AREA_ROLES = {
  overview: ["owner", "ops", "marketing"],
  users: ["owner", "ops"],
  // Marketing grants Pro days (up to 30) from the ambassador and referral tools
  grant: ["owner", "ops", "marketing"],
  userActions: ["owner", "ops"],
  deleteData: ["owner"],
  contacts: ["owner", "ops"],
  // A3 Jobs and sources: hide or expire a job, add or pause a company board
  jobs: ["owner", "ops"],
  // A4 Matching, A5 Alerts and crons (re-run a cron), A7 AI usage, A8 Tailoring + A9 HR outreach
  matching: ["owner", "ops"],
  crons: ["owner", "ops"],
  ai: ["owner", "ops"],
  tailoring: ["owner", "ops"],
  // A12 Funnel and acquisition, A13 Ambassadors (create codes, pause them)
  funnel: ["owner", "ops", "marketing"],
  ambassadors: ["owner", "marketing"],
  dnc: ["owner", "ops"],
  payments: ["owner", "ops"],
  remind: ["owner", "ops"],
  drafts: ["owner", "marketing", "reviewer"],
  system: ["owner"],
  flags: ["owner"],
  spendCaps: ["owner"],
  roles: ["owner"],
} as const satisfies Record<string, readonly AdminRole[]>;

/** Most Pro days a Marketing admin may grant at once. */
export const MARKETING_GRANT_MAX_DAYS = 30;

/** Kill switches (SPEC.md §5). */
export const FLAGS = [
  "whatsapp_sends",
  "telegram_sends",
  "email_sends",
  "ai_generation",
  "article_pipeline",
  "paid_contact_lookups",
  "signups",
  "campaign_sends",
] as const;
export type FlagKey = (typeof FLAGS)[number];

/** Providers with a monthly spend cap in ₹ (SPEC.md §5). */
export const SPEND_PROVIDERS = ["whatsapp", "anthropic", "hunter", "apollo"] as const;
export type SpendProvider = (typeof SPEND_PROVIDERS)[number];
