import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { AdminAccessError, requireAdmin } from "@/server/admin/admin-access";
import {
  createPlan,
  createPromoCode,
  getPromoCodeForAdmin,
  listPromoCodes,
  listTransactions,
  updatePlan,
  updatePromoCode,
} from "@/server/admin/admin-billing-service";
import {
  createTaskTemplate,
  getTemplateFormOptions,
  listAuditLogs,
  listThemesForAdmin,
  updateTaskTemplate,
  updateThemeSetting,
} from "@/server/admin/admin-content-service";
import { getAdminStats } from "@/server/admin/admin-stats-service";
import {
  adminGrantPlanToWedding,
  adminRevokeEntitlement,
  getWeddingDetail,
  listUsers,
  setUserRole,
  suspendUser,
  unsuspendUser,
} from "@/server/admin/admin-user-service";
import { authenticateUser } from "@/server/auth/auth-service";
import { createSession, validateSessionToken } from "@/server/auth/session-service";
import { getWeddingFeatures } from "@/server/billing/access";
import { adminGrantPlan, startCheckout } from "@/server/billing/billing-service";
import { getDb } from "@/server/db";
import { ensureInvitation, updateInvitationTheme } from "@/server/invitation/invitation-service";
import type { PlanInput, PromoCodeInput, TaskTemplateInput } from "@/lib/validation/admin";
import { createTestUser, deleteUsers, TEST_PASSWORD } from "../support/integration-helpers";
import { createOwnerWorkspace } from "../support/workspace-helpers";

const userIds: string[] = [];
const planCodes: string[] = [];
const promoIds: string[] = [];
const templateIds: string[] = [];
const touchedThemes = new Set<string>();

afterAll(async () => {
  const db = getDb();
  await deleteUsers(userIds);
  await db.promoCode.deleteMany({ where: { id: { in: promoIds } } });
  await db.plan.deleteMany({ where: { code: { in: planCodes } } });
  await db.taskTemplate.deleteMany({ where: { id: { in: templateIds } } });
  await db.invitationThemeSetting.deleteMany({ where: { code: { in: [...touchedThemes] } } });
  await db.adminAuditLog.deleteMany({ where: { actorId: null, actorEmail: { endsWith: "@example.test" } } });
});

async function createAdmin(name = "Admin") {
  const user = await createTestUser(userIds, name);
  await getDb().user.update({ where: { id: user.userId }, data: { role: "ADMIN" } });
  return user;
}

function uniqueCode(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}

function planInput(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    code: uniqueCode("TEST_PLAN"),
    name: "Paket uji",
    description: null,
    price: 50_000n,
    durationDays: null,
    features: ["rundown"],
    isActive: true,
    sortOrder: 900,
    ...overrides,
  };
}

function promoInput(overrides: Partial<PromoCodeInput> = {}): PromoCodeInput {
  return {
    code: uniqueCode("PROMO"),
    description: null,
    discountType: "PERCENT",
    discountValue: 20n,
    planId: null,
    startsOn: null,
    endsOn: null,
    usageLimit: null,
    perUserLimit: null,
    isActive: true,
    ...overrides,
  };
}

async function newPromo(adminId: string, overrides: Partial<PromoCodeInput> = {}) {
  const input = promoInput(overrides);
  const result = await createPromoCode(adminId, input);
  if (!result.ok) throw new Error(`promo creation failed: ${result.reason}`);
  promoIds.push(result.id);
  return { id: result.id, code: input.code };
}

async function fullAccessPrice(): Promise<bigint> {
  return (await getDb().plan.findUniqueOrThrow({ where: { code: "FULL_ACCESS" }, select: { price: true } })).price;
}

describe("admin access", () => {
  it("allows only active admins and reads the role fresh every time", async () => {
    const user = await createTestUser(userIds, "Biasa");
    await expect(requireAdmin(user.userId)).rejects.toBeInstanceOf(AdminAccessError);
    await expect(listUsers(user.userId, { q: "", role: "all", status: "all", page: 1 })).rejects.toBeInstanceOf(AdminAccessError);
    await expect(getAdminStats(user.userId, { fresh: true })).rejects.toBeInstanceOf(AdminAccessError);

    const admin = await createAdmin();
    await expect(requireAdmin(admin.userId)).resolves.toMatchObject({ id: admin.userId, email: admin.email });

    await getDb().user.update({ where: { id: admin.userId }, data: { role: "USER" } });
    await expect(requireAdmin(admin.userId)).rejects.toBeInstanceOf(AdminAccessError);

    await getDb().user.update({ where: { id: admin.userId }, data: { role: "ADMIN", suspendedAt: new Date() } });
    await expect(requireAdmin(admin.userId)).rejects.toBeInstanceOf(AdminAccessError);
  });

  it("aggregates dashboard figures", async () => {
    const admin = await createAdmin();
    const stats = await getAdminStats(admin.userId, { fresh: true });
    expect(stats.totalUsers).toBeGreaterThanOrEqual(1);
    expect(typeof stats.revenue).toBe("bigint");
    expect(stats.paidWeddings).toBeLessThanOrEqual(stats.totalWeddings);
  });
});

describe("user moderation", () => {
  it("suspension blocks sign-in, ends sessions, and is audited", async () => {
    const admin = await createAdmin();
    const target = await createTestUser(userIds, "Target");
    const { token } = await createSession(target.userId, { remember: false });
    expect(await validateSessionToken(token)).not.toBeNull();

    expect(await suspendUser(admin.userId, target.userId, "Spam berulang")).toEqual({ ok: true });
    expect(await authenticateUser(target.email, TEST_PASSWORD)).toBeNull();
    expect(await validateSessionToken(token)).toBeNull();
    expect(await getDb().session.count({ where: { userId: target.userId } })).toBe(0);
    expect(await suspendUser(admin.userId, target.userId, "Lagi")).toEqual({ ok: false, reason: "unchanged" });

    const logs = await listAuditLogs(admin.userId, { targetType: "user", q: target.userId, page: 1 });
    expect(logs.items[0]).toMatchObject({ action: "user.suspended", actorEmail: admin.email });
    expect(logs.items[0]?.summary).toMatchObject({ reason: "Spam berulang", sessionsRevoked: 1 });

    expect(await unsuspendUser(admin.userId, target.userId)).toEqual({ ok: true });
    expect(await authenticateUser(target.email, TEST_PASSWORD)).toEqual({ id: target.userId });
  });

  it("refuses to act on the admin's own account", async () => {
    const admin = await createAdmin();
    expect(await suspendUser(admin.userId, admin.userId, "Coba")).toEqual({ ok: false, reason: "self" });
    expect(await setUserRole(admin.userId, admin.userId, "USER")).toEqual({ ok: false, reason: "self" });
    expect(await setUserRole(admin.userId, randomUUID(), "ADMIN")).toEqual({ ok: false, reason: "not_found" });
  });

  it("lets only one of two admins win when they demote each other at once", async () => {
    const first = await createAdmin("Satu");
    const second = await createAdmin("Dua");
    const results = await Promise.allSettled([
      setUserRole(first.userId, second.userId, "USER"),
      setUserRole(second.userId, first.userId, "USER"),
    ]);
    const succeeded = results.filter((result) => result.status === "fulfilled" && result.value.ok);
    const denied = results.filter((result) => result.status === "rejected" && result.reason instanceof AdminAccessError);
    expect(succeeded).toHaveLength(1);
    expect(denied).toHaveLength(1);
    const roles = await getDb().user.findMany({ where: { id: { in: [first.userId, second.userId] } }, select: { role: true } });
    expect(roles.map((row) => row.role).sort()).toEqual(["ADMIN", "USER"]);
  });

  it("lets only one of two admins win when they suspend each other at once", async () => {
    const first = await createAdmin("Tiga");
    const second = await createAdmin("Empat");
    const results = await Promise.allSettled([
      suspendUser(first.userId, second.userId, "Saling suspend"),
      suspendUser(second.userId, first.userId, "Saling suspend"),
    ]);
    expect(results.filter((result) => result.status === "fulfilled" && result.value.ok)).toHaveLength(1);
    const suspended = await getDb().user.count({ where: { id: { in: [first.userId, second.userId] }, suspendedAt: { not: null } } });
    expect(suspended).toBe(1);
  });
});

describe("wedding access management", () => {
  it("grants and revokes a plan with audit entries", async () => {
    const admin = await createAdmin();
    const { weddingId } = await createOwnerWorkspace(userIds, { access: "free" });

    expect(await adminGrantPlanToWedding(admin.userId, weddingId, "NOPE", "uji")).toEqual({ ok: false, reason: "unknown_plan" });
    expect(await adminGrantPlanToWedding(admin.userId, randomUUID(), "FULL_ACCESS", "uji")).toEqual({ ok: false, reason: "unknown_wedding" });
    expect(await adminGrantPlanToWedding(admin.userId, weddingId, "FULL_ACCESS", "Kompensasi gangguan")).toEqual({ ok: true });
    expect((await getWeddingFeatures(weddingId, new Date())).has("budget")).toBe(true);

    const detail = await getWeddingDetail(admin.userId, weddingId);
    const entitlement = detail?.entitlements[0];
    expect(entitlement).toMatchObject({ source: "ADMIN_GRANT", active: true, note: "Kompensasi gangguan" });

    expect(await adminRevokeEntitlement(admin.userId, entitlement!.id, "Selesai")).toEqual({ ok: true, weddingId });
    expect(await adminRevokeEntitlement(admin.userId, entitlement!.id, "Lagi")).toEqual({ ok: false, reason: "unchanged" });
    expect((await getWeddingFeatures(weddingId, new Date())).size).toBe(0);

    const logs = await listAuditLogs(admin.userId, { targetType: "wedding", q: weddingId, page: 1 });
    expect(logs.items.map((item) => item.action)).toEqual(["entitlement.revoked", "entitlement.granted"]);
  });
});

describe("plans", () => {
  it("creates, rejects duplicate codes, and keeps the code fixed on update", async () => {
    const admin = await createAdmin();
    const input = planInput();
    planCodes.push(input.code);
    const created = await createPlan(admin.userId, input);
    expect(created.ok).toBe(true);
    expect(await createPlan(admin.userId, input)).toEqual({ ok: false, reason: "duplicate_code" });

    const id = created.ok ? created.id : "";
    const updated = await updatePlan(admin.userId, id, { ...input, code: "SOMETHING_ELSE", price: 75_000n, isActive: false });
    expect(updated).toEqual({ ok: true, id });
    const plan = await getDb().plan.findUniqueOrThrow({ where: { id } });
    expect(plan).toMatchObject({ code: input.code, price: 75_000n, isActive: false });

    const logs = await listAuditLogs(admin.userId, { targetType: "plan", q: id, page: 1 });
    expect(logs.items[0]?.summary).toMatchObject({ code: input.code, price: "75000", previousPrice: "50000" });
  });
});

describe("promo codes at checkout", () => {
  it("discounts a plan checkout and records the redemption", async () => {
    const admin = await createAdmin();
    const promo = await newPromo(admin.userId, { discountType: "PERCENT", discountValue: 20n });
    const { owner, weddingId } = await createOwnerWorkspace(userIds, { access: "free" });
    const price = await fullAccessPrice();

    const result = await startCheckout(owner.userId, weddingId, { kind: "PLAN", code: "FULL_ACCESS" }, new Date(), {
      promoCode: `  ${promo.code.toLowerCase()} `,
    });
    expect(result.ok).toBe(true);
    const transaction = await getDb().paymentTransaction.findUniqueOrThrow({ where: { orderId: result.ok ? result.orderId : "" } });
    expect(transaction).toMatchObject({ originalAmount: price, discountAmount: price / 5n, amount: price - price / 5n, promoCodeId: promo.id });
    expect(await getDb().promoRedemption.count({ where: { promoCodeId: promo.id } })).toBe(1);

    const list = await listPromoCodes(admin.userId);
    expect(list.find((item) => item.id === promo.id)?.uses).toBe(1);
    const transactions = await listTransactions(admin.userId, { status: "all", q: transaction.orderId, page: 1 });
    expect(transactions.items[0]?.promoCode?.code).toBe(promo.code);
  });

  it("rejects unknown, inactive, not-yet-started, expired and malformed codes", async () => {
    const admin = await createAdmin();
    const { owner, weddingId } = await createOwnerWorkspace(userIds, { access: "free" });
    const checkout = (code: string, now = new Date()) =>
      startCheckout(owner.userId, weddingId, { kind: "PLAN", code: "FULL_ACCESS" }, now, { promoCode: code });

    expect(await checkout("TIDAK-ADA-123")).toEqual({ ok: false, reason: "promo_invalid" });
    expect(await checkout("!!")).toEqual({ ok: false, reason: "promo_invalid" });

    const inactive = await newPromo(admin.userId, { isActive: false });
    expect(await checkout(inactive.code)).toEqual({ ok: false, reason: "promo_invalid" });

    const future = await newPromo(admin.userId);
    await getDb().promoCode.update({ where: { id: future.id }, data: { startsAt: new Date(Date.now() + 86_400_000) } });
    expect(await checkout(future.code)).toEqual({ ok: false, reason: "promo_invalid" });

    const expired = await newPromo(admin.userId);
    await getDb().promoCode.update({ where: { id: expired.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await checkout(expired.code)).toEqual({ ok: false, reason: "promo_expired" });

    expect(await getDb().paymentTransaction.count({ where: { weddingId } })).toBe(0);
  });

  it("applies plan restrictions, never discounts add-ons, and keeps a minimum charge", async () => {
    const admin = await createAdmin();
    const otherPlan = planInput();
    planCodes.push(otherPlan.code);
    const plan = await createPlan(admin.userId, otherPlan);
    const restricted = await newPromo(admin.userId, { planId: plan.ok ? plan.id : null });
    const price = await fullAccessPrice();
    const tooLarge = await newPromo(admin.userId, { discountType: "FIXED", discountValue: price - 500n });
    const { owner, weddingId } = await createOwnerWorkspace(userIds, { access: "free" });

    expect(await startCheckout(owner.userId, weddingId, { kind: "PLAN", code: "FULL_ACCESS" }, new Date(), { promoCode: restricted.code })).toEqual({
      ok: false,
      reason: "promo_not_applicable",
    });
    expect(await startCheckout(owner.userId, weddingId, { kind: "ADDON", code: "ANY" }, new Date(), { promoCode: restricted.code })).toEqual({
      ok: false,
      reason: "promo_not_applicable",
    });
    expect(await startCheckout(owner.userId, weddingId, { kind: "PLAN", code: "FULL_ACCESS" }, new Date(), { promoCode: tooLarge.code })).toEqual({
      ok: false,
      reason: "promo_too_large",
    });
  });

  it("enforces the usage limit under concurrent checkouts and frees lapsed reservations", async () => {
    const admin = await createAdmin();
    const promo = await newPromo(admin.userId, { usageLimit: 1 });
    const workspaces = await Promise.all([1, 2, 3].map(() => createOwnerWorkspace(userIds, { access: "free" })));

    const results = await Promise.all(
      workspaces.slice(0, 2).map(({ owner, weddingId }) =>
        startCheckout(owner.userId, weddingId, { kind: "PLAN", code: "FULL_ACCESS" }, new Date(), { promoCode: promo.code }),
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok && result.reason === "promo_exhausted")).toHaveLength(1);

    // The winning checkout lapses unpaid: the code becomes usable again.
    await getDb().paymentTransaction.updateMany({ where: { promoCodeId: promo.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const third = workspaces[2]!;
    const retry = await startCheckout(third.owner.userId, third.weddingId, { kind: "PLAN", code: "FULL_ACCESS" }, new Date(), {
      promoCode: promo.code,
    });
    expect(retry.ok).toBe(true);
  });

  it("enforces the per-user limit across that user's checkouts", async () => {
    const admin = await createAdmin();
    const promo = await newPromo(admin.userId, { perUserLimit: 1 });
    const { owner, weddingId } = await createOwnerWorkspace(userIds, { access: "free" });
    const first = await startCheckout(owner.userId, weddingId, { kind: "PLAN", code: "FULL_ACCESS" }, new Date(), { promoCode: promo.code });
    expect(first.ok).toBe(true);
    expect(await startCheckout(owner.userId, weddingId, { kind: "PLAN", code: "FULL_ACCESS" }, new Date(), { promoCode: promo.code })).toEqual({
      ok: false,
      reason: "promo_exhausted",
    });
  });

  it("stores admin date ranges as whole Jakarta days and keeps the code fixed", async () => {
    const admin = await createAdmin();
    const promo = await newPromo(admin.userId, { startsOn: "2026-10-01", endsOn: "2026-10-31" });
    const stored = await getPromoCodeForAdmin(admin.userId, promo.id);
    expect(stored?.startsAt?.toISOString()).toBe("2026-09-30T17:00:00.000Z");
    expect(stored?.expiresAt?.toISOString()).toBe("2026-10-31T17:00:00.000Z");

    const updated = await updatePromoCode(admin.userId, promo.id, promoInput({ code: "GANTI_KODE", discountValue: 30n }));
    expect(updated).toEqual({ ok: true, id: promo.id });
    expect(await getPromoCodeForAdmin(admin.userId, promo.id)).toMatchObject({ code: promo.code, discountValue: 30n });
    expect(await updatePromoCode(admin.userId, promo.id, promoInput({ planId: randomUUID() }))).toEqual({ ok: false, reason: "invalid_plan" });
    expect(await createPromoCode(admin.userId, promoInput({ code: promo.code }))).toEqual({ ok: false, reason: "duplicate_code" });
  });
});

describe("invitation theme metadata", () => {
  it("gates premium themes, hides disabled ones, and never breaks a theme already in use", async () => {
    const admin = await createAdmin();
    const invitationOnly = planInput({ features: ["invitation"] });
    planCodes.push(invitationOnly.code);
    await createPlan(admin.userId, invitationOnly);

    const { owner, weddingId } = await createOwnerWorkspace(userIds, { access: "free" });
    expect((await adminGrantPlan(weddingId, invitationOnly.code, { note: "test" })).ok).toBe(true);
    expect((await ensureInvitation(owner.userId, weddingId)).ok).toBe(true);

    touchedThemes.add("dark-luxury");
    touchedThemes.add("playful");
    await updateThemeSetting(admin.userId, "dark-luxury", { displayName: null, description: null, isEnabled: true, isPremium: true, sortOrder: 60 });
    await updateThemeSetting(admin.userId, "playful", { displayName: "Ceria", description: null, isEnabled: false, isPremium: false, sortOrder: 70 });
    expect(await updateThemeSetting(admin.userId, "tidak-ada", { displayName: null, description: null, isEnabled: true, isPremium: false, sortOrder: 0 })).toEqual({
      ok: false,
    });

    const themes = await listThemesForAdmin(admin.userId);
    expect(themes.find((theme) => theme.code === "playful")).toMatchObject({ name: "Ceria", isEnabled: false });

    expect(await updateInvitationTheme(owner.userId, weddingId, { themeCode: "dark-luxury", coverLayout: "center" })).toEqual({
      ok: false,
      reason: "premium",
    });
    expect(await updateInvitationTheme(owner.userId, weddingId, { themeCode: "playful", coverLayout: "center" })).toEqual({
      ok: false,
      reason: "disabled",
    });

    expect((await adminGrantPlan(weddingId, "FULL_ACCESS", { note: "test" })).ok).toBe(true);
    expect(await updateInvitationTheme(owner.userId, weddingId, { themeCode: "dark-luxury", coverLayout: "center" })).toEqual({ ok: true });

    // Disabling the theme afterwards keeps it working for this invitation, including layout changes.
    await updateThemeSetting(admin.userId, "dark-luxury", { displayName: null, description: null, isEnabled: false, isPremium: true, sortOrder: 60 });
    expect(await updateInvitationTheme(owner.userId, weddingId, { themeCode: "dark-luxury", coverLayout: "bottom" })).toEqual({ ok: true });

    const logs = await listAuditLogs(admin.userId, { targetType: "invitation_theme", q: "", page: 1 });
    expect(logs.items.some((item) => item.targetId === "dark-luxury" && item.action === "theme.updated")).toBe(true);
  });
});

describe("task templates", () => {
  it("creates and updates templates with their event types and marriage processes", async () => {
    const admin = await createAdmin();
    const options = await getTemplateFormOptions(admin.userId);
    const category = options.categories.find((item) => item.isActive)!;
    const input: TaskTemplateInput = {
      title: "Uji template admin",
      description: null,
      categoryId: category.id,
      priority: "HIGH",
      deadlineOffsetDays: -45,
      eventTypeIds: [options.eventTypes[0]!.id],
      marriageProcessIds: options.marriageProcesses.map((item) => item.id),
      isActive: true,
    };

    const created = await createTaskTemplate(admin.userId, input);
    expect(created.ok).toBe(true);
    const id = created.ok ? created.id : "";
    templateIds.push(id);
    const stored = await getDb().taskTemplate.findUniqueOrThrow({
      where: { id },
      include: { eventTypes: true, marriageProcesses: true },
    });
    expect(stored.code).toMatch(/^ADMIN_/);
    expect(stored.eventTypes).toHaveLength(1);
    expect(stored.marriageProcesses).toHaveLength(options.marriageProcesses.length);

    const updated = await updateTaskTemplate(admin.userId, id, {
      ...input,
      title: "Uji template diubah",
      eventTypeIds: options.eventTypes.map((item) => item.id),
      marriageProcessIds: [options.marriageProcesses[0]!.id],
      isActive: false,
    });
    expect(updated).toEqual({ ok: true, id });
    const after = await getDb().taskTemplate.findUniqueOrThrow({ where: { id }, include: { eventTypes: true, marriageProcesses: true } });
    expect(after).toMatchObject({ title: "Uji template diubah", isActive: false });
    expect(after.eventTypes).toHaveLength(options.eventTypes.length);
    expect(after.marriageProcesses).toHaveLength(1);

    expect(await createTaskTemplate(admin.userId, { ...input, categoryId: randomUUID() })).toEqual({ ok: false, reason: "invalid_reference" });
    expect(await updateTaskTemplate(admin.userId, randomUUID(), input)).toEqual({ ok: false, reason: "not_found" });
  });
});
