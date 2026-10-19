import { NextResponse } from "next/server";
import { deleteAccount } from "@/lib/account";
import { rateLimit } from "@/lib/ratelimit";
import { fail, tooMany, unauthorized } from "@/lib/security";
import { adminClient, requireUser } from "@/lib/supabase/server";

/** DPDP: delete the account and everything linked to it (lib/account.ts). Autopay is cancelled first. */
export async function POST() {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  if (!(await rateLimit("api", user.id)).ok) return tooMany();

  const res = await deleteAccount(adminClient(), user.id, "user");
  if (!res.ok) {
    return res.step === "autopay"
      ? fail("account.delete.cancel", res.error, "We couldn't cancel your Autopay, so your account wasn't deleted. Cancel the mandate in your UPI app, then try again.", 502)
      : fail("account.delete", res.error, "Couldn't delete your account. Try again or email us.");
  }
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
