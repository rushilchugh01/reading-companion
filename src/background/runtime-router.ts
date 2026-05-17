import type { Browser } from "wxt/browser";
import { browser } from "wxt/browser";
import type { ChatSendInput, InterventionComposeInput, InterventionComposeResult } from "../shared/intervention-types";
import type { RuntimeMessage } from "../shared/messages";
import type { ModelJobDraft, ModelJobKind, ModelQueueDebugSnapshot } from "../shared/model-job-types";
import type { CurrentRuntimeSnapshot } from "../shared/runtime-types";
import { createCompanionLogger } from "../shared/logger";
import { BackgroundDatabaseRepository } from "./database-repository";
import { ModelClient } from "./model-client";
import { ModelCallAuditLog } from "./model/model-call-audit";
import type { ModelJobExecutor, ModelJobSettleEvent } from "./queue";
import { ModelQueue } from "./queue";
import { SettingsRepository } from "./settings-repository";
import { validateInterventionComposeResult } from "./model/model-result-validator";

type RuntimeSender = Browser.runtime.MessageSender;
type SendResponse = (response?: unknown) => void;

type RouterServices = {
  settings: SettingsRepository;
  database: BackgroundDatabaseRepository;
  model: ModelClient;
};

type RouteResult = {
  ok: boolean;
  value?: unknown;
  error?: string;
};

type QueuedModelRequest = {
  resolve: (event: ModelJobSettleEvent) => void;
  reject: (error: Error) => void;
};

type QuestionGeneratePayload = Extract<RuntimeMessage, { type: "question:generate" }>["payload"];
type AnswerGradePayload = Extract<RuntimeMessage, { type: "answer:grade" }>["payload"];

const backgroundLogger = createCompanionLogger("background");

function ok(value?: unknown): RouteResult {
  return { ok: true, value };
}

function fail(error: unknown): RouteResult {
  return {
    ok: false,
    error: error instanceof Error ? error.message : "Unknown background error."
  };
}

/** Routes typed runtime messages to background services. */
export class RuntimeMessageRouter {
  private readonly services: RouterServices;
  private readonly modelQueue: ModelQueue;
  private readonly modelAudit = new ModelCallAuditLog();
  private readonly pendingModelRequests = new Map<string, QueuedModelRequest>();
  private readonly runtimeSnapshots = new Map<number, CurrentRuntimeSnapshot>();

  /** Creates a runtime router over background service dependencies. */
  public constructor(services: RouterServices) {
    this.services = services;
    this.modelQueue = new ModelQueue({
      executors: this.createModelExecutors(),
      onSettled: (event) => this.settleQueuedModelRequest(event)
    });
  }

  /** Handles one message and returns a serializable result envelope. */
  public async route(message: RuntimeMessage): Promise<RouteResult> {
    const startedAt = Date.now();
    try {
      return await this.routeKnownMessage(message, startedAt);
    } catch (error) {
      backgroundLogger.error("runtime route failed", { error: error instanceof Error ? error.message : String(error), type: message.type });
      return fail(error);
    }
  }

  /** Browser runtime listener wrapper that keeps async responses alive. */
  public listener(): (
    message: RuntimeMessage,
    sender: RuntimeSender,
    sendResponse: SendResponse
  ) => true {
    return (message, _sender, sendResponse) => {
      void this.route(message).then(sendResponse);
      return true;
    };
  }

  /** Returns a sanitized queue and model-call audit snapshot for debug tooling. */
  public debugModelJobsSnapshot(): ModelQueueDebugSnapshot {
    return this.modelAudit.snapshot(this.modelQueue.getJobs());
  }

  private logRoute(type: RuntimeMessage["type"], startedAt: number, details: Record<string, unknown> = {}): void {
    backgroundLogger.debug("runtime route completed", { ...details, durationMs: Date.now() - startedAt, type });
  }

  /** Routes a known message through small domain-specific dispatchers. */
  private async routeKnownMessage(message: RuntimeMessage, startedAt: number): Promise<RouteResult> {
    return await this.routeSettingsMessage(message, startedAt)
      ?? await this.routeModelMessage(message, startedAt)
      ?? await this.routePersistenceMessage(message, startedAt)
      ?? fail(new Error(`Unsupported runtime message: ${message.type}`));
  }

  /** Routes settings and runtime-state messages. */
  private async routeSettingsMessage(message: RuntimeMessage, startedAt: number): Promise<RouteResult | undefined> {
    switch (message.type) {
      case "settings:get":
        return this.loggedOk(message.type, startedAt, await this.services.settings.get());
      case "settings:set":
        return this.loggedOk(message.type, startedAt, await this.services.settings.set(message.settings));
      case "settings:open":
        return this.loggedOk(message.type, startedAt, await browser.tabs.create({ url: `chrome-extension://${browser.runtime.id}/options.html` }));
      case "runtime:snapshot":
        this.saveRuntimeSnapshot(message.payload);
        return this.loggedOk(message.type, startedAt);
      case "runtime:debugModelJobs":
        return this.loggedOk(message.type, startedAt, this.debugModelJobsSnapshot(), {
          jobs: this.modelQueue.getJobs().length
        });
      default:
        return undefined;
    }
  }

  /** Routes model-related messages through the queue. */
  private async routeModelMessage(message: RuntimeMessage, startedAt: number): Promise<RouteResult | undefined> {
    switch (message.type) {
      case "intervention:compose":
        return this.loggedOk(message.type, startedAt, await this.enqueueInterventionCompose(message.payload));
      case "question:generate":
        return this.loggedOk(message.type, startedAt, (await this.enqueueModelJob(this.legacyQuestionJob(message.payload))).result);
      case "answer:grade":
        return this.loggedOk(message.type, startedAt, (await this.enqueueModelJob(this.answerGradeJob(message.payload))).result);
      case "chat:send":
        return this.loggedOk(message.type, startedAt, (await this.enqueueModelJob(this.userChatJob(message.payload))).result);
      case "modelJob:cancelForPage":
        return this.cancelPageJobs(message.payload.pageId, message.type, startedAt);
      default:
        return undefined;
    }
  }

  /** Routes persistence-only messages. */
  private async routePersistenceMessage(message: RuntimeMessage, startedAt: number): Promise<RouteResult | undefined> {
    switch (message.type) {
      case "weakConcept:save":
        await this.services.database.saveWeakConcept(message.concept);
        return this.loggedOk(message.type, startedAt);
      case "debug:event":
        await this.services.database.saveDebugEvent(message.event);
        return this.loggedOk(message.type, startedAt, undefined, { code: message.event.code });
      default:
        return undefined;
    }
  }

  /** Logs a successful route and returns its envelope. */
  private loggedOk(
    type: RuntimeMessage["type"],
    startedAt: number,
    value?: unknown,
    details: Record<string, unknown> = {}
  ): RouteResult {
    this.logRoute(type, startedAt, details);
    return ok(value);
  }

  /** Cancels queued or running page jobs. */
  private cancelPageJobs(pageId: string, type: RuntimeMessage["type"], startedAt: number): RouteResult {
    const value = this.modelQueue.cancelWhere((job) => job.pageId === pageId);
    return this.loggedOk(type, startedAt, { cancelledJobIds: value.map((job) => job.id) }, { cancelled: value.length });
  }

  /** Creates executors that keep all model work behind the queue boundary. */
  private createModelExecutors(): Partial<Record<ModelJobKind, ModelJobExecutor>> {
    return {
      intervention_compose: (job) => this.runInterventionComposeJob(job.input),
      answer_grade: (job) => this.runAnswerGradeJob(job.input),
      user_chat: (job) => this.runUserChatJob(job.input),
      page_map: (job) => this.runPageMapJob(job.input),
      chunk_sketch: (job) => this.runChunkSketchJob(job.input)
    };
  }

  /** Enqueues a model job and waits for its terminal queue event. */
  private async enqueueModelJob<TInput>(draft: ModelJobDraft<TInput>): Promise<ModelJobSettleEvent> {
    const result = this.modelQueue.enqueue(draft);
    this.modelAudit.captureDropped(result.dropped);
    if (!result.accepted) {
      throw new Error(`Model job rejected: ${result.reason}`);
    }

    this.modelAudit.captureJob(result.job);
    const promise = new Promise<ModelJobSettleEvent>((resolve, reject) => {
      this.pendingModelRequests.set(result.job.id, { resolve, reject });
    });
    this.modelQueue.run();
    return promise;
  }

  /** Enqueues and validates normalized intervention composition results. */
  private async enqueueInterventionCompose(payload: InterventionComposeInput): Promise<unknown> {
    const event = await this.enqueueModelJob(this.interventionComposeJob(payload));
    const snapshot = this.runtimeSnapshots.get(payload.tabId);
    if (!snapshot) {
      this.modelAudit.recordValidation(event.job, { status: "not_checked", reason: "runtime_snapshot_missing" });
      return event.result;
    }
    const validation = validateInterventionComposeResult(event.job, event.result, snapshot);
    this.modelAudit.recordValidation(event.job, {
      status: validation.valid ? "valid" : "invalid",
      reason: validation.valid ? undefined : validation.reason,
      checkedAt: Date.now()
    });
    return validation.valid ? validation.result : staleInterventionResult(payload, validation.reason);
  }

  /** Resolves or rejects request promises when queue jobs settle. */
  private settleQueuedModelRequest(event: ModelJobSettleEvent): void {
    this.modelAudit.captureSettled(event);
    const waiter = this.pendingModelRequests.get(event.job.id);
    if (!waiter) return;
    this.pendingModelRequests.delete(event.job.id);

    if (event.status === "completed") {
      waiter.resolve(event);
      return;
    }

    waiter.reject(modelJobError(event));
  }

  /** Stores the latest runtime snapshot for stale-result validation. */
  private saveRuntimeSnapshot(snapshot: CurrentRuntimeSnapshot): void {
    this.runtimeSnapshots.set(snapshot.tabId ?? 0, snapshot);
  }

  /** Builds a queue draft for normalized intervention composition. */
  private interventionComposeJob(payload: InterventionComposeInput): ModelJobDraft<InterventionComposeInput> {
    return {
      kind: "intervention_compose",
      tabId: payload.tabId,
      pageId: payload.pageId,
      contentHash: payload.contentHash,
      chunkId: payload.chunkId,
      expiresAt: payload.expiresAt,
      input: payload
    };
  }

  /** Builds a queue draft for legacy question generation. */
  private legacyQuestionJob(payload: QuestionGeneratePayload): ModelJobDraft<QuestionGeneratePayload> {
    const contentHash = hashText(payload.chunkText);
    return {
      kind: "intervention_compose",
      pageId: payload.heading || "legacy-question",
      contentHash,
      chunkId: payload.opportunity?.targetChunkId ?? contentHash,
      input: payload
    };
  }

  /** Builds a queue draft for answer grading. */
  private answerGradeJob(payload: AnswerGradePayload): ModelJobDraft<AnswerGradePayload> {
    return {
      kind: "answer_grade",
      questionSessionId: payload.session.id,
      attemptNumber: payload.session.attemptCount,
      chunkId: payload.session.chunkId,
      input: payload
    };
  }

  /** Builds a queue draft for user-authored chat. */
  private userChatJob(payload: ChatSendInput): ModelJobDraft<ChatSendInput> {
    return {
      kind: "user_chat",
      tabId: payload.tabId,
      pageId: payload.pageId,
      conversationId: payload.requestId,
      input: payload,
      dedupeKey: `user_chat:${payload.requestId}`
    };
  }

  /** Runs either normalized intervention compose or legacy question generation. */
  private async runInterventionComposeJob(input: unknown): Promise<unknown> {
    const settings = await this.services.settings.get();
    if (isInterventionComposeInput(input)) {
      return this.services.model.composeIntervention(input, settings);
    }

    return this.services.model.generateQuestion(input as QuestionGeneratePayload, settings);
  }

  /** Runs answer grading behind the queue boundary. */
  private async runAnswerGradeJob(input: unknown): Promise<unknown> {
    const settings = await this.services.settings.get();
    return this.services.model.gradeAnswer(input as AnswerGradePayload, settings);
  }

  /** Runs natural-language chat behind the queue boundary. */
  private async runUserChatJob(input: unknown): Promise<unknown> {
    const settings = await this.services.settings.get();
    return this.services.model.sendChat(input as ChatSendInput, settings);
  }

  /** Runs lightweight page mapping behind the queue boundary. */
  private runPageMapJob(input: unknown): Promise<unknown> {
    return Promise.resolve(this.services.model.mapPage(input as Parameters<ModelClient["mapPage"]>[0]));
  }

  /** Runs lightweight chunk sketching behind the queue boundary. */
  private runChunkSketchJob(input: unknown): Promise<unknown> {
    return Promise.resolve(this.services.model.sketchChunks(input as Parameters<ModelClient["sketchChunks"]>[0]));
  }
}

/** Creates a readable error for a non-completed queue event. */
function modelJobError(event: ModelJobSettleEvent): Error {
  if (event.error instanceof Error) return event.error;
  return new Error(`Model job ${event.status}: ${event.job.kind}`);
}

/** Checks whether queued input uses the normalized intervention contract. */
function isInterventionComposeInput(input: unknown): input is InterventionComposeInput {
  return isRecord(input)
    && typeof input.requestId === "string"
    && typeof input.pageId === "string"
    && typeof input.contentHash === "string"
    && typeof input.chunkId === "string"
    && isRecord(input.currentPassage);
}

/** Returns a stay-quiet result when validation rejects a stale intervention. */
function staleInterventionResult(
  payload: InterventionComposeInput,
  reason: string
): InterventionComposeResult {
  return {
    requestId: payload.requestId,
    action: "stay_quiet",
    petIntent: "quiet",
    reasonForApp: `discarded_${reason}`,
    confidence: 0,
    expiresAt: payload.expiresAt
  };
}

/** Checks whether an unknown value is a plain object record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Hashes legacy chunk text for queue identity. */
function hashText(text: string): string {
  let hash = 0;
  for (const character of text) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return `hash-${hash.toString(16)}`;
}
