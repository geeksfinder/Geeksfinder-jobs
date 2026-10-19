import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { rzp } from "./razorpay";

export type DeleteResult = { ok: true } | { ok: false; step: "autopay" | "delete"; error: unknown };

/**
 * DPDP deletion, shared by "Delete my account" and the admin action (SPEC.md §6 notes):
 * 1. cancel any live UPI Autopay so a deleted account is never charged again;
 * 2. remove resume files;
 * 3. delete WhatsApp inbound messages (contacts and codes cascade from auth.users; events and wa_messages keep
 *    their rows with user_id set to null);
 * 4. delete the auth user, which cascades to profile, resumes, matches, outreach and everything else;
 * 5. log the deletion with only a SHA-256 hash of the email.
 */
export async function deleteAccount(admin: SupabaseClient, userId: string, by: "user" | "admin"): Promise<DeleteResult> {
  const [{ data: sub }, { data: u }] = await Promise.all([
    admin.from("subscriptions").select("razorpay_subscription_id, status").eq("user_id", userId).maybeSingle(),
    admin.from("users").select("email").eq("id", userId).maybeSingle(),
  ]);
  if (sub?.razorpay_subscription_id && !["cancelled", "completed", "expired"].includes(sub.status ?? "")) {
    try {
      // Immediate cancel (not at cycle end): the account and its access are going away now
      await rzp(`/subscriptions/${sub.razorpay_subscription_id}/cancel`, { cancel_at_cycle_end: 0 });
    } catch (error) {
      return { ok: false, step: "autopay", error };
    }
  }

  const { data: files } = await admin.storage.from("resumes").list(userId);
  if (files?.length) await admin.storage.from("resumes").remove(files.map((f) => `${userId}/${f.name}`));
  await admin.from("wa_inbound").delete().eq("user_id", userId);

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, step: "delete", error };

  const email = (u?.email as string | null) ?? "";
  await admin.from("deletion_requests").insert({
    email_hash: createHash("sha256").update(email.trim().toLowerCase()).digest("hex"),
    requested_by: by,
    completed_at: new Date().toISOString(),
  });
  return { ok: true };
}
