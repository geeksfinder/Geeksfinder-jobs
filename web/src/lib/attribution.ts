/**
 * First-touch attribution (SPEC.md §5): where a student first came from, kept in the gf_attr cookie for 30 days and
 * saved to `attributions` when they sign up. Pure, so middleware, the /r/<code> link, sign-in and tests share it.
 * The cookie is ours but readable by the browser user, so every field is length-capped and character-checked on
 * the way in and on the way out: a hand-edited cookie can't put anything odd into the database.
 */
export const ATTR_COOKIE = "gf_attr";
export const ATTR_MAX_AGE = 30 * 86_400;

export type Attribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  referrer_host?: string;
  ref_code?: string;
  landing_path?: string;
  first_seen_at?: string;
};

const FIELD = /^[\w .:/@+-]{1,100}$/;
const CODE = /^[A-Z0-9-]{4,24}$/;
const clean = (v: unknown, max = 100) => {
  if (typeof v !== "string") return undefined;
  const s = v.trim().slice(0, max);
  return s && FIELD.test(s) ? s : undefined;
};
export const cleanCode = (v: unknown) => (typeof v === "string" && CODE.test(v.trim().toUpperCase()) ? v.trim().toUpperCase() : undefined);

/** Only the known keys, each cleaned; undefined values dropped. */
export function sanitizeAttribution(a: Record<string, unknown>): Attribution {
  const out: Attribution = {
    utm_source: clean(a.utm_source)?.toLowerCase(),
    utm_medium: clean(a.utm_medium)?.toLowerCase(),
    utm_campaign: clean(a.utm_campaign),
    utm_content: clean(a.utm_content),
    referrer_host: clean(a.referrer_host)?.toLowerCase(),
    ref_code: cleanCode(a.ref_code),
    landing_path: typeof a.landing_path === "string" && a.landing_path.startsWith("/") ? clean(a.landing_path.split("?")[0], 200) : undefined,
    first_seen_at: typeof a.first_seen_at === "string" && !Number.isNaN(Date.parse(a.first_seen_at)) ? new Date(a.first_seen_at).toISOString() : undefined,
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as Attribution;
}

/** What a first page view tells us: UTM tags, a ?ref= code, the site that sent them (not ourselves), the page. */
export function attributionFrom(url: URL, referrer: string | null, now = Date.now()): Attribution {
  let referrerHost: string | undefined;
  try {
    const host = referrer ? new URL(referrer).hostname.replace(/^www\./, "") : "";
    if (host && host !== url.hostname.replace(/^www\./, "")) referrerHost = host;
  } catch {
    referrerHost = undefined;
  }
  const q = url.searchParams;
  return sanitizeAttribution({
    utm_source: q.get("utm_source"),
    utm_medium: q.get("utm_medium"),
    utm_campaign: q.get("utm_campaign"),
    utm_content: q.get("utm_content"),
    ref_code: q.get("ref"),
    referrer_host: referrerHost,
    landing_path: url.pathname,
    first_seen_at: new Date(now).toISOString(),
  });
}

// base64url without Buffer: the middleware runs on the Edge runtime, which has btoa/atob but no Buffer
const toB64Url = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64Url = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

export const encodeAttribution = (a: Attribution) => toB64Url(JSON.stringify(sanitizeAttribution(a)));

export function decodeAttribution(value: string | undefined | null): Attribution | null {
  if (!value || value.length > 2000) return null;
  try {
    const parsed = JSON.parse(fromB64Url(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? sanitizeAttribution(parsed) : null;
  } catch {
    return null;
  }
}

/** First touch wins: a later /r/<code> only fills in a ref code that's missing, never replaces where they came from. */
export const withRefCode = (a: Attribution | null, code: string, now = Date.now()): Attribution =>
  a ? (a.ref_code ? a : { ...a, ref_code: code }) : { ref_code: code, landing_path: "/", first_seen_at: new Date(now).toISOString() };
