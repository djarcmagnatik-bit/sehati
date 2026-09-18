import { z } from "zod";

export type Mailbox = { name: string | null; address: string };

const emailSchema = z.email();

/**
 * Parses `Name <user@domain>` or a bare `user@domain` (as used for MAIL_FROM). Returns null for
 * anything else, including line breaks that could smuggle extra headers.
 */
export function parseMailbox(value: string | undefined): Mailbox | null {
  if (!value || /[\r\n]/.test(value)) return null;
  const trimmed = value.trim();
  const angle = /^(.*?)\s*<([^<>\s]+)>$/.exec(trimmed);
  const name = angle ? angle[1]!.trim().replace(/^"(.*)"$/, "$1") : null;
  const address = (angle ? angle[2]! : trimmed).toLowerCase();
  if (!emailSchema.safeParse(address).success) return null;
  if (name !== null && /[<>"]/.test(name)) return null;
  return { name: name || null, address };
}
