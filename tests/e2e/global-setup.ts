import { spawnSync } from "node:child_process";

/** Runs once before the E2E suite: reset rate limits in the test database (see script for safeguards). */
export default function globalSetup() {
  // A fixed command string (no interpolated arguments) so the shell is only used to resolve `pnpm`.
  const result = spawnSync("pnpm exec tsx scripts/reset-test-rate-limits.ts", { stdio: "inherit", shell: true });
  if (result.status !== 0) {
    throw new Error("Gagal mengosongkan rate limit di database test sebelum E2E.");
  }
}
