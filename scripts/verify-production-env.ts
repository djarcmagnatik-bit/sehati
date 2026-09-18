/**
 * Checks a production environment before deploying (variable names only; values are never printed).
 *
 *   NODE_ENV=production pnpm verify:env            # uses the current environment / .env
 *   pnpm verify:env -- --file .env.production      # reads a specific env file
 *
 * Exit code 1 when a rule fails; warnings are listed but do not fail.
 */
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { checkProductionEnv } from "../src/lib/production-checks";

const fileIndex = process.argv.indexOf("--file");
const env: Record<string, string | undefined> =
  fileIndex > -1 ? { NODE_ENV: "production", ...parse(readFileSync(process.argv[fileIndex + 1]!, "utf8")) } : { ...process.env };

const results = checkProductionEnv(env);
for (const result of results) console.log(`${result.level === "error" ? "ERROR  " : "WARNING"} ${result.variable}: ${result.message}`);
const errors = results.filter((result) => result.level === "error").length;
console.log(errors === 0 ? `OK — ${results.length} warning(s).` : `${errors} error(s), ${results.length - errors} warning(s).`);
process.exit(errors === 0 ? 0 : 1);
