import "server-only";
import { redirect } from "next/navigation";
import type { Feature } from "@/lib/billing";
import { requireSession } from "@/server/auth/session-cookie";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";
import { weddingHasFeature } from "./access";

/**
 * Page-level convenience on top of the service-level gate: a locked section sends the couple to the
 * access page instead of rendering an error. The services still refuse on their own.
 */
export async function requireFeaturePage(feature: Feature): Promise<void> {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");
  if (!(await weddingHasFeature(membership.wedding.id, feature))) redirect(`/billing?feature=${feature}`);
}
