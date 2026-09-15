import { expect, test, type Page } from "@playwright/test";
import { futureIsoDate, registerAndOnboard } from "./helpers";

async function search(page: Page, query: string) {
  await page.getByLabel("Cari tugas").fill(query);
  await page.getByRole("button", { name: "Terapkan" }).click();
  await expect(page).toHaveURL(/[?&]q=/);
}

test("checklist: generated tasks, completion, custom task CRUD and date recalculation", async ({ page }) => {
  test.setTimeout(120_000);
  await registerAndOnboard(page, { weddingInDays: 400 });

  // Dashboard shows generated checklist progress
  const progress = page.getByText(/^0 dari \d+ tugas selesai$/);
  await expect(progress).toBeVisible();
  const total = Number((await progress.textContent())?.match(/dari (\d+)/)?.[1]);
  expect(total).toBeGreaterThan(50);

  await page.getByRole("link", { name: "Buka checklist" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Checklist" })).toBeVisible();
  await expect(page.getByText(`0 dari ${total} tugas selesai`)).toBeVisible();

  // Search + complete a KUA task (template tailored to the chosen marriage process)
  const kuaTitle = "Daftar nikah ke KUA";
  await search(page, kuaTitle);
  await expect(page.getByRole("link", { name: kuaTitle, exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Tandai selesai: ${kuaTitle}`, exact: true }).click();
  await expect(page.getByRole("link", { name: kuaTitle, exact: true })).toHaveCount(0);
  await expect(page.getByText(`1 dari ${total} tugas selesai`)).toBeVisible();

  // It appears under "Selesai" and can be reopened
  await page.getByRole("link", { name: "Selesai", exact: true }).click();
  await expect(page.getByRole("link", { name: kuaTitle, exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Tandai belum selesai: ${kuaTitle}`, exact: true }).click();
  await expect(page.getByRole("link", { name: kuaTitle, exact: true })).toHaveCount(0);
  await expect(page.getByText(`0 dari ${total} tugas selesai`)).toBeVisible();

  // Template tasks cannot be deleted
  await page.getByRole("link", { name: "Semua", exact: true }).click();
  await page.getByRole("link", { name: kuaTitle, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ubah tugas" })).toBeVisible();
  await expect(page.getByText(/Tugas dari template tidak bisa dihapus/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Hapus tugas" })).toHaveCount(0);

  // Create a custom task (validation failure first)
  await page.goto("/checklist/new");
  await page.getByRole("button", { name: "Simpan tugas" }).click();
  await expect(page.getByText("Judul tugas wajib diisi")).toBeVisible();
  await page.getByLabel(/^Judul tugas/).fill("Survei toko cincin kawin");
  await page.getByLabel(/^Kategori/).selectOption({ label: "Busana" });
  await page.getByLabel(/^Tenggat/).fill(futureIsoDate(30));
  await page.getByLabel(/^Prioritas/).selectOption({ label: "Tinggi" });
  await page.getByLabel(/^Penanggung jawab/).selectOption({ label: "Fajar" });
  await page.getByRole("button", { name: "Simpan tugas" }).click();
  await expect(page).toHaveURL(/\/checklist\?notice=created$/);
  await expect(page.getByText("Tugas ditambahkan.")).toBeVisible();
  await expect(page.getByText(`0 dari ${total + 1} tugas selesai`)).toBeVisible();

  // Edit it
  await search(page, "cincin kawin");
  await page.getByRole("link", { name: "Survei toko cincin kawin", exact: true }).click();
  await page.getByLabel(/^Judul tugas/).fill("Survei & pesan cincin kawin");
  await page.getByLabel(/^Status/).selectOption({ label: "Sedang dikerjakan" });
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page).toHaveURL(/notice=updated/);
  await expect(page.getByText("Perubahan tugas disimpan.")).toBeVisible();

  // Delete it (two-step confirmation)
  await search(page, "cincin kawin");
  await expect(page.getByText("Sedang dikerjakan")).toBeVisible();
  await page.getByRole("link", { name: "Survei & pesan cincin kawin", exact: true }).click();
  await page.getByRole("button", { name: "Hapus tugas" }).click();
  await page.getByRole("button", { name: "Ya, hapus" }).click();
  await expect(page).toHaveURL(/notice=deleted/);
  await expect(page.getByText(`0 dari ${total} tugas selesai`)).toBeVisible();

  // Change the wedding date: explicit recalculation choice is required
  await page.goto("/settings/wedding");
  await page.getByLabel(/^Tanggal pernikahan baru/).fill(futureIsoDate(300));
  await page.getByRole("button", { name: "Simpan tanggal" }).click();
  await expect(page.getByText("Pilih apakah tenggat checklist dihitung ulang")).toBeVisible();
  await page.getByLabel("Ya, hitung ulang tenggat").check();
  await page.getByRole("button", { name: "Simpan tanggal" }).click();
  await expect(page.getByText(/Tanggal pernikahan diperbarui menjadi .+\. \d+ tenggat tugas dihitung ulang\./)).toBeVisible();
});
