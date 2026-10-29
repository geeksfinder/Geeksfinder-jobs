import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ATTR_COOKIE, ATTR_MAX_AGE, attributionFrom, encodeAttribution } from "@/lib/attribution";

const PROTECTED = ["/dashboard", "/onboarding", "/alerts", "/tracker", "/billing", "/apply", "/resumes", "/admin"];
// Server-to-server endpoints authenticated by signature/secret instead of cookies
const WEBHOOKS = ["/api/telegram/webhook", "/api/razorpay/webhook", "/api/whatsapp/webhook"];
// Public, cacheable assets that never need a session (skip the Supabase auth round-trip)
const PUBLIC_ASSETS = ["/api/logo/"];

function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") !== "cross-site";
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isApi = path.startsWith("/api/") || path.startsWith("/auth/");

  // Lock down CORS/CSRF: state-changing requests must come from our own origin. No CORS headers are ever sent.
  if (isApi && request.method !== "GET" && request.method !== "HEAD" && !WEBHOOKS.includes(path)) {
    if (!sameOrigin(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (request.method === "OPTIONS") return new NextResponse(null, { status: 405 });
  if (WEBHOOKS.includes(path) || PUBLIC_ASSETS.some((p) => path.startsWith(p))) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  // /admin is in PROTECTED for the noindex header only: signed-out visitors get the admin layout's 404, not a login
  // redirect that would reveal the panel exists (SPEC.md §1)
  const isAdmin = path === "/admin" || path.startsWith("/admin/");
  if (!data.user && !isAdmin && PROTECTED.some((p) => path === p || path.startsWith(`${p}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Keep the query (e.g. /billing?plan=pro_30) so the student lands back on what they picked
    url.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  // App pages are private: tell crawlers not to index them
  if (PROTECTED.some((p) => path.startsWith(p))) response.headers.set("X-Robots-Tag", "noindex, nofollow");
  // First touch (lib/attribution.ts): where a visitor first came from, saved to attributions when they sign up
  const publicPage = request.method === "GET" && !isApi && !path.startsWith("/r/") && !PROTECTED.some((p) => path === p || path.startsWith(`${p}/`));
  if (publicPage && !request.cookies.get(ATTR_COOKIE)) {
    const attr = attributionFrom(request.nextUrl, request.headers.get("referer"));
    response.cookies.set(ATTR_COOKIE, encodeAttribution(attr), { maxAge: ATTR_MAX_AGE, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|robots.txt|llms.txt|sitemap.xml|.*\\.(?:png|jpg|svg|webp|avif)$).*)"],
};
