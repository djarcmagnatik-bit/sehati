/**
 * Runs a command with DATABASE_URL pointed at DATABASE_URL_TEST.
 * Usage: tsx scripts/with-test-db.ts prisma migrate deploy
 */
import { spawnSync } from "node:child_process";
import { config } from "dotenv";

config({ path: ".env.test", quiet: true });
config({ quiet: true });

const testUrl = process.env["DATABASE_URL_TEST"];
if (!testUrl) {
  console.error("DATABASE_URL_TEST belum diisi di .env / .env.test");
  process.exit(1);
}
if (testUrl === process.env["DATABASE_URL"]) {
  console.error("DATABASE_URL_TEST tidak boleh sama dengan DATABASE_URL");
  process.exit(1);
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("Usage: tsx scripts/with-test-db.ts <command> [...args]");
  process.exit(1);
}

const result = spawnSync(command, args, {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, DATABASE_URL: testUrl },
});
process.exit(result.status ?? 1);
