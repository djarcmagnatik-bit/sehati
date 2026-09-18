import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/lib/env";

const globalForPrisma = globalThis as typeof globalThis & { __prisma?: PrismaClient };

export type DbQueryEvent = { query: string; durationMs: number };
type DbQueryListener = (event: DbQueryEvent) => void;
const listeners = new Set<DbQueryListener>();

/** Lazily created singleton (survives dev hot reloads). */
export function getDb(): PrismaClient {
  if (!globalForPrisma.__prisma) {
    const adapter = new PrismaPg({ connectionString: getEnv().DATABASE_URL });
    if (process.env["PRISMA_QUERY_EVENTS"] === "1") {
      // Diagnostics only (performance tests): every SQL statement is reported to onDbQuery listeners.
      const client = new PrismaClient({ adapter, log: [{ emit: "event", level: "query" }] });
      client.$on("query", (event) => {
        for (const listener of listeners) listener({ query: event.query, durationMs: event.duration });
      });
      globalForPrisma.__prisma = client as unknown as PrismaClient;
    } else {
      globalForPrisma.__prisma = new PrismaClient({ adapter });
    }
  }
  return globalForPrisma.__prisma;
}

/** Subscribes to SQL statements; only fires when PRISMA_QUERY_EVENTS=1. Returns an unsubscribe function. */
export function onDbQuery(listener: DbQueryListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
