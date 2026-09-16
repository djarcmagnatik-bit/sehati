import { expect, test } from "./fixtures";
import { registerAndOnboard } from "./helpers";

const IMPORT_CSV =
  "Nama,Nama Undangan,Telepon,Grup,Kursi\r\n" +
  "Budi Santoso,Keluarga Bapak Budi,0813-1111-2222,Kantor Lama,4\r\n" +
  "Rina Lestari,Rina Lestari,0814-3333-4444,Teman,2\r\n" +
  ",,0815-5555-6666,Teman,1\r\n";

test("guests: add, RSVP, bulk status, groups and CSV import", async ({ page }) => {
  test.setTimeout(150_000);
  await registerAndOnboard(page);

  // Satu undangan untuk 5 orang (contoh PRD).
  await page.goto("/guests");
  await page.getByRole("link", { name: "+ Tambah tamu" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Tambah tamu" })).toBeVisible();
  await page.getByLabel(/^Nama tamu/).fill("Ahmad Fauzi");
  await page.getByLabel(/^Nama di undangan/).fill("Keluarga Bapak Ahmad");
  await page.getByLabel(/^Grup/).selectOption({ label: "Keluarga Mempelai Pria" });
  await page.getByLabel(/^Jumlah kursi/).fill("5");
  await page.getByLabel(/^Telepon/).fill("0812-3456-7890");
  await page.getByRole("button", { name: "Simpan tamu" }).click();
  await expect(page).toHaveURL(/\/guests\?notice=created$/);

  await expect(page.getByTestId("guests-invitations")).toHaveText("1");
  await expect(page.getByTestId("guests-seats")).toHaveText("5");
  await expect(page.getByTestId("guests-pending")).toHaveText("1");

  // Kirim undangan lewat aksi massal.
  await page.getByLabel("Pilih Keluarga Bapak Ahmad").check();
  await page.getByLabel("Ubah status undangan terpilih").selectOption({ label: "Terkirim" });
  await page.getByRole("button", { name: "Terapkan ke terpilih" }).click();
  await expect(page.getByText("Status 1 undangan diperbarui.")).toBeVisible();
  await expect(page.getByTestId("guests-invited")).toHaveText("1");

  // RSVP: 4 dari 5 kursi hadir.
  await page.getByRole("link", { name: "Keluarga Bapak Ahmad" }).click();
  await expect(page).toHaveURL(/\/guests\/[\w-]+$/);
  await page.getByLabel(/^Status RSVP/).selectOption({ label: "Hadir" });
  await page.getByLabel(/^Jumlah hadir/).fill("6");
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page.getByText(/Jumlah hadir tidak boleh melebihi 5 kursi/)).toBeVisible();
  await page.getByLabel(/^Jumlah hadir/).fill("4");
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page.getByText("Perubahan data tamu disimpan.")).toBeVisible();

  await page.goto("/guests");
  await expect(page.getByTestId("guests-attending-invitations")).toHaveText("1");
  await expect(page.getByTestId("guests-attending-seats")).toHaveText("4");

  // Impor CSV: pratinjau dulu, tanpa menyimpan apa pun.
  await page.getByRole("link", { name: "Impor CSV/XLSX" }).click();
  await page.getByLabel(/^File tamu/).setInputFiles({ name: "daftar-tamu.csv", mimeType: "text/csv", buffer: Buffer.from(IMPORT_CSV) });
  await page.getByRole("button", { name: "Pratinjau impor" }).click();
  await expect(page).toHaveURL(/\/guests\/import\/[\w-]+$/);
  await expect(page.getByTestId("import-total")).toHaveText("3");
  await expect(page.getByTestId("import-valid")).toHaveText("2");
  await expect(page.getByTestId("import-invalid")).toHaveText("1");
  await expect(page.getByTestId("import-seats")).toHaveText("6");
  await expect(page.getByText("Grup baru yang akan dibuat: Kantor Lama")).toBeVisible();
  await expect(page.getByText("Nama wajib diisi")).toBeVisible();

  await page.getByRole("button", { name: "Impor 2 undangan" }).click();
  await expect(page).toHaveURL(/\/guests\?notice=imported&count=2$/);
  await expect(page.getByText("2 undangan tamu berhasil diimpor.")).toBeVisible();
  await expect(page.getByTestId("guests-invitations")).toHaveText("3");
  await expect(page.getByTestId("guests-seats")).toHaveText("11");

  // Filter RSVP dan pencarian.
  await page.getByRole("link", { name: "Hadir", exact: true }).click();
  await expect(page.getByRole("link", { name: "Keluarga Bapak Ahmad" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Rina Lestari" })).toHaveCount(0);
  await page.goto("/guests");
  await page.getByLabel("Cari tamu").fill("rina");
  await page.getByRole("button", { name: "Terapkan", exact: true }).click();
  await expect(page.getByRole("link", { name: "Rina Lestari" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Keluarga Bapak Ahmad" })).toHaveCount(0);

  // Grup: grup baru dari impor ada, dan menghapusnya tidak menghapus tamunya.
  await page.goto("/guests/groups");
  await expect(page.getByRole("link", { name: "Kantor Lama" })).toBeVisible();
  await page.getByRole("button", { name: "Hapus grup Kantor Lama" }).click();
  await page.getByRole("button", { name: "Ya, hapus grup" }).click();
  await expect(page.getByText("Grup dihapus. Tamu di dalamnya kini tanpa grup.")).toBeVisible();
  await page.goto("/guests");
  await expect(page.getByTestId("guests-invitations")).toHaveText("3");
  await expect(page.getByRole("link", { name: "Keluarga Bapak Budi" })).toBeVisible();

  // Dashboard memakai angka yang sama.
  await page.goto("/dashboard");
  await expect(page.getByTestId("dashboard-guests-invitations")).toHaveText("3");
  await expect(page.getByTestId("dashboard-guests-seats")).toHaveText("11");
  await expect(page.getByTestId("dashboard-guests-attending-seats")).toHaveText("4");
});

test("guests: navigation reaches the guest list on mobile and desktop", async ({ page, isMobile }) => {
  await registerAndOnboard(page);
  await page.getByRole("navigation", { name: "Navigasi utama" }).getByRole("link", { name: "Tamu" }).click();
  await expect(page).toHaveURL(/\/guests$/);
  await expect(page.getByRole("heading", { level: 1, name: "Tamu" })).toBeVisible();

  if (!isMobile) return;

  // Vendor pindah ke halaman "Lainnya" di layar kecil.
  await page.getByRole("navigation", { name: "Navigasi utama" }).getByRole("link", { name: "Lainnya" }).click();
  await expect(page).toHaveURL(/\/more$/);
  await page.getByRole("link", { name: /^Vendor/ }).click();
  await expect(page).toHaveURL(/\/vendors$/);

  // Halaman yang lebih lebar dari layar memaksa Chrome memperkecil halaman (layout viewport
  // jadi lebih besar dari 412px), jadi lebar layout dipakai sebagai penjaga regresi.
  for (const path of ["/dashboard", "/guests", "/guests/import", "/more"]) {
    await page.goto(path);
    expect(await page.evaluate(() => window.innerWidth), `${path} melebihi lebar layar`).toBe(412);
  }
});
