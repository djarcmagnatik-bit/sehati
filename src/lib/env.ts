import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.url().default("http://localhost:3000"),
  MAIL_DRIVER: z.enum(["file"]).default("file"),
  MAIL_FILE_DIR: z.string().min(1).default(".data/mail"),
  MEDIA_DRIVER: z.enum(["file"]).default("file"),
  MEDIA_FILE_DIR: z.string().min(1).default(".data/media"),
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
