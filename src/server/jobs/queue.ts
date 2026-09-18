import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { retryDelayMs } from "@/lib/notifications";
import { getDb } from "@/server/db";

type Tx = Prisma.TransactionClient;

/** Every job type and the payload it carries. Payloads hold ids only, never personal data. */
export const JOB_PAYLOAD_SCHEMAS = {
  "notify.rsvp_received": z.object({ submissionId: z.uuid() }),
  "notify.partner_invited": z.object({ invitationId: z.uuid() }),
  "notify.partner_joined": z.object({ memberId: z.uuid() }),
  "budget.check": z.object({ weddingId: z.uuid() }),
  "reminders.scan": z.object({}),
  "maintenance.cleanup": z.object({}),
  "billing.reconcile": z.object({}),
} as const;

export type JobType = keyof typeof JOB_PAYLOAD_SCHEMAS;
export type JobPayload<T extends JobType> = z.infer<(typeof JOB_PAYLOAD_SCHEMAS)[T]>;

export function isJobType(value: string): value is JobType {
  return Object.hasOwn(JOB_PAYLOAD_SCHEMAS, value);
}

/** A failure that retrying cannot fix (bad payload, unknown type). The job goes straight to DEAD. */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentJobError";
  }
}

export type EnqueueOptions = { runAt?: Date; dedupeKey?: string; maxAttempts?: number };

/**
 * Pass the transaction client of the change that causes the job: both commit or neither does.
 * With a dedupe key, a request that already waits (PENDING) absorbs this one.
 */
export async function enqueueJob<T extends JobType>(db: Tx, type: T, payload: JobPayload<T>, options: EnqueueOptions = {}): Promise<void> {
  await db.backgroundJob.createMany({
    data: [
      {
        type,
        payload,
        runAt: options.runAt ?? new Date(),
        dedupeKey: options.dedupeKey ?? null,
        maxAttempts: options.maxAttempts ?? 5,
      },
    ],
    skipDuplicates: true,
  });
}

export type ClaimedJob = { id: string; type: string; payload: unknown; attempts: number; maxAttempts: number };

/** How long a worker may hold a job before another worker assumes it crashed. */
export const JOB_LEASE_MS = 5 * 60 * 1000;

/** Atomically takes up to `limit` due jobs. Concurrent workers never receive the same job. */
export async function claimJobs(workerId: string, limit: number, now: Date = new Date()): Promise<ClaimedJob[]> {
  const leaseCutoff = new Date(now.getTime() - JOB_LEASE_MS);
  const rows = await getDb().$queryRaw<Array<{ id: string; type: string; payload: unknown; attempts: number; max_attempts: number }>>`
    UPDATE background_jobs AS j
    SET state = 'RUNNING', locked_at = ${now}, locked_by = ${workerId}, attempts = j.attempts + 1
    WHERE j.id IN (
      SELECT id FROM background_jobs
      WHERE (state = 'PENDING' AND run_at <= ${now})
         OR (state = 'RUNNING' AND locked_at < ${leaseCutoff})
      ORDER BY run_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING j.id, j.type, j.payload, j.attempts, j.max_attempts
  `;
  return rows.map((row) => ({ id: row.id, type: row.type, payload: row.payload, attempts: row.attempts, maxAttempts: row.max_attempts }));
}

export async function completeJob(job: ClaimedJob, workerId: string, now: Date = new Date()): Promise<void> {
  // Guarded by the lock owner: a job reclaimed after an expired lease is not closed by the old worker.
  await getDb().backgroundJob.updateMany({
    where: { id: job.id, state: "RUNNING", lockedBy: workerId },
    data: { state: "DONE", completedAt: now, lockedAt: null, lastError: null },
  });
}

function errorText(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return text.slice(0, 500);
}

/** Retries with backoff until max attempts, then parks the job as DEAD for inspection. */
export async function failJob(
  job: ClaimedJob,
  workerId: string,
  error: unknown,
  now: Date = new Date(),
): Promise<"retry" | "dead" | "superseded"> {
  const db = getDb();
  const where = { id: job.id, state: "RUNNING" as const, lockedBy: workerId };
  const lastError = errorText(error);
  if (error instanceof PermanentJobError || job.attempts >= job.maxAttempts) {
    await db.backgroundJob.updateMany({ where, data: { state: "DEAD", completedAt: now, lockedAt: null, lastError } });
    return "dead";
  }
  try {
    await db.backgroundJob.updateMany({
      where,
      data: { state: "PENDING", runAt: new Date(now.getTime() + retryDelayMs(job.attempts)), lockedAt: null, lockedBy: null, lastError },
    });
    return "retry";
  } catch (cause) {
    // A newer request with the same dedupe key is already waiting and will do the same work.
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
      await db.backgroundJob.updateMany({ where, data: { state: "DONE", completedAt: now, lockedAt: null, lastError: `superseded after ${lastError}`.slice(0, 500) } });
      return "superseded";
    }
    throw cause;
  }
}

/**
 * Schedules a periodic job unless one is waiting, running, or finished within the interval. Several
 * workers may call this at once; an advisory lock keeps it to one job.
 */
export async function ensureRecurringJob(type: JobType, intervalMs: number, now: Date = new Date()): Promise<boolean> {
  return getDb().$transaction(async (tx) => {
    const key = `job-schedule:${type}`;
    await tx.$executeRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${key}::text))`;
    const existing = await tx.backgroundJob.findFirst({
      where: {
        type,
        OR: [{ state: { in: ["PENDING", "RUNNING"] } }, { state: "DONE", completedAt: { gt: new Date(now.getTime() - intervalMs) } }],
      },
      select: { id: true },
    });
    if (existing) return false;
    await tx.backgroundJob.create({ data: { type, payload: {}, runAt: now } });
    return true;
  });
}

/** Finished jobs are kept briefly for debugging; dead ones longer. */
export async function purgeFinishedJobs(now: Date = new Date()): Promise<number> {
  const day = 24 * 60 * 60 * 1000;
  const { count } = await getDb().backgroundJob.deleteMany({
    where: {
      OR: [
        { state: "DONE", completedAt: { lt: new Date(now.getTime() - 7 * day) } },
        { state: "DEAD", completedAt: { lt: new Date(now.getTime() - 30 * day) } },
      ],
    },
  });
  return count;
}
