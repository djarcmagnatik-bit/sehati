import "server-only";
import { logger } from "@/lib/logger";
import {
  handleBudgetCheck,
  handleMaintenanceCleanup,
  handlePartnerInvited,
  handlePartnerJoined,
  handleRemindersScan,
  handleRsvpReceived,
} from "@/server/notifications/notification-jobs";
import {
  claimJobs,
  completeJob,
  ensureRecurringJob,
  failJob,
  isJobType,
  JOB_PAYLOAD_SCHEMAS,
  PermanentJobError,
  type ClaimedJob,
  type JobPayload,
  type JobType,
} from "./queue";

type Handler<T extends JobType> = (payload: JobPayload<T>, now: Date) => Promise<unknown>;

const HANDLERS: { [T in JobType]: Handler<T> } = {
  "notify.rsvp_received": handleRsvpReceived,
  "notify.partner_invited": handlePartnerInvited,
  "notify.partner_joined": handlePartnerJoined,
  "budget.check": handleBudgetCheck,
  "reminders.scan": handleRemindersScan,
  "maintenance.cleanup": handleMaintenanceCleanup,
};

/** Reminders run hourly (dedupe keys keep them to one per event); housekeeping daily. */
export const RECURRING_JOBS: ReadonlyArray<{ type: JobType; intervalMs: number }> = [
  { type: "reminders.scan", intervalMs: 60 * 60 * 1000 },
  { type: "maintenance.cleanup", intervalMs: 24 * 60 * 60 * 1000 },
];

async function runOne(job: ClaimedJob, now: Date): Promise<void> {
  if (job.attempts > job.maxAttempts) throw new PermanentJobError("attempts exhausted");
  if (!isJobType(job.type)) throw new PermanentJobError(`unknown job type ${job.type}`);
  const parsed = JOB_PAYLOAD_SCHEMAS[job.type].safeParse(job.payload);
  if (!parsed.success) throw new PermanentJobError(`invalid payload for ${job.type}`);
  const handler = HANDLERS[job.type] as Handler<typeof job.type>;
  await handler(parsed.data as JobPayload<typeof job.type>, now);
}

export type RunSummary = { done: number; retried: number; dead: number };

/** Processes due jobs in batches until none are left or `maxJobs` is reached. */
export async function runDueJobs(options: { workerId: string; batchSize?: number; maxJobs?: number; now?: () => Date }): Promise<RunSummary> {
  const clock = options.now ?? (() => new Date());
  const batchSize = options.batchSize ?? 20;
  const maxJobs = options.maxJobs ?? 500;
  const summary: RunSummary = { done: 0, retried: 0, dead: 0 };
  let handled = 0;

  while (handled < maxJobs) {
    const jobs = await claimJobs(options.workerId, Math.min(batchSize, maxJobs - handled), clock());
    if (jobs.length === 0) break;
    for (const job of jobs) {
      handled += 1;
      try {
        await runOne(job, clock());
        await completeJob(job, options.workerId, clock());
        summary.done += 1;
      } catch (error) {
        const outcome = await failJob(job, options.workerId, error, clock());
        if (outcome === "dead") summary.dead += 1;
        else if (outcome === "retry") summary.retried += 1;
        else summary.done += 1;
        // Job id and type only: payloads never go to logs.
        logger[outcome === "dead" ? "error" : "warn"]("jobs.failed", { jobId: job.id, type: job.type, attempts: job.attempts, outcome, error });
      }
    }
  }
  return summary;
}

/** One worker cycle: make sure periodic jobs exist, then drain the queue. */
export async function runWorkerTick(workerId: string, now: () => Date = () => new Date()): Promise<RunSummary> {
  for (const job of RECURRING_JOBS) await ensureRecurringJob(job.type, job.intervalMs, now());
  return runDueJobs({ workerId, now });
}
