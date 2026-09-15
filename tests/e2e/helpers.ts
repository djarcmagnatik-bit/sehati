import { expect, type Page } from "@playwright/test";

export const E2E_PASSWORD = "rahasia-aman-123";

export function futureIsoDate(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function uniqueEmail(prefix = "e2e"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

/** Registers a fresh account and completes onboarding (Akad + Resepsi, KUA). Ends on the dashboard. */
export async function registerAndOnboard(page: Page, options: { weddingInDays?: number } = {}) {
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

  return { email };
}
