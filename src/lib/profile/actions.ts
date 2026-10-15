"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { backendEnabled } from "@/lib/preview/mode";
import { createClient } from "@/lib/supabase/server";
import { parseProfileForm, type ProfileFieldErrors } from "./validation";

export type UpdateProfileState =
  | { status: "idle" }
  | { status: "saved"; savedAt: number }
  | { status: "error"; message?: string; fieldErrors?: ProfileFieldErrors };

export async function updateProfile(_prev: UpdateProfileState, formData: FormData): Promise<UpdateProfileState> {
  // Re-verify the session inside the action; never trust the page that rendered the form.
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Your session has expired. Please log in again." };
  if (!backendEnabled) return { status: "error", message: "This preview has no database, so changes aren't saved." };

  const parsed = parseProfileForm(formData);
  if (!parsed.success) {
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: parsed.fieldErrors };
  }

  const { username, displayName, bio, isPublic, socialLinks } = parsed.data;
  const supabase = await createClient();
  // The row id comes from the verified session, not from the form. RLS and
  // column privileges independently restrict this to the caller's own row and
  // to editable columns only.
  const { data, error } = await supabase
    .from("profiles")
    .update({ username, display_name: displayName, bio, is_public: isPublic, social_links: socialLinks })
    .eq("id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return { status: "error", fieldErrors: { username: "That username is already taken." } };
    }
    if (error.code === "23514") {
      return { status: "error", message: "Some values weren't accepted. Check your links and try again." };
    }
    if (error.code === "42703") {
      return { status: "error", message: "Profile links aren't set up in the database yet (migration 3)." };
    }
    console.error("updateProfile failed", error.code);
    return { status: "error", message: "Couldn't save your profile. Please try again." };
  }
  if (!data) return { status: "error", message: "Profile not found." };

  // The header shows the username, so refresh the whole layout.
  revalidatePath("/", "layout");
  return { status: "saved", savedAt: Date.now() };
}

export type RegenerateLinkState =
  | { status: "idle" }
  | { status: "done" }
  | { status: "error"; message: string };

/** Issue a new random public URL. Old links and printed QR codes stop working. */
export async function regeneratePublicLink(): Promise<RegenerateLinkState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Your session has expired. Please log in again." };
  if (!backendEnabled) return { status: "error", message: "This preview has no database, so the link stays as it is." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("regenerate_public_slug");
  if (error) {
    console.error("regeneratePublicLink failed", error.code);
    return { status: "error", message: "Couldn't create a new link. Please try again." };
  }

  revalidatePath("/profile");
  return { status: "done" };
}
