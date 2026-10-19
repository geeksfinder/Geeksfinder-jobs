import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { notFound } from "next/navigation";
import { adminClient, requireUser } from "../supabase/server";
import { ADMIN_ROLES, type AdminRole } from "./constants";

export { ADMIN_ROLES, type AdminRole } from "./constants";

/** The admin's role from admin_users, or null. Read from the database on every request, never from the session. */
export async function adminRole(db: SupabaseClient, userId: string): Promise<AdminRole | null> {
  const { data } = await db.from("admin_users").select("role").eq("user_id", userId).maybeSingle();
  const role = data?.role as AdminRole | undefined;
  return role && ADMIN_ROLES.includes(role) ? role : null;
}

async function resolve(roles: readonly AdminRole[]) {
  const { user } = await requireUser();
  if (!user) return null;
  const admin = adminClient();
  const role = await adminRole(admin, user.id);
  if (!role || !roles.includes(role)) return null;
  const { data: profile } = await admin.from("users").select("name, email").eq("id", user.id).single();
  return { user, admin, role, profile: { name: (profile?.name as string | null) ?? null, email: (profile?.email as string | null) ?? null } };
}

/**
 * Pages and server actions: anyone without one of `roles` gets a 404, so the panel's existence isn't revealed.
 * The /admin layout calls it with every role; each page and action calls it again with its own roles.
 */
export async function requireAdmin(roles: readonly AdminRole[] = ADMIN_ROLES) {
  const ctx = await resolve(roles);
  if (!ctx) notFound();
  return ctx;
}

/** /api/admin/* routes: same check, but returns null so the route can answer with `adminNotFound()`. */
export async function adminApi(roles: readonly AdminRole[]) {
  return resolve(roles);
}

export const adminNotFound = () => NextResponse.json({ error: { code: "not_found", message: "Not found." } }, { status: 404 });
