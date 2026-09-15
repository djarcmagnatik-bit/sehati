import "server-only";
import { hash, verify } from "@node-rs/argon2";

// Argon2id (library default) with the OWASP baseline: 19 MiB memory, 2 iterations, 1 lane.
const HASH_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, HASH_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
