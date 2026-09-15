import { expect, test } from "@playwright/test";
import { E2E_PASSWORD, registerAndOnboard, uniqueEmail } from "./helpers";

test("partner invitation: two accounts plan the same wedding", async ({ page, browser }) => {
  test.setTimeout(150_000);

  // Owner creates the workspace and invites the partner.
  await registerAndOnboard(page);
  await expect(page.getByText("Putri belum bergabung ke workspace ini.")).toBeVisible();
  await page.getByRole("link", { name: "Undang pasangan" }).click();
  await expect(page).toHaveURL(/\/settings\/partner$/);

  const partnerEmail = uniqueEmail("putri");
  await page.getByLabel(/^Email pasangan/).fill(partnerEmail);
  await page.getByRole("button", { name: "Kirim undangan" }).click();
  const linkInput = page.getByLabel("Tautan undangan");
  await expect(linkInput).toBeVisible();
  const inviteUrl = await linkInput.inputValue();
  expect(inviteUrl).toMatch(/\/invite\/partner\?token=[\w-]+$/);
  await expect(page.getByText(`Menunggu ${partnerEmail} menerima undangan.`)).toBeVisible();

  // Partner opens the link in a separate browser (separate session), signs up and accepts.
  const partnerContext = await browser.newContext();
  const partnerPage = await partnerContext.newPage();
  await partnerPage.goto(inviteUrl);
  await expect(partnerPage.getByRole("heading", { level: 1, name: "Putri & Fajar" })).toBeVisible();
  await partnerPage.getByRole("link", { name: "Daftar untuk menerima" }).click();

  await partnerPage.getByLabel(/^Nama/).fill("Putri");
  await partnerPage.getByLabel(/^Email/).fill(partnerEmail);
  await partnerPage.getByLabel(/^Password/).fill(E2E_PASSWORD);
  await partnerPage.getByLabel(/^Konfirmasi password/).fill(E2E_PASSWORD);
  await partnerPage.getByRole("button", { name: "Daftar" }).click();

  await expect(partnerPage).toHaveURL(/\/invite\/partner\?token=/);
  await partnerPage.getByRole("button", { name: "Terima undangan" }).click();
  await expect(partnerPage).toHaveURL(/\/dashboard\?notice=partner_joined$/);
  await expect(partnerPage.getByRole("heading", { level: 1, name: "Putri & Fajar" })).toBeVisible();
  await expect(partnerPage.getByText("Pemilik workspace")).toBeVisible();
  await expect(partnerPage.getByText(/Rp\s100\.000\.000/)).toBeVisible();

  // Partner completes a task.
  await partnerPage.goto("/checklist?q=Daftar+nikah+ke+KUA");
  await partnerPage.getByRole("button", { name: "Tandai selesai: Daftar nikah ke KUA", exact: true }).click();
  await expect(partnerPage.getByText(/^1 dari \d+ tugas selesai$/)).toBeVisible();

  // Owner sees the same progress and the partner's activity.
  await page.goto("/dashboard");
  await expect(page.getByText(/^1 dari \d+ tugas selesai$/)).toBeVisible();
  await expect(page.getByText("Putri menyelesaikan tugas “Daftar nikah ke KUA”")).toBeVisible();
  await expect(page.getByText("Putri bergabung ke workspace")).toBeVisible();

  // The invitation link cannot be reused.
  const strangerContext = await browser.newContext();
  const strangerPage = await strangerContext.newPage();
  await strangerPage.goto(inviteUrl);
  await expect(strangerPage.getByRole("heading", { name: "Undangan tidak berlaku" })).toBeVisible();

  await Promise.all([partnerContext.close(), strangerContext.close()]);
});
