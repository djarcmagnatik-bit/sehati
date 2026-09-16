import { test as base } from "@playwright/test";
import { getTestDb } from "./test-db";

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
