import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "./fixtures";
import { E2E_PASSWORD, uniqueEmail } from "./helpers";

// Matches MAIL_FILE_DIR in playwright.config.ts (file driver).
const MAIL_DIR = path.resolve(".data/mail-e2e");
const SENT = "Jika email tersebut terdaftar, kami telah mengirim tautan untuk mengatur ulang password.";

async function resetLinkFor(email: string): Promise<string | null> {
  const files = await readdir(MAIL_DIR).catch(() => [] as string[]);
  for (const file of files) {
    const mail = JSON.parse(await readFile(path.join(MAIL_DIR, file), "utf8")) as { to: string; text: string };
    if (mail.to === email) return /https?:\/\/\S+\/reset-password\?token=\S+/.exec(mail.text)?.[0] ?? null;
  }
  return null;
}

test("forgot password → email sent after the response → new password works", async ({ page }) => {
  const email = uniqueEmail("reset");
  const newPassword = "password-baru-456";

  await page.goto("/register");
  await page.getByLabel(/^Nama/).fill("Fajar");
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill(E2E_PASSWORD);
  await page.getByLabel(/^Konfirmasi password/).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Daftar" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.context().clearCookies();

  // An unknown address gets exactly the same answer.
  await page.goto("/forgot-password");
  await page.getByLabel(/^Email/).fill(uniqueEmail("nobody"));
  await page.getByRole("button", { name: "Kirim tautan reset" }).click();
  await expect(page.getByText(SENT)).toBeVisible();

  await page.goto("/forgot-password");
  await page.getByLabel(/^Email/).fill(email);
  await page.getByRole("button", { name: "Kirim tautan reset" }).click();
  await expect(page.getByText(SENT)).toBeVisible();

  // The email is written by after(), once the response has been sent.
  await expect.poll(() => resetLinkFor(email), { timeout: 15_000 }).not.toBeNull();
  const link = (await resetLinkFor(email))!;
  expect(link.startsWith("http://localhost:3100/reset-password?token=")).toBe(true);

  await page.goto(link);
  await page.getByLabel(/^Password baru/).fill(newPassword);
  await page.getByLabel(/^Konfirmasi password baru/).fill(newPassword);
  await page.getByRole("button", { name: "Simpan password baru" }).click();
  await expect(page).toHaveURL(/\/login\?reset=1$/);

  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill(newPassword);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);

  // The link is single-use.
  await page.context().clearCookies();
  await page.goto(link);
  await expect(page.getByRole("link", { name: /tautan baru|Minta/i })).toBeVisible();
});
