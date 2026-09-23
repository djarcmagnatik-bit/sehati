/**
 * Support tool: bring the checklist templates in the database in line with the shipped defaults
 * (src/server/seed/task-templates.ts).
 *
 *   pnpm templates:sync -- --dry-run   # show what would change, write nothing
 *   pnpm templates:sync                # apply
 *
 * The seed only ever creates missing templates, so corrected wording, deadlines or descriptions
 * never reach a database that was seeded earlier. This script updates them by code.
 *
 * It touches only seeded codes: templates an admin created carry an `ADMIN_` prefix and are left
 * alone, and a seeded template that no longer ships is deactivated rather than deleted, so the tasks
 * already generated from it keep their template. Checklists that already exist are never rewritten;
 * a couple's tasks are copies made when their workspace was created.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { TASK_TEMPLATES } from "../src/server/seed/task-templates";

config({ quiet: true });

const dryRun = process.argv.includes("--dry-run");
const ADMIN_PREFIX = "ADMIN_";

function sameLinks(current: readonly string[], wanted: readonly string[]): boolean {
  return current.length === wanted.length && [...current].sort().join() === [...wanted].sort().join();
}

async function main() {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const [categories, eventTypes, marriageProcesses, existing] = await Promise.all([
      db.taskCategory.findMany({ select: { id: true, code: true } }),
      db.eventType.findMany({ select: { id: true, code: true } }),
      db.marriageProcess.findMany({ select: { id: true, code: true } }),
      db.taskTemplate.findMany({
        select: {
          id: true,
          code: true,
          title: true,
          description: true,
          categoryId: true,
          priority: true,
          deadlineOffsetDays: true,
          sortOrder: true,
          isActive: true,
          eventTypes: { select: { eventTypeId: true } },
          marriageProcesses: { select: { marriageProcessId: true } },
        },
      }),
    ]);

    const categoryIds = new Map(categories.map((row) => [row.code, row.id]));
    const eventTypeIds = new Map(eventTypes.map((row) => [row.code, row.id]));
    const processIds = new Map(marriageProcesses.map((row) => [row.code, row.id]));
    const byCode = new Map(existing.map((row) => [row.code, row]));
    const shipped = new Set(TASK_TEMPLATES.map((template) => template.code));

    const lookup = (map: Map<string, string>, code: string, kind: string): string => {
      const id = map.get(code);
      if (!id) throw new Error(`Unknown ${kind} code "${code}". Run the seed first (pnpm db:seed).`);
      return id;
    };

    const created: string[] = [];
    const updated: string[] = [];
    const reordered: string[] = [];
    const deactivated: string[] = [];

    for (const [index, template] of TASK_TEMPLATES.entries()) {
      const categoryId = lookup(categoryIds, template.categoryCode, "task category");
      const wantedEventTypes = template.eventTypeCodes.map((code) => lookup(eventTypeIds, code, "event type"));
      const wantedProcesses = template.marriageProcessCodes.map((code) => lookup(processIds, code, "marriage process"));
      const current = byCode.get(template.code);

      if (!current) {
        created.push(template.code);
        if (!dryRun) {
          await db.taskTemplate.create({
            data: {
              code: template.code,
              title: template.title,
              description: template.description,
              categoryId,
              priority: template.priority,
              deadlineOffsetDays: template.deadlineOffsetDays,
              sortOrder: index,
              eventTypes: { create: wantedEventTypes.map((eventTypeId) => ({ eventTypeId })) },
              marriageProcesses: { create: wantedProcesses.map((marriageProcessId) => ({ marriageProcessId })) },
            },
          });
        }
        continue;
      }

      const sameContent =
        current.title === template.title &&
        (current.description ?? null) === template.description &&
        current.categoryId === categoryId &&
        current.priority === template.priority &&
        current.deadlineOffsetDays === template.deadlineOffsetDays &&
        current.isActive &&
        sameLinks(current.eventTypes.map((link) => link.eventTypeId), wantedEventTypes) &&
        sameLinks(current.marriageProcesses.map((link) => link.marriageProcessId), wantedProcesses);
      if (sameContent && current.sortOrder === index) continue;

      // Inserting a template shifts the ones after it, so order-only moves are reported apart.
      if (sameContent) reordered.push(template.code);
      else updated.push(template.code);
      if (!dryRun) {
        await db.$transaction([
          db.taskTemplateEventType.deleteMany({ where: { templateId: current.id } }),
          db.taskTemplateMarriageProcess.deleteMany({ where: { templateId: current.id } }),
          db.taskTemplate.update({
            where: { id: current.id },
            data: {
              title: template.title,
              description: template.description,
              categoryId,
              priority: template.priority,
              deadlineOffsetDays: template.deadlineOffsetDays,
              sortOrder: index,
              isActive: true,
              eventTypes: { create: wantedEventTypes.map((eventTypeId) => ({ eventTypeId })) },
              marriageProcesses: { create: wantedProcesses.map((marriageProcessId) => ({ marriageProcessId })) },
            },
          }),
        ]);
      }
    }

    for (const row of existing) {
      if (shipped.has(row.code) || row.code.startsWith(ADMIN_PREFIX) || !row.isActive) continue;
      deactivated.push(row.code);
      if (!dryRun) await db.taskTemplate.update({ where: { id: row.id }, data: { isActive: false } });
    }

    const show = (label: string, codes: string[]) => {
      console.log(`${label}: ${codes.length}${codes.length > 0 ? ` — ${codes.join(", ")}` : ""}`);
    };
    console.log(dryRun ? "Rencana (tidak ada yang ditulis):" : "Templat checklist disinkronkan:");
    show("  Dibuat", created);
    show("  Diperbarui", updated);
    console.log(`  Bergeser urutannya saja: ${reordered.length}`);
    show("  Dinonaktifkan (tidak lagi dikirim)", deactivated);
    console.log(`  Total templat bawaan: ${TASK_TEMPLATES.length}`);
    console.log("Checklist pasangan yang sudah ada tidak berubah; templat dipakai saat workspace dibuat.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
