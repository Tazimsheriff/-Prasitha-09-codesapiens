"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { backendEnabled } from "@/lib/preview/mode";
import { createClient } from "@/lib/supabase/server";
import { EVIDENCE_BUCKET, checkEvidenceFile, evidencePath } from "./evidence";
import { parseSubmissionFields, type SubmissionFieldErrors } from "./validation";

export type SubmitState =
  | { status: "idle" }
  | { status: "submitted"; submissionId: string }
  | { status: "error"; message?: string; fieldErrors?: SubmissionFieldErrors };

const err = (message: string, fieldErrors?: SubmissionFieldErrors): SubmitState => ({
  status: "error",
  message,
  fieldErrors,
});

/**
 * Create a submission for the signed-in user.
 *
 * Trust model: only the task id, proof text/link and the file are taken from
 * the client. The user id comes from the verified session; the deadline,
 * task status and evidence requirement are read from the database here for
 * friendly messages AND enforced again by RLS at insert time.
 */
export async function submitTask(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const user = await getCurrentUser();
  if (!user) return err("Your session has expired. Please log in again.");
  if (!backendEnabled) return err("This preview has no database, so submissions aren't saved.");

  const fields = parseSubmissionFields(formData);
  if (!fields.success) return err("Please fix the highlighted fields.", fields.fieldErrors);
  const evidence = await checkEvidenceFile(formData.get("evidence"));
  if (!evidence.ok) return err("Please fix the highlighted fields.", { evidence: evidence.error });

  const { taskId, proofText, proofUrl } = fields.data;
  if (!proofText && !proofUrl && !evidence.file) {
    return err("Add a note, a link or a file as proof.");
  }

  const supabase = await createClient();

  // Pre-checks for clear messages (the database re-checks all of these).
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id, deadline, evidence_required")
    .eq("id", taskId)
    .eq("status", "active")
    .maybeSingle();
  if (taskError) {
    console.error("submitTask: task lookup failed", taskError.code);
    return err("Couldn't check this task. Please try again.");
  }
  if (!task) return err("This task isn't accepting submissions.");
  if (task.deadline && new Date(task.deadline).getTime() <= Date.now()) {
    return err("The deadline for this task has passed.");
  }
  if (task.evidence_required && !evidence.file) {
    return err("This task requires a file as evidence.", { evidence: "Attach a file." });
  }

  // 1. Upload evidence (private bucket, caller's own folder, never overwrites).
  let path: string | null = null;
  if (evidence.file) {
    path = evidencePath(user.id, evidence.file.type.ext);
    const { error: uploadError } = await supabase.storage
      .from(EVIDENCE_BUCKET)
      .upload(path, evidence.file.bytes, { contentType: evidence.file.type.mime, upsert: false });
    if (uploadError) {
      console.error("submitTask: evidence upload failed", uploadError.message);
      return err("Your file couldn't be uploaded. Please try again.", { evidence: "Upload failed." });
    }
  }

  // 2. Create the submission. RLS enforces: own user id, active task, deadline
  //    not passed (DB clock), required evidence present, evidence is own file.
  const { data: created, error: insertError } = await supabase
    .from("task_submissions")
    .insert({ task_id: taskId, proof_text: proofText, proof_url: proofUrl, evidence_path: path })
    .select("id")
    .single();

  if (insertError) {
    // Don't leave an orphaned file behind (allowed: it isn't attached to anything).
    if (path) await supabase.storage.from(EVIDENCE_BUCKET).remove([path]);
    if (insertError.code === "23505") return err("You already have a pending or approved submission for this task.");
    if (insertError.code === "42501") {
      return err("This task isn't accepting your submission — it may have closed or changed. Refresh and try again.");
    }
    if (insertError.code === "23514") return err("Your submission didn't pass validation. Check your proof and try again.");
    console.error("submitTask: insert failed", insertError.code);
    return err("Couldn't save your submission. Please try again.");
  }

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
  revalidatePath("/submissions");
  return { status: "submitted", submissionId: created.id };
}
