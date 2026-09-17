import { expect, test } from "./fixtures";
import { E2E_PASSWORD, registerAndOnboard } from "./helpers";
import { getTestDb } from "./test-db";

test("admin: hidden from couples, then moderates users, grants access, runs a promo and keeps an audit trail", async ({ page, isMobile }) => {
  test.setTimeout(240_000);

  // A regular couple account: the admin area does not exist for it.
  const { email: coupleEmail } = await registerAndOnboard(page, { access: "free" });
  const notFound = await page.goto("/admin/users");
  expect(notFound?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Halaman tidak ditemukan" })).toBeVisible();
  await page.goto("/more");
  await expect(page.getByRole("link", { name: /Panel admin/ })).toHaveCount(0);

  // Anonymous visitors are sent to sign in first.
  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin$/);

  // The first admin is promoted out of band (pnpm admin:set does the same).
  const { email: adminEmail } = await registerAndOnboard(page, { access: "free" });
  await getTestDb().user.update({ where: { email: adminEmail.toLowerCase() }, data: { role: "ADMIN" } });
  await page.goto("/more");
  await page.getByRole("link", { name: /Panel admin/ }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard admin" })).toBeVisible();
  await expect(page.getByTestId("stat-users")).toHaveText(/\d/);

  // Suspend the couple account.
  await page.goto("/admin/users");
  await page.getByLabel("Cari nama atau email").fill(coupleEmail);
  await page.getByRole("button", { name: "Terapkan" }).click();
  const users = page.getByRole("table", { name: "Daftar pengguna" });
  await expect(users.getByRole("row")).toHaveCount(2);
  await users.getByRole("link", { name: "Fajar" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Fajar" })).toBeVisible();
  await page.getByRole("button", { name: "Suspend akun" }).click();
  await expect(page.getByText("Tulis alasan singkat (minimal 3 karakter)")).toBeVisible();
  await page.getByLabel(/^Alasan suspend/).fill("Laporan penyalahgunaan");
  await page.getByRole("button", { name: "Suspend akun" }).click();
  await expect(page.getByText("Akun disuspend dan semua sesinya diakhiri.")).toBeVisible();
  await expect(page.getByTestId("user-status")).toHaveText("Disuspend");

  // Grant that couple's wedding full access by hand.
  await page.goto(`/admin/weddings?q=${encodeURIComponent(coupleEmail)}`);
  await page.getByRole("table", { name: "Daftar pernikahan" }).getByRole("link", { name: "Putri & Fajar" }).click();
  await page.getByLabel(/^Catatan/).fill("Kompensasi gangguan layanan");
  await page.getByRole("button", { name: "Berikan akses" }).click();
  await expect(page.getByText("Akses diberikan dan tercatat di audit log.")).toBeVisible();
  await expect(page.getByTestId("entitlements")).toContainText("Aktif");
  await expect(page.getByTestId("entitlements")).toContainText("Kompensasi gangguan layanan");

  // Create a 30% promo code and use it on the admin's own (free) workspace.
  const promoCode = `E2E${Date.now().toString(36).toUpperCase()}`;
  await page.goto("/admin/promo-codes/new");
  await page.getByRole("textbox", { name: /^Kode/ }).fill(promoCode.toLowerCase());
  await page.getByLabel(/^Diskon \(%\)/).fill("30");
  await page.getByRole("button", { name: "Buat kode promo" }).click();
  await expect(page).toHaveURL(/\/admin\/promo-codes\?notice=created$/);
  await expect(page.getByRole("table", { name: "Daftar kode promo" })).toContainText(promoCode);

  await page.goto("/billing");
  await page.getByLabel("Kode promo (opsional)").first().fill("KODE-SALAH");
  await page.getByRole("button", { name: "Beli Akses Penuh" }).click();
  await expect(page.getByText("Kode promo tidak dikenal atau belum berlaku.").first()).toBeVisible();
  await page.getByLabel("Kode promo (opsional)").first().fill(promoCode.toLowerCase());
  await page.getByRole("button", { name: "Beli Akses Penuh" }).click();
  await expect(page).toHaveURL(/\/payments\/sandbox\/SHT-/);
  await expect(page.getByText(/104\.300/)).toBeVisible();

  await page.goto("/admin/transactions");
  await expect(page.getByRole("table", { name: "Daftar transaksi" })).toContainText(`Promo ${promoCode}`);
  await page.goto("/admin/promo-codes");
  await expect(page.getByRole("table", { name: "Daftar kode promo" }).getByRole("row", { name: new RegExp(promoCode) })).toContainText("1");

  // Theme metadata and a preview built from sample data.
  await page.goto("/admin/themes");
  await expect(page.getByRole("heading", { level: 1, name: "Tema undangan" })).toBeVisible();
  await page.getByRole("link", { name: "Pratinjau" }).first().click();
  await expect(page.getByTestId("theme-preview")).toContainText("Sekar & Bima");

  // Every change above is in the audit log.
  await page.goto("/admin/audit-logs");
  const audit = page.getByRole("table", { name: "Audit log admin" });
  await expect(audit).toContainText("user.suspended");
  await expect(audit).toContainText("entitlement.granted");
  await expect(audit).toContainText("promo.created");

  if (isMobile) {
    await page.goto("/admin/users");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }

  // The suspended couple can no longer sign in.
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel(/^Email/).fill(coupleEmail);
  await page.getByLabel(/^Password/).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page.getByText("Email atau password salah.")).toBeVisible();
});
