import "server-only";
import { connection } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import type { LedgerRow } from "./ledger";

export type CoinSummary = {
  balance: number;
  lifetime_earned: number;
  rewards_count: number;
  leaderboard_rank: number | null;
  is_public: boolean;
};

export type Loaded<T> = { ok: true; data: T } | { ok: false; schemaMissing: boolean; unreachable?: boolean };

function failed(error: { code?: string }, what: string): { ok: false; schemaMissing: boolean; unreachable: boolean } {
  const schemaMissing = error.code === "PGRST202" || error.code === "PGRST205" || error.code === "42703";
  // No Postgres code means the request never reached the database (missing or unreachable Supabase).
  const unreachable = !error.code;
  if (!schemaMissing && !unreachable) console.error(`coins: failed to load ${what}`, error.code);
  return { ok: false, schemaMissing, unreachable };
}

/** The signed-in user's balance, lifetime earnings and rank — computed by the database from the ledger. */
export async function getMyCoinSummary(nextPath = "/wallet"): Promise<Loaded<CoinSummary>> {
  await requireUser(nextPath);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_coin_summary");
  if (error) return failed(error, "summary");
  const row = data[0];
  if (!row) return { ok: false, schemaMissing: false };
  return {
    ok: true,
    data: {
      balance: Number(row.balance),
      lifetime_earned: Number(row.lifetime_earned),
      rewards_count: Number(row.rewards_count),
      leaderboard_rank: row.leaderboard_rank === null ? null : Number(row.leaderboard_rank),
      is_public: row.is_public,
    },
  };
}

export const LEDGER_PAGE_SIZE = 50;

/** The signed-in user's own ledger rows (RLS: own rows only), newest first. */
export async function listMyTransactions(page: number): Promise<Loaded<{ rows: LedgerRow[]; hasMore: boolean }>> {
  const user = await requireUser("/wallet");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coin_transactions")
    .select("id, amount, kind, reason, submission_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * LEDGER_PAGE_SIZE, page * LEDGER_PAGE_SIZE); // one extra row → hasMore
  if (error) return failed(error, "transactions");

  const rows = data.slice(0, LEDGER_PAGE_SIZE);
  // Task titles for reward rows: submission → task (both readable by the owner).
  const submissionIds = rows.map((r) => r.submission_id).filter((v): v is string => !!v);
  const titles = new Map<string, string>();
  if (submissionIds.length) {
    const subs = await supabase.from("task_submissions").select("id, task_id").in("id", submissionIds);
    if (subs.error) return failed(subs.error, "submissions");
    const taskIds = [...new Set(subs.data.map((s) => s.task_id))];
    const tasks = taskIds.length
      ? await supabase.from("tasks").select("id, title").in("id", taskIds)
      : { data: [], error: null };
    if (tasks.error) return failed(tasks.error, "task titles");
    const taskTitle = new Map(tasks.data.map((t) => [t.id, t.title]));
    for (const s of subs.data) {
      const title = taskTitle.get(s.task_id);
      if (title) titles.set(s.id, title);
    }
  }

  return {
    ok: true,
    data: {
      rows: rows.map((r) => ({
        id: r.id,
        amount: Number(r.amount),
        kind: r.kind,
        reason: r.reason,
        created_at: r.created_at,
        task_title: r.submission_id ? (titles.get(r.submission_id) ?? null) : null,
      })),
      hasMore: data.length > LEDGER_PAGE_SIZE,
    },
  };
}

export type LeaderboardEntry = {
  leaderboard_rank: number;
  username: string;
  display_name: string | null;
  public_slug: string;
  lifetime_coins: number;
  approved_tasks: number;
};

/** Public leaderboard via the allow-listed function, read as the anonymous role. */
export async function getLeaderboard(limit = 50): Promise<Loaded<LeaderboardEntry[]>> {
  await connection(); // live ranking: computed from the ledger on every request
  try {
    const { data, error } = await createPublicClient().rpc("get_leaderboard", { p_limit: limit });
    if (error || !data) return failed(error ?? {}, "leaderboard");
    return {
      ok: true,
      data: data.map((r) => ({
        leaderboard_rank: Number(r.leaderboard_rank),
        username: r.username,
        display_name: r.display_name,
        public_slug: r.public_slug,
        lifetime_coins: Number(r.lifetime_coins),
        approved_tasks: Number(r.approved_tasks),
      })),
    };
  } catch {
    return { ok: false, schemaMissing: false, unreachable: true };
  }
}
