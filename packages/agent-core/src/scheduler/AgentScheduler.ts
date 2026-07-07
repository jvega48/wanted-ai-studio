import { randomUUID } from 'crypto';
import { createLogger } from '@wanted/shared';

export interface ScheduledJob {
  id: string;
  name: string;
  cronExpression?: string;
  intervalMs?: number;
  runAt?: Date;
  handler: () => Promise<void>;
  lastRunAt?: Date;
  nextRunAt: Date;
  runCount: number;
  errorCount: number;
  enabled: boolean;
  once: boolean;
}

export class AgentScheduler {
  private readonly jobs = new Map<string, ScheduledJob>();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private readonly tickIntervalMs: number;
  private readonly log = createLogger('AgentScheduler');
  private isRunning = false;

  constructor(tickIntervalMs = 1000) {
    this.tickIntervalMs = tickIntervalMs;
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.tickTimer = setInterval(() => void this.tick(), this.tickIntervalMs);
    this.log.info('Scheduler started');
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.log.info('Scheduler stopped');
  }

  scheduleInterval(
    name: string,
    intervalMs: number,
    handler: () => Promise<void>,
    runImmediately = false,
  ): string {
    const id = randomUUID();
    const job: ScheduledJob = {
      id,
      name,
      intervalMs,
      handler,
      nextRunAt: runImmediately ? new Date() : new Date(Date.now() + intervalMs),
      runCount: 0,
      errorCount: 0,
      enabled: true,
      once: false,
    };
    this.jobs.set(id, job);
    this.log.info(`Scheduled interval job: ${name}`, { intervalMs });
    return id;
  }

  scheduleOnce(name: string, runAt: Date, handler: () => Promise<void>): string {
    const id = randomUUID();
    const job: ScheduledJob = {
      id,
      name,
      runAt,
      handler,
      nextRunAt: runAt,
      runCount: 0,
      errorCount: 0,
      enabled: true,
      once: true,
    };
    this.jobs.set(id, job);
    this.log.info(`Scheduled one-time job: ${name}`, { runAt });
    return id;
  }

  scheduleDelay(name: string, delayMs: number, handler: () => Promise<void>): string {
    return this.scheduleOnce(name, new Date(Date.now() + delayMs), handler);
  }

  cancel(jobId: string): boolean {
    const deleted = this.jobs.delete(jobId);
    if (deleted) this.log.info(`Cancelled job: ${jobId}`);
    return deleted;
  }

  enable(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.enabled = true;
      this.log.info(`Enabled job: ${job.name}`);
    }
  }

  disable(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.enabled = false;
      this.log.info(`Disabled job: ${job.name}`);
    }
  }

  getJob(jobId: string): ScheduledJob | undefined {
    return this.jobs.get(jobId);
  }

  listJobs(): ScheduledJob[] {
    return Array.from(this.jobs.values());
  }

  private async tick(): Promise<void> {
    const now = new Date();
    const dueJobs = Array.from(this.jobs.values()).filter(
      (job) => job.enabled && job.nextRunAt <= now,
    );

    await Promise.all(
      dueJobs.map(async (job) => {
        try {
          job.lastRunAt = now;
          job.runCount++;
          await job.handler();

          if (job.once) {
            this.jobs.delete(job.id);
          } else if (job.intervalMs) {
            job.nextRunAt = new Date(now.getTime() + job.intervalMs);
          }
        } catch (error) {
          job.errorCount++;
          this.log.error(`Job "${job.name}" failed`, error);

          if (!job.once && job.intervalMs) {
            job.nextRunAt = new Date(now.getTime() + job.intervalMs);
          }
        }
      }),
    );
  }
}
