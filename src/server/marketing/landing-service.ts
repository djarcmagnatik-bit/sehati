import "server-only";
import { knownFeatures, type Feature } from "@/lib/billing";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { listActivePlans } from "@/server/billing/billing-service";
import { getDb } from "@/server/db";

export type LandingData = {
  plan: { name: string; price: bigint; durationDays: number | null; features: Feature[] } | null;
  /** The example invitation the operator chose (DEMO_INVITATION_SLUG), only while it is published. */
  demoInvitationSlug: string | null;
  /** Reference data counts, so the page never quotes a stale number. Null when unavailable. */
  counts: { taskTemplates: number; budgetCategories: number; vendorCategories: number } | null;
};

/**
 * What the public landing page shows from the database. Prices come from the admin-managed plans, so
 * the page never advertises a stale price. A database hiccup only hides these parts.
 *
 * The example invitation is named in the server configuration, never looked up by account name:
 * anyone can register, so a lookup by name could make the landing page link to a stranger's page.
 */
export async function getLandingData(): Promise<LandingData> {
  try {
    const slug = getEnv().DEMO_INVITATION_SLUG;
    const db = getDb();
    const [plans, demo, taskTemplates, budgetCategories, vendorCategories] = await Promise.all([
      listActivePlans(),
      slug ? db.invitation.findFirst({ where: { slug, status: "PUBLISHED" }, select: { slug: true } }) : null,
      db.taskTemplate.count({ where: { isActive: true } }),
      db.budgetCategoryTemplate.count({ where: { isActive: true } }),
      db.vendorCategory.count({ where: { isActive: true } }),
    ]);
    const plan = plans[0];
    return {
      plan: plan ? { name: plan.name, price: plan.price, durationDays: plan.durationDays, features: knownFeatures(plan.features) } : null,
      demoInvitationSlug: demo?.slug ?? null,
      counts: { taskTemplates, budgetCategories, vendorCategories },
    };
  } catch (error) {
    logger.error("landing.data_failed", { error });
    return { plan: null, demoInvitationSlug: null, counts: null };
  }
}
