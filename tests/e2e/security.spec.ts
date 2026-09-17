import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { createAndPublishInvitation, E2E_PASSWORD, registerAndOnboard } from "./helpers";

const XSS_IMG = `<img src=x onerror="window.__xss=1">`;
const XSS_SCRIPT = `</textarea><script>window.__xss=2</script>`;

/** Fails the test on any CSP violation or uncaught script error while the callback runs. */
function watchForViolations(page: Page) {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text())) problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("dialog", (dialog) => {
    problems.push(`dialog: ${dialog.message()}`);
    void dialog.dismiss();
  });
  return problems;
}

test("security: headers, per-request CSP nonce and session cookie flags", async ({ page, request, context }) => {
  const first = await request.get("/login");
  const second = await request.get("/login");
  const headers = first.headers();
  const csp = headers["content-security-policy"]!;
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]{24}' 'strict-dynamic'/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).not.toContain("unsafe-eval");
  const nonceOf = (value: string) => value.match(/'nonce-([^']+)'/)![1];
  expect(nonceOf(second.headers()["content-security-policy"]!)).not.toBe(nonceOf(csp));
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
  expect(headers["strict-transport-security"]).toBe("max-age=63072000; includeSubDomains");
  expect(headers["x-powered-by"]).toBeUndefined();

  // Every script Next.js renders carries this response's nonce, so the page still works.
  const problems = watchForViolations(page);
  const response = await page.goto("/login");
  const pageNonce = nonceOf(response!.headers()["content-security-policy"]!);
  const scriptNonces = await page.evaluate(() => Array.from(document.scripts).map((script) => script.nonce));
  expect(scriptNonces.length).toBeGreaterThan(0);
  for (const nonce of scriptNonces) expect(nonce).toBe(pageNonce);

  // The classic injection — markup with an inline event handler — is refused by the browser.
  const blocked = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        document.addEventListener("securitypolicyviolation", (event) => resolve(event.violatedDirective), { once: true });
        const holder = document.createElement("div");
        holder.innerHTML = '<img src="data:," onerror="window.__injected = true">';
        document.body.appendChild(holder);
      }),
  );
  expect(blocked).toMatch(/^script-src/);
  expect(await page.evaluate(() => (window as unknown as { __injected?: boolean }).__injected)).toBeUndefined();
  expect(problems.some((problem) => /Content Security Policy|Refused/.test(problem))).toBe(true);

  // Non-page responses keep their own policy.
  expect((await request.get("/manifest.webmanifest")).headers()["content-security-policy"]).toBeUndefined();

  await registerAndOnboard(page);
  const session = (await context.cookies()).find((cookie) => cookie.name.endsWith("sehati_session"))!;
  expect(session).toMatchObject({ httpOnly: true, sameSite: "Lax", secure: true, path: "/" });
  expect(session.name).toBe("__Host-sehati_session");
});

test("security: stored XSS payloads render as text, on private and public pages", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const problems = watchForViolations(page);
  await registerAndOnboard(page);

  await page.getByLabel("Catatan untuk berdua").fill(XSS_SCRIPT);
  await page.getByRole("button", { name: "Simpan catatan" }).click();
  await expect(page.getByText("Catatan tersimpan.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Catatan untuk berdua")).toHaveValue(XSS_SCRIPT);

  await page.goto("/guests/new");
  await page.getByLabel(/^Nama tamu/).fill("Iseng");
  await page.getByLabel(/^Nama di undangan/).fill(XSS_IMG);
  await page.getByRole("button", { name: "Simpan tamu" }).click();
  await expect(page).toHaveURL(/\/guests\?notice=created$/);
  await expect(page.getByRole("link", { name: XSS_IMG })).toBeVisible();

  const slug = `aman-${Date.now().toString(36)}`;
  await createAndPublishInvitation(page, slug);
  await page.goto("/invitation/sections/wishes");
  await page.getByLabel(/^Tampilkan bagian ini/).check();
  await page.getByRole("button", { name: "Simpan bagian" }).click();
  await expect(page.getByText(/disimpan/)).toBeVisible();
  await page.goto("/invitation/sections/quote");
  await page.getByLabel(/^Kutipan/).fill(XSS_IMG);
  await page.getByRole("button", { name: "Simpan bagian" }).click();
  await expect(page.getByText(/disimpan/)).toBeVisible();

  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  const guestProblems = watchForViolations(guestPage);
  await guestPage.goto(`/undangan/${slug}`);
  await expect(guestPage.getByText(XSS_IMG, { exact: false }).first()).toBeVisible();
  await guestPage.getByLabel(/^Nama$/).fill(XSS_IMG);
  await guestPage.getByLabel(/^Ucapan & doa/).fill(XSS_SCRIPT);
  await guestPage.getByRole("button", { name: "Kirim ucapan" }).click();
  await guestPage.reload();
  await expect(guestPage.getByText(XSS_SCRIPT).first()).toBeVisible();
  expect(await guestPage.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  expect(await guestPage.locator("img[src='x']").count()).toBe(0);
  expect(guestProblems).toEqual([]);
  await guest.close();

  await page.goto("/invitation/wishes");
  await expect(page.getByText(XSS_SCRIPT).first()).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  expect(problems).toEqual([]);
});

test("security: Server Actions refuse cross-site requests", async ({ page }) => {
  await registerAndOnboard(page);
  const noteField = page.getByLabel("Catatan untuk berdua");
  await noteField.fill("Catatan asli");
  const [action] = await Promise.all([
    page.waitForRequest((request) => request.method() === "POST" && Boolean(request.headers()["next-action"])),
    page.getByRole("button", { name: "Simpan catatan" }).click(),
  ]);
  await expect(page.getByText("Catatan tersimpan.")).toBeVisible();

  const body = action.postDataBuffer()!;
  const forged = Buffer.from(body.toString("binary").replace("Catatan asli", "Ditulis situs lain"), "binary");
  const replayHeaders = Object.fromEntries(
    Object.entries(action.headers()).filter(([name]) => !["content-length", "host", "cookie", "origin"].includes(name.toLowerCase())),
  );

  // Same request from another site: refused, nothing stored.
  const crossSite = await page.request.post(action.url(), { headers: { ...replayHeaders, origin: "https://evil.example" }, data: forged });
  expect(crossSite.ok()).toBe(false);
  await page.reload();
  await expect(page.getByLabel("Catatan untuk berdua")).toHaveValue("Catatan asli");

  // Control: the identical replay from this origin is accepted, so the refusal above is the origin check.
  const sameSite = await page.request.post(action.url(), {
    headers: { ...replayHeaders, origin: new URL(action.url()).origin },
    data: Buffer.from(body.toString("binary").replace("Catatan asli", "Diganti dari situs sendiri"), "binary"),
  });
  expect(sameSite.ok()).toBe(true);
  await page.reload();
  await expect(page.getByLabel("Catatan untuk berdua")).toHaveValue("Diganti dari situs sendiri");
});

test("security: another account cannot open a wedding's records by URL", async ({ page, browser }) => {
  test.setTimeout(150_000);
  await registerAndOnboard(page);
  await page.goto("/guests/new");
  await page.getByLabel(/^Nama tamu/).fill("Pribadi");
  await page.getByLabel(/^Nama di undangan/).fill("Keluarga Pribadi");
  await page.getByLabel(/^Telepon/).fill("0812-5555-4444");
  await page.getByRole("button", { name: "Simpan tamu" }).click();
  await page.getByRole("link", { name: "Keluarga Pribadi" }).click();
  await expect(page).toHaveURL(/\/guests\/[\w-]+$/);
  const guestUrl = new URL(page.url()).pathname;

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await registerAndOnboard(otherPage);
  const response = await otherPage.goto(guestUrl);
  expect(response?.status()).toBe(404);
  await expect(otherPage.getByText("Keluarga Pribadi")).toHaveCount(0);
  await expect(otherPage.getByText("0812-5555-4444")).toHaveCount(0);

  const exported = await otherPage.request.get("/exports/guests?format=csv");
  expect(await exported.text()).not.toContain("Keluarga Pribadi");
  await other.close();
});

test("security: login is rate limited per account and never redirects off-site", async ({ page }) => {
  const { email } = await registerAndOnboard(page, { access: "free" });
  await page.getByRole("button", { name: "Keluar" }).click();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    await page.goto("/login");
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/^Password/).fill(`salah-sekali-${attempt}`);
    await page.getByRole("button", { name: "Masuk" }).click();
    await expect(page.getByText("Email atau password salah.")).toBeVisible();
  }
  // Even the right password is refused while the account is locked out.
  await page.goto("/login");
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page.getByText("Terlalu banyak percobaan. Silakan coba lagi beberapa menit lagi.")).toBeVisible();
});

test("security: post-login redirects stay on this site", async ({ page }) => {
  const { email } = await registerAndOnboard(page, { access: "free" });
  await page.getByRole("button", { name: "Keluar" }).click();
  for (const next of ["//evil.example/phish", "https://evil.example", "/\\evil.example"]) {
    await page.goto(`/login?next=${encodeURIComponent(next)}`);
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/^Password/).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Masuk" }).click();
    await expect(page).toHaveURL(/^http:\/\/localhost:3100\/dashboard$/);
    await page.getByRole("button", { name: "Keluar" }).click();
  }
});
