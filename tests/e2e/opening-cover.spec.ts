import { expect, test } from "./fixtures";
import { createAndPublishInvitation, openInvitation, registerAndOnboard } from "./helpers";

function uniqueSlug(): string {
  return `sampul-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

test("opening cover: the guest taps to open, the page stays readable without it", async ({ page, browser }) => {
  test.setTimeout(240_000);
  await registerAndOnboard(page);
  const slug = uniqueSlug();
  await createAndPublishInvitation(page, slug);

  await page.goto("/guests/new");
  await page.getByLabel(/^Nama tamu/).fill("Ahmad Fauzi");
  await page.getByLabel(/^Nama di undangan/).fill("Keluarga Bapak Ahmad");
  await page.getByRole("button", { name: "Simpan tamu" }).click();
  await page.getByRole("link", { name: "Keluarga Bapak Ahmad" }).click();
  const personalLink = new URL(await page.getByLabel(/^Tautan khusus Keluarga Bapak Ahmad/).inputValue()).pathname;

  // The guest lands on the cover: their name, the couple's, and nothing to scroll past yet.
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(personalLink);
  const cover = guestPage.getByRole("dialog");
  await expect(cover).toBeVisible();
  await expect(cover.getByRole("heading", { name: "Putri & Fajar" })).toBeVisible();
  await expect(cover.getByText("Keluarga Bapak Ahmad")).toBeVisible();
  expect(await guestPage.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");
  expect(await guestPage.evaluate(() => window.scrollY)).toBe(0);
  await guestPage.mouse.wheel(0, 600);
  expect(await guestPage.evaluate(() => window.scrollY)).toBe(0);

  await openInvitation(guestPage);
  expect(await guestPage.evaluate(() => document.documentElement.style.overflow)).toBe("");
  await expect(guestPage.getByRole("heading", { name: "Putri & Fajar" }).first()).toBeVisible();
  await guestPage.mouse.wheel(0, 600);
  await expect.poll(() => guestPage.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  // Reloading the same tab goes straight to the invitation; a new visitor sees the cover again.
  await guestPage.reload();
  await expect(guestPage.getByRole("dialog")).toHaveCount(0);
  await expect(guestPage.getByRole("heading", { name: "Putri & Fajar" }).first()).toBeVisible();
  await guest.close();

  const returning = await browser.newContext();
  const returningPage = await returning.newPage();
  await returningPage.goto(`/undangan/${slug}`);
  await expect(returningPage.getByRole("dialog")).toBeVisible();
  await returning.close();

  // Without JavaScript the cover cannot be tapped away, so it is not shown at all.
  const noScript = await browser.newContext({ javaScriptEnabled: false });
  const noScriptPage = await noScript.newPage();
  await noScriptPage.goto(`/undangan/${slug}`);
  await expect(noScriptPage.locator(".inv-gate")).toBeHidden();
  await expect(noScriptPage.getByRole("heading", { name: "Putri & Fajar" }).first()).toBeVisible();
  await expect(noScriptPage.getByText("Resepsi").first()).toBeVisible();
  await noScript.close();

  // The couple can switch the cover off.
  await page.goto("/invitation/design");
  await page.getByLabel(/^Tampilkan sampul pembuka/).uncheck();
  await page.getByRole("button", { name: "Simpan tampilan" }).click();
  await expect(page.getByText("Tema undangan diperbarui.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(/^Tampilkan sampul pembuka/)).not.toBeChecked();

  const direct = await browser.newContext();
  const directPage = await direct.newPage();
  await directPage.goto(`/undangan/${slug}`);
  await expect(directPage.getByRole("heading", { name: "Putri & Fajar" }).first()).toBeVisible();
  await expect(directPage.getByRole("dialog")).toHaveCount(0);
  await expect(directPage.locator(".inv-gate")).toHaveCount(0);
  await direct.close();
});

test("opening cover: motion is kept off when the guest asks for less of it", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await registerAndOnboard(page);
  const slug = uniqueSlug();
  await createAndPublishInvitation(page, slug);

  const calm = await browser.newContext({ reducedMotion: "reduce" });
  const calmPage = await calm.newPage();
  await calmPage.goto(`/undangan/${slug}`);
  await openInvitation(calmPage);
  // Sections below the fold are never hidden first, so the page reads the same with motion off.
  await expect(calmPage.locator(".inv-reveal-pending")).toHaveCount(0);
  const durations = await calmPage.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".inv-sway, .inv-rise, .inv-kenburns")].map((element) =>
      getComputedStyle(element).animationDuration,
    ),
  );
  expect(durations.length).toBeGreaterThan(0);
  for (const duration of durations) expect(parseFloat(duration)).toBeLessThan(0.001);
  await calm.close();

  const moving = await browser.newContext();
  const movingPage = await moving.newPage();
  await movingPage.goto(`/undangan/${slug}`);
  const heroTitle = movingPage.locator("header h1");
  const heroAnimation = () => heroTitle.evaluate((element) => getComputedStyle(element).animationName);
  await expect(movingPage.getByRole("button", { name: "Buka Undangan" })).toBeFocused();
  // Held back behind the cover, so the entrance plays for the guest instead of unseen.
  expect(await heroAnimation()).toBe("none");
  await movingPage.getByRole("button", { name: "Buka Undangan" }).click();
  // The cover slides away rather than vanishing, and the couple's names rise in behind it.
  await expect(movingPage.locator(".inv-gate.inv-gate-closing")).toBeAttached();
  expect(await heroAnimation()).toBe("inv-rise");
  await expect(movingPage.getByRole("dialog")).toHaveCount(0);
  // Sections further down start hidden and fade in as the guest scrolls.
  const pending = movingPage.locator(".inv-reveal-pending");
  await expect(pending.first()).toBeAttached();
  const hidden = await pending.count();
  await movingPage.getByRole("heading", { name: "Acara" }).first().scrollIntoViewIfNeeded();
  await expect.poll(() => pending.count()).toBeLessThan(hidden);
  await moving.close();
});
