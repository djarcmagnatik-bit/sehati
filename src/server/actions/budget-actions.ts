"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { todayIsoInTimeZone } from "@/lib/dates";
import type { FormState } from "@/lib/form-state";
import { logger } from "@/lib/logger";
import { formatRupiah } from "@/lib/money";
import {
  budgetCategorySchema,
  budgetSettingsSchema,
  expenseInputSchema,
  makePaymentInputSchema,
} from "@/lib/validation/budget";
import { fieldErrorsFromZod } from "@/lib/validation/errors";
import { requireSession } from "@/server/auth/session-cookie";
import { WeddingAccessError } from "@/server/authz/wedding-access";
import {
  createBudgetCategory,
  createExpense,
  deleteBudgetCategory,
  deleteExpense,
  deletePayment,
  initializeBudgetIfMissing,
  recordPayment,
  updateBudgetCategory,
  updateBudgetSettings,
  updateExpense,
} from "@/server/budget/budget-service";
import { readString } from "./form-data";

const INVALID_INPUT = "Periksa kembali data yang ditandai.";
const NO_ACCESS = "Data tidak ditemukan atau kamu tidak memiliki akses.";
const SAVE_FAILED = "Data belum berhasil disimpan. Silakan coba lagi.";

function readFields(formData: FormData, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.map((key) => [key, readString(formData, key)]));
}

function revalidateBudget() {
  revalidatePath("/budget", "layout");
  revalidatePath("/dashboard");
}

function failure(error: unknown, event: string, values?: Record<string, string>): FormState {
  if (error instanceof WeddingAccessError) return { status: "error", message: NO_ACCESS, values };
  logger.error(event, { error });
  return { status: "error", message: SAVE_FAILED, values };
}

export async function updateBudgetSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readFields(formData, ["targetBudget", "warningPercent"]);
  const parsed = budgetSettingsSchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  }
  try {
    await updateBudgetSettings(session.user.id, readString(formData, "weddingId"), parsed.data);
  } catch (error) {
    return failure(error, "budget.settings_failed", values);
  }
  revalidateBudget();
  return { status: "success", message: "Pengaturan budget disimpan." };
}

export async function initializeBudgetAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  try {
    await initializeBudgetIfMissing(session.user.id, readString(formData, "weddingId"));
  } catch (error) {
    if (error instanceof WeddingAccessError) return;
    throw error;
  }
  revalidateBudget();
  redirect("/budget?notice=initialized");
}

export async function createBudgetCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readFields(formData, ["name", "allocatedAmount"]);
  const parsed = budgetCategorySchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  }
  try {
    const result = await createBudgetCategory(session.user.id, readString(formData, "weddingId"), parsed.data);
    if (!result.ok) {
      return { status: "error", message: INVALID_INPUT, fieldErrors: { name: ["Nama kategori sudah dipakai"] }, values };
    }
  } catch (error) {
    return failure(error, "budget.category_create_failed", values);
  }
  revalidateBudget();
  return { status: "success", message: `Kategori “${parsed.data.name}” ditambahkan.` };
}

export async function updateBudgetCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readFields(formData, ["name", "allocatedAmount"]);
  const parsed = budgetCategorySchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  }
  try {
    const result = await updateBudgetCategory(session.user.id, readString(formData, "categoryId"), parsed.data);
    if (!result.ok) {
      return { status: "error", message: INVALID_INPUT, fieldErrors: { name: ["Nama kategori sudah dipakai"] }, values };
    }
  } catch (error) {
    return failure(error, "budget.category_update_failed", values);
  }
  revalidateBudget();
  redirect("/budget?notice=category_updated");
}

export async function deleteBudgetCategoryAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const categoryId = readString(formData, "categoryId");
  let blocked = false;
  try {
    const result = await deleteBudgetCategory(session.user.id, categoryId);
    blocked = !result.ok;
  } catch (error) {
    if (error instanceof WeddingAccessError) return;
    throw error;
  }
  if (blocked) redirect(`/budget/categories/${categoryId}?notice=has_expenses`);
  revalidateBudget();
  redirect("/budget?notice=category_deleted");
}

const EXPENSE_FIELDS = ["title", "categoryId", "totalAmount", "dueDate", "notes"] as const;

export async function createExpenseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readFields(formData, EXPENSE_FIELDS);
  const parsed = expenseInputSchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  }
  let expenseId: string;
  try {
    const result = await createExpense(session.user.id, readString(formData, "weddingId"), parsed.data);
    if (!result.ok) {
      return { status: "error", message: INVALID_INPUT, fieldErrors: { categoryId: ["Kategori tidak tersedia"] }, values };
    }
    expenseId = result.expenseId;
  } catch (error) {
    return failure(error, "expense.create_failed", values);
  }
  revalidateBudget();
  redirect(`/budget/expenses/${expenseId}?notice=expense_created`);
}

export async function updateExpenseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const expenseId = readString(formData, "expenseId");
  const values = readFields(formData, EXPENSE_FIELDS);
  const parsed = expenseInputSchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  }
  try {
    const result = await updateExpense(session.user.id, expenseId, parsed.data);
    if (!result.ok) {
      const fieldErrors =
        result.reason === "invalid_category"
          ? { categoryId: ["Kategori tidak tersedia"] }
          : { totalAmount: [`Total tidak boleh lebih kecil dari yang sudah dibayar (${formatRupiah(result.paid)})`] };
      return { status: "error", message: INVALID_INPUT, fieldErrors, values };
    }
  } catch (error) {
    return failure(error, "expense.update_failed", values);
  }
  revalidateBudget();
  redirect(`/budget/expenses/${expenseId}?notice=expense_updated`);
}

export async function deleteExpenseAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const expenseId = readString(formData, "expenseId");
  let blocked = false;
  try {
    const result = await deleteExpense(session.user.id, expenseId);
    blocked = !result.ok;
  } catch (error) {
    if (error instanceof WeddingAccessError) return;
    throw error;
  }
  if (blocked) redirect(`/budget/expenses/${expenseId}?notice=has_payments`);
  revalidateBudget();
  redirect("/budget/expenses?notice=expense_deleted");
}

export async function recordPaymentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readFields(formData, ["amount", "paymentDate", "method", "reference", "notes"]);
  const parsed = makePaymentInputSchema(todayIsoInTimeZone(new Date())).safeParse(values);
  if (!parsed.success) {
    return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  }
  try {
    const result = await recordPayment(session.user.id, readString(formData, "expenseId"), parsed.data);
    if (!result.ok) {
      return {
        status: "error",
        message: INVALID_INPUT,
        fieldErrors: { amount: [`Melebihi sisa tagihan (${formatRupiah(result.outstanding)})`] },
        values,
      };
    }
  } catch (error) {
    return failure(error, "payment.record_failed", values);
  }
  revalidateBudget();
  return { status: "success", message: `Pembayaran ${formatRupiah(parsed.data.amount)} dicatat.` };
}

export async function deletePaymentAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  let expenseId: string;
  try {
    ({ expenseId } = await deletePayment(session.user.id, readString(formData, "paymentId")));
  } catch (error) {
    if (error instanceof WeddingAccessError) return;
    throw error;
  }
  revalidateBudget();
  redirect(`/budget/expenses/${expenseId}?notice=payment_deleted`);
}
