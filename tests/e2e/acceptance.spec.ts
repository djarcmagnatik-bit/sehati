/**
 * PRD §73 — the acceptance scenario, as one uninterrupted journey through the real UI:
 * the owner, the partner and the guest each use their own browser session.
 */
import { expect, test } from "./fixtures";
import { E2E_PASSWORD, uniqueEmail, openInvitation } from "./helpers";

const money = (digits: string) => new RegExp(`Rp\\s${digits.replace(/\./g, "\\.")}$`);

test("PRD §73: the MVP acceptance journey works end to end", async ({ page, browser }) => {
  test.setTimeout(300_000);

  // Fajar registers.
  const email = uniqueEmail("fajar");
  await page.goto("/register");
  await page.getByLabel(/^Nama/).fill("Fajar");
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill(E2E_PASSWORD);
  await page.getByLabel(/^Konfirmasi password/).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Daftar" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);

  // Creates the wedding: Fajar & partner, 20 December 2027, Akad + Resepsi, KUA, Rp100.000.000.
  await page.getByLabel(/^Nama pasangan/).fill("Putri");
  await page.getByLabel(/^Nama mempelai wanita/).fill("Putri");
  await page.getByLabel(/^Nama mempelai pria/).fill("Fajar");
  await page.getByRole("button", { name: "Lanjut" }).click();
  await page.getByLabel(/^Tanggal pernikahan/).fill("2027-12-20");
  await page.getByRole("button", { name: "Lanjut" }).click();
  await page.getByRole("radio", { name: /^Akad \+ Resepsi/ }).check();
  await page.getByRole("button", { name: "Lanjut" }).click();
  await page.getByRole("radio", { name: /^KUA/ }).check();
  await page.getByRole("button", { name: "Lanjut" }).click();
  await page.getByLabel(/^Target total budget/).fill("100.000.000");
  await page.getByRole("button", { name: "Lanjut" }).click();
  await page.getByRole("button", { name: "Buat workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1, name: "Putri & Fajar" })).toBeVisible();
  await expect(page.getByText("Senin, 20 Desember 2027")).toBeVisible();

  // The system generated the planning checklist.
  const progress = page.getByText(/^0 dari \d+ tugas selesai$/);
  await expect(progress).toBeVisible();
  const totalTasks = Number((await progress.textContent())!.match(/dari (\d+)/)![1]);
  expect(totalTasks).toBeGreaterThan(20);

  // Paid planning features come with Full Access, bought through the (sandbox) checkout.
  await page.goto("/billing");
  await page.getByRole("button", { name: "Beli Akses Penuh" }).click();
  await expect(page).toHaveURL(/\/payments\/sandbox\/SHT-/);
  await page.getByRole("button", { name: "Bayar (simulasi)" }).click();
  await expect(page.getByTestId("payment-status")).toHaveText("Lunas");

  // The budget target from onboarding.
  await page.goto("/dashboard");
  await expect(page.getByTestId("budget-target")).toHaveText(money("100.000.000"));

  // Adds vendor ABC Catering with a Rp30.000.000 contract, then records a Rp10.000.000 DP.
  await page.goto("/vendors/new");
  await page.getByLabel(/^Nama vendor/).fill("ABC Catering");
  await page.getByRole("combobox", { name: "Kategori", exact: true }).selectOption({ label: "Catering" });
  await page.getByLabel(/^Nilai kontrak/).fill("30.000.000");
  await page.getByLabel(/^Kategori budget/).selectOption({ label: "Catering" });
  await page.getByRole("button", { name: "Simpan vendor" }).click();
  await expect(page.getByTestId("vendor-detail-contract")).toHaveText(money("30.000.000"));
  await page.getByRole("link", { name: "Kontrak ABC Catering" }).click();
  await page.getByLabel(/^Nominal pembayaran/).fill("10.000.000");
  await page.getByRole("button", { name: "Catat pembayaran" }).click();
  await expect(page.getByText(/Pembayaran Rp\s10\.000\.000 dicatat\./)).toBeVisible();

  // Dashboard: paid Rp10jt, outstanding Rp20jt.
  await page.goto("/dashboard");
  await expect(page.getByTestId("budget-paid")).toHaveText(money("10.000.000"));
  await expect(page.getByTestId("budget-unpaid")).toHaveText(money("20.000.000"));
  await expect(page.getByTestId("dashboard-vendors-outstanding")).toHaveText(money("20.000.000"));

  // Adds "Keluarga Bapak Ahmad" with 5 seats.
  await page.goto("/guests/new");
  await page.getByLabel(/^Nama tamu/).fill("Ahmad");
  await page.getByLabel(/^Nama di undangan/).fill("Keluarga Bapak Ahmad");
  await page.getByLabel(/^Jumlah kursi/).fill("5");
  await page.getByLabel(/^Status undangan/).selectOption({ label: "Terkirim" });
  await page.getByRole("button", { name: "Simpan tamu" }).click();
  await expect(page).toHaveURL(/\/guests\?notice=created$/);

  // Publishes the invitation (with the RSVP section on).
  const slug = `fajar-putri-${Date.now().toString(36)}`;
  await page.goto("/invitation");
  await page.getByRole("button", { name: "Buat undangan digital" }).click();
  await expect(page).toHaveURL(/\/invitation\?notice=created$/);
  await page.goto("/invitation/sections/couple");
  await page.getByLabel(/^Nama lengkap mempelai wanita/).fill("Putri Ayu");
  await page.getByLabel(/^Nama lengkap mempelai pria/).fill("Fajar Pratama");
  await page.getByRole("button", { name: "Simpan bagian" }).click();
  await expect(page.getByText("Bagian Mempelai disimpan.")).toBeVisible();
  await page.goto("/invitation/sections/rsvp");
  await page.getByLabel(/^Tampilkan bagian ini/).check();
  await page.getByRole("button", { name: "Simpan bagian" }).click();
  await expect(page.getByText(/disimpan\./)).toBeVisible();
  await page.goto("/invitation/events/new");
  await page.getByLabel(/^Nama acara/).fill("Resepsi");
  await page.getByLabel(/^Tanggal/).fill("2027-12-20");
  await page.getByLabel(/^Jam mulai/).fill("11:00");
  await page.getByRole("button", { name: "Simpan acara" }).click();
  await expect(page).toHaveURL(/\/invitation\/events\?notice=created$/);
  await page.goto("/invitation");
  await page.getByLabel(/^Alamat undangan/).fill(slug);
  await page.getByRole("button", { name: "Simpan pengaturan" }).click();
  await expect(page.getByText("Pengaturan undangan disimpan.")).toBeVisible();
  await page.getByRole("button", { name: "Terbitkan undangan" }).click();
  await expect(page.getByTestId("invitation-status")).toHaveText("Terbit");

  // The system created a personalized invitation link for the guest.
  await page.goto("/guests");
  await page.getByRole("link", { name: "Keluarga Bapak Ahmad" }).click();
  const personalLink = await page.getByLabel(/^Tautan khusus Keluarga Bapak Ahmad/).inputValue();
  expect(new URL(personalLink).pathname).toMatch(/^\/i\/[\w-]+$/);

  // Bapak Ahmad opens it (no account) and RSVPs: attending, 4 people.
  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  await guestPage.goto(new URL(personalLink).pathname);
  await openInvitation(guestPage);
  await expect(guestPage.getByText("Keluarga Bapak Ahmad").first()).toBeVisible();
  await guestPage.getByLabel("Ya, saya hadir").check();
  await guestPage.getByLabel(/^Berapa orang yang hadir/).fill("4");
  await guestPage.getByRole("button", { name: /^Kirim konfirmasi/ }).click();
  await expect(guestPage.getByText(/Konfirmasi kehadiranmu sudah kami terima/)).toBeVisible();
  await guestContext.close();

  // Dashboard: invited seats 5, confirmed attendance 4.
  await page.goto("/dashboard");
  await expect(page.getByTestId("dashboard-guests-seats")).toHaveText("5");
  await expect(page.getByTestId("dashboard-guests-attending-seats")).toHaveText("4");

  // The partner joins with a separate account.
  await page.goto("/settings/partner");
  const partnerEmail = uniqueEmail("putri");
  await page.getByLabel(/^Email pasangan/).fill(partnerEmail);
  await page.getByRole("button", { name: "Kirim undangan" }).click();
  const inviteUrl = await page.getByLabel("Tautan undangan").inputValue();

  const partnerContext = await browser.newContext();
  const partnerPage = await partnerContext.newPage();
  await partnerPage.goto(inviteUrl);
  await partnerPage.getByRole("link", { name: "Daftar untuk menerima" }).click();
  await partnerPage.getByLabel(/^Nama/).fill("Putri");
  await partnerPage.getByLabel(/^Email/).fill(partnerEmail);
  await partnerPage.getByLabel(/^Password/).fill(E2E_PASSWORD);
  await partnerPage.getByLabel(/^Konfirmasi password/).fill(E2E_PASSWORD);
  await partnerPage.getByRole("button", { name: "Daftar" }).click();
  await partnerPage.getByRole("button", { name: "Terima undangan" }).click();
  await expect(partnerPage).toHaveURL(/\/dashboard\?notice=partner_joined$/);

  // The partner sees the same tasks, budget, vendors, guests and RSVP.
  await expect(partnerPage.getByText(`0 dari ${totalTasks} tugas selesai`)).toBeVisible();
  await expect(partnerPage.getByTestId("budget-target")).toHaveText(money("100.000.000"));
  await expect(partnerPage.getByTestId("budget-paid")).toHaveText(money("10.000.000"));
  await expect(partnerPage.getByTestId("budget-unpaid")).toHaveText(money("20.000.000"));
  await expect(partnerPage.getByTestId("dashboard-guests-seats")).toHaveText("5");
  await expect(partnerPage.getByTestId("dashboard-guests-attending-seats")).toHaveText("4");
  await partnerPage.goto("/vendors");
  await expect(partnerPage.getByRole("link", { name: "ABC Catering" })).toBeVisible();
  await expect(partnerPage.getByTestId("vendors-outstanding")).toHaveText(money("20.000.000"));
  await partnerPage.goto("/guests");
  await expect(partnerPage.getByRole("link", { name: "Keluarga Bapak Ahmad" }).first()).toBeVisible();
  await expect(partnerPage.getByTestId("guests-attending-seats")).toHaveText("4");

  // The partner completes one task.
  await partnerPage.goto("/checklist?q=Daftar+nikah+ke+KUA");
  await partnerPage.getByRole("button", { name: "Tandai selesai: Daftar nikah ke KUA", exact: true }).click();
  await expect(partnerPage.getByText(`1 dari ${totalTasks} tugas selesai`)).toBeVisible();
  await partnerContext.close();

  // Fajar's dashboard reflects the update.
  await page.goto("/dashboard");
  await expect(page.getByText(`1 dari ${totalTasks} tugas selesai`)).toBeVisible();
  await expect(page.getByText("Putri menyelesaikan tugas “Daftar nikah ke KUA”")).toBeVisible();
});
