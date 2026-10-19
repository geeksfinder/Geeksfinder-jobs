import { NextResponse } from "next/server";
import { afterSignIn } from "@/lib/landing";
import { adminClient, requireUser } from "@/lib/supabase/server";

/** After signing in with the 6-digit email code: same landing rules as the callback (lib/landing.ts). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const { user } = await requireUser();
  if (!user) return NextResponse.redirect(new URL("/login", url.origin));
  const dest = await afterSignIn(adminClient(), user.id, url.searchParams.get("next"));
  return NextResponse.redirect(new URL(dest, url.origin));
}
