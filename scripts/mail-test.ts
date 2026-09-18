/**
 * Checks the SMTP settings from .env: connects, authenticates and optionally sends one test email.
 *
 *   pnpm mail:test                       # connect + authenticate only
 *   pnpm mail:test -- --to you@example   # also send a test email
 *
 * Uses the SMTP_* and MAIL_FROM variables even when MAIL_DRIVER is still "file". The password is
 * never printed.
 */
import { config } from "dotenv";

config({ quiet: true });

const toIndex = process.argv.indexOf("--to");
const to = toIndex > -1 ? process.argv[toIndex + 1] : undefined;

async function main() {
  const [{ parseEnv }, { createMailer, SmtpMailer }] = await Promise.all([import("../src/lib/env"), import("../src/server/mail/mailer")]);
  const env = parseEnv({ ...process.env, MAIL_DRIVER: "smtp" });
  const secure = env.SMTP_SECURE ? env.SMTP_SECURE === "true" : env.SMTP_PORT === 465;
  console.log(`SMTP ${env.SMTP_HOST}:${env.SMTP_PORT} (${secure ? "implicit TLS" : "STARTTLS required"}), sender ${env.MAIL_FROM}`);

  const mailer = createMailer(env);
  if (!(mailer instanceof SmtpMailer)) throw new Error("SMTP driver not selected");
  const secret = env.SMTP_PASSWORD ?? "";
  try {
    await mailer.verify();
    console.log("OK   connected and authenticated");
    if (to) {
      await mailer.send({
        to,
        subject: "Tes email Sehati",
        text: [
          "Halo,",
          "",
          "Ini email uji dari aplikasi Sehati. Jika email ini sampai, pengaturan SMTP sudah benar.",
          `Dikirim: ${new Date().toISOString()}`,
        ].join("\n"),
      });
      console.log(`OK   test email accepted by the server for ${to} (check the inbox and the spam folder)`);
    } else {
      console.log("Add `-- --to <address>` to send a test email.");
    }
  } catch (error) {
    const details = error as { code?: string; responseCode?: number; command?: string; message?: string };
    const message = String(details.message ?? error);
    console.error(
      `FAIL ${[details.code, details.responseCode, details.command].filter(Boolean).join(" ")} ${secret ? message.replaceAll(secret, "***") : message}`,
    );
    process.exitCode = 1;
  } finally {
    mailer.close();
  }
}

main().catch((error: unknown) => {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
