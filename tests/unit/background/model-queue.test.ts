import {
  DEFAULT_MODEL_QUEUE_CONFIG,
  JOB_TTL_MS,
  MODEL_JOB_PRIORITY,
  type ModelJobDraft,
  type ModelJobKind,
  type ModelQueueConfig
} from "@/shared/model-job-types";
import { ModelQueue, type ModelJobExecutor, type ModelJobSettleEvent } from "@/background/queue";

const BASE_TIME = 2_000_000_000_000;

type Deferred = {
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

/** Creates a promise that tests can resolve after a job starts. */
function createDeferred(): Deferred {
  let resolve!: (value: unknown) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<unknown>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
}

/** Creates a queue config with small test-friendly overrides. */
function config(overrides: Partial<ModelQueueConfig> = {}): ModelQueueConfig {
  return {
    ...DEFAULT_MODEL_QUEUE_CONFIG,
    ...overrides,
    kindLimits: {
      ...DEFAULT_MODEL_QUEUE_CONFIG.kindLimits,
      ...overrides.kindLimits
    }
  };
}

/** Builds a minimal model job draft for tests. */
function draft(id: string, kind: ModelJobKind, createdAt = BASE_TIME): ModelJobDraft<{ id: string }> {
  return {
    id,
    kind,
    createdAt,
    pageId: "page-1",
    input: { id }
  };
}

/** Creates executors that capture start order and wait on deferred promises. */
function deferredExecutors(
  deferreds: Record<string, Deferred>,
  started: string[]
): Partial<Record<ModelJobKind, ModelJobExecutor>> {
  const executor: ModelJobExecutor = (job) => {
    started.push(job.id);
    return deferreds[job.id]?.promise ?? Promise.resolve(job.id);
  };

  return {
    user_chat: executor,
    answer_grade: executor,
    intervention_compose: executor,
    page_map: executor,
    chunk_sketch: executor,
    weak_concept_save: executor,
    session_summary: executor
  };
}

/** Waits for promise callbacks scheduled by queue settlement. */
async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("ModelQueue contracts", () => {
  it("defines the requested priorities and TTLs", () => {
    expect(MODEL_JOB_PRIORITY).toMatchObject({
      user_chat: 0,
      answer_grade: 0,
      intervention_compose: 1,
      page_map: 2,
      chunk_sketch: 2,
      weak_concept_save: 3,
      session_summary: 4
    });
    expect(JOB_TTL_MS).toMatchObject({
      user_chat: 60_000,
      answer_grade: 45_000,
      intervention_compose: 20_000,
      page_map: 600_000,
      chunk_sketch: 600_000,
      weak_concept_save: 120_000,
      session_summary: 1_800_000
    });
  });
});

describe("ModelQueue scheduling", () => {
  it("schedules by priority and FIFO order within the same priority", () => {
    const started: string[] = [];
    const queue = new ModelQueue({
      config: config({ maxRunning: 5, maxRunningInteractive: 5, maxRunningBackground: 5 }),
      executors: deferredExecutors({}, started)
    });

    queue.enqueue(draft("late-intervention", "intervention_compose", BASE_TIME));
    queue.enqueue(draft("first-interactive", "answer_grade", BASE_TIME + 1));
    queue.enqueue(draft("second-interactive", "user_chat", BASE_TIME + 2));
    queue.enqueue(draft("background", "chunk_sketch", BASE_TIME + 3));

    expect(queue.run().map((job) => job.id)).toEqual([
      "first-interactive",
      "second-interactive",
      "late-intervention",
      "background"
    ]);
  });

  it("honors interactive and background concurrency lanes", async () => {
    const started: string[] = [];
    const chat = createDeferred();
    const grade = createDeferred();
    const page = createDeferred();
    const deferreds: Record<string, Deferred> = {
      chat,
      grade,
      page
    };
    const queue = new ModelQueue({
      config: config(),
      executors: deferredExecutors(deferreds, started)
    });

    queue.enqueue(draft("chat", "user_chat", BASE_TIME + 1));
    queue.enqueue(draft("grade", "answer_grade", BASE_TIME + 2));
    queue.enqueue(draft("page", "page_map", BASE_TIME + 3));
    queue.run();

    expect(started).toEqual(["chat", "page"]);
    chat.resolve("ok");
    await flushPromises();
    expect(started).toEqual(["chat", "page", "grade"]);
  });
});

describe("ModelQueue enqueue limits", () => {
  it("dedupes active jobs by dedupe key", () => {
    const queue = new ModelQueue();

    const first = queue.enqueue({ ...draft("first", "page_map"), dedupeKey: "page-map:1" });
    const second = queue.enqueue({ ...draft("second", "page_map"), dedupeKey: "page-map:1" });

    expect(first.accepted).toBe(true);
    expect(second).toMatchObject({
      accepted: false,
      reason: "dedupe",
      existingJob: first.job
    });
    expect(second.job.status).toBe("dropped");
  });

  it("drops the lowest-priority pending job on total overflow", () => {
    const queue = new ModelQueue({ config: config({ maxTotalJobs: 2 }) });

    queue.enqueue(draft("summary", "session_summary", BASE_TIME + 1));
    queue.enqueue(draft("sketch", "chunk_sketch", BASE_TIME + 2));
    const result = queue.enqueue(draft("chat", "user_chat", BASE_TIME + 3));

    expect(result.accepted).toBe(true);
    expect(result.dropped.map((job) => job.id)).toEqual(["summary"]);
    expect(queue.getJobs().find((job) => job.id === "summary")?.status).toBe("dropped");
  });
});

describe("ModelQueue cancellation and expiry", () => {
  it("cancels matching jobs and aborts running provider work", () => {
    const signalByJob = new Map<string, AbortSignal>();
    const executor: ModelJobExecutor = (job, signal) => {
      signalByJob.set(job.id, signal);
      return createDeferred().promise;
    };
    const queue = new ModelQueue({ executors: { user_chat: executor } });

    queue.enqueue(draft("chat", "user_chat"));
    queue.run();
    const cancelled = queue.cancelWhere((job) => job.id === "chat");

    expect(cancelled).toHaveLength(1);
    expect(cancelled[0]?.status).toBe("cancelled");
    expect(signalByJob.get("chat")?.aborted).toBe(true);
  });

  it("expires stale jobs before execution", () => {
    let now = 1_000;
    const executor = vi.fn<ModelJobExecutor>(() => Promise.resolve("never"));
    const queue = new ModelQueue({ now: () => now, executors: { intervention_compose: executor } });

    queue.enqueue({ ...draft("expired", "intervention_compose", now), expiresAt: now + 10 });
    now += 11;

    expect(queue.run()).toEqual([]);
    expect(queue.getJobs()[0]?.status).toBe("expired");
    expect(executor).not.toHaveBeenCalled();
  });
});

describe("ModelQueue failure handling", () => {
  it("marks provider failures and continues draining the queue", async () => {
    const settled: ModelJobSettleEvent[] = [];
    const started: string[] = [];
    const first = createDeferred();
    const second = createDeferred();
    const deferreds: Record<string, Deferred> = {
      first,
      second
    };
    const queue = new ModelQueue({
      config: config({ maxRunning: 1, maxRunningInteractive: 1 }),
      executors: deferredExecutors(deferreds, started),
      onSettled: (event) => settled.push(event)
    });

    queue.enqueue(draft("first", "user_chat", BASE_TIME + 1));
    queue.enqueue(draft("second", "answer_grade", BASE_TIME + 2));
    queue.run();
    first.reject(new Error("provider down"));
    await flushPromises();
    second.resolve("ok");
    await flushPromises();

    expect(started).toEqual(["first", "second"]);
    expect(queue.getJobs().map((job) => job.status)).toEqual(["failed", "completed"]);
    expect(settled.map((event) => event.status)).toEqual(["failed", "completed"]);
  });
});
