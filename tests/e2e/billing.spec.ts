import { expect, test } from "./fixtures";
import { registerAndOnboard } from "./helpers";

test("billing: free workspace is locked until a webhook-confirmed payment unlocks it", async ({ page, isMobile }) => {
  test.setTimeout(180_000);
  await registerAndOnboard(page, { access: "free" });

  // Dashboard previews paid sections without loading them.
  await expect(page.getByText("Budget & pembayaran tersedia di Akses Penuh.").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Buka checklist" })).toBeVisible();

  // Paid pages send the couple to the access page, server-side.
  await page.goto("/budget");
  await expect(page).toHaveURL(/\/billing\?feature=budget$/);
  await expect(page.getByTestId("access-status")).toHaveText("Akses Gratis");
  await expect(page.getByTestId("feature-budget")).toContainText("Terkunci");
  await page.goto("/guests/new");
  await expect(page).toHaveURL(/\/billing\?feature=guests$/);

  // Free sections stay open.
  await page.goto("/checklist");
  await expect(page.getByRole("heading", { level: 1, name: "Checklist" })).toBeVisible();

  // A failed payment changes nothing.
  await page.goto("/billing");
  await page.getByRole("button", { name: "Beli Akses Penuh" }).click();
  await expect(page).toHaveURL(/\/payments\/sandbox\/SHT-\d{8}-[A-Z0-9]{10}$/);
  await page.getByRole("button", { name: "Gagalkan (simulasi)" }).click();
  await expect(page).toHaveURL(/\/billing\/return\?order=SHT-/);
  await expect(page.getByTestId("payment-status")).toHaveText("Gagal");
  await page.goto("/budget");
  await expect(page).toHaveURL(/\/billing\?feature=budget$/);

  // A paid one unlocks everything — the page only reports what the webhook stored.
  await page.getByRole("button", { name: "Beli Akses Penuh" }).click();
  await expect(page.getByText("Mode simulasi")).toBeVisible();
  await page.getByRole("button", { name: "Bayar (simulasi)" }).click();
  await expect(page.getByTestId("payment-status")).toHaveText("Lunas");
  await expect(page.getByText(/Pembayaran diterima/)).toBeVisible();

  await page.goto("/budget");
  await expect(page).toHaveURL(/\/budget$/);
  await page.goto("/billing");
  await expect(page.getByTestId("access-status")).toHaveText("Akses Penuh aktif");
  await expect(page.getByRole("button", { name: "Beli Akses Penuh" })).toHaveCount(0);
  await expect(page.getByRole("table", { name: "Riwayat pembayaran" })).toContainText("Lunas");
  await expect(page.getByRole("table", { name: "Riwayat pembayaran" })).toContainText("Gagal");

  await page.goto("/dashboard");
  await expect(page.getByTestId("budget-target")).toBeVisible();

  if (isMobile) {
    await page.goto("/billing");
    expect(await page.evaluate(() => window.innerWidth)).toBe(412);
  }
});

test("billing: a forged webhook is rejected and grants nothing", async ({ page, request }) => {
  await registerAndOnboard(page, { access: "free" });
  await page.goto("/billing");
  await page.getByRole("button", { name: "Beli Akses Penuh" }).click();
  await expect(page).toHaveURL(/\/payments\/sandbox\/SHT-/);
  const orderId = page.url().split("/").pop()!;

  const response = await request.post("/api/payments/webhook/sandbox", {
    data: { order_id: orderId, status: "PAID", gross_amount: "149000", event_id: "forged" },
    headers: { "x-sandbox-signature": "0".repeat(64) },
  });
  expect(response.status()).toBe(401);

  // The redirect page is not proof of payment either.
  await page.goto(`/billing/return?order=${orderId}`);
  await expect(page.getByTestId("payment-status")).toHaveText("Menunggu pembayaran");
  await page.goto("/budget");
  await expect(page).toHaveURL(/\/billing\?feature=budget$/);
});
