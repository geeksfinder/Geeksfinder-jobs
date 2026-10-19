import { cleanCompany } from "./company";

/**
 * Companies and HR contacts: pure helpers shared by the importer, the job pipeline, the HR finder and company pages.
 * A company is keyed by its root domain ("in.bosch.com" → "bosch.com"); contacts keep their real email domain.
 */

// Second-level suffixes where the registrable domain has three labels ("tcs.co.in")
const SECOND_LEVEL = new Set(["co.in", "net.in", "org.in", "ac.in", "gov.in", "firm.in", "gen.in", "ind.in", "co.uk", "org.uk", "ac.uk", "com.au", "net.au", "co.jp", "com.sg", "com.my", "co.za", "com.br", "com.cn", "co.nz", "com.mx"]);

export function rootDomain(domain: string): string {
  const labels = domain.trim().toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const lastTwo = labels.slice(-2).join(".");
  return SECOND_LEVEL.has(lastTwo) ? labels.slice(-3).join(".") : lastTwo;
}

// Only legal and filler words are dropped. "Technologies" or "Solutions" stay, so "Star Technologies" never
// matches "Star" (a different company).
const LEGAL = /\b(private|pvt|limited|ltd|llp|llc|inc|incorporated|corporation|corp|co|company|plc|gmbh|india|group)\b/g;

/** "Bosch Group" → "bosch", "Razorpay Software Private Limited" → "razorpay", "M&M (Mahindra)" → "m and m". */
export function normName(name: string): string {
  return cleanCompany(name)
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(LEGAL, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function companySlug(name: string): string {
  return (
    cleanCompany(name)
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "company"
  );
}

/** "acme-corp.com" → "Acme Corp", for companies only known from an email domain. */
export function nameFromDomain(domain: string): string {
  const label = rootDomain(domain).split(".")[0];
  return label.split(/[-_]/).map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(" ");
}

const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "yahoo.in", "ymail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
  "rediffmail.com", "rediff.com", "icloud.com", "me.com", "aol.com", "protonmail.com", "proton.me", "zoho.com", "zohomail.in", "mail.com", "gmx.com", "inbox.com",
]);
export const isFreeMail = (domain: string) => FREE_MAIL.has(domain.toLowerCase());

const EMAIL = /^[a-z0-9._%+-]+@([a-z0-9-]+\.)+[a-z]{2,}$/;

export type SheetRow = { name?: unknown; email?: unknown; designation?: unknown; company?: unknown; companySource?: unknown; category?: unknown; emailType?: unknown; city?: unknown; confidence?: unknown };
export type SheetContact = {
  email: string;
  domain: string;
  name: string | null;
  role: string | null;
  category: "hr_team" | "generic_mailbox";
  quality: "recent" | "older";
  company: string | null;
  city: string | null;
};
export type SkipReason = "invalid_email" | "personal_mailbox" | "agency_or_college" | "free_mail";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

function cleanPersonName(raw: string): string | null {
  const n = raw.replace(/\s+/g, " ").trim();
  if (n.length < 2 || n.length > 60 || /[@\d]/.test(n)) return null;
  // "PRIYA SHARMA" / "priya sharma" → "Priya Sharma"; mixed case is kept as written
  if (n === n.toUpperCase() || n === n.toLowerCase()) return n.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  return n;
}

function cleanRole(raw: string): string | null {
  const r = raw.replace(/\s+/g, " ").trim();
  // Placeholders from the source lists, not real job titles
  if (!r || r.length > 80 || /^hr'?s? and hiring managers?$/i.test(r) || /^(na|n\/a|-|none)$/i.test(r)) return null;
  return r;
}

/**
 * One row of the HR contacts sheet → a contact we may keep, or why not. Kept: company HR teams and hr@/careers@
 * mailboxes on a company domain. Dropped: personal mailboxes, free-mail domains, recruitment agencies (including
 * US bench sales) and college placement cells. Phone numbers and notes are never read.
 */
export function classifySheetRow(row: SheetRow): { ok: true; contact: SheetContact } | { ok: false; reason: SkipReason } {
  const email = str(row.email).toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, reason: "invalid_email" };
  const domain = email.split("@")[1];
  if (str(row.emailType) && str(row.emailType) !== "Company domain") return { ok: false, reason: "personal_mailbox" };
  if (isFreeMail(domain)) return { ok: false, reason: "free_mail" };
  const cat = str(row.category);
  const category = cat === "Corporate HR / Talent team" ? "hr_team" : cat.startsWith("Generic company mailbox") ? "generic_mailbox" : null;
  if (!category) return { ok: false, reason: "agency_or_college" };
  return {
    ok: true,
    contact: {
      email,
      domain,
      name: category === "generic_mailbox" ? null : cleanPersonName(str(row.name)),
      role: cleanRole(str(row.designation)),
      category,
      quality: /^recent/i.test(str(row.confidence)) ? "recent" : "older",
      // Only a name the source gave; "derived from email domain" names are rebuilt from the domain instead
      company: str(row.companySource) === "Provided" && str(row.company) ? cleanCompany(str(row.company)) : null,
      city: str(row.city) || null,
    },
  };
}

/**
 * Who a fresher should write to first: campus and talent-acquisition people, then recruiting mailboxes, then HR
 * generalists, and only then HR heads and CXOs. Verified and recent addresses rank above older ones.
 */
export function contactScore(c: { role?: string | null; email: string; quality?: string | null; verified?: boolean | null }): number {
  const role = (c.role ?? "").toLowerCase();
  const local = c.email.split("@")[0].toLowerCase();
  let s = 50;
  if (/campus|universit|graduate|early.?career|fresher/.test(role)) s = 100;
  else if (/talent acquisition|recruit|hiring|sourcing|staffing|\bta\b/.test(role)) s = 90;
  else if (!role && /^(careers?|jobs|recruit(ment|ing)?|hiring|talent|hr)$/.test(local)) s = 70;
  else if (/chief|\bcpo\b|\bchro\b|vice president|\bvp\b|director|\bhead\b|president/.test(role)) s = 30;
  else if (/\bhr\b|human resource|people|business partner|generalist/.test(role)) s = 60;
  const trust = c.verified ? 40 : c.quality === "verified" ? 40 : c.quality === "recent" ? 20 : c.quality === "older" ? 0 : 10;
  return s + trust;
}

/** Minimal RFC 4180 CSV reader (quoted fields, doubled quotes, CRLF), for sheets saved as CSV from Excel. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  // A UTF-8 byte-order mark (U+FEFF) at the start of an Excel export is not part of the first header
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}
