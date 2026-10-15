import Link from "next/link";
import { TaskMeta } from "@/components/tasks/task-meta";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { getLeaderboard } from "@/lib/coins/data";
import { getOpenChallengesForViewer } from "@/lib/tasks/data";
import { cn } from "@/lib/utils";

/** Real open challenges for signed-in visitors; a sign-in prompt otherwise. */
export async function ActiveChallenges() {
  const view = await getOpenChallengesForViewer(3);

  if (!view.signedIn) {
    return (
      <div className="relative overflow-hidden border-[3px] border-ink bg-surface p-8 shadow-brutal sm:p-10">
        <div aria-hidden="true" className="bg-lines absolute inset-0" />
        <div className="relative flex flex-col items-start gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex max-w-xl flex-col gap-2">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.25em] text-mint">Participants only</p>
            <p className="text-2xl font-bold">Sign in to see the live challenge board.</p>
            <p className="text-subtle">
              Challenge details, rewards and deadlines are visible to registered participants.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/login?next=%2Ftasks">Log in</ButtonLink>
            <ButtonLink href="/signup" variant="secondary">
              Create account
            </ButtonLink>
          </div>
        </div>
      </div>
    );
  }

  if (view.result.status !== "ok") {
    return (
      <Alert tone={view.result.status === "schema-missing" ? "warning" : "danger"} title="Challenges unavailable">
        We couldn&apos;t load challenges right now. Please refresh the page.
      </Alert>
    );
  }

  const tasks = view.result.data;
  if (tasks.length === 0) {
    return (
      <Alert tone="info" title="No open challenges right now">
        New challenges will appear here as soon as the organizers publish them.
      </Alert>
    );
  }

  const now = new Date();
  return (
    <ul className="grid list-none gap-6 md:grid-cols-3">
      {tasks.map((t, i) => (
        <li key={t.id}>
          <Link
            href={`/tasks/${t.id}`}
            className={cn(
              "group flex h-full flex-col gap-4 border-[3px] border-ink bg-surface p-6 shadow-brutal transition-[transform,box-shadow] duration-100",
              "hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-brutal-lg",
            )}
          >
            <span className="font-display text-5xl leading-none text-mint">{String(i + 1).padStart(2, "0")}</span>
            <span className="text-xl font-bold leading-tight group-hover:underline">{t.title}</span>
            <span className="line-clamp-3 text-sm text-subtle">{t.description}</span>
            <span className="mt-auto">
              <TaskMeta reward={t.reward_coins} deadline={t.deadline} evidenceRequired={t.evidence_required} now={now} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const podiumStyles = [
  "bg-mint text-on-accent md:-translate-y-4",
  "bg-surface text-ink",
  "bg-surface text-ink",
];

/** Top of the real leaderboard (public profiles, lifetime coins earned). */
export async function LeaderboardPreview() {
  const board = await getLeaderboard(5);
  if (!board.ok) {
    if (board.unreachable) {
      return (
        <Alert tone="info" title="Leaderboard not connected">
          Live standings appear here once the arena database is connected.
        </Alert>
      );
    }
    return (
      <Alert tone={board.schemaMissing ? "warning" : "danger"} title="Leaderboard unavailable">
        {board.schemaMissing
          ? "The database is missing the latest coin changes. Apply migration 6 (see the README)."
          : "We couldn't load the leaderboard right now. Please refresh the page."}
      </Alert>
    );
  }
  if (board.data.length === 0) {
    return (
      <div className="border-[3px] border-dashed border-ink/40 p-8 text-center">
        <p className="font-display text-3xl uppercase">No rankings yet</p>
        <p className="mt-2 text-subtle">The board fills up as soon as the first submission is approved.</p>
      </div>
    );
  }

  const top = board.data.slice(0, 3);
  const rest = board.data.slice(3);
  return (
    <div className="flex flex-col gap-6">
      <ol className="grid list-none gap-4 md:grid-cols-3 md:items-end" aria-label="Top three">
        {top.map((e, i) => (
          <li key={e.public_slug} className={cn(i === 0 ? "md:order-2" : i === 1 ? "md:order-1" : "md:order-3")}>
            <Link
              href={`/u/${e.public_slug}`}
              className={cn(
                "flex flex-col gap-3 border-[3px] border-ink p-5 shadow-brutal transition-transform hover:-translate-y-1",
                podiumStyles[i],
              )}
            >
              <span className="font-display text-6xl leading-none" aria-label={`Rank ${e.leaderboard_rank}`}>
                #{e.leaderboard_rank}
              </span>
              <span className="truncate text-lg font-bold">{e.display_name ?? e.username}</span>
              <span className="flex items-baseline justify-between gap-2 font-mono text-sm">
                <span className="truncate opacity-80">@{e.username}</span>
                <span className="font-bold">{e.lifetime_coins.toLocaleString("en")} coins</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
      {rest.length > 0 && (
        <ol className="flex list-none flex-col border-[3px] border-ink bg-surface" aria-label="Next places">
          {rest.map((e) => (
            <li key={e.public_slug} className="flex items-center gap-4 border-b border-ink/20 px-5 py-3 last:border-0">
              <span className="w-10 font-display text-2xl">#{e.leaderboard_rank}</span>
              <Link href={`/u/${e.public_slug}`} className="min-w-0 flex-1 truncate font-bold hover:underline">
                {e.display_name ?? e.username}
              </Link>
              <span className="font-mono font-bold">{e.lifetime_coins.toLocaleString("en")}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="font-mono text-xs text-subtle">Equal totals share a rank. Private profiles are not listed.</p>
    </div>
  );
}

export function SectionSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true" className="grid animate-pulse gap-6 md:grid-cols-3">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden="true" className="h-48 border-[3px] border-ink/20 bg-surface" />
      ))}
    </div>
  );
}
