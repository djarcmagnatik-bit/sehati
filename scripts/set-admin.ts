/**
 * Bootstrap tool: make an existing account an admin (or take the role away).
 *
 *   pnpm admin:set -- --email kamu@contoh.com
 *   pnpm admin:set -- --email kamu@contoh.com --revoke
 *
 * The first admin can only be created this way; after that, admins manage roles in /admin/users.
 * Runs against DATABASE_URL (development by default). Nothing is printed except the outcome.
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
  const revoke = process.argv.includes("--revoke");
  if (!email) throw new Error("Pakai: pnpm admin:set -- --email kamu@contoh.com [--revoke]");

  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) throw new Error("DATABASE_URL belum diisi");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const user = await db.user.findUnique({ where: { email }, select: { id: true, role: true } });
    if (!user) throw new Error("Akun dengan email tersebut tidak ditemukan");
    const role = revoke ? "USER" : "ADMIN";
    if (user.role === role) {
      console.log(revoke ? "Akun ini memang bukan admin." : "Akun ini sudah admin.");
      return;
    }

    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { role } });
      await tx.adminAuditLog.create({
        data: {
          actorId: null,
          actorEmail: "cli:admin:set",
          action: revoke ? "user.demoted" : "user.promoted",
          targetType: "user",
          targetId: user.id,
          summary: { from: user.role, to: role, via: "script" },
        },
      });
    });
    console.log(revoke ? "Hak admin dicabut." : "Akun sekarang admin. Buka /admin setelah masuk.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
