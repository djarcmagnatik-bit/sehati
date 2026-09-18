import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import { type Env, getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { parseMailbox } from "@/lib/mail-address";

export type MailMessage = { to: string; subject: string; text: string };

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Development driver: every email becomes a JSON file in `directory`. */
export class FileMailer implements Mailer {
  constructor(private readonly directory: string) {}

  async send(message: MailMessage) {
    await mkdir(this.directory, { recursive: true });
    const file = path.join(this.directory, `${Date.now()}-${randomUUID()}.json`);
    await writeFile(file, JSON.stringify({ ...message, createdAt: new Date().toISOString() }, null, 2), "utf8");
  }
}

export type SmtpConfig = {
  host: string;
  port: number;
  /** Implicit TLS (port 465). When false the connection must upgrade with STARTTLS. */
  secure: boolean;
  user: string;
  password: string;
  from: string;
  timeouts?: { connectionMs?: number; greetingMs?: number; socketMs?: number };
  /** Tests only: allows a plaintext fake server. Never set from the environment. */
  allowPlaintext?: boolean;
};

/** Sends through an authenticated SMTP server (e.g. the domain's cPanel mailbox). */
export class SmtpMailer implements Mailer {
  private readonly transport: Transporter;
  private readonly from: { name: string; address: string };

  constructor(config: SmtpConfig) {
    const from = parseMailbox(config.from);
    if (!from) throw new Error("MAIL_FROM is not a valid address");
    this.from = { name: from.name ?? "", address: from.address };
    this.transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      // Refuse to authenticate or send over an unencrypted connection.
      requireTLS: !config.secure && !config.allowPlaintext,
      ignoreTLS: Boolean(config.allowPlaintext),
      auth: { user: config.user, pass: config.password },
      tls: { minVersion: "TLSv1.2", servername: config.host },
      // Generous: some shared-hosting Exim servers take 7–12 s before their TLS greeting.
      connectionTimeout: config.timeouts?.connectionMs ?? 30_000,
      greetingTimeout: config.timeouts?.greetingMs ?? 30_000,
      socketTimeout: config.timeouts?.socketMs ?? 60_000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      headers: { "Auto-Submitted": "auto-generated" },
    });
  }

  /** Connects and authenticates without sending anything. */
  async verify(): Promise<void> {
    await this.transport.verify();
  }

  close(): void {
    this.transport.close();
  }
}

export function createMailer(env: Env): Mailer {
  if (env.MAIL_DRIVER === "smtp") {
    return new SmtpMailer({
      host: env.SMTP_HOST!,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE ? env.SMTP_SECURE === "true" : env.SMTP_PORT === 465,
      user: env.SMTP_USER!,
      password: env.SMTP_PASSWORD!,
      from: env.MAIL_FROM!,
    });
  }
  if (env.NODE_ENV === "production") logger.warn("mail.file_driver_in_production", { driver: env.MAIL_DRIVER });
  return new FileMailer(path.resolve(env.MAIL_FILE_DIR));
}

let cached: Mailer | undefined;

export function getMailer(): Mailer {
  cached ??= createMailer(getEnv());
  return cached;
}
