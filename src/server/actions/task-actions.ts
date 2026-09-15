"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/form-state";
import { logger } from "@/lib/logger";
import { fieldErrorsFromZod } from "@/lib/validation/errors";
import { taskInputSchema, taskUpdateSchema } from "@/lib/validation/task";
import { requireSession } from "@/server/auth/session-cookie";
import { WeddingAccessError } from "@/server/authz/wedding-access";
import {
  createTask,
  deleteTask,
  generateChecklistIfMissing,
  setTaskCompleted,
  updateTask,
  type TaskMutationResult,
} from "@/server/checklist/task-service";
import { readString } from "./form-data";

const INVALID_INPUT = "Periksa kembali data tugas.";
const NO_ACCESS = "Tugas tidak ditemukan atau kamu tidak memiliki akses.";
const TASK_FIELDS = ["title", "description", "categoryId", "dueDate", "priority", "assigneeMemberId", "status"] as const;

function readTaskValues(formData: FormData): Record<string, string> {
  return Object.fromEntries(TASK_FIELDS.map((key) => [key, readString(formData, key)]));
}

function referenceErrorState(
  result: Extract<TaskMutationResult, { ok: false }>,
  values: Record<string, string>,
): FormState {
  return result.reason === "invalid_category"
    ? { status: "error", message: INVALID_INPUT, fieldErrors: { categoryId: ["Kategori tidak tersedia"] }, values }
    : {
        status: "error",
        message: INVALID_INPUT,
        fieldErrors: { assigneeMemberId: ["Penanggung jawab harus anggota workspace ini"] },
        values,
      };
}

function revalidateChecklist() {
  revalidatePath("/checklist", "layout");
  revalidatePath("/dashboard");
}

export async function createTaskAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readTaskValues(formData);
  const parsed = taskInputSchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  }

  try {
    const result = await createTask(session.user.id, readString(formData, "weddingId"), parsed.data);
    if (!result.ok) return referenceErrorState(result, values);
  } catch (error) {
    if (error instanceof WeddingAccessError) return { status: "error", message: NO_ACCESS, values };
    logger.error("task.create_failed", { error });
    return { status: "error", message: "Tugas belum berhasil disimpan. Silakan coba lagi.", values };
  }

  revalidateChecklist();
  redirect("/checklist?notice=created");
}

export async function updateTaskAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readTaskValues(formData);
  const parsed = taskUpdateSchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  }

  try {
    const result = await updateTask(session.user.id, readString(formData, "taskId"), parsed.data);
    if (!result.ok) return referenceErrorState(result, values);
  } catch (error) {
    if (error instanceof WeddingAccessError) return { status: "error", message: NO_ACCESS, values };
    logger.error("task.update_failed", { error });
    return { status: "error", message: "Perubahan belum berhasil disimpan. Silakan coba lagi.", values };
  }

  revalidateChecklist();
  redirect("/checklist?notice=updated");
}

export async function toggleTaskAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  try {
    await setTaskCompleted(session.user.id, readString(formData, "taskId"), readString(formData, "completed") === "true");
  } catch (error) {
    if (error instanceof WeddingAccessError) {
      logger.warn("task.access_denied", { userId: session.user.id, action: "toggle" });
      return;
    }
    throw error;
  }
  revalidateChecklist();
}

export async function deleteTaskAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const taskId = readString(formData, "taskId");
  try {
    const result = await deleteTask(session.user.id, taskId);
    if (!result.ok) return;
  } catch (error) {
    if (error instanceof WeddingAccessError) {
      logger.warn("task.access_denied", { userId: session.user.id, action: "delete" });
      return;
    }
    throw error;
  }
  revalidateChecklist();
  redirect("/checklist?notice=deleted");
}

export async function generateChecklistAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  try {
    await generateChecklistIfMissing(session.user.id, readString(formData, "weddingId"));
  } catch (error) {
    if (error instanceof WeddingAccessError) return;
    throw error;
  }
  revalidateChecklist();
  redirect("/checklist?notice=generated");
}
