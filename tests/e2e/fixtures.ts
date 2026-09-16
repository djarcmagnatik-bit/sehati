import { test as base } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import { PrismaClient } from "../../src/generated/prisma/client";

config({ path: ".env.test", quiet: true });
config({ quiet: true });

let client: PrismaClient | undefined;

function getTestDb(): PrismaClient {
  if (client) return client;
  const testUrl = process.env["DATABASE_URL_TEST"];
  if (!testUrl) throw new Error("DATABASE_URL_TEST belum diisi");
  if (testUrl === process.env["DATABASE_URL"]) throw new Error("DATABASE_URL_TEST tidak boleh sama dengan DATABASE_URL");
  client = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl }) });
  return client;
}

/**
 * Every spec registers a fresh account, and the whole suite runs from one IP, so the app's
 * (intentionally strict) signup limit would fire partway through. The buckets are cleared in the
 * TEST database before each test; the application limits themselves are untouched.
 */
export const test = base.extend<{ freshRateLimits: void }>({
  freshRateLimits: [
    async ({}, use) => {
      await getTestDb().rateLimitBucket.deleteMany({});
      await use();
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
