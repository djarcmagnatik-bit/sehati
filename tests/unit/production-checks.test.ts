import { describe, expect, it } from "vitest";
import { checkProductionEnv } from "@/lib/production-checks";

const READY = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://app@db.internal/wedding",
  DATABASE_URL_TEST: "postgresql://app@db.internal/wedding_test",
  APP_URL: "https://sehati.example",
  PAYMENT_PROVIDER: "midtrans",
  MIDTRANS_SERVER_KEY: "server-key",
  MIDTRANS_IS_PRODUCTION: "true",
  MAIL_DRIVER: "smtp",
  SMTP_HOST: "mail.sehati.example",
  SMTP_PORT: "465",
  SMTP_USER: "halo@sehati.example",
  SMTP_PASSWORD: "mail-password",
  MAIL_FROM: "Sehati <halo@sehati.example>",
  TRUSTED_PROXY_COUNT: "1",
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: "k",
  JOBS_CRON_SECRET: "s".repeat(32),
};

const variables = (env: Record<string, string | undefined>, level: "error" | "warning") =>
  checkProductionEnv(env)
    .filter((result) => result.level === level)
    .map((result) => result.variable);

describe("production environment checks", () => {
  it("passes a fully configured environment", () => {
    expect(checkProductionEnv(READY)).toEqual([]);
  });

  it("blocks unsafe or incomplete configuration", () => {
    expect(variables({ ...READY, APP_URL: "http://sehati.example" }, "error")).toEqual(["APP_URL"]);
    expect(variables({ ...READY, APP_URL: "https://localhost:3000" }, "error")).toEqual(["APP_URL"]);
    expect(variables({ ...READY, DATABASE_URL: READY.DATABASE_URL_TEST }, "error")).toEqual(["DATABASE_URL"]);
    expect(variables({ ...READY, MIDTRANS_SERVER_KEY: "" }, "error")).toEqual(["MIDTRANS_SERVER_KEY"]);
    expect(variables({ ...READY, PAYMENT_PROVIDER: "sandbox", ALLOW_SANDBOX_PAYMENTS: "true" }, "error")).toEqual(["ALLOW_SANDBOX_PAYMENTS"]);
    expect(variables({ ...READY, NODE_ENV: "development" }, "error")).toEqual(["NODE_ENV"]);
  });

  it("requires a complete SMTP configuration", () => {
    expect(variables({ ...READY, SMTP_HOST: "", SMTP_PASSWORD: undefined }, "error")).toEqual(["SMTP_HOST", "SMTP_PASSWORD"]);
    expect(variables({ ...READY, MAIL_FROM: "Sehati <not-an-address>" }, "error")).toEqual(["MAIL_FROM"]);
    expect(variables({ ...READY, MAIL_FROM: "Sehati <halo@sehati.example>\r\nBcc: x@y.example" }, "error")).toEqual(["MAIL_FROM"]);
    expect(variables({ ...READY, SMTP_SECURE: "false" }, "error")).toEqual(["SMTP_SECURE"]);
    expect(variables({ ...READY, SMTP_PORT: "587", SMTP_SECURE: "false" }, "error")).toEqual([]);
    expect(variables({ ...READY, MAIL_DRIVER: "sendgrid" }, "error")).toEqual(["MAIL_DRIVER"]);
    expect(variables({ ...READY, MAIL_FROM: "halo@sehati.example" }, "warning")).toEqual([]);
    expect(variables({ ...READY, MAIL_FROM: "Sehati <noreply@other.example>" }, "warning")).toEqual(["MAIL_FROM"]);
  });

  it("warns about decisions the operator must make", () => {
    expect(variables({ ...READY, MAIL_DRIVER: "file" }, "warning")).toEqual(["MAIL_DRIVER"]);
    expect(variables({ ...READY, PAYMENT_PROVIDER: "sandbox" }, "warning")).toEqual(["PAYMENT_PROVIDER"]);
    expect(variables({ ...READY, MIDTRANS_IS_PRODUCTION: "false" }, "warning")).toEqual(["MIDTRANS_IS_PRODUCTION"]);
    expect(variables({ ...READY, NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: undefined, JOBS_CRON_SECRET: undefined }, "warning")).toEqual([
      "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
      "JOBS_CRON_SECRET",
    ]);
  });

  it("never echoes a value", () => {
    const output = JSON.stringify(checkProductionEnv({ ...READY, APP_URL: "http://secret-host.example", MIDTRANS_SERVER_KEY: "", SMTP_HOST: "" }));
    expect(output).not.toContain("secret-host");
    expect(output).not.toContain("postgresql://");
    expect(output).not.toContain("mail-password");
    expect(output).not.toContain("halo@sehati.example");
  });
});
