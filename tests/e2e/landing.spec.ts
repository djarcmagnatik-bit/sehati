import { expect, test } from "./fixtures";

test("landing page explains the product, its plans and how to start", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Nikahnya seru, ngurusnya nggak harus ribet.");
  for (const heading of [
    "Kamu urus vendor, dia urus tamu. Dua-duanya tetap update.",
    "Bye catatan tercecer, spreadsheet ruwet, dan chat yang tenggelam.",
    "Undangan yang nyapa tamu pakai namanya.",
    "Mulai gratis, upgrade pas udah siap.",
    "Yang sering ditanyain",
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
  await expect(page.getByRole("link", { name: /contoh undangan/ })).toHaveCount(0);

  // FAQ answers open without JavaScript (details/summary).
  await page.locator("summary", { hasText: "Sehati gratis?" }).click();
  await expect(page.getByText(/fitur dasar \(checklist, kalender, tabungan, pengingat\) gratis/)).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

  await page.getByRole("link", { name: "Mulai gratis" }).first().click();
  await expect(page).toHaveURL(/\/register$/);
});
