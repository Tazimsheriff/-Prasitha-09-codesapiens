"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { adminNav, memberNav, primaryNav, type NavItem } from "@/config/site";
import { signOut } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

/** What the header needs to know about the viewer. Display only — never used for authorization. */
export type NavViewer = { username: string | null; email: string | null; isAdmin: boolean; preview?: boolean } | null;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** All links (mobile menu). */
function allItems(viewer: NavViewer): NavItem[] {
  if (!viewer) return primaryNav;
  return [...memberNav.slice(0, 1), ...primaryNav, ...memberNav.slice(1), ...(viewer.isAdmin ? adminNav : [])];
}

/** Desktop bar: My Profile is reached through the @username chip. */
function desktopItems(viewer: NavViewer): NavItem[] {
  return allItems(viewer).filter((i) => i.href !== "/profile");
}

const linkBase =
  "border-[3px] px-3 py-1.5 text-sm font-bold uppercase tracking-wider transition-colors duration-100";

function LogoutButton({ block }: { block?: boolean }) {
  return (
    <form action={signOut}>
      <Button type="submit" variant="secondary" size={block ? "md" : "sm"} block={block}>
        Log out
      </Button>
    </form>
  );
}

/** Desktop links + mobile menu. Reads the pathname, so it renders inside a Suspense boundary. */
export function SiteNav({ viewer }: { viewer: NavViewer }) {
  const pathname = usePathname();
  // The menu remembers which page it was opened on, so it closes itself after navigation.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const who = viewer?.username ?? viewer?.email;

  return (
    <>
      <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
        {desktopItems(viewer).map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                linkBase,
                active
                  ? "border-ink bg-mint text-on-accent shadow-brutal-sm"
                  : "border-transparent hover:border-ink hover:bg-muted",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="hidden items-center gap-3 lg:flex">
        {viewer ? (
          <>
            {who && (
              <Link
                href="/profile"
                aria-current={isActive(pathname, "/profile") ? "page" : undefined}
                className={cn(
                  "max-w-44 truncate border-[3px] px-2 py-1 font-mono text-sm",
                  isActive(pathname, "/profile")
                    ? "border-ink bg-mint text-on-accent"
                    : "border-ink/30 hover:border-ink",
                )}
                title="My Profile"
              >
                @{who}
              </Link>
            )}
            {viewer.preview ? (
              <span className="border-[3px] border-ink bg-sun px-2 py-1 font-mono text-xs font-bold uppercase tracking-wider text-on-accent">
                Preview
              </span>
            ) : (
              <LogoutButton />
            )}
          </>
        ) : (
          <>
            <ButtonLink href="/login" variant="secondary" size="sm">
              Log in
            </ButtonLink>
            <ButtonLink href="/signup" size="sm">
              Join the arena
            </ButtonLink>
          </>
        )}
      </div>

      <button
        type="button"
        className="flex size-11 items-center justify-center border-[3px] border-ink bg-surface shadow-brutal-sm lg:hidden"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpenOn(open ? null : pathname)}
      >
        <span aria-hidden="true" className="relative block h-3.5 w-5">
          <span
            className={cn(
              "absolute left-0 top-0 h-[3px] w-5 bg-ink transition-transform",
              open && "translate-y-[5.5px] rotate-45",
            )}
          />
          <span
            className={cn(
              "absolute bottom-0 left-0 h-[3px] w-5 bg-ink transition-transform",
              open && "-translate-y-[5.5px] -rotate-45",
            )}
          />
        </span>
      </button>

      {open && (
        <div
          id="mobile-menu"
          className="absolute inset-x-0 top-full max-h-[calc(100dvh-5rem)] overflow-y-auto border-b-[3px] border-ink bg-paper lg:hidden"
          onKeyDown={(e) => e.key === "Escape" && setOpenOn(null)}
        >
          <nav aria-label="Mobile" className="flex flex-col gap-2 px-4 py-4">
            {allItems(viewer).map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    linkBase,
                    "py-3 text-base",
                    active ? "border-ink bg-mint text-on-accent" : "border-ink bg-surface",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
            {viewer ? (
              <div className="mt-2 flex flex-col gap-3">
                {who && <p className="truncate font-mono text-sm text-subtle">Signed in as @{who}</p>}
                {viewer.preview ? (
                  <p className="font-mono text-xs font-bold uppercase tracking-wider text-subtle">Preview — database off</p>
                ) : (
                  <LogoutButton block />
                )}
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-3">
                <ButtonLink href="/login" variant="secondary">
                  Log in
                </ButtonLink>
                <ButtonLink href="/signup">Join</ButtonLink>
              </div>
            )}
          </nav>
        </div>
      )}
    </>
  );
}

/** Static placeholder rendered while the viewer and pathname are being resolved. */
export function SiteNavFallback() {
  return (
    <>
      <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
        {primaryNav.map((item) => (
          <Link key={item.href} href={item.href} className={cn(linkBase, "border-transparent")}>
            {item.label}
          </Link>
        ))}
      </nav>
      <div aria-hidden="true" className="hidden h-9 w-48 lg:block" />
      <span aria-hidden="true" className="size-11 border-[3px] border-ink bg-surface lg:hidden" />
    </>
  );
}
