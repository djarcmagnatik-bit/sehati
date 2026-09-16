import { expect, test } from "./fixtures";

function futureIsoDate(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test("register → onboarding → dashboard → couple note → logout → login", async ({ page }) => {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const password = "rahasia-aman-123";

  // Private pages require a session.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);

  // Register
  await page.goto("/register");
  await page.getByLabel(/^Nama/).fill("Fajar");
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByLabel(/^Konfirmasi password/).fill(password);
  await page.getByRole("button", { name: "Daftar" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);

  // Step 1 — validation failure path, then valid input
  await expect(page.getByRole("heading", { name: "Tentang kalian berdua" })).toBeVisible();
  await page.getByRole("button", { name: "Lanjut" }).click();
  await expect(page.getByText("Periksa kembali isian yang ditandai.")).toBeVisible();
  await expect(page.getByText("Nama pasangan wajib diisi")).toBeVisible();

  await page.getByLabel(/^Nama pasangan/).fill("Putri");
  await page.getByLabel(/^Nama mempelai wanita/).fill("Putri");
  await page.getByLabel(/^Nama mempelai pria/).fill("Fajar");
  await page.getByRole("button", { name: "Lanjut" }).click();

  // Step 2 — dates
  await expect(page.getByRole("heading", { name: "Tanggal penting" })).toBeVisible();
  await page.getByLabel(/^Tanggal pernikahan/).fill(futureIsoDate(400));
  await page.getByRole("button", { name: "Lanjut" }).click();

  // Step 3 & 4 — configurable event type and marriage process
  await page.getByRole("radio", { name: /^Akad \+ Resepsi/ }).check();
  await page.getByRole("button", { name: "Lanjut" }).click();
  await page.getByRole("radio", { name: /^KUA/ }).check();
  await page.getByRole("button", { name: "Lanjut" }).click();

  // Step 5 — budget
  await page.getByLabel(/^Target total budget/).fill("100.000.000");
  await expect(page.getByText(/Terbaca: Rp\s100\.000\.000/)).toBeVisible();
  await page.getByRole("button", { name: "Lanjut" }).click();

  // Step 6 — review & create
  await expect(page.getByRole("heading", { name: "Periksa & buat workspace" })).toBeVisible();
  await page.getByRole("button", { name: "Buat workspace" }).click();

  // Dashboard
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1, name: "Putri & Fajar" })).toBeVisible();
  await expect(page.getByText("hari menuju hari bahagia")).toBeVisible();
  // A new workspace starts on free access: paid sections appear as locked previews.
  await expect(page.getByText("Budget & pembayaran tersedia di Akses Penuh.").first()).toBeVisible();
  await expect(page.getByText("Akad + Resepsi")).toBeVisible();

  // Couple note persists
  const note = page.getByLabel("Catatan untuk berdua");
  await note.fill("Jangan lupa meeting WO malam ini");
  await page.getByRole("button", { name: "Simpan catatan" }).click();
  await expect(page.getByText("Catatan tersimpan.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Catatan untuk berdua")).toHaveValue("Jangan lupa meeting WO malam ini");

  // Onboarding is not repeatable once a workspace exists
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/dashboard$/);

  // Logout ends the session
  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);

  // Wrong password is rejected, correct password returns to the dashboard
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill("password-salah-1");
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page.getByText("Email atau password salah.")).toBeVisible();

  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1, name: "Putri & Fajar" })).toBeVisible();
});
