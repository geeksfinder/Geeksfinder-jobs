import { NextResponse } from "next/server";
import { ATTR_COOKIE, ATTR_MAX_AGE, cleanCode, decodeAttribution, encodeAttribution, withRefCode } from "@/lib/attribution";
import { rateLimit } from "@/lib/ratelimit";
import { adminClient } from "@/lib/supabase/admin";

/**
 * /r/PUNE-AMB-07: an ambassador's or a student's referral link (SPEC.md §5). A known, active code goes into the
 * gf_attr cookie (first touch kept), then the visitor lands on the home page. Unknown codes just land there too.
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const home = NextResponse.redirect(new URL("/", request.url));
  const code = cleanCode(decodeURIComponent((await params).code));
  if (!code || !(await rateLimit("public")).ok) return home;

  const db = adminClient();
  const [{ data: amb }, { data: student }] = await Promise.all([
    db.from("ambassadors").select("id").eq("code", code).eq("active", true).maybeSingle(),
    db.from("users").select("id").eq("referral_code", code).is("disabled_at", null).maybeSingle(),
  ]);
  if (!amb && !student) return home;

  const cookie = request.headers.get("cookie")?.match(new RegExp(`(?:^|; )${ATTR_COOKIE}=([^;]+)`))?.[1];
  home.cookies.set(ATTR_COOKIE, encodeAttribution(withRefCode(decodeAttribution(cookie), code)), {
    maxAge: ATTR_MAX_AGE,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return home;
}
