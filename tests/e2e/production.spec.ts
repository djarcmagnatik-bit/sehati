import { expect, test } from "./fixtures";

test("production smoke: health, crawler rules and private-page headers", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: "ok" });
  expect(health.headers()["cache-control"]).toBe("no-store");

  const robots = await (await request.get("/robots.txt")).text();
  for (const path of ["/dashboard", "/admin", "/exports", "/reports", "/i/", "/media/"]) expect(robots).toContain(`Disallow: ${path}`);

  // Private pages redirect anonymous visitors and are never indexable.
  const dashboard = await request.get("/dashboard", { maxRedirects: 0 });
  expect(dashboard.status()).toBe(307);
  expect(dashboard.headers()["location"]).toContain("/login?next=%2Fdashboard");

  const landing = await request.get("/");
  expect(landing.status()).toBe(200);
  const html = await landing.text();
  expect(html).toContain("<title>");
  expect(html).toMatch(/<meta property="og:title"/);
});
