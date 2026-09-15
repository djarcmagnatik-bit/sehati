import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/redirect";

describe("safeRedirectPath", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/settings/security?tab=sessions", "/settings/security?tab=sessions"],
    ["/onboarding#step-2", "/onboarding#step-2"],
  ])("allows internal path %j", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });

  it.each([
    "//evil.example",
    "https://evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "/\t/evil.example",
    "javascript:alert(1)",
    "dashboard",
    "",
  ])("falls back for unsafe target %j", (input) => {
    expect(safeRedirectPath(input)).toBe("/dashboard");
  });

  it("falls back for missing values and supports a custom fallback", () => {
    expect(safeRedirectPath(null)).toBe("/dashboard");
    expect(safeRedirectPath(undefined, "/onboarding")).toBe("/onboarding");
  });
});
