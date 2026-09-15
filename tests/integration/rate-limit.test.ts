import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { consumeRateLimit } from "@/server/auth/rate-limit";
import { getDb } from "@/server/db";

const prefix = `test:${randomUUID()}`;

afterAll(async () => {
  await getDb().rateLimitBucket.deleteMany({ where: { key: { startsWith: prefix } } });
});

describe("consumeRateLimit", () => {
  it("allows requests up to the limit and blocks the rest", async () => {
    const key = `${prefix}:sequential`;
    const rule = { limit: 3, windowSeconds: 60 };
    const results = [];
    for (let i = 0; i < 4; i += 1) results.push(await consumeRateLimit(key, rule));

    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results.map((r) => r.count)).toEqual([1, 2, 3, 4]);
  });

  it("starts a new window once the previous one has elapsed", async () => {
    const key = `${prefix}:window`;
    const rule = { limit: 1, windowSeconds: 1 };
    expect((await consumeRateLimit(key, rule)).allowed).toBe(true);
    expect((await consumeRateLimit(key, rule)).allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 1_200));
    expect(await consumeRateLimit(key, rule)).toEqual({ allowed: true, count: 1 });
  });

  it("is atomic under concurrent requests", async () => {
    const key = `${prefix}:concurrent`;
    const rule = { limit: 5, windowSeconds: 60 };
    const results = await Promise.all(Array.from({ length: 20 }, () => consumeRateLimit(key, rule)));

    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    expect(results.map((r) => r.count).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });
});
