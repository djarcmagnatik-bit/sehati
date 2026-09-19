import "server-only";
import { knownFeatures, type Feature } from "@/lib/billing";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { listActivePlans } from "@/server/billing/billing-service";
import { getDb } from "@/server/db";
import { getPublishedInvitation } from "@/server/invitation/public-invitation-service";

/** The example invitation as the landing page shows it: only fields already public on its page. */
export type LandingDemo = {
  slug: string;
  coupleName: string;
  weddingDateIso: string;
  themeCode: string;
  coverImageId: string | null;
  coverImageWidths: number[];
};

export type LandingData = {
  plan: { name: string; price: bigint; durationDays: number | null; features: Feature[] } | null;
  /** The example invitation the operator chose (DEMO_INVITATION_SLUG), only while it is publicly visible. */
  demo: LandingDemo | null;
  /** Reference data counts, so the page never quotes a stale number. Null when unavailable. */
  counts: { taskTemplates: number; budgetCategories: number; vendorCategories: number } | null;
};

/**
 * What the public landing page shows from the database. Prices come from the admin-managed plans, so
 * the page never advertises a stale price. A database hiccup only hides these parts.
 *
 * The example invitation is named in the server configuration, never looked up by account name:
 * anyone can register, so a lookup by name could make the landing page link to a stranger's page.
 * It is loaded through the public invitation service, so the landing page can never show more than
 * the invitation itself shows (and nothing once it is unpublished or its access lapses).
 */
export async function getLandingData(): Promise<LandingData> {
  try {
    const slug = getEnv().DEMO_INVITATION_SLUG;
    const db = getDb();
    const [plans, invitation, taskTemplates, budgetCategories, vendorCategories] = await Promise.all([
      listActivePlans(),
      slug ? getPublishedInvitation(slug) : null,
      db.taskTemplate.count({ where: { isActive: true } }),
      db.budgetCategoryTemplate.count({ where: { isActive: true } }),
      db.vendorCategory.count({ where: { isActive: true } }),
    ]);
    const plan = plans[0];
    return {
      plan: plan ? { name: plan.name, price: plan.price, durationDays: plan.durationDays, features: knownFeatures(plan.features) } : null,
      demo: invitation
        ? {
            slug: invitation.slug,
            coupleName: invitation.coupleName,
            weddingDateIso: invitation.weddingDateIso,
            themeCode: invitation.themeCode,
            coverImageId: invitation.coverImageId,
            coverImageWidths: invitation.coverImageWidths,
          }
        : null,
      counts: { taskTemplates, budgetCategories, vendorCategories },
    };
  } catch (error) {
    logger.error("landing.data_failed", { error });
    return { plan: null, demo: null, counts: null };
  }
}
