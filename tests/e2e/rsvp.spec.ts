import { expect, test } from "./fixtures";
import { createAndPublishInvitation, registerAndOnboard, openInvitation } from "./helpers";

function uniqueSlug(): string {
  return `rsvp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

test("rsvp: guest answers from their personal link and the couple sees it", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await registerAndOnboard(page);
  const slug = uniqueSlug();
  await createAndPublishInvitation(page, slug);

  // RSVP and wishes sections start hidden; the couple switches them on.
  for (const section of ["rsvp", "wishes"]) {
    await page.goto(`/invitation/sections/${section}`);
    await page.getByLabel(/^Tampilkan bagian ini/).check();
    await page.getByRole("button", { name: "Simpan bagian" }).click();
    await expect(page.getByText(/disimpan\./)).toBeVisible();
  }

  // One invitation for five people.
  await page.goto("/guests/new");
  await page.getByLabel(/^Nama tamu/).fill("Ahmad Fauzi");
  await page.getByLabel(/^Nama di undangan/).fill("Keluarga Bapak Ahmad");
  await page.getByLabel(/^Jumlah kursi/).fill("5");
  await page.getByLabel(/^Status undangan/).selectOption({ label: "Terkirim" });
  await page.getByRole("button", { name: "Simpan tamu" }).click();
  await page.getByRole("link", { name: "Keluarga Bapak Ahmad" }).click();
  const personalLink = await page.getByLabel(/^Tautan khusus Keluarga Bapak Ahmad/).inputValue();

  // The guest answers on their own, with no account.
  const anonymous = await browser.newContext();
  const guestPage = await anonymous.newPage();
  await guestPage.goto(new URL(personalLink).pathname);
  await openInvitation(guestPage);
  await expect(guestPage.getByRole("heading", { name: "Konfirmasi kehadiran" })).toBeVisible();

  await guestPage.getByLabel("Ya, saya hadir").check();
  await guestPage.getByLabel(/^Berapa orang yang hadir/).fill("6");
  await guestPage.getByRole("button", { name: /^Kirim konfirmasi/ }).click();
  await expect(guestPage.getByText(/tidak boleh melebihi 5 kursi/)).toBeVisible();

  await guestPage.getByLabel(/^Berapa orang yang hadir/).fill("4");
  await guestPage.getByLabel(/^Nama yang hadir/).fill("Ahmad, Siti, Budi, Rina");
  await guestPage.getByLabel(/^Pesan untuk mempelai/).fill("Sampai jumpa di resepsi!");
  await guestPage.getByRole("button", { name: /^Kirim konfirmasi/ }).click();
  await expect(guestPage.getByText(/Konfirmasi kehadiranmu sudah kami terima/)).toBeVisible();

  // The guest also leaves a wish, which appears in the guestbook right away.
  await guestPage.getByLabel(/^Ucapan & doa/).fill("Barakallahu lakuma, selamat menempuh hidup baru.");
  await guestPage.getByRole("button", { name: "Kirim ucapan" }).click();
  await expect(guestPage.getByText("Terima kasih atas ucapan dan doanya.")).toBeVisible();
  await expect(guestPage.getByText("Barakallahu lakuma, selamat menempuh hidup baru.")).toBeVisible();

  // The couple's dashboard reflects the answer.
  await page.goto("/guests");
  await expect(page.getByTestId("guests-attending-invitations")).toHaveText("1");
  await expect(page.getByTestId("guests-attending-seats")).toHaveText("4");
  await expect(page.getByTestId("guests-pending")).toHaveText("0");
  await expect(page.getByTestId("guests-responded")).toHaveText("1");

  await page.getByRole("link", { name: "Keluarga Bapak Ahmad" }).first().click();
  await expect(page.getByRole("heading", { name: "Riwayat konfirmasi" })).toBeVisible();
  await expect(page.getByText("Yang hadir: Ahmad, Siti, Budi, Rina")).toBeVisible();
  await expect(page.getByText("Sampai jumpa di resepsi!")).toBeVisible();

  // Moderation: hiding a wish removes it from the public page but keeps it for the couple.
  await page.goto("/invitation/wishes");
  await expect(page.getByTestId("wishes-visible")).toHaveText("1");
  await page.getByRole("button", { name: "Sembunyikan" }).click();
  await expect(page.getByTestId("wishes-visible")).toHaveText("0");
  await expect(page.getByText("Barakallahu lakuma, selamat menempuh hidup baru.")).toBeVisible();

  await guestPage.reload();
  await expect(guestPage.getByText("Barakallahu lakuma, selamat menempuh hidup baru.")).toHaveCount(0);
  await expect(guestPage.getByText("Jadilah yang pertama mengirim ucapan.")).toBeVisible();

  // The guest can still change their answer; the history keeps both.
  await guestPage.getByLabel("Maaf, berhalangan").check();
  await guestPage.getByRole("button", { name: /^Perbarui konfirmasi/ }).click();
  // The choice hint uses the same words, so read the form's status message specifically.
  await expect(guestPage.getByRole("status").filter({ hasText: "Doa kalian tetap kami nantikan" })).toBeVisible();
  await anonymous.close();

  await page.goto("/guests");
  await expect(page.getByTestId("guests-attending-seats")).toHaveText("0");
  await expect(page.getByTestId("guests-declined")).toHaveText("1");
  await page.getByRole("link", { name: "Keluarga Bapak Ahmad" }).first().click();
  await expect(page.getByText("Tidak hadir").first()).toBeVisible();
  await expect(page.getByText("Yang hadir: Ahmad, Siti, Budi, Rina")).toBeVisible();
});

test("rsvp: the public invitation takes wishes but no RSVP without a personal link", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await registerAndOnboard(page);
  const slug = uniqueSlug();
  await createAndPublishInvitation(page, slug);

  for (const section of ["rsvp", "wishes"]) {
    await page.goto(`/invitation/sections/${section}`);
    await page.getByLabel(/^Tampilkan bagian ini/).check();
    await page.getByRole("button", { name: "Simpan bagian" }).click();
    // Navigating before the action lands would leave the section hidden.
    await expect(page.getByText(/disimpan\./)).toBeVisible();
  }

  const anonymous = await browser.newContext();
  const guestPage = await anonymous.newPage();
  await guestPage.goto(`/undangan/${slug}`);
  await openInvitation(guestPage);
  await expect(guestPage.getByText(/tautan undangan pribadi/)).toBeVisible();
  await expect(guestPage.getByRole("button", { name: /^Kirim konfirmasi/ })).toHaveCount(0);

  await guestPage.getByLabel(/^Nama$/).fill("Rina Lestari");
  await guestPage.getByLabel(/^Ucapan & doa/).fill("Selamat berbahagia!");
  await guestPage.getByRole("button", { name: "Kirim ucapan" }).click();
  await expect(guestPage.getByText("Terima kasih atas ucapan dan doanya.")).toBeVisible();
  await expect(guestPage.getByText("Selamat berbahagia!")).toBeVisible();
  await anonymous.close();

  await page.goto("/invitation/wishes");
  await expect(page.getByText("Rina Lestari", { exact: true })).toBeVisible();
  await expect(page.getByText("dari tautan umum")).toBeVisible();
});

test("rsvp: the seat count is optional, and a guest without one answers for several people", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await registerAndOnboard(page);
  const slug = uniqueSlug();
  await createAndPublishInvitation(page, slug);
  // The editor explains where the form appears, and no longer calls it unfinished.
  await page.goto("/invitation");
  await expect(page.getByText(/belum aktif/)).toHaveCount(0);
  await expect(page.getByText(/hanya muncul di tautan pribadi/)).toBeVisible();
  await page.goto("/invitation/sections/rsvp");
  await expect(page.getByText(/hanya muncul di tautan pribadi/)).toBeVisible();
  await page.getByLabel(/^Tampilkan bagian ini/).check();
  await page.getByRole("button", { name: "Simpan bagian" }).click();
  await expect(page.getByText(/disimpan\./)).toBeVisible();

  // The field is optional: no asterisk, no browser "required", empty by default.
  await page.goto("/guests/new");
  const seats = page.getByLabel(/^Jumlah kursi/);
  await expect(seats).toHaveValue("");
  await expect(seats).not.toHaveAttribute("required");
  await page.getByLabel(/^Nama tamu/).fill("Harun");
  await page.getByLabel(/^Nama di undangan/).fill("Keluarga Pak Harun");
  await page.getByRole("button", { name: "Simpan tamu" }).click();
  await expect(page).toHaveURL(/\/guests\?notice=created$/);
  await expect(page.getByTestId("guests-seats")).toHaveText("1");
  await expect(page.getByTestId("guests-unset-seats")).toContainText("1 undangan belum diisi jumlah kursinya");

  await page.getByRole("link", { name: "Keluarga Pak Harun" }).click();
  await expect(page.getByText(/Kursi tidak ditentukan/).first()).toBeVisible();
  await expect(page.getByLabel(/^Jumlah kursi/)).toHaveValue("");
  const personalLink = await page.getByLabel(/^Tautan khusus Keluarga Pak Harun/).inputValue();

  const anonymous = await browser.newContext();
  const guestPage = await anonymous.newPage();
  await guestPage.goto(new URL(personalLink).pathname);
  await openInvitation(guestPage);
  await expect(guestPage.getByRole("heading", { name: "Konfirmasi kehadiran" })).toBeVisible();
  await expect(guestPage.getByText(/Undangan ini berlaku untuk/)).toHaveCount(0);
  await guestPage.getByLabel("Ya, saya hadir").check();
  await guestPage.getByLabel(/^Berapa orang yang hadir/).fill("3");
  await guestPage.getByRole("button", { name: /^Kirim konfirmasi/ }).click();
  await expect(guestPage.getByText(/Konfirmasi kehadiranmu sudah kami terima/)).toBeVisible();
  await anonymous.close();

  await page.goto("/guests");
  await expect(page.getByTestId("guests-attending-seats")).toHaveText("3");
});
