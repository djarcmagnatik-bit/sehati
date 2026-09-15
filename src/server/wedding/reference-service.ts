import "server-only";
import { getDb } from "@/server/db";

export type ReferenceOption = { id: string; name: string; description: string | null };

const optionSelect = { id: true, name: true, description: true } as const;

export function getActiveEventTypes(): Promise<ReferenceOption[]> {
  return getDb().eventType.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: optionSelect,
  });
}

export function getActiveMarriageProcesses(): Promise<ReferenceOption[]> {
  return getDb().marriageProcess.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: optionSelect,
  });
}
