"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FieldErrors, FormState } from "@/lib/form-state";
import { logger } from "@/lib/logger";
import { fieldErrorsFromZod } from "@/lib/validation/errors";
import {
  bookVendorSchema,
  vendorCreateSchema,
  vendorResearchSchema,
  vendorUpdateSchema,
} from "@/lib/validation/vendor";
import { requireSession } from "@/server/auth/session-cookie";
import { WeddingAccessError } from "@/server/authz/wedding-access";
import {
  bookVendorFromResearch,
  createVendor,
  createVendorResearch,
  deleteVendor,
  deleteVendorResearch,
  updateVendor,
  updateVendorResearch,
} from "@/server/vendors/vendor-service";
import { readString } from "./form-data";

const INVALID_INPUT = "Periksa kembali data yang ditandai.";
const NO_ACCESS = "Data tidak ditemukan atau kamu tidak memiliki akses.";

const CONTACT_FIELDS = ["contactPerson", "whatsapp", "phone", "instagram", "website"] as const;
const RESEARCH_FIELDS = [
  "name",
  "categoryId",
  "status",
  "estimatedPrice",
  "packageName",
  "location",
  "rating",
  "pros",
  "cons",
  "notes",
  ...CONTACT_FIELDS,
] as const;
const VENDOR_UPDATE_FIELDS = ["name", "categoryId", "packageName", "bookingDate", "eventLabel", "notes", ...CONTACT_FIELDS] as const;
const CONTRACT_FIELDS = ["contractValue", "budgetCategoryId", "paymentDueDate", "bookingDate"] as const;

function readFields(formData: FormData, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.map((key) => [key, readString(formData, key)]));
}

function revalidateVendors() {
  revalidatePath("/vendors", "layout");
  revalidatePath("/budget", "layout");
  revalidatePath("/dashboard");
}

function failure(error: unknown, event: string, values: Record<string, string>): FormState {
  if (error instanceof WeddingAccessError) return { status: "error", message: NO_ACCESS, values };
  logger.error(event, { error });
  return { status: "error", message: "Data belum berhasil disimpan. Silakan coba lagi.", values };
}

const CATEGORY_ERROR: FieldErrors = { categoryId: ["Kategori vendor tidak tersedia"] };
const BUDGET_CATEGORY_ERROR: FieldErrors = { budgetCategoryId: ["Kategori budget tidak tersedia"] };

export async function createVendorResearchAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readFields(formData, RESEARCH_FIELDS);
  const parsed = vendorResearchSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    const result = await createVendorResearch(session.user.id, readString(formData, "weddingId"), parsed.data);
    if (!result.ok) return { status: "error", message: INVALID_INPUT, fieldErrors: CATEGORY_ERROR, values };
  } catch (error) {
    return failure(error, "vendor_research.create_failed", values);
  }
  revalidateVendors();
  redirect("/vendors/research?notice=created");
}

export async function updateVendorResearchAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const researchId = readString(formData, "researchId");
  const values = readFields(formData, RESEARCH_FIELDS);
  const parsed = vendorResearchSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    const result = await updateVendorResearch(session.user.id, researchId, parsed.data);
    if (!result.ok) return { status: "error", message: INVALID_INPUT, fieldErrors: CATEGORY_ERROR, values };
  } catch (error) {
    return failure(error, "vendor_research.update_failed", values);
  }
  revalidateVendors();
  redirect(`/vendors/research/${researchId}?notice=updated`);
}

export async function deleteVendorResearchAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const researchId = readString(formData, "researchId");
  let blocked = false;
  try {
    blocked = !(await deleteVendorResearch(session.user.id, researchId)).ok;
  } catch (error) {
    if (error instanceof WeddingAccessError) return;
    throw error;
  }
  if (blocked) redirect(`/vendors/research/${researchId}?notice=is_selected`);
  revalidateVendors();
  redirect("/vendors/research?notice=deleted");
}

export async function bookVendorAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const researchId = readString(formData, "researchId");
  const values = readFields(formData, [...CONTRACT_FIELDS, "packageName"]);
  const parsed = bookVendorSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };

  let vendorId: string;
  let notice = "booked";
  try {
    const result = await bookVendorFromResearch(session.user.id, researchId, parsed.data);
    if (!result.ok) {
      if (result.reason === "invalid_budget_category") {
        return { status: "error", message: INVALID_INPUT, fieldErrors: BUDGET_CATEGORY_ERROR, values };
      }
      if (!result.vendorId) return { status: "error", message: "Kandidat ini sudah dipilih sebagai vendor.", values };
      vendorId = result.vendorId;
      notice = "already_booked";
    } else {
      vendorId = result.vendorId;
    }
  } catch (error) {
    return failure(error, "vendor.book_failed", values);
  }
  revalidateVendors();
  redirect(`/vendors/${vendorId}?notice=${notice}`);
}

export async function createVendorAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readFields(formData, [...VENDOR_UPDATE_FIELDS, ...CONTRACT_FIELDS]);
  const parsed = vendorCreateSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };

  let vendorId: string;
  try {
    const result = await createVendor(session.user.id, readString(formData, "weddingId"), parsed.data);
    if (!result.ok) {
      const fieldErrors = result.reason === "invalid_category" ? CATEGORY_ERROR : BUDGET_CATEGORY_ERROR;
      return { status: "error", message: INVALID_INPUT, fieldErrors, values };
    }
    vendorId = result.vendorId;
  } catch (error) {
    return failure(error, "vendor.create_failed", values);
  }
  revalidateVendors();
  redirect(`/vendors/${vendorId}?notice=created`);
}

export async function updateVendorAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const vendorId = readString(formData, "vendorId");
  const values = readFields(formData, VENDOR_UPDATE_FIELDS);
  const parsed = vendorUpdateSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    const result = await updateVendor(session.user.id, vendorId, parsed.data);
    if (!result.ok) return { status: "error", message: INVALID_INPUT, fieldErrors: CATEGORY_ERROR, values };
  } catch (error) {
    return failure(error, "vendor.update_failed", values);
  }
  revalidateVendors();
  redirect(`/vendors/${vendorId}?notice=updated`);
}

export async function deleteVendorAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const vendorId = readString(formData, "vendorId");
  let blocked = false;
  try {
    blocked = !(await deleteVendor(session.user.id, vendorId)).ok;
  } catch (error) {
    if (error instanceof WeddingAccessError) return;
    throw error;
  }
  if (blocked) redirect(`/vendors/${vendorId}?notice=has_expenses`);
  revalidateVendors();
  redirect("/vendors?notice=deleted");
}
