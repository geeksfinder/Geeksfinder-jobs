/**
 * Admin names shared by server code, scripts, tests and zod schemas. No imports on purpose: validate.ts uses these
 * and is imported by client components, so nothing server-only may be pulled in from here.
 */

/** Roles (SPEC.md §4). */
export const ADMIN_ROLES = ["owner", "ops", "marketing", "reviewer"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/** Who may open each existing admin area. Owners can do everything. */
export const AREA_ROLES = {
  overview: ["owner", "ops", "marketing"],
  drafts: ["owner", "marketing", "reviewer"],
  contacts: ["owner", "ops"],
  flags: ["owner"],
  spendCaps: ["owner"],
} as const satisfies Record<string, readonly AdminRole[]>;

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
