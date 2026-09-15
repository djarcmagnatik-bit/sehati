import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

export type MailMessage = { to: string; subject: string; text: string };

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/**
 * Development driver: writes each email as a JSON file instead of sending it.
 * A real provider (SMTP / transactional API) must be added before production use.
 */
export class FileMailer implements Mailer {
  constructor(private readonly directory: string) {}

  async send(message: MailMessage): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const file = path.join(this.directory, `${Date.now()}-${randomUUID()}.json`);
    await writeFile(file, JSON.stringify({ ...message, createdAt: new Date().toISOString() }, null, 2), "utf8");
  }
}

export function getMailer(): Mailer {
  const env = getEnv();
  if (env.NODE_ENV === "production") {
    logger.warn("mail.file_driver_in_production", { driver: env.MAIL_DRIVER });
  }
  return new FileMailer(path.resolve(env.MAIL_FILE_DIR));
}
