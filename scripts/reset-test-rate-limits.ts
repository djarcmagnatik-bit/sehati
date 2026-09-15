/**
 * Clears rate-limit buckets in the TEST database only, so repeated E2E runs from the same IP are not
 * blocked by the (intentionally strict) registration/login limits. Never touches DATABASE_URL.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";

config({ path: ".env.test", quiet: true });
config({ quiet: true });

async function main() {
  const testUrl = process.env["DATABASE_URL_TEST"];
  if (!testUrl) throw new Error("DATABASE_URL_TEST belum diisi");
  if (testUrl === process.env["DATABASE_URL"]) throw new Error("DATABASE_URL_TEST tidak boleh sama dengan DATABASE_URL");

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl }) });
  try {
    const { count } = await db.rateLimitBucket.deleteMany({});
    console.log(`Rate limit buckets di database test dikosongkan (${count} baris).`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
