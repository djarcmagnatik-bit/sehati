import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";
import { registerAndOnboard } from "./helpers";

test("reports: summaries, print views and downloads obey access", async ({ page, isMobile, browser }) => {
  test.setTimeout(180_000);
  await registerAndOnboard(page);

  // One guest whose name looks like a spreadsheet formula, and one contract.
  await page.goto("/guests/new");
  await page.getByLabel(/^Nama tamu/).fill("Iseng");
  await page.getByLabel(/^Nama di undangan/).fill("=HYPERLINK(\"http://evil.example\")");
  await page.getByLabel(/^Jumlah kursi/).fill("3");
  await page.getByRole("button", { name: "Simpan tamu" }).click();
  await expect(page).toHaveURL(/\/guests\?notice=created$/);

  await page.goto("/budget/expenses/new");
  await page.getByLabel(/^Nama pengeluaran/).fill("Gedung");
  await page.getByLabel(/^Kategori/).selectOption({ label: "Venue" });
  await page.getByLabel(/^Total biaya/).fill("40.000.000");
  await page.getByRole("button", { name: "Simpan pengeluaran" }).click();
  await expect(page).toHaveURL(/\/budget\/expenses\/[\w-]+\?notice=expense_created$/);

  // Overview.
  await page.goto("/more");
  await page.getByRole("link", { name: /Laporan & export/ }).click();
  await expect(page).toHaveURL(/\/reports$/);
  await expect(page.getByRole("heading", { level: 1, name: "Laporan" })).toBeVisible();
  await expect(page.getByTestId("report-tasks-total")).not.toHaveText("0");
  await expect(page.getByTestId("report-guests-invitations")).toHaveText("1");
  await expect(page.getByTestId("report-budget-committed")).toHaveText(/40\.000\.000/);

  // Guest report + CSV download: attachment, no caching, formula neutralized.
  await page.getByRole("link", { name: "Laporan & daftar tamu" }).click();
  await expect(page.getByTestId("guest-report-seats")).toHaveText("3");
  await expect(page.getByTestId("guest-report-list")).toContainText('=HYPERLINK("http://evil.example")');
  const csvDownload = page.waitForEvent("download");
  await page.getByRole("link", { name: "Unduh data tamu (CSV)" }).click();
  const csv = await csvDownload;
  expect(csv.suggestedFilename()).toMatch(/^sehati-tamu-\d{4}-\d{2}-\d{2}\.csv$/);
  const csvText = await readFile((await csv.path())!, "utf8");
  expect(csvText.startsWith("﻿Nama di undangan,")).toBe(true);
  expect(csvText).toContain(`"'=HYPERLINK(""http://evil.example"")"`);

  const xlsxResponse = await page.request.get("/exports/guests?format=xlsx");
  expect(xlsxResponse.status()).toBe(200);
  expect(xlsxResponse.headers()["content-type"]).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  expect(xlsxResponse.headers()["content-disposition"]).toMatch(/^attachment; filename="sehati-tamu-\d{4}-\d{2}-\d{2}\.xlsx"$/);
  expect(xlsxResponse.headers()["cache-control"]).toBe("private, no-store");
  expect((await xlsxResponse.body()).subarray(0, 2).toString()).toBe("PK");
  expect((await page.request.get("/exports/users?format=csv")).status()).toBe(404);
  expect((await page.request.get("/exports/guests?format=pdf")).status()).toBe(404);

  // Budget and vendor reports.
  await page.goto("/reports/budget");
  await expect(page.getByTestId("budget-report-committed")).toHaveText(/40\.000\.000/);
  await expect(page.getByTestId("budget-report-table")).toContainText("Venue");
  await page.goto("/reports/vendors");
  await expect(page.getByRole("heading", { level: 1, name: "Laporan vendor" })).toBeVisible();

  // Print view hides the app chrome.
  await page.emulateMedia({ media: "print" });
  await page.goto("/reports/guests");
  await expect(page.getByRole("button", { name: "Cetak" })).toBeHidden();
  await expect(page.getByTestId("notification-bell")).toBeHidden();
  await expect(page.getByTestId("guest-report-list")).toBeVisible();
  await page.emulateMedia({ media: "screen" });

  // Progress card: money only when chosen.
  await page.goto("/reports/share");
  const preview = page.getByTestId("progress-card-preview");
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth)).toBe(1080);
  expect(await preview.getAttribute("src")).toBe("/reports/share/image?set=1&checklist=1");
  await page.getByLabel(/Status budget/).check();
  await page.getByRole("button", { name: "Perbarui pratinjau" }).click();
  await expect(page).toHaveURL(/budget=1/);
  expect(await preview.getAttribute("src")).toBe("/reports/share/image?set=1&checklist=1&budget=1");
  const image = await page.request.get("/reports/share/image?set=1&checklist=1&budget=1");
  expect(image.headers()["content-type"]).toBe("image/png");
  expect(image.headers()["cache-control"]).toBe("private, no-store");
  const pngDownload = page.waitForEvent("download");
  await page.getByRole("link", { name: "Unduh PNG" }).click();
  expect((await pngDownload).suggestedFilename()).toBe("sehati-progres.png");

  if (isMobile) {
    await page.goto("/reports/guests");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  }

  // Signed out: exports and cards are not reachable.
  const anonymous = await browser.newContext();
  const anonymousPage = await anonymous.newPage();
  await anonymousPage.goto("/exports/guests?format=csv");
  await expect(anonymousPage).toHaveURL(/\/login\?next=%2Fexports%2Fguests%3Fformat%3Dcsv$/);
  await anonymous.close();
});

test("reports: a free workspace sees locked sections and cannot download paid data", async ({ page }) => {
  await registerAndOnboard(page, { access: "free" });
  await page.goto("/reports");
  await expect(page.getByTestId("report-tasks-total")).toBeVisible();
  await expect(page.getByText("Tamu & RSVP tersedia di Akses Penuh.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Unduh data tamu/ })).toHaveCount(0);

  await page.goto("/exports/guests?format=csv");
  await expect(page).toHaveURL(/\/billing\?feature=guests$/);
  await page.goto("/reports/budget");
  await expect(page).toHaveURL(/\/billing\?feature=budget$/);

  await page.goto("/reports/share");
  await expect(page.getByLabel(/RSVP tamu/)).toBeDisabled();
  await expect(page.getByLabel(/Status budget/)).toBeDisabled();
});
