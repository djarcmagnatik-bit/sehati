import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { upsertReferenceData } from "../src/server/seed/reference-data";

config({ quiet: true });

async function main() {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    await upsertReferenceData(db);
    const [eventTypes, marriageProcesses, taskCategories, taskTemplates, budgetTemplates, vendorCategories, guestGroups, giftCategories, plans, addons] =
      await Promise.all([
        db.eventType.count(),
        db.marriageProcess.count(),
        db.taskCategory.count(),
        db.taskTemplate.count(),
        db.budgetCategoryTemplate.count(),
        db.vendorCategory.count(),
        db.guestGroupTemplate.count(),
        db.giftCategory.count(),
        db.plan.count(),
        db.addon.count(),
      ]);
    console.log(
      `Seed selesai: ${eventTypes} event types, ${marriageProcesses} marriage processes, ` +
        `${taskCategories} task categories, ${taskTemplates} task templates, ` +
        `${budgetTemplates} budget category templates, ${vendorCategories} vendor categories, ` +
        `${guestGroups} guest group templates, ${giftCategories} gift categories, ${plans} plans, ${addons} add-ons.`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
