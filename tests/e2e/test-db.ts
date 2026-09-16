import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import { PrismaClient } from "../../src/generated/prisma/client";

config({ path: ".env.test", quiet: true });
config({ quiet: true });

let client: PrismaClient | undefined;

/** The TEST database only; refuses to run when it would point at the development database. */
export function getTestDb(): PrismaClient {
  if (client) return client;
  const testUrl = process.env["DATABASE_URL_TEST"];
  if (!testUrl) throw new Error("DATABASE_URL_TEST belum diisi");
  if (testUrl === process.env["DATABASE_URL"]) throw new Error("DATABASE_URL_TEST tidak boleh sama dengan DATABASE_URL");
  client = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl }) });
  return client;
}

/**
 * Feature specs test features, not the purchase flow (billing.spec.ts covers that), so their
 * accounts get the full-access plan the way support would grant it.
 */
export async function grantFullAccess(email: string): Promise<void> {
  const db = getTestDb();
  const [user, plan] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { email }, select: { memberships: { select: { weddingId: true } } } }),
    db.plan.findUniqueOrThrow({ where: { code: "FULL_ACCESS" }, select: { id: true } }),
  ]);
  for (const { weddingId } of user.memberships) {
    await db.weddingEntitlement.create({
      data: { weddingId, planId: plan.id, source: "ADMIN_GRANT", startsAt: new Date(), note: "e2e" },
    });
  }
}
