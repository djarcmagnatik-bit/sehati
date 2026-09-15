import { z } from "zod";
import { COUPLE_DISPLAY_FORMATS } from "@/lib/couple";
import { isValidIsoDate } from "@/lib/dates";
import { parseRupiah } from "@/lib/money";

type Issue = { path: string; message: string };

const requiredName = (label: string) =>
  z.string().trim().min(1, `${label} wajib diisi`).max(80, `${label} maksimal 80 karakter`);

const requiredIsoDate = (label: string) =>
  z.string().trim().min(1, `${label} wajib diisi`).refine(isValidIsoDate, `${label} tidak valid`);

const optionalIsoDate = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null))
    .refine((value) => value === null || isValidIsoDate(value), `${label} tidak valid`);

const coupleShape = {
  displayName: requiredName("Nama panggilan kamu"),
  partnerName: requiredName("Nama pasangan"),
  brideName: requiredName("Nama mempelai wanita"),
  groomName: requiredName("Nama mempelai pria"),
  coupleDisplayFormat: z.enum(COUPLE_DISPLAY_FORMATS, "Pilih format nama pasangan"),
  customDisplayName: z
    .string()
    .trim()
    .max(120, "Nama tampilan maksimal 120 karakter")
    .optional()
    .transform((value) => (value ? value : null)),
};

const datesShape = {
  weddingDate: requiredIsoDate("Tanggal pernikahan"),
  engagementDate: optionalIsoDate("Tanggal lamaran"),
  receptionDate: optionalIsoDate("Tanggal resepsi"),
};

const eventTypeShape = {
  eventTypeId: z.uuid("Pilih jenis acara"),
};

const marriageProcessShape = {
  marriageProcessId: z.uuid("Pilih jalur pernikahan"),
};

const budgetShape = {
  targetBudget: z
    .string()
    .trim()
    .max(30, "Nominal terlalu panjang")
    .optional()
    .transform((value, ctx) => {
      if (!value) return null;
      const amount = parseRupiah(value);
      if (amount === null) {
        ctx.addIssue({ code: "custom", message: "Masukkan nominal rupiah yang valid, contoh 100.000.000" });
        return z.NEVER;
      }
      return amount;
    }),
  currency: z.literal("IDR").default("IDR"),
};

function coupleIssues(data: { coupleDisplayFormat: string; customDisplayName: string | null }): Issue[] {
  if (data.coupleDisplayFormat === "CUSTOM" && !data.customDisplayName) {
    return [{ path: "customDisplayName", message: "Tulis nama tampilan pasangan" }];
  }
  return [];
}

function dateIssues(
  data: { weddingDate: string; engagementDate: string | null; receptionDate: string | null },
  todayIso: string,
): Issue[] {
  const issues: Issue[] = [];
  if (!isValidIsoDate(data.weddingDate)) return issues;
  // ISO dates compare correctly as strings.
  if (data.weddingDate < todayIso) {
    issues.push({ path: "weddingDate", message: "Tanggal pernikahan tidak boleh di masa lalu" });
  }
  if (data.engagementDate && data.engagementDate > data.weddingDate) {
    issues.push({ path: "engagementDate", message: "Tanggal lamaran tidak boleh setelah tanggal pernikahan" });
  }
  if (data.receptionDate && data.receptionDate < data.weddingDate) {
    issues.push({ path: "receptionDate", message: "Tanggal resepsi tidak boleh sebelum tanggal pernikahan" });
  }
  return issues;
}

function addIssues(ctx: { addIssue: (issue: { code: "custom"; path: string[]; message: string }) => void }, issues: Issue[]) {
  for (const issue of issues) {
    ctx.addIssue({ code: "custom", path: [issue.path], message: issue.message });
  }
}

/** Per-step schemas used by the onboarding wizard (client) for immediate feedback. */
export function makeOnboardingStepSchemas(todayIso: string) {
  return {
    couple: z.object(coupleShape).superRefine((data, ctx) => addIssues(ctx, coupleIssues(data))),
    dates: z.object(datesShape).superRefine((data, ctx) => addIssues(ctx, dateIssues(data, todayIso))),
    eventType: z.object(eventTypeShape),
    marriageProcess: z.object(marriageProcessShape),
    budget: z.object(budgetShape),
  };
}

/** Full onboarding schema — the server always re-validates the complete payload with this. */
export function makeOnboardingSchema(todayIso: string) {
  return z
    .object({ ...coupleShape, ...datesShape, ...eventTypeShape, ...marriageProcessShape, ...budgetShape })
    .superRefine((data, ctx) => addIssues(ctx, [...coupleIssues(data), ...dateIssues(data, todayIso)]));
}

export type OnboardingInput = z.input<ReturnType<typeof makeOnboardingSchema>>;
export type OnboardingData = z.output<ReturnType<typeof makeOnboardingSchema>>;

/** Which wizard step owns each field (used to jump back to the first invalid step). */
export const ONBOARDING_FIELD_STEP: Record<string, number> = {
  displayName: 0,
  partnerName: 0,
  brideName: 0,
  groomName: 0,
  coupleDisplayFormat: 0,
  customDisplayName: 0,
  weddingDate: 1,
  engagementDate: 1,
  receptionDate: 1,
  eventTypeId: 2,
  marriageProcessId: 3,
  targetBudget: 4,
  currency: 4,
};
