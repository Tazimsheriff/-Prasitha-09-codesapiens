import "server-only";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { previewProfile, previewUser } from "@/lib/preview/content";
import { backendEnabled } from "@/lib/preview/mode";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";

export type SessionUser = { id: string; email: string | null };

export type ProfileSummary = Pick<Profile, "id" | "username" | "display_name" | "role">;

export type ProfileResult =
  | { status: "ok"; profile: ProfileSummary }
  /** Signed in, but the profiles table hasn't been created yet (migration not run). */
  | { status: "schema-missing" }
  /** Table exists but this user has no row (e.g. signed up before the migration ran). */
  | { status: "missing" }
  | { status: "error" };

/**
 * The verified current user, or null. `getClaims()` validates the JWT (it never
 * trusts the cookie contents blindly). Deduplicated per request with React `cache`.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  // Session checks compare token expiry with the current time, so they must run
  // at request time, never during prerendering.
  await connection();
  if (!backendEnabled) return previewUser;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
});

/** The current user's profile, read through RLS (users can only read their own row). */
export const getCurrentProfile = cache(async (): Promise<ProfileResult | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!backendEnabled) return { status: "ok", profile: previewProfile };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    // PGRST205: table not found in the schema cache → migration hasn't been applied.
    if (error.code === "PGRST205") return { status: "schema-missing" };
    console.error("Failed to load profile", error.code);
    return { status: "error" };
  }
  if (!data) return { status: "missing" };
  return { status: "ok", profile: data };
});

/** Redirects to /login (returning to `nextPath` afterwards) unless signed in. */
export async function requireUser(nextPath = "/dashboard"): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}

/**
 * For Server Actions and Route Handlers: the verified admin, or null.
 * Re-reads the role from the database on every call (never from the client,
 * the JWT, or a hidden form field). Callers must refuse the operation on null.
 */
export async function getAdminOrNull() {
  const user = await getCurrentUser();
  if (!user) return null;
  const result = await getCurrentProfile();
  if (result?.status !== "ok" || result.profile.role !== "admin") return null;
  return { user, profile: result.profile };
}

/**
 * Allows only users whose role in the database is `admin`. Everyone else gets a
 * 404, so the admin area's existence isn't confirmed to non-admins. Fails closed:
 * a missing table, missing profile or query error all deny access.
 */
export async function requireAdmin(nextPath = "/admin") {
  const user = await requireUser(nextPath);
  const result = await getCurrentProfile();
  if (result?.status !== "ok" || result.profile.role !== "admin") notFound();
  return { user, profile: result.profile };
}
