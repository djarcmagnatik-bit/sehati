/** Deployment readiness rules for a production environment (pure; values are never echoed). */
import { parseMailbox } from "./mail-address";

export type CheckLevel = "error" | "warning";
export type CheckResult = { level: CheckLevel; variable: string; message: string };

type Env = Record<string, string | undefined>;

const set = (env: Env, name: string) => Boolean(env[name] && env[name]!.trim() !== "");

/**
 * Errors block a production start; warnings are decisions the operator must make knowingly.
 * Only variable names and rules appear in the output, never their values.
 */
export function checkProductionEnv(env: Env): CheckResult[] {
  const results: CheckResult[] = [];
  const error = (variable: string, message: string) => results.push({ level: "error", variable, message });
  const warning = (variable: string, message: string) => results.push({ level: "warning", variable, message });

  if (env["NODE_ENV"] !== "production") error("NODE_ENV", "must be production");
  if (!set(env, "DATABASE_URL")) error("DATABASE_URL", "is required");
  else if (env["DATABASE_URL"] === env["DATABASE_URL_TEST"]) error("DATABASE_URL", "must not be the test database");

  let appUrl: URL | null = null;
  try {
    appUrl = env["APP_URL"] ? new URL(env["APP_URL"]) : null;
  } catch {
    appUrl = null;
  }
  if (!appUrl) error("APP_URL", "must be the public URL of the app");
  else if (appUrl.protocol !== "https:") error("APP_URL", "must use https (secure cookies, HSTS, payment callbacks)");
  else if (["localhost", "127.0.0.1"].includes(appUrl.hostname)) error("APP_URL", "must not point at localhost");

  const provider = env["PAYMENT_PROVIDER"] ?? "sandbox";
  if (provider === "sandbox") {
    if (env["ALLOW_SANDBOX_PAYMENTS"] === "true") error("ALLOW_SANDBOX_PAYMENTS", "lets anyone unlock paid features for free; only for tests");
    else warning("PAYMENT_PROVIDER", "is sandbox: checkout is refused in production until a real provider is configured");
  } else if (provider === "midtrans") {
    const sandboxKey = env["MIDTRANS_SERVER_KEY"]?.trim().startsWith("SB-") ?? false;
    if (!set(env, "MIDTRANS_SERVER_KEY")) error("MIDTRANS_SERVER_KEY", "is required for Midtrans");
    else if (env["MIDTRANS_IS_PRODUCTION"] === "true" && sandboxKey) error("MIDTRANS_SERVER_KEY", "is a sandbox key (SB-…) but MIDTRANS_IS_PRODUCTION is true");
    if (env["MIDTRANS_IS_PRODUCTION"] !== "true") warning("MIDTRANS_IS_PRODUCTION", "is not true: payments go to the Midtrans sandbox");
  }

  const mailDriver = env["MAIL_DRIVER"] || "file";
  if (mailDriver === "file") {
    warning("MAIL_DRIVER", "is the development file driver: password-reset and partner-invite emails are written to disk, not sent");
  } else if (mailDriver === "smtp") {
    for (const name of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "MAIL_FROM"]) {
      if (!set(env, name)) error(name, "is required when MAIL_DRIVER is smtp");
    }
    const from = parseMailbox(env["MAIL_FROM"]);
    if (set(env, "MAIL_FROM") && !from) error("MAIL_FROM", "must be an address or `Name <address>`");
    else if (from && set(env, "SMTP_USER") && from.address !== env["SMTP_USER"]!.trim().toLowerCase()) {
      warning("MAIL_FROM", "differs from SMTP_USER: most servers reject or spam-flag a sender the account does not own");
    }
    const port = env["SMTP_PORT"] || "465";
    if (env["SMTP_SECURE"] === "false" && port === "465") error("SMTP_SECURE", "must not be false on port 465 (implicit TLS)");
  } else {
    error("MAIL_DRIVER", "must be file or smtp");
  }
  if (!env["TRUSTED_PROXY_COUNT"]) warning("TRUSTED_PROXY_COUNT", "not set; defaults to 1 reverse proxy in front of the app");
  if (!set(env, "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY")) {
    warning("NEXT_SERVER_ACTIONS_ENCRYPTION_KEY", "not set; required when more than one app instance runs behind a load balancer");
  }
  if (!set(env, "JOBS_CRON_SECRET")) warning("JOBS_CRON_SECRET", "not set; run `pnpm worker` as a separate process for notifications and reminders");
  return results;
}
