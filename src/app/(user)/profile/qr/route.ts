import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { previewOwnProfile } from "@/lib/preview/content";
import { backendEnabled } from "@/lib/preview/mode";
import { publicProfileUrl } from "@/lib/profile/public-url";
import { qrPng, qrSvg } from "@/lib/profile/qr";
import { createClient } from "@/lib/supabase/server";

const noStore = { "Cache-Control": "private, no-store" };

async function loadOwnSlug(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("username, public_slug")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

/**
 * GET /profile/qr?format=png|svg — downloads the signed-in user's own QR code.
 * Only ever encodes the caller's own public profile URL (never arbitrary text).
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401, headers: noStore });

  const format = request.nextUrl.searchParams.get("format") ?? "png";
  if (format !== "png" && format !== "svg") {
    return NextResponse.json({ error: "format must be png or svg" }, { status: 400, headers: noStore });
  }

  const profile = backendEnabled ? await loadOwnSlug(user.id) : previewOwnProfile;
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404, headers: noStore });
  }

  const url = publicProfileUrl(profile.public_slug);
  const filename = `code-sapiens-${profile.username}-qr.${format}`;
  const headers = { ...noStore, "Content-Disposition": `attachment; filename="${filename}"` };

  if (format === "svg") {
    return new NextResponse(await qrSvg(url), { headers: { ...headers, "Content-Type": "image/svg+xml" } });
  }
  const png = await qrPng(url);
  return new NextResponse(new Uint8Array(png), { headers: { ...headers, "Content-Type": "image/png" } });
}
