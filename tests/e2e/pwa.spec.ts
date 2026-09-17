import { expect, test } from "./fixtures";
import { registerAndOnboard } from "./helpers";
import { runWorkerOnce } from "./test-db";

test("pwa: manifest, icons and worker headers make the app installable", async ({ request }, testInfo) => {
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.status()).toBe(200);
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({ name: "Sehati — Wedding Planner", short_name: "Sehati", start_url: "/dashboard", display: "standalone" });

  for (const icon of manifest.icons as Array<{ src: string; sizes: string; purpose: string }>) {
    const response = await request.get(icon.src);
    expect(response.status(), icon.src).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/png");
    const body = await response.body();
    // PNG signature + IHDR width/height match the declared size.
    expect(body.subarray(1, 4).toString()).toBe("PNG");
    const [width] = icon.sizes.split("x").map(Number);
    expect(body.readUInt32BE(16)).toBe(width);
    expect(body.readUInt32BE(20)).toBe(width);
    if (icon.purpose === "maskable") await testInfo.attach("maskable-icon", { body, contentType: "image/png" });
  }

  const worker = await request.get("/sw.js");
  expect(worker.status()).toBe(200);
  expect(worker.headers()["content-type"]).toContain("javascript");
  expect(worker.headers()["cache-control"]).toBe("no-cache, no-store, must-revalidate");
});

test("pwa: the service worker serves an offline page and never stores private pages", async ({ page, context }) => {
  test.setTimeout(120_000);
  await registerAndOnboard(page);
  await page.goto("/budget");
  const scriptUrl = await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.scriptURL);
  expect(scriptUrl).toMatch(/\/sw\.js$/);
  // Visit a few private pages while the worker controls the tab.
  await page.reload();
  await page.goto("/guests");
  await page.goto("/dashboard");

  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) urls.push(new URL(request.url).pathname);
    }
    return urls;
  });
  expect(cached).toContain("/offline");
  for (const pathname of cached) {
    expect(pathname, pathname).toMatch(/^(\/_next\/static\/|\/pwa-icon\/|\/manifest\.webmanifest$|\/offline$)/);
  }

  await context.setOffline(true);
  await page.goto("/checklist").catch(() => undefined);
  await expect(page.getByRole("heading", { level: 1, name: "Kamu sedang offline" })).toBeVisible();
  await context.setOffline(false);
  await page.getByRole("button", { name: "Coba lagi" }).click();
  await expect(page).toHaveURL(/\/checklist\??$/);
  await expect(page.getByRole("heading", { level: 1, name: "Checklist" })).toBeVisible();

  await page.goto("/more");
  await expect(page.getByRole("heading", { name: "Aplikasi" })).toBeVisible();
});

test("notifications: a budget overrun reaches the bell after the worker runs, and opening it marks it read", async ({ page }) => {
  test.setTimeout(180_000);
  await registerAndOnboard(page);
  await expect(page.getByTestId("notification-bell")).toHaveAccessibleName("Notifikasi");

  // Target from onboarding is Rp100.000.000; one contract goes over it.
  await page.goto("/budget/expenses/new");
  await page.getByLabel(/^Nama pengeluaran/).fill("Gedung & katering");
  await page.getByLabel(/^Kategori/).selectOption({ label: "Catering" });
  await page.getByLabel(/^Total biaya/).fill("120.000.000");
  await page.getByRole("button", { name: "Simpan pengeluaran" }).click();
  await expect(page).toHaveURL(/\/budget\/expenses\/[\w-]+\?notice=expense_created$/);

  // Delivery is asynchronous: nothing arrives until a worker processes the queue.
  await page.goto("/dashboard");
  await expect(page.getByTestId("notification-count")).toHaveCount(0);
  runWorkerOnce();
  await page.reload();
  await expect(page.getByTestId("notification-count")).toHaveText("1");
  await expect(page.getByTestId("notification-bell")).toHaveAccessibleName("Notifikasi, 1 belum dibaca");

  await page.getByTestId("notification-bell").click();
  await expect(page).toHaveURL(/\/notifications$/);
  await expect(page.getByTestId("unread-summary")).toHaveText("1 belum dibaca");
  const list = page.getByRole("list", { name: "Daftar notifikasi" });
  await expect(list).toContainText("Pengeluaran melebihi target budget");
  await expect(list).toContainText(/Tercatat Rp\s120\.000\.000 dari target Rp\s100\.000\.000\./);

  await list.getByRole("button", { name: /Pengeluaran melebihi target budget/ }).click();
  await expect(page).toHaveURL(/\/budget$/);
  await expect(page.getByTestId("notification-count")).toHaveCount(0);
  await page.goto("/notifications");
  await expect(page.getByTestId("unread-summary")).toHaveText("Semua sudah dibaca");

  // Running the worker again does not repeat the alert.
  runWorkerOnce();
  await page.reload();
  await expect(page.getByRole("list", { name: "Daftar notifikasi" }).getByRole("listitem")).toHaveCount(1);
});
