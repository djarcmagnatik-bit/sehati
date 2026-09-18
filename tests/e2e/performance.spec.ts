import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { expect, test } from "./fixtures";
import { createAndPublishInvitation, registerAndOnboard } from "./helpers";
import { getTestDb } from "./test-db";

/** Lighthouse's mobile profile: slow 4G (150 ms RTT, 1.6 Mbps down) and a 4× slower CPU. */
const SLOW_4G = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };

/**
 * A phone-like photo: smooth colour fields with sensor-like grain, saved as a high-quality JPEG
 * (about 2 MB). Pure noise would be unrealistically incompressible, a flat gradient unrealistically small.
 */
async function phonePhoto(): Promise<Buffer> {
  const width = 2400;
  const height = 1800;
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 3;
      const grain = (Math.random() - 0.5) * 60;
      raw[index] = Math.max(0, Math.min(255, 120 + 80 * Math.sin(x / 170) + grain));
      raw[index + 1] = Math.max(0, Math.min(255, 100 + 60 * Math.cos(y / 130) + grain));
      raw[index + 2] = Math.max(0, Math.min(255, 90 + 50 * Math.sin((x + y) / 260) + grain));
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
}

test("performance: the public invitation paints within 2.5 s on slow 4G with a large cover photo", async ({ page, browser, browserName }, testInfo) => {
  test.skip(browserName !== "chromium", "Network and CPU throttling use the Chrome DevTools Protocol");
  test.setTimeout(180_000);
  await registerAndOnboard(page);
  const slug = `cepat-${Date.now().toString(36)}`;
  await createAndPublishInvitation(page, slug);

  const photo = await phonePhoto();
  expect(photo.byteLength).toBeGreaterThan(1024 * 1024);
  expect(photo.byteLength).toBeLessThan(3 * 1024 * 1024);
  await page.goto("/invitation/design");
  await page.getByLabel(/^Foto sampul/).setInputFiles({ name: "IMG_1024.jpg", mimeType: "image/jpeg", buffer: photo });
  await page.getByRole("button", { name: "Unggah sampul" }).click();
  await expect(page.getByText("Foto sampul diperbarui.")).toBeVisible();

  const guest = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true });
  const guestPage = await guest.newPage();
  const cdp = await guest.newCDPSession(guestPage);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", SLOW_4G);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  const coverResponses: Array<{ url: string; type: string; bytes: number }> = [];
  guestPage.on("response", async (response) => {
    if (!/\/media\//.test(response.url())) return;
    const body = await response.body().catch(() => Buffer.alloc(0));
    coverResponses.push({ url: new URL(response.url()).pathname + new URL(response.url()).search, type: response.headers()["content-type"] ?? "", bytes: body.byteLength });
  });

  await guestPage.goto(`/undangan/${slug}`, { waitUntil: "load" });
  // LCP is final once the cover has painted; read the last candidate after a short settle.
  await guestPage.waitForFunction(() => Array.from(document.images).every((image) => image.complete));
  const lcp = await guestPage.evaluate(
    () =>
      new Promise<{ time: number; element: string; url: string }>((resolve) => {
        const entries: Array<PerformanceEntry & { element?: Element; url?: string }> = [];
        new PerformanceObserver((list) => {
          entries.push(...(list.getEntries() as typeof entries));
        }).observe({ type: "largest-contentful-paint", buffered: true });
        setTimeout(() => {
          const last = entries[entries.length - 1]!;
          resolve({ time: last.startTime, element: last.element?.tagName ?? "", url: last.url ?? "" });
        }, 1000);
      }),
  );
  await guest.close();

  const cover = coverResponses.find((response) => response.type.startsWith("image/"));
  await testInfo.attach("lcp.json", {
    body: JSON.stringify({ lcp, originalBytes: photo.byteLength, coverResponses }, null, 2),
    contentType: "application/json",
  });
  console.log(`[perf] LCP ${Math.round(lcp.time)} ms (${lcp.element}); cover ${cover?.url} ${cover?.type} ${cover?.bytes} B; original ${photo.byteLength} B`);

  // The browser picked a resized WebP copy, a fraction of the uploaded photo.
  expect(cover?.url).toMatch(/\?w=\d+$/);
  expect(cover?.type).toBe("image/webp");
  expect(cover!.bytes).toBeLessThan(photo.byteLength / 4);
  expect(lcp.element).toBe("IMG");
  expect(lcp.time).toBeLessThan(2500);
});

test("performance: a 10,000-guest list stays paginated and quick to open and search", async ({ page }) => {
  test.setTimeout(180_000);
  const { email } = await registerAndOnboard(page);
  const db = getTestDb();
  const member = await db.weddingMember.findFirstOrThrow({ where: { user: { email: email.toLowerCase() } }, select: { weddingId: true } });
  const rows = Array.from({ length: 10_000 }, (_, index) => ({
    weddingId: member.weddingId,
    guestName: `Tamu ${index}`,
    invitationName: `Keluarga ${index.toString().padStart(5, "0")}`,
    seatCount: 2,
    invitationToken: randomBytes(16).toString("hex"),
  }));
  for (let index = 0; index < rows.length; index += 2000) await db.guest.createMany({ data: rows.slice(index, index + 2000) });

  const started = Date.now();
  await page.goto("/guests");
  await expect(page.getByText(/Halaman 1 dari 200/)).toBeVisible();
  const openMs = Date.now() - started;
  await expect(page.getByTestId("guests-invitations")).toHaveText("10.000");
  // One page of rows in the DOM, not ten thousand.
  expect(await page.getByRole("link", { name: /^Keluarga \d{5}$/ }).count()).toBeLessThanOrEqual(50);

  const searchStarted = Date.now();
  await page.goto("/guests?q=Keluarga%2009999");
  await expect(page.getByRole("link", { name: "Keluarga 09999" })).toBeVisible();
  const searchMs = Date.now() - searchStarted;
  console.log(`[perf] 10,000 guests: open ${openMs} ms, search ${searchMs} ms`);
  expect(openMs).toBeLessThan(3000);
  expect(searchMs).toBeLessThan(3000);
});

test("performance: pages rendered per request (CSP nonce) still answer quickly", async ({ request }) => {
  const timings: Record<string, number> = {};
  for (const path of ["/", "/login", "/register"]) {
    const samples: number[] = [];
    for (let run = 0; run < 10; run += 1) {
      const started = performance.now();
      const response = await request.get(path);
      await response.body();
      expect(response.status()).toBe(200);
      samples.push(performance.now() - started);
    }
    samples.sort((a, b) => a - b);
    timings[path] = Math.round(samples[5]!);
  }
  console.log(`[perf] median response ms ${JSON.stringify(timings)}`);
  for (const median of Object.values(timings)) expect(median).toBeLessThan(300);
});
