import { expect, test } from "./fixtures";

test("landing page explains the product, its plans and how to start", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Siapkan pernikahan bersama pasangan");
  for (const heading of [
    "Satu mengurus vendor, satu mengurus tamu. Keduanya tetap tahu semuanya.",
    "Semua yang biasanya tercecer di catatan, spreadsheet, dan grup chat.",
    "Undangan yang menyapa tamu dengan namanya.",
    "Mulai gratis. Buka semua fitur saat kalian siap.",
    "Pertanyaan yang sering muncul",
  ]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }

  // Plans: free features and the paid plan with its price from the database.
  const pricing = page.locator("#harga");
  await expect(pricing.getByRole("heading", { name: "Gratis", exact: true })).toBeVisible();
  await expect(pricing.getByText(/Rp\s?\d{1,3}(\.\d{3})+/).first()).toBeVisible();
  await expect(pricing.getByText("Kolaborasi pasangan")).toBeVisible();

  // Paid features are labelled before anyone signs up.
  await expect(page.locator("#fitur").getByText("Gratis", { exact: true })).toHaveCount(1);

  // No example invitation is configured in the test environment, so no dead link is shown.
  await expect(page.getByRole("link", { name: "Lihat contoh undangan" })).toHaveCount(0);

  // FAQ answers open without JavaScript (details/summary).
  await page.getByText("Apakah Sehati gratis?").click();
  await expect(page.getByText(/fitur dasar \(checklist, kalender, tabungan, pengingat\) gratis/)).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

  await page.getByRole("link", { name: "Mulai gratis" }).first().click();
  await expect(page).toHaveURL(/\/register$/);
});
