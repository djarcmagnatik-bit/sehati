import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/lib/env";

const globalForPrisma = globalThis as typeof globalThis & { __prisma?: PrismaClient };

/** Lazily created singleton (survives dev hot reloads). */
export function getDb(): PrismaClient {
  if (!globalForPrisma.__prisma) {
    const adapter = new PrismaPg({ connectionString: getEnv().DATABASE_URL });
    globalForPrisma.__prisma = new PrismaClient({ adapter });
  }
  return globalForPrisma.__prisma;
}
