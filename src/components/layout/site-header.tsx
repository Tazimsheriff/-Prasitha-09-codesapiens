import { Suspense } from "react";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth/session";
import { backendEnabled } from "@/lib/preview/mode";
import { Container } from "./container";
import { Logo } from "./logo";
import { SiteNav, SiteNavFallback, type NavViewer } from "./site-nav";

/** Reads the session at request time, so it streams in behind the Suspense boundary below. */
async function ViewerNav() {
  const user = await getCurrentUser();
  let viewer: NavViewer = null;
  if (user) {
    const profile = await getCurrentProfile();
    const p = profile?.status === "ok" ? profile.profile : null;
    viewer = {
      username: p?.username ?? null,
      email: user.email,
      isAdmin: p?.role === "admin",
      preview: !backendEnabled,
    };
  }
  return <SiteNav viewer={viewer} />;
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b-[3px] border-ink bg-paper">
      <Container className="relative flex h-18 items-center justify-between gap-6">
        <Logo />
        <Suspense fallback={<SiteNavFallback />}>
          <ViewerNav />
        </Suspense>
      </Container>
    </header>
  );
}
