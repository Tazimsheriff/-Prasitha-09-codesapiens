import "server-only";
import { connection } from "next/server";
import { cache } from "react";
import { requireUser } from "@/lib/auth/session";
import { previewOwnProfile, previewPublicProfile } from "@/lib/preview/content";
import { backendEnabled } from "@/lib/preview/mode";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import { isValidPublicSlug } from "./public-url";

export type OwnProfile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  is_public: boolean;
  public_slug: string;
  social_links: Json;
  created_at: string;
};

export type OwnProfileResult =
  | { status: "ok"; profile: OwnProfile }
  /** Table or column missing: a migration hasn't been applied yet. */
  | { status: "schema-missing" }
  | { status: "missing" }
  | { status: "error" };

/**
 * The signed-in user's own profile, read through RLS with their session.
 * Redirects to /login when signed out. Only ever reads the caller's own row.
 */
export const getOwnProfile = cache(async (): Promise<OwnProfileResult> => {
  if (!backendEnabled) {
    await connection();
    return { status: "ok", profile: previewOwnProfile };
  }
  const user = await requireUser("/profile");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, bio, is_public, public_slug, social_links, created_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    // PGRST205: table missing · 42703: column missing (migration 3 not applied).
    if (error.code === "PGRST205" || error.code === "42703") return { status: "schema-missing" };
    console.error("Failed to load own profile", error.code);
    return { status: "error" };
  }
  if (!data) return { status: "missing" };
  return { status: "ok", profile: data };
});

export type PublicProfile = {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  social_links: Json;
  /** Lifetime earnings (task rewards + admin corrections). The spendable balance is private. */
  lifetime_coins: number;
  leaderboard_rank: number | null;
  approved_tasks: number;
  member_since: string;
};

/**
 * A public profile by slug, via the allow-listed `get_public_profile` function
 * and the anonymous role — never the viewer's session. Null if the slug is
 * malformed, unknown, or the profile is private.
 */
export const getPublicProfile = cache(async (slug: string): Promise<PublicProfile | null> => {
  await connection(); // live data: always fetched at request time
  if (!isValidPublicSlug(slug)) return null;
  if (!backendEnabled) return previewPublicProfile(slug);
  const { data, error } = await createPublicClient().rpc("get_public_profile", { p_slug: slug });
  if (error) {
    console.error("Failed to load public profile", error.code);
    throw new Error("Could not load this profile right now.");
  }
  return data?.[0] ?? null;
});
