import type { z } from "zod";
import type { FieldErrors } from "@/lib/form-state";

/** Groups Zod issues by top-level field name. Issues without a path go under "_form". */
export function fieldErrorsFromZod(error: z.ZodError): FieldErrors {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : "_form";
    (result[key] ??= []).push(issue.message);
  }
  return result;
}
