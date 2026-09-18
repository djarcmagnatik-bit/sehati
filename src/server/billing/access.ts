import "server-only";
import { cache } from "react";
import { isEntitlementActive, knownFeatures, type Feature } from "@/lib/billing";
import { requireWeddingMember, type WeddingMembership } from "@/server/authz/wedding-access";
import { getDb } from "@/server/db";

/** The wedding is a member's, but this feature is not part of its access. Never thrown to outsiders. */
export class FeatureLockedError extends Error {
  constructor(readonly feature: Feature) {
    super(`Feature locked: ${feature}`);
    this.name = "FeatureLockedError";
  }
}

async function loadWeddingFeatures(weddingId: string, now: Date): Promise<Set<Feature>> {
  const entitlements = await getDb().weddingEntitlement.findMany({
    where: { weddingId, revokedAt: null },
    select: { startsAt: true, expiresAt: true, revokedAt: true, plan: { select: { features: true } } },
  });
  const features = new Set<Feature>();
  for (const entitlement of entitlements) {
    if (!isEntitlementActive(entitlement, now)) continue;
    for (const feature of knownFeatures(entitlement.plan.features)) features.add(feature);
  }
  return features;
}

/** Access for many weddings in one query (background jobs that look across weddings). */
export async function getFeaturesForWeddings(weddingIds: readonly string[], now: Date): Promise<Map<string, Set<Feature>>> {
  const result = new Map<string, Set<Feature>>(weddingIds.map((id) => [id, new Set<Feature>()]));
  if (weddingIds.length === 0) return result;
  const entitlements = await getDb().weddingEntitlement.findMany({
    where: { weddingId: { in: [...new Set(weddingIds)] }, revokedAt: null },
    select: { weddingId: true, startsAt: true, expiresAt: true, revokedAt: true, plan: { select: { features: true } } },
  });
  for (const entitlement of entitlements) {
    if (!isEntitlementActive(entitlement, now)) continue;
    const features = result.get(entitlement.weddingId)!;
    for (const feature of knownFeatures(entitlement.plan.features)) features.add(feature);
  }
  return result;
}

/** Memoized per request inside Next.js; a plain call everywhere else (scripts, tests). */
const cachedWeddingFeatures = cache((weddingId: string) => loadWeddingFeatures(weddingId, new Date()));

export function getWeddingFeatures(weddingId: string, now?: Date): Promise<Set<Feature>> {
  return now ? loadWeddingFeatures(weddingId, now) : cachedWeddingFeatures(weddingId);
}

export async function weddingHasFeature(weddingId: string, feature: Feature): Promise<boolean> {
  return (await getWeddingFeatures(weddingId)).has(feature);
}

/**
 * Membership first, then access: someone outside the wedding gets the usual not-found error and
 * learns nothing about what the wedding has paid for.
 */
export async function requireWeddingFeature(
  feature: Feature,
  userId: string,
  weddingId: string,
  options?: { ownerOnly?: boolean },
): Promise<WeddingMembership> {
  const membership = await requireWeddingMember(userId, weddingId, options);
  if (!(await weddingHasFeature(membership.weddingId, feature))) throw new FeatureLockedError(feature);
  return membership;
}
