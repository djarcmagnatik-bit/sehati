import { z } from "zod";

/** Empty strings (as copied from .env.example) count as "not set". */
const optionalSecret = (min: number) =>
  z
    .string()
    .optional()
    .transform((value) => (value ? value : undefined))
    .refine((value) => value === undefined || value.length >= min, `must be at least ${min} characters`);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.url().default("http://localhost:3000"),
  MAIL_DRIVER: z.enum(["file"]).default("file"),
  MAIL_FILE_DIR: z.string().min(1).default(".data/mail"),
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
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Validated server environment. Parsed lazily so `next build` does not require runtime secrets. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Report variable names only — never values.
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))].join(", ");
    throw new Error(`Invalid environment configuration: ${names}`);
  }
  cached = parsed.data;
  return cached;
}
