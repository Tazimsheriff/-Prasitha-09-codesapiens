import "server-only";
import { connection } from "next/server";
import { cache } from "react";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { previewSubmissions, previewTasks } from "@/lib/preview/content";
import { backendEnabled } from "@/lib/preview/mode";
import { createClient } from "@/lib/supabase/server";
import type { SubmissionStatus } from "@/types/database";

export type TaskSummary = {
  id: string;
  title: string;
  description: string;
  requirements: string | null;
  reward_coins: number;
  deadline: string | null;
  evidence_required: boolean;
};

export type MySubmission = {
  id: string;
  task_id: string;
  status: SubmissionStatus;
  proof_text: string | null;
  proof_url: string | null;
  has_evidence: boolean;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export type DataResult<T> = { status: "ok"; data: T } | { status: "schema-missing" } | { status: "error" };

const TASK_COLUMNS = "id, title, description, requirements, reward_coins, deadline, evidence_required";
const SUBMISSION_COLUMNS =
  "id, task_id, status, proof_text, proof_url, evidence_path, review_note, created_at, reviewed_at";

function failure(error: { code?: string }, what: string): { status: "schema-missing" } | { status: "error" } {
  // PGRST205 table missing · 42703 column missing → a migration hasn't been applied.
  if (error.code === "PGRST205" || error.code === "42703") return { status: "schema-missing" };
  console.error(`Failed to load ${what}`, error.code);
  return { status: "error" };
}

function toMySubmission(row: {
  id: string;
  task_id: string;
  status: SubmissionStatus;
  proof_text: string | null;
  proof_url: string | null;
  evidence_path: string | null;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}): MySubmission {
  // The storage path never leaves the server; the page only learns that a file exists.
  const { evidence_path, ...rest } = row;
  return { ...rest, has_evidence: evidence_path !== null };
}

/** Active tasks (RLS also hides drafts/archived from non-admins). */
export const listActiveTasks = cache(async (): Promise<DataResult<TaskSummary[]>> => {
  if (!backendEnabled) {
    await connection();
    return { status: "ok", data: previewTasks };
  }
  await requireUser("/tasks");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_COLUMNS)
    .eq("status", "active")
    .order("deadline", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) return failure(error, "tasks");
  return { status: "ok", data };
});

/**
 * Open challenges for the landing page. Anonymous visitors can't read tasks
 * (RLS), so they get `signedIn: false` instead of an error or a redirect.
 */
export async function getOpenChallengesForViewer(
  limit = 3,
): Promise<{ signedIn: false } | { signedIn: true; result: DataResult<TaskSummary[]> }> {
  const user = await getCurrentUser();
  if (!user) return { signedIn: false };
  if (!backendEnabled) {
    const now = Date.now();
    const open = previewTasks.filter((task) => !task.deadline || Date.parse(task.deadline) > now);
    return { signedIn: true, result: { status: "ok", data: open.slice(0, limit) } };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_COLUMNS)
    .eq("status", "active")
    .or(`deadline.is.null,deadline.gt.${new Date().toISOString()}`)
    .order("deadline", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { signedIn: true, result: failure(error, "open challenges") };
  return { signedIn: true, result: { status: "ok", data } };
}

/** One active task, or null if it doesn't exist / isn't visible to this user. */
export const getActiveTask = cache(async (taskId: string): Promise<DataResult<TaskSummary | null>> => {
  if (!backendEnabled) {
    await connection();
    return { status: "ok", data: previewTasks.find((task) => task.id === taskId) ?? null };
  }
  await requireUser(`/tasks/${taskId}`);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_COLUMNS)
    .eq("id", taskId)
    .eq("status", "active")
    .maybeSingle();
  if (error) return failure(error, "task");
  return { status: "ok", data };
});

/** The signed-in user's own submissions (optionally for one task), newest first. */
export const listMySubmissions = cache(async (taskId?: string): Promise<DataResult<MySubmission[]>> => {
  if (!backendEnabled) {
    await connection();
    const data = taskId ? previewSubmissions.filter((submission) => submission.task_id === taskId) : previewSubmissions;
    return { status: "ok", data };
  }
  const user = await requireUser(taskId ? `/tasks/${taskId}` : "/submissions");
  const supabase = await createClient();
  // Explicit user filter: admins can read everyone's rows via RLS, but this
  // page is about the viewer's own history.
  let query = supabase
    .from("task_submissions")
    .select(SUBMISSION_COLUMNS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (taskId) query = query.eq("task_id", taskId);
  const { data, error } = await query;
  if (error) return failure(error, "submissions");
  return { status: "ok", data: data.map(toMySubmission) };
});

/** Titles for a set of task ids (any status the user can see), for history views. */
export async function getTaskTitles(taskIds: string[]): Promise<Map<string, { title: string; reward_coins: number }>> {
  if (taskIds.length === 0) return new Map();
  if (!backendEnabled) {
    return new Map(
      previewTasks
        .filter((task) => taskIds.includes(task.id))
        .map((task) => [task.id, { title: task.title, reward_coins: task.reward_coins }]),
    );
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("tasks").select("id, title, reward_coins").in("id", taskIds);
  if (error) {
    console.error("Failed to load task titles", error.code);
    return new Map();
  }
  return new Map(data.map((t) => [t.id, { title: t.title, reward_coins: t.reward_coins }]));
}
