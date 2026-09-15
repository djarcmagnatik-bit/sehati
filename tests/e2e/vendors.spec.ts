import { expect, test, type Page } from "@playwright/test";
import { registerAndOnboard } from "./helpers";

const money = (digits: string) => new RegExp(`Rp\\s${digits.replace(/\./g, "\\.")}$`);

async function addCandidate(page: Page, data: { name: string; price: string; rating: string }) {
  await page.goto("/vendors/research/new");
  await expect(page.getByRole("heading", { level: 1, name: "Tambah kandidat vendor" })).toBeVisible();
  await page.getByLabel(/^Nama vendor/).fill(data.name);
  await page.getByLabel(/^Kategori/).selectOption({ label: "Catering" });
  await page.getByLabel(/^Status/).selectOption({ label: "Kandidat kuat" });
  await page.getByLabel(/^Estimasi harga/).fill(data.price);
  await page.getByLabel(/^Rating/).selectOption(data.rating);
}

test("vendors: research, compare, select, book and pay", async ({ page }) => {
  test.setTimeout(150_000);
  await registerAndOnboard(page);

  // Candidate 1 — unsafe website rejected, then saved.
  await addCandidate(page, { name: "ABC Catering", price: "30.000.000", rating: "4" });
  await page.getByLabel(/^WhatsApp/).fill("0812-3456-7890");
  await page.getByLabel(/^Kelebihan/).fill("Rasa enak");
  await page.getByLabel(/^Website/).fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Simpan kandidat" }).click();
  await expect(page.getByText(/Alamat website tidak valid/)).toBeVisible();
  await page.getByLabel(/^Website/).fill("abccatering.id");
  await page.getByRole("button", { name: "Simpan kandidat" }).click();
  await expect(page).toHaveURL(/\/vendors\/research\?notice=created$/);

  // Candidate 2.
  await addCandidate(page, { name: "XYZ Catering", price: "25.000.000", rating: "3" });
  await page.getByRole("button", { name: "Simpan kandidat" }).click();
  await expect(page).toHaveURL(/\/vendors\/research\?notice=created$/);

  // Compare both.
  await page.getByLabel("Bandingkan ABC Catering").check();
  await page.getByLabel("Bandingkan XYZ Catering").check();
  await page.getByRole("button", { name: "Bandingkan terpilih" }).click();
  await expect(page).toHaveURL(/\/vendors\/research\/compare\?ids=/);
  const table = page.getByRole("table", { name: "Perbandingan kandidat vendor" });
  await expect(table.getByRole("columnheader", { name: /ABC Catering/ })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: /XYZ Catering/ })).toBeVisible();
  await expect(table.getByText("Termurah")).toBeVisible();

  // Choose ABC and book it with a Rp30jt contract (budget category pre-selected: Catering).
  await table.getByRole("link", { name: "Pilih vendor ini ABC Catering" }).click();
  await expect(page).toHaveURL(/\/vendors\/research\/[\w-]+#booking$/);
  await expect(page.getByRole("heading", { level: 1, name: "ABC Catering" })).toBeVisible();
  await page.getByLabel(/^Nilai kontrak/).fill("30.000.000");
  await page.getByRole("button", { name: "Pilih & booking vendor ini" }).click();

  await expect(page).toHaveURL(/\/vendors\/[\w-]+\?notice=booked$/);
  await expect(page.getByTestId("vendor-detail-contract")).toHaveText(money("30.000.000"));
  await expect(page.getByTestId("vendor-detail-outstanding")).toHaveText(money("30.000.000"));
  await expect(page.getByRole("link", { name: /^WhatsApp/ })).toHaveAttribute("href", "https://wa.me/6281234567890");
  await expect(page.getByRole("link", { name: "Website" })).toHaveAttribute("href", "https://abccatering.id/");
  await expect(page.getByText("Rasa enak")).toBeVisible(); // research notes preserved

  // Pay the DP from the linked expense.
  await page.getByRole("link", { name: "Kontrak ABC Catering" }).click();
  await page.getByLabel(/^Nominal pembayaran/).fill("10.000.000");
  await page.getByRole("button", { name: "Catat pembayaran" }).click();
  await expect(page.getByText(/Pembayaran Rp\s10\.000\.000 dicatat\./)).toBeVisible();
  await page.getByRole("link", { name: "ABC Catering", exact: true }).click();
  await expect(page.getByTestId("vendor-detail-paid")).toHaveText(money("10.000.000"));
  await expect(page.getByTestId("vendor-detail-outstanding")).toHaveText(money("20.000.000"));

  // Vendor list and dashboard agree.
  await page.goto("/vendors");
  await expect(page.getByTestId("vendors-booked")).toHaveText("1");
  await expect(page.getByTestId("vendors-researching")).toHaveText("1");
  await expect(page.getByTestId("vendors-outstanding")).toHaveText(money("20.000.000"));
  await page.goto("/dashboard");
  await expect(page.getByTestId("dashboard-vendors-booked")).toHaveText("1");
  await expect(page.getByTestId("dashboard-vendors-outstanding")).toHaveText(money("20.000.000"));

  // The selected candidate shows as "Dipilih" in research.
  await page.goto("/vendors/research");
  await page.getByRole("link", { name: "ABC Catering", exact: true }).click();
  await expect(page.getByText("Kandidat ini sudah dipilih sebagai vendor.")).toBeVisible();
});
