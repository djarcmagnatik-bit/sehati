/**
 * Migration validation (PRD Phase 16): applies every migration to an EMPTY schema, checks there is
 * no drift between the result and prisma/schema.prisma, runs the reference seed twice (it must be
 * idempotent), then drops the temporary schema.
 *
 *   pnpm verify:migrations
 *
 * Works inside the TEST database only (DATABASE_URL_TEST), in a throwaway schema, so neither the
 * development data nor the test data is touched.
 */
import { spawnSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { upsertReferenceData } from "../src/server/seed/reference-data";

config({ path: ".env.test", quiet: true });
config({ quiet: true });

const base = process.env["DATABASE_URL_TEST"];
if (!base) throw new Error("DATABASE_URL_TEST belum diisi");
if (base === process.env["DATABASE_URL"]) throw new Error("DATABASE_URL_TEST tidak boleh sama dengan DATABASE_URL");

const schema = `migration_verify_${Date.now().toString(36)}`;
const url = new URL(base);
url.searchParams.set("schema", schema);
const env = { ...process.env, DATABASE_URL: url.toString() };

function step(title: string, args: string[], allowedExitCodes = [0]): string {
  console.log(`\n$ prisma ${args.join(" ")}   # ${title}`);
  // Fixed arguments only (no user input), passed as one command line for the shell.
  const result = spawnSync(`pnpm exec prisma ${args.join(" ")}`, { env, encoding: "utf8", shell: true });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  // Never print the connection string.
  console.log(output.replaceAll(url.toString(), "<DATABASE_URL_TEST?schema>").replaceAll(base!, "<DATABASE_URL_TEST>"));
  if (!allowedExitCodes.includes(result.status ?? -1)) throw new Error(`${title} failed (exit ${result.status})`);
  return output;
}

async function counts(db: PrismaClient) {
  const [eventTypes, marriageProcesses, taskCategories, taskTemplates, budgetTemplates, vendorCategories, guestGroupTemplates, giftCategories, plans, addons] =
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
  return { eventTypes, marriageProcesses, taskCategories, taskTemplates, budgetTemplates, vendorCategories, guestGroupTemplates, giftCategories, plans, addons };
}

async function main() {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: base! }, { schema }) });
  let ok = false;
  try {
    console.log(`Temporary schema: ${schema}`);
    step("apply every migration to an empty schema", ["migrate", "deploy"]);
    step("migration history matches the folder", ["migrate", "status"]);
    // --exit-code: 0 = no difference, 2 = differences found.
    const diff = step("no drift between migrations and schema.prisma", [
      "migrate",
      "diff",
      "--from-config-datasource",
      "--to-schema",
      "prisma/schema.prisma",
      "--exit-code",
    ]);
    if (!/No difference detected/i.test(diff) && diff.trim() !== "") console.log("(diff output above)");

    await upsertReferenceData(db);
    const first = await counts(db);
    await upsertReferenceData(db);
    const second = await counts(db);
    console.log(`\nSeed run 1: ${JSON.stringify(first)}`);
    console.log(`Seed run 2: ${JSON.stringify(second)}`);
    if (JSON.stringify(first) !== JSON.stringify(second)) throw new Error("seed is not idempotent");
    if (Object.values(first).some((count) => count === 0)) throw new Error("seed left a reference table empty");

    const checks = await db.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT COUNT(*)::int AS count FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = $1 AND c.contype = 'c'`,
      schema,
    );
    const partialIndexes = await db.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT COUNT(*)::int AS count FROM pg_indexes WHERE schemaname = $1 AND indexdef ILIKE '% WHERE %'`,
      schema,
    );
    console.log(`CHECK constraints: ${checks[0]?.count}, partial indexes: ${partialIndexes[0]?.count}`);
    ok = true;
  } finally {
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.$disconnect();
    console.log(`\nDropped ${schema}. ${ok ? "MIGRATIONS VERIFIED" : "VERIFICATION FAILED"}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
