"use server";

import type { AuthError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DEFAULT_LOGIN_REDIRECT, safeNextPath } from "@/lib/auth/routes";
import { signInSchema, signUpSchema } from "@/lib/auth/validation";
import { backendEnabled } from "@/lib/preview/mode";
import { getSiteUrl } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

type FieldErrors = Partial<Record<"username" | "email" | "password", string>>;

export type SignUpState =
  | { status: "idle" }
  | { status: "error"; message?: string; fieldErrors?: FieldErrors; values: { username: string; email: string } }
  | { status: "check-email"; email: string };

export type SignInState =
  | { status: "idle" }
  | { status: "error"; message?: string; fieldErrors?: FieldErrors; values: { email: string } };

function firstErrors(error: z.ZodError): FieldErrors {
  const flat = z.flattenError(error).fieldErrors as Record<string, string[] | undefined>;
  return Object.fromEntries(Object.entries(flat).map(([key, msgs]) => [key, msgs?.[0]])) as FieldErrors;
}

/** Translate Supabase Auth errors into safe, user-facing messages (no internals). */
function authErrorMessage(error: AuthError): string {
  if (error.status === 429 || error.code === "over_request_rate_limit" || error.code === "over_email_send_rate_limit") {
    return "Too many attempts. Please wait a few minutes and try again.";
  }
  switch (error.code) {
    case "invalid_credentials":
      return "Incorrect email or password.";
    case "email_not_confirmed":
      return "Please confirm your email first — check your inbox for the confirmation link.";
    case "weak_password":
      return "That password is too weak. Try a longer one with a mix of characters.";
    case "email_address_invalid":
      return "That email address can't be used. Please try a different one.";
    case "signup_disabled":
      return "Sign-ups are currently disabled.";
    case "user_already_exists":
    case "email_exists":
      return "An account with this email already exists. Try logging in.";
    default:
      return "Something went wrong. Please try again.";
  }
}

export async function signUp(_prev: SignUpState, formData: FormData): Promise<SignUpState> {
  if (!backendEnabled) redirect(DEFAULT_LOGIN_REDIRECT);
  const raw = {
    username: String(formData.get("username") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  };
  const values = { username: raw.username, email: raw.email };

  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", fieldErrors: firstErrors(parsed.error), values };

  const { username, email, password } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${getSiteUrl()}/auth/confirm?next=${encodeURIComponent(DEFAULT_LOGIN_REDIRECT)}`,
      // Only the *requested* username is passed; the database validates it and
      // never reads a role from metadata.
      data: { username },
    },
  });

  if (error) {
    console.error("signUp failed", error.code ?? error.status);
    return { status: "error", message: authErrorMessage(error), values };
  }

  // Email confirmation disabled → Supabase returns a session immediately.
  if (data.session) {
    revalidatePath("/", "layout");
    redirect(DEFAULT_LOGIN_REDIRECT);
  }

  // With confirmation enabled, Supabase deliberately gives the same response for
  // new and already-registered emails (prevents account enumeration).
  return { status: "check-email", email };
}

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  if (!backendEnabled) redirect(safeNextPath(formData.get("next")));
  const raw = {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  };
  const values = { email: raw.email };

  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", fieldErrors: firstErrors(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    if (error.code !== "invalid_credentials") console.error("signIn failed", error.code ?? error.status);
    return { status: "error", message: authErrorMessage(error), values };
  }

  revalidatePath("/", "layout");
  redirect(safeNextPath(formData.get("next")));
}

export async function signOut() {
  if (!backendEnabled) redirect("/");
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login?signed_out=1");
}
