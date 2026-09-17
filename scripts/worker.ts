/**
 * Background worker: schedules the periodic jobs and drains the PostgreSQL job queue.
 *
 *   pnpm worker            # keeps running, polls every WORKER_POLL_MS (default 5000)
 *   pnpm worker -- --once  # one cycle, then exit (cron, tests)
 *
 * Several workers may run at once: jobs are claimed with FOR UPDATE SKIP LOCKED.
 * Runs with the react-server condition so it can use the same server modules as the app.
 */
import { hostname } from "node:os";
import { config } from "dotenv";

config({ quiet: true });

const once = process.argv.includes("--once");
const pollMs = Math.max(1000, Number(process.env["WORKER_POLL_MS"] ?? 5000) || 5000);
const workerId = `${hostname()}:${process.pid}`.slice(0, 80);

async function main() {
  const [{ runWorkerTick }, { getDb }] = await Promise.all([import("../src/server/jobs/runner"), import("../src/server/db")]);
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  try {
    do {
      const summary = await runWorkerTick(workerId);
      if (once || summary.done + summary.retried + summary.dead > 0) {
        console.log(JSON.stringify({ level: "info", time: new Date().toISOString(), event: "worker.tick", context: { workerId, ...summary } }));
      }
      if (once) break;
      // Sleep in short slices so Ctrl+C stops the worker promptly.
      for (let waited = 0; waited < pollMs && !stopping; waited += 250) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    } while (!stopping);
  } finally {
    await getDb().$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
