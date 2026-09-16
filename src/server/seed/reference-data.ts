import type { PrismaClient } from "@/generated/prisma/client";
import { BUDGET_CATEGORY_TEMPLATES } from "./budget-templates";
import { GIFT_CATEGORIES } from "./gift-categories";
import { GUEST_GROUP_TEMPLATES } from "./guest-group-templates";
import { TASK_CATEGORIES, TASK_TEMPLATES } from "./task-templates";
import { VENDOR_CATEGORIES } from "./vendor-categories";

type ReferenceRow = { code: string; name: string; description: string; sortOrder: number };

export const EVENT_TYPES: ReferenceRow[] = [
  { code: "AKAD_ONLY", name: "Akad saja", description: "Hanya akad / pemberkatan tanpa resepsi.", sortOrder: 10 },
  { code: "AKAD_RECEPTION", name: "Akad + Resepsi", description: "Akad / pemberkatan dilanjutkan resepsi.", sortOrder: 20 },
  { code: "RECEPTION_ONLY", name: "Resepsi saja", description: "Hanya acara resepsi.", sortOrder: 30 },
  { code: "ENGAGEMENT", name: "Lamaran / Tunangan", description: "Acara lamaran atau pertunangan.", sortOrder: 40 },
  { code: "TRADITIONAL", name: "Upacara adat", description: "Rangkaian upacara adat.", sortOrder: 50 },
  { code: "CUSTOM", name: "Lainnya", description: "Susunan acara sesuai kebutuhan kalian.", sortOrder: 90 },
];

export const MARRIAGE_PROCESSES: ReferenceRow[] = [
  { code: "KUA", name: "KUA", description: "Pencatatan pernikahan melalui Kantor Urusan Agama.", sortOrder: 10 },
  {
    code: "RELIGIOUS",
    name: "Upacara keagamaan",
    description: "Pemberkatan / upacara di rumah ibadah sesuai agama.",
    sortOrder: 20,
  },
  { code: "CIVIL", name: "Pencatatan sipil", description: "Pencatatan di Dinas Dukcapil.", sortOrder: 30 },
  { code: "CUSTOM", name: "Lainnya", description: "Proses lain sesuai kebutuhan kalian.", sortOrder: 90 },
];

/**
 * Idempotent seed keyed by `code`.
 * - Reference lists (event types, marriage processes, task/budget/vendor categories, guest groups):
 *   names/order are refreshed, `isActive` is kept.
 * - Task templates: created when missing, never overwritten (admins may have edited them).
 */
export async function upsertReferenceData(db: PrismaClient): Promise<void> {
  for (const row of EVENT_TYPES) {
    await db.eventType.upsert({
      where: { code: row.code },
      update: { name: row.name, description: row.description, sortOrder: row.sortOrder },
      create: row,
    });
  }
  for (const row of MARRIAGE_PROCESSES) {
    await db.marriageProcess.upsert({
      where: { code: row.code },
      update: { name: row.name, description: row.description, sortOrder: row.sortOrder },
      create: row,
    });
  }
  for (const row of TASK_CATEGORIES) {
    await db.taskCategory.upsert({
      where: { code: row.code },
      update: { name: row.name, sortOrder: row.sortOrder },
      create: row,
    });
  }
  for (const row of BUDGET_CATEGORY_TEMPLATES) {
    await db.budgetCategoryTemplate.upsert({
      where: { code: row.code },
      update: { name: row.name, sortOrder: row.sortOrder },
      create: row,
    });
  }
  for (const row of VENDOR_CATEGORIES) {
    await db.vendorCategory.upsert({
      where: { code: row.code },
      update: { name: row.name, sortOrder: row.sortOrder, budgetCategoryName: row.budgetCategoryName },
      create: row,
    });
  }
  for (const row of GUEST_GROUP_TEMPLATES) {
    await db.guestGroupTemplate.upsert({
      where: { code: row.code },
      update: { name: row.name, sortOrder: row.sortOrder },
      create: row,
    });
  }

  for (const row of GIFT_CATEGORIES) {
    await db.giftCategory.upsert({
      where: { code: row.code },
      update: { name: row.name, sortOrder: row.sortOrder },
      create: row,
    });
  }

  const [eventTypes, marriageProcesses, categories, existingTemplates] = await Promise.all([
    db.eventType.findMany({ select: { id: true, code: true } }),
    db.marriageProcess.findMany({ select: { id: true, code: true } }),
    db.taskCategory.findMany({ select: { id: true, code: true } }),
    db.taskTemplate.findMany({ select: { code: true } }),
  ]);
  const eventTypeIds = new Map(eventTypes.map((row) => [row.code, row.id]));
  const marriageProcessIds = new Map(marriageProcesses.map((row) => [row.code, row.id]));
  const categoryIds = new Map(categories.map((row) => [row.code, row.id]));
  const existingCodes = new Set(existingTemplates.map((row) => row.code));

  const lookup = (map: Map<string, string>, code: string, kind: string): string => {
    const id = map.get(code);
    if (!id) throw new Error(`Seed error: unknown ${kind} code "${code}"`);
    return id;
  };

  for (const [index, template] of TASK_TEMPLATES.entries()) {
    if (existingCodes.has(template.code)) continue;
    await db.taskTemplate.create({
      data: {
        code: template.code,
        title: template.title,
        description: template.description,
        categoryId: lookup(categoryIds, template.categoryCode, "task category"),
        priority: template.priority,
        deadlineOffsetDays: template.deadlineOffsetDays,
        sortOrder: index,
        eventTypes: {
          create: template.eventTypeCodes.map((code) => ({ eventTypeId: lookup(eventTypeIds, code, "event type") })),
        },
        marriageProcesses: {
          create: template.marriageProcessCodes.map((code) => ({
            marriageProcessId: lookup(marriageProcessIds, code, "marriage process"),
          })),
        },
      },
    });
  }
}
