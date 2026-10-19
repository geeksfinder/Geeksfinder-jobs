import { NextResponse } from "next/server";
import { afterSignIn } from "@/lib/landing";
import { adminClient, createClient } from "@/lib/supabase/server";

/** Google and email-link sign-in land here. Returning students skip onboarding (lib/landing.ts). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  // Only internal relative paths are ever followed (safeNext inside afterSignIn blocks ?next=https://phishing.example)
  const wanted = url.searchParams.get("next");
  let dest = "/login";
  if (code) {
    const supabase = await createClient();
    const { data } = await supabase.auth.exchangeCodeForSession(code);
    if (data.user) {
      if (url.searchParams.get("consent") === "1") {
        await supabase.from("users").update({ consent_at: new Date().toISOString() }).eq("id", data.user.id).is("consent_at", null);
      }
      dest = await afterSignIn(adminClient(), data.user.id, wanted);
    }
  }
  return NextResponse.redirect(new URL(dest, url.origin));
}
