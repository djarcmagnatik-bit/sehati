import { expect, type Page } from "@playwright/test";
import { grantFullAccess } from "./test-db";

export const E2E_PASSWORD = "rahasia-aman-123";

export function futureIsoDate(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function uniqueEmail(prefix = "e2e"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

/**
 * Registers a fresh account and completes onboarding (Akad + Resepsi, KUA). Ends on the dashboard.
 * The workspace gets full access unless `access: "free"` is asked for.
 */
export async function registerAndOnboard(page: Page, options: { weddingInDays?: number; access?: "full" | "free" } = {}) {
  const email = uniqueEmail();

  await page.goto("/register");
  await page.getByLabel(/^Nama/).fill("Fajar");
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill(E2E_PASSWORD);
  await page.getByLabel(/^Konfirmasi password/).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Daftar" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);

  await page.getByLabel(/^Nama pasangan/).fill("Putri");
  await page.getByLabel(/^Nama mempelai wanita/).fill("Putri");
  await page.getByLabel(/^Nama mempelai pria/).fill("Fajar");
  await page.getByRole("button", { name: "Lanjut" }).click();

  await page.getByLabel(/^Tanggal pernikahan/).fill(futureIsoDate(options.weddingInDays ?? 400));
  await page.getByRole("button", { name: "Lanjut" }).click();

  await page.getByRole("radio", { name: /^Akad \+ Resepsi/ }).check();
  await page.getByRole("button", { name: "Lanjut" }).click();
  await page.getByRole("radio", { name: /^KUA/ }).check();
  await page.getByRole("button", { name: "Lanjut" }).click();

  await page.getByLabel(/^Target total budget/).fill("100.000.000");
  await page.getByRole("button", { name: "Lanjut" }).click();
  await page.getByRole("button", { name: "Buat workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  if (options.access !== "free") {
    await grantFullAccess(email.toLowerCase());
    await page.reload();
  }
  return { email };
}

/** Creates and publishes a minimal invitation at `slug`. Ends on /invitation. */
export async function createAndPublishInvitation(page: Page, slug: string): Promise<void> {
  await page.goto("/invitation");
  await page.getByRole("button", { name: "Buat undangan digital" }).click();
  await expect(page).toHaveURL(/\/invitation\?notice=created$/);

  await page.goto("/invitation/sections/couple");
  await page.getByLabel(/^Nama lengkap mempelai wanita/).fill("Putri Ayu");
  await page.getByLabel(/^Nama lengkap mempelai pria/).fill("Fajar Pratama");
  await page.getByRole("button", { name: "Simpan bagian" }).click();
  await expect(page.getByText("Bagian Mempelai disimpan.")).toBeVisible();

  await page.goto("/invitation/events/new");
  await page.getByLabel(/^Nama acara/).fill("Resepsi");
  await page.getByLabel(/^Tanggal/).fill(futureIsoDate(400));
  await page.getByLabel(/^Jam mulai/).fill("18:00");
  await page.getByRole("button", { name: "Simpan acara" }).click();
  await expect(page).toHaveURL(/\/invitation\/events\?notice=created$/);

  await page.goto("/invitation");
  await page.getByLabel(/^Alamat undangan/).fill(slug);
  await page.getByRole("button", { name: "Simpan pengaturan" }).click();
  await expect(page.getByText("Pengaturan undangan disimpan.")).toBeVisible();
  await page.getByRole("button", { name: "Terbitkan undangan" }).click();
  await expect(page.getByTestId("invitation-status")).toHaveText("Terbit");
}
