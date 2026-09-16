/**
 * Support tool: give every wedding of one account a plan without payment, recorded as an admin grant.
 *
 *   pnpm access:grant -- --email kamu@contoh.com [--plan FULL_ACCESS]
 *
 * Runs against DATABASE_URL (development by default). Nothing is printed except counts.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";

config({ quiet: true });

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const email = argument("email")?.trim().toLowerCase();
  const planCode = argument("plan") ?? "FULL_ACCESS";
  if (!email) throw new Error("Pakai: pnpm access:grant -- --email kamu@contoh.com [--plan FULL_ACCESS]");

  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) throw new Error("DATABASE_URL belum diisi");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const [user, plan] = await Promise.all([
      db.user.findUnique({ where: { email }, select: { id: true, memberships: { where: { wedding: { deletedAt: null } }, select: { weddingId: true } } } }),
      db.plan.findUnique({ where: { code: planCode }, select: { id: true, durationDays: true } }),
    ]);
    if (!user) throw new Error("Akun dengan email tersebut tidak ditemukan");
    if (!plan) throw new Error(`Paket ${planCode} tidak ditemukan (sudah menjalankan pnpm db:seed?)`);
    if (user.memberships.length === 0) throw new Error("Akun ini belum punya workspace pernikahan");

    const now = new Date();
    for (const { weddingId } of user.memberships) {
      await db.weddingEntitlement.create({
        data: {
          weddingId,
          planId: plan.id,
          source: "ADMIN_GRANT",
          startsAt: now,
          expiresAt: plan.durationDays ? new Date(now.getTime() + plan.durationDays * 86_400_000) : null,
          note: "Diberikan lewat pnpm access:grant",
        },
      });
    }
    console.log(`Akses ${planCode} diberikan ke ${user.memberships.length} workspace.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
