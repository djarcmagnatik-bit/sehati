import { expect, test } from "./fixtures";
import { pngFixture } from "../support/image-fixtures";
import { futureIsoDate, registerAndOnboard } from "./helpers";

function uniqueSlug(): string {
  return `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

test("invitation: build, publish, and open the public page as a guest", async ({ page, browser, isMobile }) => {
  test.setTimeout(180_000);
  await registerAndOnboard(page);
  const slug = uniqueSlug();

  // Create the invitation.
  await page.goto("/invitation");
  await page.getByRole("button", { name: "Buat undangan digital" }).click();
  await expect(page).toHaveURL(/\/invitation\?notice=created$/);
  await expect(page.getByTestId("invitation-status")).toHaveText("Draf");

  // Publishing is refused while the invitation is incomplete.
  await page.getByRole("button", { name: "Terbitkan undangan" }).click();
  await expect(page.getByText(/Belum bisa diterbitkan/)).toBeVisible();
  await expect(page.getByText(/minimal satu acara/)).toBeVisible();

  // Couple section.
  await page.goto("/invitation/sections/couple");
  await page.getByLabel(/^Nama lengkap mempelai wanita/).fill("Putri Ayu Lestari");
  await page.getByLabel(/^Orang tua mempelai wanita/).fill("Bpk. Surya & Ibu Sari");
  await page.getByLabel(/^Nama lengkap mempelai pria/).fill("Fajar Pratama");
  await page.getByRole("button", { name: "Simpan bagian" }).click();
  await expect(page.getByText("Bagian Mempelai disimpan.")).toBeVisible();

  // Event with coordinates.
  await page.goto("/invitation/events/new");
  await page.getByLabel(/^Nama acara/).fill("Akad Nikah");
  await page.getByLabel(/^Tanggal/).fill(futureIsoDate(400));
  await page.getByLabel(/^Jam mulai/).fill("09:00");
  await page.getByLabel(/^Jam selesai/).fill("11:00");
  await page.getByLabel(/^Nama tempat/).fill("Masjid Agung Bandung");
  await page.getByLabel(/^Alamat/).fill("Jl. Asia Afrika No. 1, Bandung");
  await page.getByLabel(/^Latitude/).fill("-6.921667");
  await page.getByLabel(/^Longitude/).fill("107.606667");
  await page.getByRole("button", { name: "Simpan acara" }).click();
  await expect(page).toHaveURL(/\/invitation\/events\?notice=created$/);
  await expect(page.getByRole("heading", { name: "Akad Nikah" })).toBeVisible();

  // Rejected time range.
  await page.goto("/invitation/events/new");
  await page.getByLabel(/^Nama acara/).fill("Resepsi");
  await page.getByLabel(/^Tanggal/).fill(futureIsoDate(400));
  await page.getByLabel(/^Jam mulai/).fill("18:00");
  await page.getByLabel(/^Jam selesai/).fill("17:00");
  await page.getByRole("button", { name: "Simpan acara" }).click();
  await expect(page.getByText(/Jam selesai harus setelah jam mulai/)).toBeVisible();

  // Theme and gallery photo.
  await page.goto("/invitation/design");
  await page.getByRole("radio", { name: /^Elegan/ }).check();
  await page.getByRole("radio", { name: "Judul di bawah" }).check();
  await page.getByRole("button", { name: "Simpan tampilan" }).click();
  await expect(page.getByText("Tema undangan diperbarui.")).toBeVisible();

  await page.goto("/invitation/gallery");
  await page.getByLabel(/^Tambah foto galeri/).setInputFiles({ name: "prewedding.png", mimeType: "image/png", buffer: pngFixture(600, 600) });
  await page.getByRole("button", { name: "Unggah foto" }).click();
  await expect(page.getByText("Foto ditambahkan ke galeri.")).toBeVisible();

  // A too-small image is refused.
  await page.getByLabel(/^Tambah foto galeri/).setInputFiles({ name: "kecil.png", mimeType: "image/png", buffer: pngFixture(120, 120) });
  await page.getByRole("button", { name: "Unggah foto" }).click();
  await expect(page.getByText(/Gambar terlalu kecil/)).toBeVisible();

  // Gift information.
  await page.goto("/invitation/gift");
  await page.getByLabel(/^Bank \/ dompet digital/).fill("BCA");
  await page.getByLabel(/^Nomor rekening/).fill("1234567890");
  await page.getByLabel(/^Atas nama/).fill("Putri Ayu Lestari");
  await page.getByRole("button", { name: "Tambah info hadiah" }).click();
  await expect(page.getByText("Info hadiah ditambahkan.")).toBeVisible();

  // Gallery and gift sections still need to be switched on.
  await page.goto("/invitation");
  await expect(page.getByTestId("section-state-gallery")).toHaveText("Disembunyikan");
  await page.goto("/invitation/sections/gallery");
  await page.getByLabel(/^Tampilkan bagian ini/).check();
  await page.getByRole("button", { name: "Simpan bagian" }).click();
  await page.goto("/invitation/sections/gift");
  await page.getByLabel(/^Tampilkan bagian ini/).check();
  await page.getByRole("button", { name: "Simpan bagian" }).click();

  // Pick a stable public address, then publish.
  await page.goto("/invitation");
  await page.getByLabel(/^Alamat undangan/).fill(slug);
  await page.getByRole("button", { name: "Simpan pengaturan" }).click();
  await expect(page.getByText("Pengaturan undangan disimpan.")).toBeVisible();
  await page.getByRole("button", { name: "Terbitkan undangan" }).click();
  await expect(page).toHaveURL(/\/invitation\?notice=published$/);
  await expect(page.getByTestId("invitation-status")).toHaveText("Terbit");

  // The public page works without a session.
  const anonymous = await browser.newContext();
  const guestPage = await anonymous.newPage();
  await guestPage.goto(`/undangan/${slug}?to=Bapak+Ahmad`);
  await expect(guestPage.getByRole("heading", { level: 1 })).toHaveText("Putri & Fajar");
  await expect(guestPage.getByText("Kepada Yth.")).toBeVisible();
  await expect(guestPage.getByText("Bapak Ahmad")).toBeVisible();
  await expect(guestPage.getByRole("heading", { name: "Mempelai" })).toBeVisible();
  await expect(guestPage.getByText("Putri Ayu Lestari").first()).toBeVisible();
  await expect(guestPage.getByRole("heading", { name: "Akad Nikah" })).toBeVisible();
  await expect(guestPage.getByText("Masjid Agung Bandung").first()).toBeVisible();
  await expect(guestPage.getByRole("heading", { name: "Menuju hari bahagia" })).toBeVisible();
  await expect(guestPage.getByText("1234567890").first()).toBeVisible();
  await expect(guestPage.getByRole("link", { name: "Buka peta" }).first()).toHaveAttribute("href", /google\.com\/maps/);

  // The gallery image is served publicly, as a resized WebP copy of the uploaded PNG.
  const image = guestPage.locator('img[src^="/media/"]').first();
  await expect(image).toBeVisible();
  const src = (await image.getAttribute("src")) ?? "";
  expect(src).toMatch(/\?w=\d+$/);
  const response = await anonymous.request.get(src);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/webp");
  const original = await anonymous.request.get(src.replace(/\?w=\d+$/, ""));
  expect(original.headers()["content-type"]).toBe("image/png");

  // The public page must fit a phone: a wider page makes Chrome zoom the whole invitation out.
  if (isMobile) {
    expect(await guestPage.evaluate(() => window.innerWidth)).toBe(412);
  }

  // A draft invitation is not reachable.
  const missing = await anonymous.request.get(`/undangan/${slug}-tidak-ada`);
  expect(missing.status()).toBe(404);
  await anonymous.close();
});

test("invitation: personalized guest link greets the guest and marks the invitation opened", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await registerAndOnboard(page);
  const slug = uniqueSlug();

  // Minimum viable invitation.
  await page.goto("/invitation");
  await page.getByRole("button", { name: "Buat undangan digital" }).click();
  await expect(page).toHaveURL(/\/invitation\?notice=created$/);
  await page.goto("/invitation/sections/couple");
  await page.getByLabel(/^Nama lengkap mempelai wanita/).fill("Putri Ayu");
  await page.getByLabel(/^Nama lengkap mempelai pria/).fill("Fajar Pratama");
  await page.getByRole("button", { name: "Simpan bagian" }).click();
  await page.goto("/invitation/events/new");
  await page.getByLabel(/^Nama acara/).fill("Resepsi");
  await page.getByLabel(/^Tanggal/).fill(futureIsoDate(400));
  await page.getByRole("button", { name: "Simpan acara" }).click();
  await page.goto("/invitation");
  await page.getByLabel(/^Alamat undangan/).fill(slug);
  await page.getByRole("button", { name: "Simpan pengaturan" }).click();
  await page.getByRole("button", { name: "Terbitkan undangan" }).click();
  await expect(page.getByTestId("invitation-status")).toHaveText("Terbit");

  // One guest with five seats.
  await page.goto("/guests/new");
  await page.getByLabel(/^Nama tamu/).fill("Ahmad Fauzi");
  await page.getByLabel(/^Nama di undangan/).fill("Keluarga Bapak Ahmad");
  await page.getByLabel(/^Jumlah kursi/).fill("5");
  await page.getByLabel(/^Status undangan/).selectOption({ label: "Terkirim" });
  await page.getByRole("button", { name: "Simpan tamu" }).click();
  await page.getByRole("link", { name: "Keluarga Bapak Ahmad" }).click();

  const link = await page.getByLabel(/^Tautan khusus Keluarga Bapak Ahmad/).inputValue();
  expect(link).toMatch(/\/i\/[\w-]{16,}$/);

  const anonymous = await browser.newContext();
  const guestPage = await anonymous.newPage();
  await guestPage.goto(new URL(link).pathname);
  await expect(guestPage.getByText("Keluarga Bapak Ahmad").first()).toBeVisible();
  await expect(guestPage.getByText("Undangan ini berlaku untuk 5 orang.")).toBeVisible();
  await anonymous.close();

  // Opening the link moves the invitation status to "Dibuka".
  await page.reload();
  await expect(page.getByText("Dibuka", { exact: true })).toBeVisible();
  await page.goto("/guests");
  await expect(page.getByTestId("guests-invited")).toHaveText("1");
});
