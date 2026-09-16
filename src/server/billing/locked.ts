import "server-only";
import { FEATURE_LABEL } from "@/lib/billing";
import type { FormState } from "@/lib/form-state";
import { FeatureLockedError } from "./access";

export { FeatureLockedError };

/** Where a locked action or page sends the couple: the access page, naming what they tried to use. */
export function upgradePath(error: FeatureLockedError): string {
  return `/billing?feature=${error.feature}`;
}

export function lockedState(error: FeatureLockedError, values?: Record<string, string>): FormState {
  return {
    status: "error",
    message: `${FEATURE_LABEL[error.feature]} tersedia di Akses Penuh. Buka halaman Akses & pembayaran untuk mengaktifkannya.`,
    values,
  };
}
