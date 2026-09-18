/**
 * HTTP load test against a production build (`next start`) and the TEST database.
 *
 *   pnpm build && pnpm load:seed
 *   pnpm load:run -- --spawn [--stages 10:30,25:30,50:30,100:30] [--think 300]
 *   pnpm load:run -- --spawn --instances 3              # 3 servers (ports 3200…), round-robin
 *   pnpm load:run -- --base http://localhost:3200      # against a server you started yourself
 *
 * Each stage runs N virtual users for S seconds. A virtual user loops: pick a scenario by weight,
 * send the request, check the answer, wait a random think time (0 … 2×--think ms). Guests come from
 * different IP addresses (X-Forwarded-For behind one trusted proxy), as they would in production;
 * the app's rate limits are unchanged. Results: .data/load-test/results-*.json and a printed table.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import { PrismaClient } from "../../src/generated/prisma/client";
import { FIXTURE_PATH, LOAD_MEDIA_DIR, type LoadFixture } from "./shared";

config({ path: ".env.test", quiet: true });
config({ quiet: true });

const argValue = (name: string, fallback: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1]! : fallback;
};

const FIRST_PORT = 3200;
const SPAWN = process.argv.includes("--spawn");
const INSTANCES = SPAWN ? Number(argValue("instances", "1")) : 1;
/** One or more servers; requests go round-robin, like a load balancer. */
const BASES = SPAWN
  ? Array.from({ length: INSTANCES }, (_, index) => `http://localhost:${FIRST_PORT + index}`)
  : [argValue("base", `http://localhost:${FIRST_PORT}`).replace(/\/+$/, "")];
const BASE = BASES[0]!;
let nextBase = 0;
const THINK_MS = Number(argValue("think", "300"));
const STAGES = argValue("stages", "10:30,25:30,50:30,100:30").split(",").map((stage) => {
  const [users, seconds] = stage.split(":").map(Number);
  if (!users || !seconds) throw new Error(`invalid stage "${stage}" (use users:seconds)`);
  return { users, seconds };
});
/** PRD §60: common operations < 500 ms under normal load. */
const P95_BUDGET_MS = Number(argValue("p95", "500"));
const REQUEST_TIMEOUT_MS = 30_000;

// ─── Scenarios ───────────────────────────────────────────────────────────────

type Check = { ok: boolean; note?: string };
type Scenario = { name: string; weight: number; run: (vu: VirtualUser) => Promise<Check> };

const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as LoadFixture;
const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;
/** Carrier-grade NAT range: plausible distinct phones. */
const randomIp = () => `100.${64 + Math.floor(Math.random() * 64)}.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 254)}`;

/** The server under test is a production build, which uses the __Host- cookie name. */
let SESSION_COOKIE_NAME = "";
let rsvpTemplate: Array<[string, string]> = [];
let loginTemplate: Array<[string, string]> = [];

class VirtualUser {
  readonly couple = pick(fixture.couples);
  readonly ip = randomIp();

  async request(pathname: string, init: RequestInit & { ip?: string; session?: boolean } = {}) {
    const base = BASES[nextBase++ % BASES.length]!;
    const headers = new Headers(init.headers);
    headers.set("x-forwarded-for", init.ip ?? this.ip);
    // Server Actions compare Origin with Host; a browser sends the site it is on.
    if (init.method === "POST") headers.set("origin", base);
    if (init.session) headers.set("cookie", `${SESSION_COOKIE_NAME}=${this.couple.sessionToken}`);
    return fetch(`${base}${pathname}`, { ...init, headers, redirect: "manual", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  }
}

function formBody(template: Array<[string, string]>, fields: Record<string, string>) {
  const form = new FormData();
  for (const [name, value] of template) form.append(name, value);
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  return form;
}

const SCENARIOS: Scenario[] = [
  {
    name: "guest opens personal invitation",
    weight: 30,
    run: async (vu) => {
      const response = await vu.request(`/i/${pick(vu.couple.guestTokens)}`, { ip: randomIp() });
      const body = await response.text();
      return { ok: response.status === 200 && body.includes("Putri"), note: `HTTP ${response.status}` };
    },
  },
  {
    name: "public invitation page",
    weight: 20,
    run: async (vu) => {
      const response = await vu.request(`/undangan/${vu.couple.slug}`, { ip: randomIp() });
      const body = await response.text();
      return { ok: response.status === 200 && body.includes("Putri"), note: `HTTP ${response.status}` };
    },
  },
  {
    name: "cover photo (960 px WebP)",
    weight: 15,
    run: async (vu) => {
      const response = await vu.request(`/media/${vu.couple.coverAssetId}?w=960`, { ip: randomIp() });
      const bytes = (await response.arrayBuffer()).byteLength;
      return { ok: response.status === 200 && response.headers.get("content-type") === "image/webp" && bytes > 0, note: `HTTP ${response.status}` };
    },
  },
  {
    name: "guest submits RSVP",
    weight: 10,
    run: async (vu) => {
      const token = pick(vu.couple.guestTokens);
      const response = await vu.request(`/i/${token}`, {
        method: "POST",
        ip: randomIp(),
        body: formBody(rsvpTemplate, { token, rsvpStatus: "ATTENDING", attendingCount: "1", attendeeNames: "", message: "" }),
      });
      const body = await response.text();
      return { ok: response.status === 200 && body.includes("sudah kami terima"), note: body.includes("Terlalu banyak") ? "rate limited" : `HTTP ${response.status}` };
    },
  },
  {
    name: "couple dashboard",
    weight: 10,
    run: async (vu) => {
      const response = await vu.request("/dashboard", { session: true });
      await response.arrayBuffer();
      return { ok: response.status === 200, note: `HTTP ${response.status}` };
    },
  },
  {
    name: "couple guest list",
    weight: 8,
    run: async (vu) => {
      const response = await vu.request("/guests", { session: true });
      await response.arrayBuffer();
      return { ok: response.status === 200, note: `HTTP ${response.status}` };
    },
  },
  {
    name: "couple guest list (10,000 guests)",
    weight: 2,
    run: async (vu) => {
      const big = fixture.couples[0]!;
      const response = await vu.request("/guests", { headers: { cookie: `${SESSION_COOKIE_NAME}=${big.sessionToken}` } });
      await response.arrayBuffer();
      return { ok: response.status === 200, note: `HTTP ${response.status}` };
    },
  },
  {
    name: "login (Argon2id)",
    weight: 2,
    run: async (vu) => {
      const couple = pick(fixture.couples);
      const response = await vu.request("/login", {
        method: "POST",
        ip: randomIp(),
        body: formBody(loginTemplate, { email: couple.email, password: fixture.password }),
      });
      const location = response.headers.get("location") ?? "";
      await response.arrayBuffer();
      return { ok: response.status === 303 && !location.includes("/login"), note: `HTTP ${response.status}` };
    },
  },
  {
    name: "health check",
    weight: 3,
    run: async (vu) => {
      const response = await vu.request("/api/health");
      await response.arrayBuffer();
      return { ok: response.status === 200, note: `HTTP ${response.status}` };
    },
  },
];
const TOTAL_WEIGHT = SCENARIOS.reduce((sum, scenario) => sum + scenario.weight, 0);

function pickScenario(): Scenario {
  let roll = Math.random() * TOTAL_WEIGHT;
  for (const scenario of SCENARIOS) {
    roll -= scenario.weight;
    if (roll < 0) return scenario;
  }
  return SCENARIOS[0]!;
}

// ─── Progressive-enhancement form templates ──────────────────────────────────

const decodeEntities = (value: string) =>
  value.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** The hidden `$ACTION…` fields React renders into a Server Action form (works without JavaScript). */
function actionFields(html: string, requiredField: string): Array<[string, string]> {
  for (const form of html.match(/<form[\s\S]*?<\/form>/g) ?? []) {
    if (!form.includes(`name="${requiredField}"`)) continue;
    const fields: Array<[string, string]> = [];
    for (const input of form.match(/<input[^>]*>/g) ?? []) {
      const name = /name="([^"]*)"/.exec(input)?.[1];
      if (!name?.startsWith("$ACTION")) continue;
      fields.push([decodeEntities(name), decodeEntities(/value="([^"]*)"/.exec(input)?.[1] ?? "")]);
    }
    if (fields.length > 0) return fields;
  }
  throw new Error(`no Server Action form with field "${requiredField}" found`);
}

async function prepareTemplates() {
  const couple = fixture.couples[1] ?? fixture.couples[0]!;
  const guestPage = await fetch(`${BASE}/i/${couple.guestTokens[0]}`).then((response) => response.text());
  rsvpTemplate = actionFields(guestPage, "rsvpStatus");
  const loginPage = await fetch(`${BASE}/login`).then((response) => response.text());
  loginTemplate = actionFields(loginPage, "password");
}

// ─── Measurement ─────────────────────────────────────────────────────────────

type Sample = { scenario: string; ms: number; ok: boolean; note?: string };

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

function summarize(samples: Sample[], seconds: number) {
  const describe = (list: Sample[]) => {
    const times = list.map((sample) => sample.ms).sort((a, b) => a - b);
    const failed = list.filter((sample) => !sample.ok);
    const notes: Record<string, number> = {};
    for (const sample of failed) notes[sample.note ?? "failed"] = (notes[sample.note ?? "failed"] ?? 0) + 1;
    return {
      requests: list.length,
      rps: Math.round((list.length / seconds) * 10) / 10,
      p50: Math.round(percentile(times, 50)),
      p95: Math.round(percentile(times, 95)),
      p99: Math.round(percentile(times, 99)),
      max: Math.round(times.at(-1) ?? 0),
      errors: failed.length,
      errorRate: list.length ? Math.round((failed.length / list.length) * 10_000) / 100 : 0,
      errorKinds: notes,
    };
  };
  return {
    overall: describe(samples),
    scenarios: Object.fromEntries(SCENARIOS.map((scenario) => [scenario.name, describe(samples.filter((sample) => sample.scenario === scenario.name))])),
  };
}

async function runStage(users: number, seconds: number, monitor: DbMonitor) {
  await monitor.reset();
  const samples: Sample[] = [];
  const deadline = Date.now() + seconds * 1000;
  const cpuBefore = process.cpuUsage();
  const started = performance.now();

  const loop = async () => {
    const vu = new VirtualUser();
    while (Date.now() < deadline) {
      const scenario = pickScenario();
      const begin = performance.now();
      try {
        const check = await scenario.run(vu);
        samples.push({ scenario: scenario.name, ms: performance.now() - begin, ok: check.ok, note: check.ok ? undefined : check.note });
      } catch (error) {
        const note = error instanceof Error ? (error.name === "TimeoutError" ? "timeout" : error.message.slice(0, 60)) : "error";
        samples.push({ scenario: scenario.name, ms: performance.now() - begin, ok: false, note });
      }
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 2 * THINK_MS));
    }
  };
  await Promise.all(Array.from({ length: users }, loop));

  const elapsedMs = performance.now() - started;
  const cpu = process.cpuUsage(cpuBefore);
  return {
    users,
    seconds,
    ...summarize(samples, elapsedMs / 1000),
    database: monitor.snapshot(),
    loadGeneratorCpuPercent: Math.round(((cpu.user + cpu.system) / 1000 / elapsedMs) * 100),
  };
}

/** Samples PostgreSQL connections from the app's database once a second. */
class DbMonitor {
  private readonly db: PrismaClient;
  private timer: NodeJS.Timeout | undefined;
  private maxActive = 0;
  private maxTotal = 0;

  constructor(url: string) {
    this.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  }

  start() {
    this.timer = setInterval(() => {
      this.db
        .$queryRawUnsafe<Array<{ total: number; active: number }>>(
          `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE state = 'active')::int AS active
           FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()`,
        )
        .then(([row]) => {
          this.maxActive = Math.max(this.maxActive, row?.active ?? 0);
          this.maxTotal = Math.max(this.maxTotal, row?.total ?? 0);
        })
        .catch(() => undefined);
    }, 1000);
  }

  /** Each stage starts with empty rate-limit buckets (test database only; the limits are unchanged). */
  async reset() {
    this.maxActive = 0;
    this.maxTotal = 0;
    await this.db.rateLimitBucket.deleteMany({});
  }

  snapshot() {
    return { maxConnections: this.maxTotal, maxActiveQueries: this.maxActive };
  }

  async stop() {
    clearInterval(this.timer);
    await this.db.$disconnect();
  }
}

// ─── Server under test ───────────────────────────────────────────────────────

const servers: ChildProcess[] = [];
let serverErrorLines = 0;
/** Shared by all instances, as in production behind a load balancer. */
const ACTIONS_KEY = randomBytes(32).toString("base64");

async function startServer(testUrl: string, port: number) {
  if (!existsSync(".next/BUILD_ID")) throw new Error("no production build: run `pnpm build` first");
  const base = `http://localhost:${port}`;
  const server = spawn(`pnpm exec next start --port ${port}`, {
    shell: true,
    env: {
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL: testUrl,
      APP_URL: BASE,
      NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: ACTIONS_KEY,
      MEDIA_FILE_DIR: LOAD_MEDIA_DIR,
      MAIL_DRIVER: "file",
      MAIL_FILE_DIR: ".data/mail-load",
      PAYMENT_PROVIDER: "sandbox",
      ALLOW_SANDBOX_PAYMENTS: "false",
      MIDTRANS_SERVER_KEY: "",
      TRUSTED_PROXY_COUNT: "1",
    },
  });
  const count = (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n")) if (/"level":"error"|⨯|Error:/.test(line)) serverErrorLines += 1;
  };
  servers.push(server);
  server.stdout?.on("data", count);
  server.stderr?.on("data", count);

  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("server did not become healthy within 60 s");
}

function stopServer() {
  for (const server of servers.splice(0)) {
    if (!server.pid) continue;
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else server.kill("SIGTERM");
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const testUrl = process.env["DATABASE_URL_TEST"];
  if (!testUrl) throw new Error("DATABASE_URL_TEST belum diisi");
  if (testUrl === process.env["DATABASE_URL"]) throw new Error("DATABASE_URL_TEST tidak boleh sama dengan DATABASE_URL");

  const nodeEnv = process.env["NODE_ENV"];
  Object.assign(process.env, { NODE_ENV: "production" });
  ({ SESSION_COOKIE_NAME } = await import("../../src/lib/auth/constants"));
  Object.assign(process.env, { NODE_ENV: nodeEnv });

  if (SPAWN) await Promise.all(BASES.map((_, index) => startServer(testUrl, FIRST_PORT + index)));
  const monitor = new DbMonitor(testUrl);
  try {
    await prepareTemplates();
    // Warm-up: one request per scenario so first-hit costs are not measured.
    const warm = new VirtualUser();
    for (let round = 0; round < BASES.length; round += 1) {
      for (const scenario of SCENARIOS) await scenario.run(warm).catch(() => undefined);
    }

    monitor.start();
    const stages = [];
    console.log(`Load test against ${BASES.join(", ")} — ${fixture.couples.length} couples, think time 0–${2 * THINK_MS} ms, p95 budget ${P95_BUDGET_MS} ms\n`);
    for (const stage of STAGES) {
      const result = await runStage(stage.users, stage.seconds, monitor);
      stages.push(result);
      const verdict = result.overall.p95 <= P95_BUDGET_MS && result.overall.errorRate < 1 ? "PASS" : "FAIL";
      console.log(
        `${String(stage.users).padStart(4)} VUs  ${String(result.overall.requests).padStart(6)} req  ${String(result.overall.rps).padStart(6)} req/s  ` +
          `p50 ${result.overall.p50} ms  p95 ${result.overall.p95} ms  p99 ${result.overall.p99} ms  max ${result.overall.max} ms  ` +
          `errors ${result.overall.errorRate}%  db conns ${result.database.maxConnections} (active ${result.database.maxActiveQueries})  ${verdict}`,
      );
      for (const [name, scenario] of Object.entries(result.scenarios)) {
        const kinds = Object.entries(scenario.errorKinds).map(([kind, count]) => `${kind}×${count}`).join(", ");
        console.log(
          `        ${name.padEnd(36)} ${String(scenario.requests).padStart(6)}  p50 ${String(scenario.p50).padStart(5)}  p95 ${String(scenario.p95).padStart(5)}  p99 ${String(scenario.p99).padStart(5)}  err ${scenario.errors}${kinds ? ` (${kinds})` : ""}`,
        );
      }
    }

    const outDir = path.resolve(".data/load-test");
    mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, `results-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    writeFileSync(file, JSON.stringify({ bases: BASES, thinkMs: THINK_MS, p95BudgetMs: P95_BUDGET_MS, serverErrorLines, stages }, null, 2));
    console.log(`\nServer error log lines: ${serverErrorLines}${SPAWN ? "" : " (only counted with --spawn)"}\nResults: ${path.relative(process.cwd(), file)}`);
  } finally {
    await monitor.stop();
    stopServer();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  stopServer();
  process.exit(1);
});
