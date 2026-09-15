import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema, resetPasswordSchema } from "@/lib/validation/auth";
import { fieldErrorsFromZod } from "@/lib/validation/errors";

const validRegistration = {
  name: "Fajar",
  email: "fajar@example.com",
  password: "rahasia-aman-123",
  passwordConfirmation: "rahasia-aman-123",
};

function errorsOf(result: { success: boolean; error?: Parameters<typeof fieldErrorsFromZod>[0] }) {
  if (result.success || !result.error) throw new Error("expected validation failure");
  return fieldErrorsFromZod(result.error);
}

describe("registerSchema", () => {
  it("trims the name and normalizes the email", () => {
    const result = registerSchema.parse({ ...validRegistration, name: "  Fajar ", email: "  Fajar@Example.COM " });
    expect(result.name).toBe("Fajar");
    expect(result.email).toBe("fajar@example.com");
  });

  it("requires a valid email", () => {
    expect(errorsOf(registerSchema.safeParse({ ...validRegistration, email: "bukan-email" })).email).toEqual([
      "Format email tidak valid",
    ]);
    expect(errorsOf(registerSchema.safeParse({ ...validRegistration, email: "" })).email?.[0]).toBe("Email wajib diisi");
  });

  it("requires a password of at least 8 characters", () => {
    const errors = errorsOf(
      registerSchema.safeParse({ ...validRegistration, password: "1234567", passwordConfirmation: "1234567" }),
    );
    expect(errors.password).toEqual(["Password minimal 8 karakter"]);
  });

  it("rejects mismatched confirmation on the confirmation field", () => {
    const errors = errorsOf(registerSchema.safeParse({ ...validRegistration, passwordConfirmation: "berbeda-123" }));
    expect(errors.passwordConfirmation).toEqual(["Konfirmasi password tidak sama"]);
  });

  it("caps password length to protect the hasher", () => {
    const long = "a".repeat(129);
    const errors = errorsOf(registerSchema.safeParse({ ...validRegistration, password: long, passwordConfirmation: long }));
    expect(errors.password?.[0]).toContain("maksimal");
  });
});

describe("loginSchema", () => {
  it("accepts valid credentials", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x", remember: true }).success).toBe(true);
  });

  it("requires a password", () => {
    expect(errorsOf(loginSchema.safeParse({ email: "a@b.co", password: "", remember: false })).password).toEqual([
      "Password wajib diisi",
    ]);
  });
});

describe("resetPasswordSchema", () => {
  it("rejects a malformed token", () => {
    const errors = errorsOf(
      resetPasswordSchema.safeParse({ token: "short", password: "password-baru", passwordConfirmation: "password-baru" }),
    );
    expect(errors.token).toBeDefined();
  });
});
