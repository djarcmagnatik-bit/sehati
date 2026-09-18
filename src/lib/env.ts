import { z } from "zod";
import { parseMailbox } from "./mail-address";

/** Empty strings (as copied from .env.example) count as "not set". */
const optionalSecret = (min: number) =>
  z
    .string()
    .optional()
    .transform((value) => (value ? value : undefined))
    .refine((value) => value === undefined || value.length >= min, `must be at least ${min} characters`);

const optionalText = z
  .string()
  .optional()
  .transform((value) => (value && value.trim() !== "" ? value.trim() : undefined));

const emptyAsUnset = (value: unknown) => (value === "" ? undefined : value);

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().min(1),
    APP_URL: z.url().default("http://localhost:3000"),
    /** "file" writes emails as JSON to MAIL_FILE_DIR (development only); "smtp" sends them. */
    MAIL_DRIVER: z.enum(["file", "smtp"]).default("file"),
    MAIL_FILE_DIR: z.string().min(1).default(".data/mail"),
    SMTP_HOST: optionalText,
    SMTP_PORT: z.preprocess(emptyAsUnset, z.coerce.number().int().min(1).max(65535).default(465)),
    /** Implicit TLS. Defaults to true on port 465; any other port must upgrade with STARTTLS. */
    SMTP_SECURE: z.preprocess(emptyAsUnset, z.enum(["true", "false"]).optional()),
    SMTP_USER: optionalText,
    SMTP_PASSWORD: optionalSecret(1),
    /** Sender shown to recipients, e.g. `Sehati <sehati@example.com>`; must be allowed for SMTP_USER. */
    MAIL_FROM: optionalText,
    MEDIA_DRIVER: z.enum(["file"]).default("file"),
    MEDIA_FILE_DIR: z.string().min(1).default(".data/media"),
    /** "sandbox" simulates a hosted payment page locally; "midtrans" talks to Midtrans Snap. */
    PAYMENT_PROVIDER: z.enum(["sandbox", "midtrans"]).default("sandbox"),
    /** Signs sandbox webhooks. Required for the sandbox provider. */
    PAYMENT_SANDBOX_SECRET: optionalSecret(16),
    /** The sandbox lets anyone "pay" for free, so production must opt in explicitly (E2E only). */
    ALLOW_SANDBOX_PAYMENTS: z.enum(["true", "false"]).default("false"),
    MIDTRANS_SERVER_KEY: optionalSecret(1),
    MIDTRANS_IS_PRODUCTION: z.enum(["true", "false"]).default("false"),
    /** Enables POST /api/jobs/run for schedulers when no long-running worker is available. */
    JOBS_CRON_SECRET: optionalSecret(32),
    /**
     * Reverse proxies in front of the app that append to X-Forwarded-For (e.g. 1 for nginx or a load
     * balancer). 0 ignores forwarding headers: per-IP limits then share one bucket.
     */
    TRUSTED_PROXY_COUNT: z.coerce.number().int().min(0).max(5).default(1),
  })
  .superRefine((env, context) => {
    if (env.MAIL_DRIVER !== "smtp") return;
    for (const name of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "MAIL_FROM"] as const) {
      if (!env[name]) context.addIssue({ code: "custom", path: [name], message: "is required when MAIL_DRIVER is smtp" });
    }
    if (env.MAIL_FROM && !parseMailbox(env.MAIL_FROM)) {
      context.addIssue({ code: "custom", path: ["MAIL_FROM"], message: "must be an address or `Name <address>`" });
    }
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Parses an environment. The error names the offending variables only — never their values. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))].join(", ");
    throw new Error(`Invalid environment configuration: ${names}`);
  }
  return parsed.data;
}

/** Validated server environment. Parsed lazily so `next build` does not require runtime secrets. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
