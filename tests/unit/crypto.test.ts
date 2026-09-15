import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { generateToken, hashToken } from "@/server/auth/tokens";

describe("tokens", () => {
  it("generates unique 256-bit url-safe tokens", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateToken()));
    expect(tokens.size).toBe(100);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("hashes deterministically to 64 hex characters", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });
});

describe("password hashing", () => {
  it("uses argon2id and verifies only the correct password", async () => {
    const hash = await hashPassword("rahasia-aman-123");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(hash).not.toContain("rahasia-aman-123");
    await expect(verifyPassword(hash, "rahasia-aman-123")).resolves.toBe(true);
    await expect(verifyPassword(hash, "rahasia-aman-124")).resolves.toBe(false);
  });

  it("produces a different salt each time", async () => {
    expect(await hashPassword("same-password")).not.toBe(await hashPassword("same-password"));
  });

  it("returns false (not throws) for a malformed hash", async () => {
    await expect(verifyPassword("not-a-hash", "whatever")).resolves.toBe(false);
  });
});
