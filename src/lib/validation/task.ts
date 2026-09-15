import { z } from "zod";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/checklist";
import { isValidIsoDate } from "@/lib/dates";

const emptyToNull = (value: string | undefined) => (value ? value : null);

export const taskInputSchema = z.object({
  title: z.string().trim().min(1, "Judul tugas wajib diisi").max(160, "Judul maksimal 160 karakter"),
  description: z.string().trim().max(2000, "Deskripsi maksimal 2.000 karakter").optional().transform(emptyToNull),
  categoryId: z.uuid("Pilih kategori"),
  dueDate: z
    .string()
    .trim()
    .optional()
    .transform(emptyToNull)
    .refine((value) => value === null || isValidIsoDate(value), "Tanggal tenggat tidak valid"),
  priority: z.enum(TASK_PRIORITIES, "Pilih prioritas"),
  assigneeMemberId: z
    .string()
    .trim()
    .optional()
    .transform(emptyToNull)
    .refine((value) => value === null || z.uuid().safeParse(value).success, "Penanggung jawab tidak valid"),
});

export const taskUpdateSchema = taskInputSchema.extend({
  status: z.enum(TASK_STATUSES, "Pilih status"),
});

export type TaskInput = z.output<typeof taskInputSchema>;
export type TaskUpdateInput = z.output<typeof taskUpdateSchema>;

export function makeWeddingDateChangeSchema(todayIso: string) {
  return z.object({
    weddingId: z.uuid("Workspace tidak valid"),
    weddingDate: z
      .string()
      .trim()
      .min(1, "Tanggal pernikahan wajib diisi")
      .refine(isValidIsoDate, "Tanggal pernikahan tidak valid")
      .refine((value) => !isValidIsoDate(value) || value >= todayIso, "Tanggal pernikahan tidak boleh di masa lalu"),
    recalculate: z.enum(["yes", "no"], "Pilih apakah tenggat checklist dihitung ulang"),
  });
}
