import { expect, test } from "@playwright/test";
import { registerAndOnboard } from "./helpers";

const money = (digits: string) => new RegExp(`Rp\\s${digits.replace(/\./g, "\\.")}$`);

test("budget: allocate, record a contract and its DP, totals stay correct", async ({ page }) => {
  test.setTimeout(120_000);
  await registerAndOnboard(page);

  // Budget overview uses the target from onboarding.
  await page.goto("/budget");
  await expect(page.getByRole("heading", { level: 1, name: "Budget" })).toBeVisible();
  await expect(page.getByTestId("budget-target")).toHaveText(money("100.000.000"));

  // Allocate Rp35.000.000 to Catering.
  await page.getByRole("link", { name: "Ubah Catering" }).click();
  // The overview also has an "Alokasi" field (add-category form): wait for the edit page first.
  await expect(page).toHaveURL(/\/budget\/categories\/[\w-]+$/);
  await expect(page.getByRole("heading", { level: 1, name: "Ubah kategori" })).toBeVisible();
  await page.getByLabel(/^Alokasi/).fill("35.000.000");
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page).toHaveURL(/\/budget\?notice=category_updated$/);
  await expect(page.getByTestId("budget-allocated")).toHaveText(money("35.000.000"));

  // Record the ABC Catering contract (validation failure first).
  await page.getByRole("link", { name: "+ Tambah pengeluaran" }).click();
  await page.getByRole("button", { name: "Simpan pengeluaran" }).click();
  await expect(page.getByText("Nama pengeluaran wajib diisi")).toBeVisible();
  await page.getByLabel(/^Nama pengeluaran/).fill("ABC Catering");
  await page.getByLabel(/^Kategori/).selectOption({ label: "Catering" });
  await page.getByLabel(/^Total biaya/).fill("30.000.000");
  await page.getByRole("button", { name: "Simpan pengeluaran" }).click();
  await expect(page).toHaveURL(/\/budget\/expenses\/[\w-]+\?notice=expense_created$/);
  await expect(page.getByTestId("expense-outstanding")).toHaveText(money("30.000.000"));

  // Overpayment is rejected; the DP is recorded.
  await page.getByLabel(/^Nominal pembayaran/).fill("35.000.000");
  await page.getByRole("button", { name: "Catat pembayaran" }).click();
  await expect(page.getByText(/Melebihi sisa tagihan/)).toBeVisible();
  await page.getByLabel(/^Nominal pembayaran/).fill("10.000.000");
  await page.getByLabel(/^Referensi/).fill("DP-001");
  await page.getByRole("button", { name: "Catat pembayaran" }).click();
  await expect(page.getByText(/Pembayaran Rp\s10\.000\.000 dicatat\./)).toBeVisible();
  await expect(page.getByTestId("expense-paid")).toHaveText(money("10.000.000"));
  await expect(page.getByTestId("expense-outstanding")).toHaveText(money("20.000.000"));

  // Dashboard reflects the same numbers.
  await page.goto("/dashboard");
  await expect(page.getByTestId("budget-committed")).toHaveText(money("30.000.000"));
  await expect(page.getByTestId("budget-paid")).toHaveText(money("10.000.000"));
  await expect(page.getByTestId("budget-unpaid")).toHaveText(money("20.000.000"));
  await expect(page.getByTestId("budget-remaining")).toHaveText(money("70.000.000"));
  await expect(page.getByRole("link", { name: "ABC Catering" })).toBeVisible();

  // Deleting the payment recalculates everything.
  await page.getByRole("link", { name: "ABC Catering" }).click();
  await page.getByRole("button", { name: /^Hapus pembayaran/ }).click();
  await page.getByRole("button", { name: "Ya, hapus" }).click();
  await expect(page).toHaveURL(/notice=payment_deleted/);
  await expect(page.getByTestId("expense-paid")).toHaveText(money("0"));
  await expect(page.getByTestId("expense-outstanding")).toHaveText(money("30.000.000"));

  // Catering is at 30/35 = 85% of its allocation → warning.
  await page.goto("/budget");
  await expect(page.getByTestId("budget-paid")).toHaveText(money("0"));
  await expect(page.getByText("⚠ Mendekati batas")).toBeVisible();
});
