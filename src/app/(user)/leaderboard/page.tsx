import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageLoading } from "@/components/auth/gates";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { getCurrentUser } from "@/lib/auth/session";
import { getLeaderboard, getMyCoinSummary } from "@/lib/coins/data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Leaderboard" };

export default function LeaderboardPage() {
  return (
    <>
      <PageHeader
        eyebrow="Leaderboard"
        title="Top earners"
        description="Public profiles ranked by lifetime coins earned from approved tasks. Updated live from the coin ledger."
      />
      <Suspense fallback={<PageLoading />}>
        <Board />
      </Suspense>
    </>
  );
}

async function YourStanding() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <Alert tone="info">
        <Link href="/signup" className="font-bold underline">
          Sign up
        </Link>{" "}
        and complete tasks to appear here.
      </Alert>
    );
  }
  const summary = await getMyCoinSummary("/leaderboard");
  if (!summary.ok) return null;
  const s = summary.data;
  return (
    <Alert tone={s.leaderboard_rank ? "success" : "info"} title="Your standing">
      {s.leaderboard_rank
        ? `You're #${s.leaderboard_rank} with ${s.lifetime_earned.toLocaleString("en")} coins earned.`
        : !s.is_public
          ? "Your profile is private, so you're not shown on the leaderboard. Make it public on your profile page."
          : "You haven't earned coins yet. Complete a task to get ranked."}
    </Alert>
  );
}

async function Board() {
  const board = await getLeaderboard(50);
  if (!board.ok) {
    return (
      <Container className="py-12">
        <Alert
          tone={board.unreachable ? "info" : board.schemaMissing ? "warning" : "danger"}
          title={board.unreachable ? "Leaderboard not connected" : "Leaderboard unavailable"}
        >
          {board.unreachable
            ? "Live standings appear here once the arena database is connected."
            : board.schemaMissing
              ? "The database is missing the latest coin changes. Apply migration 6 (see the README)."
              : "We couldn't load the leaderboard. Please refresh the page."}
        </Alert>
      </Container>
    );
  }

  return (
    <Container className="flex flex-col gap-6 py-12">
      <YourStanding />
      {board.data.length === 0 ? (
        <Alert tone="info" title="No rankings yet">
          Nobody has earned coins yet. Rankings appear as soon as the first submission is approved.
        </Alert>
      ) : (
        <ol className="flex list-none flex-col border-[3px] border-ink bg-surface shadow-brutal" aria-label="Rankings">
          {board.data.map((e) => {
            const podium = e.leaderboard_rank <= 3;
            return (
              <li
                key={e.public_slug}
                className={cn(
                  "flex items-center gap-4 border-b border-ink/20 p-4 last:border-0",
                  e.leaderboard_rank === 1 && "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center border-[3px] border-ink font-mono font-bold",
                    podium ? "bg-mint text-on-accent shadow-brutal-sm" : "bg-surface",
                  )}
                  aria-label={`Rank ${e.leaderboard_rank}`}
                >
                  {e.leaderboard_rank}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <Link href={`/u/${e.public_slug}`} className="truncate font-bold underline-offset-4 hover:underline">
                    {e.display_name ?? e.username}
                  </Link>
                  <span className="truncate font-mono text-xs text-subtle">
                    @{e.username} · {e.approved_tasks} task{e.approved_tasks === 1 ? "" : "s"}
                  </span>
                </div>
                <span className="font-mono text-lg font-bold">{e.lifetime_coins.toLocaleString("en")}</span>
              </li>
            );
          })}
        </ol>
      )}
    </Container>
  );
}
