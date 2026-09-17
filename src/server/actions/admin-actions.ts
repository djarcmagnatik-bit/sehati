"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/form-state";
import { logger } from "@/lib/logger";
import { fieldErrorsFromZod } from "@/lib/validation/errors";
import {
  addonSchema,
  grantPlanSchema,
  planSchema,
  promoCodeSchema,
  suspendUserSchema,
  taskTemplateSchema,
  themeSettingSchema,
} from "@/lib/validation/admin";
import { AdminAccessError } from "@/server/admin/admin-access";
import { createPlan, createPromoCode, updateAddon, updatePlan, updatePromoCode } from "@/server/admin/admin-billing-service";
import { createTaskTemplate, updateTaskTemplate, updateThemeSetting } from "@/server/admin/admin-content-service";
import {
  adminGrantPlanToWedding,
  adminRevokeEntitlement,
  setUserRole,
  suspendUser,
  unsuspendUser,
} from "@/server/admin/admin-user-service";
import { requireSession } from "@/server/auth/session-cookie";
import { readString } from "./form-data";

const INVALID_INPUT = "Periksa kembali data yang ditandai.";
const FORBIDDEN: FormState = { status: "error", message: "Akses admin diperlukan." };

function readFields(formData: FormData, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.map((key) => [key, readString(formData, key)]));
}

function failure(error: unknown, event: string, values?: Record<string, string>): FormState {
  if (error instanceof AdminAccessError) return { ...FORBIDDEN, values };
  logger.error(event, { error });
  return { status: "error", message: "Perubahan belum tersimpan. Silakan coba lagi.", values };
}

/** Void admin actions: a non-admin is sent away rather than told anything. */
async function asAdmin<T>(event: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof AdminAccessError) redirect("/dashboard");
    logger.error(event, { error });
    throw error;
  }
}

const USER_ERRORS = {
  not_found: "Pengguna tidak ditemukan.",
  self: "Kamu tidak bisa melakukan ini pada akunmu sendiri.",
  last_admin: "Minimal harus ada satu admin aktif.",
  unchanged: "Tidak ada perubahan.",
} as const;

// ─── Users ───────────────────────────────────────────────────────────────────

export async function suspendUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const userId = readString(formData, "userId");
  const values = readFields(formData, ["reason"]);
  const parsed = suspendUserSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    const result = await suspendUser(session.user.id, userId, parsed.data.reason);
    if (!result.ok) return { status: "error", message: USER_ERRORS[result.reason], values };
  } catch (error) {
    return failure(error, "admin.suspend_failed", values);
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/users/${userId}?notice=suspended`);
}

export async function unsuspendUserAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const userId = readString(formData, "userId");
  const result = await asAdmin("admin.unsuspend_failed", () => unsuspendUser(session.user.id, userId));
  revalidatePath("/admin", "layout");
  redirect(`/admin/users/${userId}?notice=${result.ok ? "unsuspended" : result.reason}`);
}

export async function setUserRoleAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const userId = readString(formData, "userId");
  const role = readString(formData, "role") === "ADMIN" ? "ADMIN" : "USER";
  const result = await asAdmin("admin.role_failed", () => setUserRole(session.user.id, userId, role));
  revalidatePath("/admin", "layout");
  redirect(`/admin/users/${userId}?notice=${result.ok ? (role === "ADMIN" ? "promoted" : "demoted") : result.reason}`);
}

// ─── Weddings ────────────────────────────────────────────────────────────────

export async function grantPlanAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const weddingId = readString(formData, "weddingId");
  const values = readFields(formData, ["planCode", "note"]);
  const parsed = grantPlanSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    const result = await adminGrantPlanToWedding(session.user.id, weddingId, parsed.data.planCode, parsed.data.note);
    if (!result.ok) return { status: "error", message: result.reason === "unknown_plan" ? "Paket tidak ditemukan." : "Pernikahan tidak ditemukan.", values };
  } catch (error) {
    return failure(error, "admin.grant_failed", values);
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/weddings/${weddingId}?notice=granted`);
}

export async function revokeEntitlementAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const entitlementId = readString(formData, "entitlementId");
  const weddingId = readString(formData, "weddingId");
  const result = await asAdmin("admin.revoke_failed", () =>
    adminRevokeEntitlement(session.user.id, entitlementId, readString(formData, "note") || "Dicabut oleh admin"),
  );
  revalidatePath("/admin", "layout");
  redirect(`/admin/weddings/${weddingId}?notice=${result.ok ? "revoked" : result.reason}`);
}

// ─── Plans, add-ons, promo codes ─────────────────────────────────────────────

const PLAN_FIELDS = ["code", "name", "description", "price", "durationDays", "isActive", "sortOrder"] as const;

function readPlan(formData: FormData) {
  const values = readFields(formData, PLAN_FIELDS);
  const features = formData.getAll("features").filter((value): value is string => typeof value === "string");
  return { values: { ...values, features: features.join(",") }, input: { ...values, features } };
}

export async function createPlanAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const { values, input } = readPlan(formData);
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    const result = await createPlan(session.user.id, parsed.data);
    if (!result.ok) return { status: "error", message: INVALID_INPUT, fieldErrors: { code: ["Kode paket sudah dipakai"] }, values };
  } catch (error) {
    return failure(error, "admin.plan_create_failed", values);
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/billing");
  redirect("/admin/plans?notice=created");
}

export async function updatePlanAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const { values, input } = readPlan(formData);
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    const result = await updatePlan(session.user.id, readString(formData, "planId"), parsed.data);
    if (!result.ok) return { status: "error", message: "Paket tidak ditemukan.", values };
  } catch (error) {
    return failure(error, "admin.plan_update_failed", values);
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/billing");
  redirect("/admin/plans?notice=updated");
}

export async function updateAddonAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readFields(formData, ["name", "description", "price", "quotaAmount", "unit", "isActive"]);
  const parsed = addonSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    const result = await updateAddon(session.user.id, readString(formData, "addonId"), parsed.data);
    if (!result.ok) return { status: "error", message: "Add-on tidak ditemukan.", values };
  } catch (error) {
    return failure(error, "admin.addon_update_failed", values);
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/billing");
  return { status: "success", message: "Add-on disimpan." };
}

const PROMO_FIELDS = ["code", "description", "discountType", "discountValue", "planId", "startsOn", "endsOn", "usageLimit", "perUserLimit", "isActive"] as const;

const PROMO_ERRORS: Record<"duplicate_code" | "invalid_plan" | "not_found", Record<string, string[]>> = {
  duplicate_code: { code: ["Kode promo sudah dipakai"] },
  invalid_plan: { planId: ["Paket tidak ditemukan"] },
  not_found: {},
};

export async function createPromoCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readFields(formData, PROMO_FIELDS);
  const parsed = promoCodeSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    const result = await createPromoCode(session.user.id, parsed.data);
    if (!result.ok) return { status: "error", message: INVALID_INPUT, fieldErrors: PROMO_ERRORS[result.reason], values };
  } catch (error) {
    return failure(error, "admin.promo_create_failed", values);
  }
  revalidatePath("/admin", "layout");
  redirect("/admin/promo-codes?notice=created");
}

export async function updatePromoCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readFields(formData, PROMO_FIELDS);
  const parsed = promoCodeSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    const result = await updatePromoCode(session.user.id, readString(formData, "promoId"), parsed.data);
    if (!result.ok) return { status: "error", message: result.reason === "not_found" ? "Kode promo tidak ditemukan." : INVALID_INPUT, fieldErrors: PROMO_ERRORS[result.reason], values };
  } catch (error) {
    return failure(error, "admin.promo_update_failed", values);
  }
  revalidatePath("/admin", "layout");
  redirect("/admin/promo-codes?notice=updated");
}

// ─── Task templates & themes ─────────────────────────────────────────────────

function readTemplate(formData: FormData) {
  const values = readFields(formData, ["title", "description", "categoryId", "priority", "deadlineOffsetDays", "isActive"]);
  const eventTypeIds = formData.getAll("eventTypeIds").filter((value): value is string => typeof value === "string");
  const marriageProcessIds = formData.getAll("marriageProcessIds").filter((value): value is string => typeof value === "string");
  return {
    values: { ...values, eventTypeIds: eventTypeIds.join(","), marriageProcessIds: marriageProcessIds.join(",") },
    input: { ...values, eventTypeIds, marriageProcessIds },
  };
}

export async function createTaskTemplateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const { values, input } = readTemplate(formData);
  const parsed = taskTemplateSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    const result = await createTaskTemplate(session.user.id, parsed.data);
    if (!result.ok) return { status: "error", message: "Kategori, jenis acara, atau jalur pernikahan tidak valid.", values };
  } catch (error) {
    return failure(error, "admin.template_create_failed", values);
  }
  revalidatePath("/admin", "layout");
  redirect("/admin/task-templates?notice=created");
}

export async function updateTaskTemplateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const { values, input } = readTemplate(formData);
  const parsed = taskTemplateSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    const result = await updateTaskTemplate(session.user.id, readString(formData, "templateId"), parsed.data);
    if (!result.ok) return { status: "error", message: result.reason === "not_found" ? "Template tidak ditemukan." : "Referensi tidak valid.", values };
  } catch (error) {
    return failure(error, "admin.template_update_failed", values);
  }
  revalidatePath("/admin", "layout");
  redirect("/admin/task-templates?notice=updated");
}

export async function updateThemeSettingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readFields(formData, ["displayName", "description", "isEnabled", "isPremium", "sortOrder"]);
  const parsed = themeSettingSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    const result = await updateThemeSetting(session.user.id, readString(formData, "code"), parsed.data);
    if (!result.ok) return { status: "error", message: "Tema tidak dikenal.", values };
  } catch (error) {
    return failure(error, "admin.theme_update_failed", values);
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/invitation/design");
  return { status: "success", message: "Tema disimpan." };
}
