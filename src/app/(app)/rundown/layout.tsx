import type { ReactNode } from "react";
import { requireFeaturePage } from "@/server/billing/page-guard";

export default async function Layout({ children }: { children: ReactNode }) {
  await requireFeaturePage("rundown");
  return children;
}
