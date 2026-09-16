import { describe, expect, it } from "vitest";
import { isPrivatePath } from "@/lib/auth/constants";
import { formatCoupleName } from "@/lib/couple";
import { redact } from "@/lib/logger";
import { describeUserAgent } from "@/lib/user-agent";

describe("formatCoupleName", () => {
  const names = { brideName: "Putri", groomName: "Fajar" };

  it("supports both orders and a custom name", () => {
    expect(formatCoupleName({ ...names, format: "BRIDE_GROOM" })).toBe("Putri & Fajar");
    expect(formatCoupleName({ ...names, format: "GROOM_BRIDE" })).toBe("Fajar & Putri");
    expect(formatCoupleName({ ...names, format: "CUSTOM", customDisplayName: "The Wedding of P&F" })).toBe(
      "The Wedding of P&F",
    );
  });

  it("falls back to the default order when the custom name is blank", () => {
    expect(formatCoupleName({ ...names, format: "CUSTOM", customDisplayName: "  " })).toBe("Putri & Fajar");
  });
});

describe("redact", () => {
  it("removes secrets at any depth and serializes errors and bigints", () => {
    const output = redact({
      email: "a@b.co",
      password: "hunter2",
      nested: { sessionToken: "abc", authorization: "Bearer x", list: [{ apiKey: "k" }] },
      amount: 100n,
      error: new Error("boom"),
    }) as Record<string, unknown>;

    expect(output.password).toBe("[REDACTED]");
    expect(output.nested).toEqual({
      sessionToken: "[REDACTED]",
      authorization: "[REDACTED]",
      list: [{ apiKey: "[REDACTED]" }],
    });
    expect(output.email).toBe("a@b.co");
    expect(output.amount).toBe("100");
    expect(output.error).toMatchObject({ name: "Error", message: "boom" });
    expect(JSON.stringify(output)).not.toContain("hunter2");
  });
});

describe("isPrivatePath", () => {
  it("matches private sections without matching look-alike paths", () => {
    expect(isPrivatePath("/dashboard")).toBe(true);
    expect(isPrivatePath("/settings/security")).toBe(true);
    expect(isPrivatePath("/onboarding")).toBe(true);
    expect(isPrivatePath("/guests/import")).toBe(true);
    expect(isPrivatePath("/more")).toBe(true);
    expect(isPrivatePath("/calendar")).toBe(true);
    expect(isPrivatePath("/seserahan/abc")).toBe(true);
    expect(isPrivatePath("/dashboardx")).toBe(false);
    expect(isPrivatePath("/login")).toBe(false);
    expect(isPrivatePath("/")).toBe(false);
  });
});

describe("describeUserAgent", () => {
  it("summarizes common browsers", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
      ),
    ).toBe("Chrome di Android");
    expect(
      describeUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("Safari di iOS");
    expect(describeUserAgent(null)).toBe("Perangkat tidak dikenal");
  });
});
