import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthPage, isProtectedPath, DEFAULT_LOGIN_REDIRECT } from "@/lib/auth/routes";
import type { Database } from "@/types/database";
import { backendEnabled } from "@/lib/preview/mode";
import { getSupabaseEnv } from "./env";

/**
 * Runs on every matched request (see src/proxy.ts):
 * 1. Refreshes the Supabase session and writes updated cookies to the response.
 * 2. Optimistically redirects signed-out users away from protected routes.
 *
 * This is NOT the security boundary — pages, Server Actions and RLS all re-check.
 */
export async function updateSession(request: NextRequest) {
  if (!backendEnabled) return NextResponse.next({ request });

  const { url, publishableKey } = getSupabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        // Make refreshed cookies visible to the page rendering this request…
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        // …and send them back to the browser, with no-cache headers so a CDN
        // never serves one user's session cookies to another.
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Don't put code between createServerClient and getClaims(): it refreshes the
  // session, and skipping it can randomly sign users out.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  if (!signedIn && isProtectedPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return redirectWithSession(loginUrl, response);
  }

  if (signedIn && isAuthPage(pathname)) {
    const target = request.nextUrl.clone();
    target.pathname = DEFAULT_LOGIN_REDIRECT;
    target.search = "";
    return redirectWithSession(target, response);
  }

  return response;
}

/** Redirect while keeping any session cookies/headers the refresh just produced. */
function redirectWithSession(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  from.headers.forEach((value, key) => {
    if (key.toLowerCase() === "cache-control" || key.toLowerCase() === "expires" || key.toLowerCase() === "pragma") {
      redirect.headers.set(key, value);
    }
  });
  return redirect;
}
