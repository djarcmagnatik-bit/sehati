import { expect, test } from "./fixtures";
import { createAndPublishInvitation, futureIsoDate, registerAndOnboard, openInvitation } from "./helpers";

const money = (digits: string) => new RegExp(`Rp\\s${digits.replace(/\./g, "\\.")}$`);

test("planning extras: savings, seserahan, rundown and calendar", async ({ page, isMobile }) => {
  test.setTimeout(180_000);
  await registerAndOnboard(page);

  // Savings: one deposit against a Rp50.000.000 target.
  await page.goto("/savings");
  await page.getByLabel(/^Target dana pernikahan/).fill("50.000.000");
  await page.getByRole("button", { name: "Simpan target" }).click();
  await expect(page.getByText("Target tabungan disimpan.")).toBeVisible();

  await page.getByRole("link", { name: "+ Catat setoran" }).click();
  await page.getByLabel(/^Nominal/).fill("5.000.000");
  await page.getByLabel(/^Disimpan di/).fill("BCA");
  await page.getByRole("button", { name: "Simpan tabungan" }).click();
  await expect(page).toHaveURL(/\/savings\?notice=created$/);
  await expect(page.getByTestId("savings-saved")).toHaveText(money("5.000.000"));
  await expect(page.getByTestId("savings-remaining")).toHaveText(money("45.000.000"));
  await expect(page.getByTestId("savings-percent")).toHaveText("10%");

  // Zero is refused.
  await page.goto("/savings/new");
  await page.getByLabel(/^Nominal/).fill("0");
  await page.getByRole("button", { name: "Simpan tabungan" }).click();
  await expect(page.getByText(/Nominal harus lebih dari 0/)).toBeVisible();

  // Seserahan: add an item, then move it forward from the list.
  await page.goto("/seserahan/new");
  await page.getByLabel(/^Nama barang/).fill("Set mukena");
  await page.getByLabel(/^Kategori/).selectOption({ label: "Perlengkapan ibadah" });
  await page.getByLabel(/^Perkiraan harga/).fill("750.000");
  await page.getByRole("button", { name: "Simpan barang" }).click();
  await expect(page).toHaveURL(/\/seserahan\/[\w-]+\?notice=created$/);

  await page.goto("/seserahan");
  await expect(page.getByTestId("seserahan-items")).toHaveText("1");
  await expect(page.getByTestId("seserahan-estimated")).toHaveText(money("750.000"));
  await page.getByRole("button", { name: "Tandai sudah dibeli: Set mukena" }).click();
  await page.getByRole("button", { name: "Tandai sudah dikemas: Set mukena" }).click();
  await expect(page.getByTestId("seserahan-done")).toHaveText("1");

  // Rundown: entered out of order, shown in time order.
  for (const [title, start, end] of [
    ["Akad nikah", "09:00", "10:00"],
    ["Makeup pengantin", "05:00", "07:30"],
  ] as const) {
    await page.goto("/rundown/new");
    await page.getByLabel(/^Kegiatan/).fill(title);
    await page.getByLabel(/^Jam mulai/).fill(start);
    await page.getByLabel(/^Jam selesai/).fill(end);
    await page.getByLabel(/^Penanggung jawab/).fill("WO");
    await page.getByRole("button", { name: "Simpan ke rundown" }).click();
    await expect(page).toHaveURL(/\/rundown\?notice=created$/);
  }
  const titles = page.getByRole("main").locator("ol > li").getByRole("link");
  await expect(titles).toHaveText(["Makeup pengantin", "Akad nikah"]);
  await expect(page.getByText("2 jam 30 menit")).toBeVisible();

  await page.getByRole("link", { name: "Tabel" }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("cell", { name: "05:00 – 07:30" })).toBeVisible();

  // Rundown end before start is refused.
  await page.goto("/rundown/new");
  await page.getByLabel(/^Kegiatan/).fill("Resepsi");
  await page.getByLabel(/^Jam mulai/).fill("19:00");
  await page.getByLabel(/^Jam selesai/).fill("18:00");
  await page.getByRole("button", { name: "Simpan ke rundown" }).click();
  await expect(page.getByText(/Jam selesai harus setelah jam mulai/)).toBeVisible();

  // Calendar: a custom agenda shows up and links back to itself.
  const agendaDate = futureIsoDate(12);
  await page.goto("/calendar/new");
  await page.getByLabel(/^Judul agenda/).fill("Fitting baju");
  await page.getByLabel(/^Tanggal/).fill(agendaDate);
  await page.getByLabel(/^Jam mulai/).fill("10:00");
  await page.getByRole("button", { name: "Simpan agenda" }).click();
  await expect(page).toHaveURL(new RegExp(`/calendar\\?month=${agendaDate.slice(0, 7)}&notice=created$`));
  await expect(page.getByText("Agenda ditambahkan.")).toBeVisible();

  const agendaLink = page.getByRole("link", { name: /Fitting baju/ });
  await expect(agendaLink.first()).toBeVisible();
  // The legend names every colour, so colour is never the only cue.
  await expect(page.getByRole("list", { name: "Keterangan" })).toContainText("Tugas");

  await page.goto(`/calendar?view=agenda&date=${agendaDate}`);
  await agendaLink.first().click();
  await expect(page.getByRole("heading", { name: "Ubah agenda" })).toBeVisible();

  // Dashboard mirrors savings and seserahan.
  await page.goto("/dashboard");
  await expect(page.getByTestId("dashboard-savings-saved")).toHaveText(money("5.000.000"));
  await expect(page.getByTestId("dashboard-seserahan-done")).toHaveText("1");

  if (isMobile) {
    for (const path of ["/savings", "/seserahan", "/rundown", "/calendar"]) {
      await page.goto(path);
      expect(await page.evaluate(() => window.innerWidth), `${path} melebihi lebar layar`).toBe(412);
    }
  }
});

test("planning extras: background music plays on the public invitation", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await registerAndOnboard(page);
  const slug = `musik-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  await createAndPublishInvitation(page, slug);

  // Anything that is not audio is refused.
  await page.goto("/invitation/music");
  await page.getByLabel(/^File musik/).setInputFiles({ name: "bukan-lagu.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("ini bukan file audio sama sekali") });
  await page.getByRole("button", { name: "Unggah musik" }).click();
  await expect(page.getByText("Format musik harus MP3, M4A, atau OGG.")).toBeVisible();

  const mp3 = Buffer.concat([Buffer.from("ID3"), Buffer.from([4, 0, 0, 0, 0, 0, 0]), Buffer.alloc(4096, 0x55)]);
  await page.getByLabel(/^File musik/).setInputFiles({ name: "lagu.mp3", mimeType: "audio/mpeg", buffer: mp3 });
  await page.getByRole("button", { name: "Unggah musik" }).click();
  await expect(page.getByText("Musik latar diunggah dan dinyalakan.")).toBeVisible();

  const anonymous = await browser.newContext();
  // Count every attempt to start sound, whether or not the browser then allows it.
  await anonymous.addInitScript(() => {
    const original = HTMLMediaElement.prototype.play;
    const counter = window as unknown as { __playCalls: number };
    counter.__playCalls = 0;
    HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
      counter.__playCalls += 1;
      return original.call(this);
    };
  });
  const guestPage = await anonymous.newPage();
  const playCalls = () => guestPage.evaluate(() => (window as unknown as { __playCalls: number }).__playCalls);
  await guestPage.goto(`/undangan/${slug}`);
  // Behind the opening cover, only "Buka Undangan" may start the music: tapping elsewhere does not.
  await expect(guestPage.getByRole("button", { name: "Buka Undangan" })).toBeFocused();
  await guestPage.getByRole("dialog").getByRole("heading").click();
  await guestPage.keyboard.press("Shift");
  expect(await playCalls()).toBe(0);
  await openInvitation(guestPage);
  expect(await playCalls()).toBeGreaterThan(0);
  // Headless Chrome blocks sound until interaction (and this fixture is not a real song), so the
  // player must stay visible as an explicit control.
  const player = guestPage.getByRole("button", { name: /musik/ });
  await expect(player).toBeVisible();
  const src = await guestPage.locator("audio").getAttribute("src");
  const response = await anonymous.request.get(src ?? "");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("audio/mpeg");

  // Switching music off removes the player and the public file.
  await page.reload();
  await page.getByLabel("Putar musik di undangan").uncheck();
  await page.getByRole("button", { name: "Simpan pengaturan musik" }).click();
  await expect(page.getByText("Pengaturan musik disimpan.")).toBeVisible();

  await guestPage.reload();
  await expect(guestPage.getByRole("button", { name: /musik/ })).toHaveCount(0);
  expect((await anonymous.request.get(src ?? "")).status()).toBe(404);
  await anonymous.close();
});
