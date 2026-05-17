import {
  DEFAULT_MODEL_QUEUE_CONFIG,
  JOB_TTL_MS,
  type ModelJob,
  type ModelJobDraft,
  type ModelJobKind,
  type ModelQueueConfig
} from "../../shared/model-job-types";
import {
  chooseOverflowDropCandidate,
  compareModelJobScheduleOrder,
  createModelJobDedupeKey,
  defaultModelJobPriority,
  isInteractiveModelJob
} from "./model-job-helpers";

export type ModelJobExecutor = (job: ModelJob, signal: AbortSignal) => Promise<unknown>;

export type ModelJobSettleEvent = {
  job: ModelJob;
  status: "completed" | "failed" | "cancelled" | "expired";
  result?: unknown;
  error?: unknown;
};

export type ModelQueueOptions = {
  config?: ModelQueueConfig;
  executors?: Partial<Record<ModelJobKind, ModelJobExecutor>>;
  now?: () => number;
  idFactory?: () => string;
  onSettled?: (event: ModelJobSettleEvent) => void;
};

export type EnqueueDropReason = "dedupe" | "max_total" | "max_jobs_per_page" | "kind_limit";

export type ModelQueueEnqueueResult =
  | { accepted: true; job: ModelJob; dropped: ModelJob[] }
  | { accepted: false; job: ModelJob; existingJob?: ModelJob; reason: EnqueueDropReason; dropped: ModelJob[] };

type OverflowDrop = {
  reason: EnqueueDropReason;
  jobs: ModelJob[];
};

/** Priority FIFO model queue with separate interactive and background lanes. */
export class ModelQueue {
  private readonly config: ModelQueueConfig;
  private readonly executors: Partial<Record<ModelJobKind, ModelJobExecutor>>;
  private readonly now: () => number;
  private readonly idFactory: () => string;
  private readonly onSettled?: (event: ModelJobSettleEvent) => void;
  private readonly jobs = new Map<string, ModelJob>();
  private readonly sequence = new Map<string, number>();
  private sequenceCounter = 0;

  /** Creates a queue with injectable timing, id, executor, and observer hooks. */
  public constructor(options: ModelQueueOptions = {}) {
    this.config = options.config ?? DEFAULT_MODEL_QUEUE_CONFIG;
    this.executors = options.executors ?? {};
    this.now = options.now ?? Date.now;
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID());
    this.onSettled = options.onSettled;
  }

  /** Adds a job if dedupe and queue limits allow it. */
  public enqueue<TInput>(draft: ModelJobDraft<TInput>): ModelQueueEnqueueResult {
    this.expireStaleJobs();
    const job = this.createJob(draft);
    const existingJob = this.findDuplicate(job);

    if (existingJob) {
      job.status = "dropped";
      return { accepted: false, job, existingJob, reason: "dedupe", dropped: [job] };
    }

    this.storeJob(job);
    const overflow = this.dropOverflow(job);
    if (job.status === "dropped") {
      return { accepted: false, job, reason: overflow.reason, dropped: overflow.dropped };
    }

    return { accepted: true, job, dropped: overflow.dropped };
  }

  /** Starts as many pending jobs as the concurrency limits allow. */
  public run(): ModelJob[] {
    this.expireStaleJobs();
    const started: ModelJob[] = [];
    let nextJob = this.nextRunnableJob();

    while (nextJob) {
      this.startJob(nextJob);
      started.push(nextJob);
      nextJob = this.nextRunnableJob();
    }

    return started;
  }

  /** Cancels pending or running jobs that match the predicate. */
  public cancelWhere(predicate: (job: ModelJob) => boolean): ModelJob[] {
    const cancelled: ModelJob[] = [];

    for (const job of this.jobs.values()) {
      if (!this.isActive(job) || !predicate(job)) continue;
      this.cancelJob(job);
      cancelled.push(job);
    }

    return cancelled;
  }

  /** Returns jobs in insertion order for tests and debug surfaces. */
  public getJobs(): ModelJob[] {
    return [...this.jobs.values()];
  }

  /** Materializes a draft into a queue-owned job. */
  private createJob<TInput>(draft: ModelJobDraft<TInput>): ModelJob<TInput> {
    const createdAt = draft.createdAt ?? this.now();
    const priority = draft.priority ?? defaultModelJobPriority(draft.kind);

    return {
      id: draft.id ?? this.idFactory(),
      kind: draft.kind,
      priority,
      createdAt,
      expiresAt: draft.expiresAt ?? createdAt + JOB_TTL_MS[draft.kind],
      tabId: draft.tabId,
      pageId: draft.pageId,
      contentHash: draft.contentHash,
      chunkId: draft.chunkId,
      questionSessionId: draft.questionSessionId,
      conversationId: draft.conversationId,
      attemptNumber: draft.attemptNumber,
      dedupeKey: draft.dedupeKey ?? createModelJobDedupeKey(draft),
      status: "pending",
      input: draft.input,
      abortController: draft.abortController ?? new AbortController()
    };
  }

  /** Stores a job and records its FIFO sequence. */
  private storeJob(job: ModelJob): void {
    this.jobs.set(job.id, job);
    this.sequence.set(job.id, this.sequenceCounter);
    this.sequenceCounter += 1;
  }

  /** Finds an active job with the same dedupe key. */
  private findDuplicate(job: ModelJob): ModelJob | undefined {
    if (!job.dedupeKey) return undefined;
    return [...this.jobs.values()].find((existingJob) => (
      this.isActive(existingJob) && existingJob.dedupeKey === job.dedupeKey
    ));
  }

  /** Enforces queue limits and returns dropped jobs with their cause. */
  private dropOverflow(job: ModelJob): { reason: EnqueueDropReason; dropped: ModelJob[] } {
    const drops = [
      this.enforceTotalLimit(),
      this.enforcePageLimit(job),
      this.enforceKindLimit(job)
    ];
    const dropped = drops.flatMap((drop) => drop.jobs);
    const reason = drops.find((drop) => drop.jobs.includes(job))?.reason ?? "max_total";

    return { reason, dropped };
  }

  /** Drops low-value pending jobs until the total active limit is satisfied. */
  private enforceTotalLimit(): OverflowDrop {
    const dropped: ModelJob[] = [];
    while (this.activeJobs().length > this.config.maxTotalJobs) {
      const candidate = chooseOverflowDropCandidate(this.activeJobs(), this.sequenceFor);
      if (!candidate) break;
      this.dropJob(candidate);
      dropped.push(candidate);
    }

    return { reason: "max_total", jobs: dropped };
  }

  /** Drops low-value pending jobs until the per-page limit is satisfied. */
  private enforcePageLimit(job: ModelJob): OverflowDrop {
    if (!job.pageId) return { reason: "max_jobs_per_page", jobs: [] };
    const dropped: ModelJob[] = [];
    let pageJobs = this.activeJobs().filter((queuedJob) => queuedJob.pageId === job.pageId);

    while (pageJobs.length > this.config.maxJobsPerPage) {
      const candidate = chooseOverflowDropCandidate(pageJobs, this.sequenceFor);
      if (!candidate) break;
      this.dropJob(candidate);
      dropped.push(candidate);
      pageJobs = this.activeJobs().filter((queuedJob) => queuedJob.pageId === job.pageId);
    }

    return { reason: "max_jobs_per_page", jobs: dropped };
  }

  /** Drops low-value pending jobs until the kind-specific limit is satisfied. */
  private enforceKindLimit(job: ModelJob): OverflowDrop {
    const limit = this.config.kindLimits[job.kind];
    if (limit === undefined) return { reason: "kind_limit", jobs: [] };
    const dropped: ModelJob[] = [];
    let kindJobs = this.activeJobs().filter((queuedJob) => queuedJob.kind === job.kind);

    while (kindJobs.length > limit) {
      const candidate = chooseOverflowDropCandidate(kindJobs, this.sequenceFor);
      if (!candidate) break;
      this.dropJob(candidate);
      dropped.push(candidate);
      kindJobs = this.activeJobs().filter((queuedJob) => queuedJob.kind === job.kind);
    }

    return { reason: "kind_limit", jobs: dropped };
  }

  /** Finds the next pending job that can fit in the current concurrency lanes. */
  private nextRunnableJob(): ModelJob | undefined {
    const pendingJobs = this.getRunnablePendingJobs();
    pendingJobs.sort((left, right) => compareModelJobScheduleOrder(left, right, this.sequenceFor));

    return pendingJobs.find((job) => this.hasCapacityFor(job));
  }

  /** Returns pending jobs that are eligible for scheduling. */
  private getRunnablePendingJobs(): ModelJob[] {
    return [...this.jobs.values()].filter((job) => job.status === "pending");
  }

  /** Starts a job and records terminal executor outcomes without throwing. */
  private startJob(job: ModelJob): void {
    const executor = this.executors[job.kind];
    if (!executor) {
      job.status = "failed";
      job.completedAt = this.now();
      this.onSettled?.({ job, status: "failed", error: new Error(`No executor for ${job.kind}`) });
      return;
    }

    job.status = "running";
    void executor(job, job.abortController.signal)
      .then((result) => this.settleJob(job, "completed", result))
      .catch((error: unknown) => this.settleJob(job, "failed", undefined, error));
  }

  /** Applies the executor outcome unless cancellation or expiry already won. */
  private settleJob(job: ModelJob, status: "completed" | "failed", result?: unknown, error?: unknown): void {
    if (job.status === "cancelled" || job.status === "expired") {
      this.onSettled?.({ job, status: job.status });
      this.run();
      return;
    }

    const finalStatus = this.now() > job.expiresAt ? "expired" : status;
    job.status = finalStatus;
    job.completedAt = this.now();
    this.onSettled?.({ job, status: finalStatus, result, error });
    this.run();
  }

  /** Expires active jobs whose TTL has elapsed. */
  private expireStaleJobs(): void {
    const now = this.now();
    for (const job of this.jobs.values()) {
      if (!this.isActive(job) || now <= job.expiresAt) continue;
      job.status = "expired";
      job.completedAt = now;
      job.abortController.abort();
      this.onSettled?.({ job, status: "expired" });
    }
  }

  /** Checks total and lane-specific concurrency availability. */
  private hasCapacityFor(job: ModelJob): boolean {
    if (this.runningJobs().length >= this.config.maxRunning) return false;
    if (isInteractiveModelJob(job.kind)) {
      return this.runningInteractiveJobs().length < this.config.maxRunningInteractive;
    }

    return this.runningBackgroundJobs().length < this.config.maxRunningBackground;
  }

  /** Returns all jobs that are still queue-active. */
  private activeJobs(): ModelJob[] {
    return [...this.jobs.values()].filter((job) => this.isActive(job));
  }

  /** Returns jobs currently executing with a provider. */
  private runningJobs(): ModelJob[] {
    return [...this.jobs.values()].filter((job) => job.status === "running");
  }

  /** Returns running jobs in the interactive lane. */
  private runningInteractiveJobs(): ModelJob[] {
    return this.runningJobs().filter((job) => isInteractiveModelJob(job.kind));
  }

  /** Returns running jobs in the background lane. */
  private runningBackgroundJobs(): ModelJob[] {
    return this.runningJobs().filter((job) => !isInteractiveModelJob(job.kind));
  }

  /** Checks whether a job can still be scheduled or cancelled. */
  private isActive(job: ModelJob): boolean {
    return job.status === "pending" || job.status === "running";
  }

  /** Marks a pending job as dropped and aborts its signal. */
  private dropJob(job: ModelJob): void {
    job.status = "dropped";
    job.completedAt = this.now();
    job.abortController.abort();
  }

  /** Marks a job as cancelled and aborts its signal. */
  private cancelJob(job: ModelJob): void {
    job.status = "cancelled";
    job.completedAt = this.now();
    job.abortController.abort();
    this.onSettled?.({ job, status: "cancelled" });
  }

  /** Returns the FIFO sequence number for a queued job. */
  private readonly sequenceFor = (job: ModelJob): number => this.sequence.get(job.id) ?? 0;
}
