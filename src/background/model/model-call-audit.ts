import type {
  ModelJob,
  ModelJobDebugRecord,
  ModelJobStatus,
  ModelJobValidationAudit,
  ModelQueueDebugCounts,
  ModelQueueDebugSnapshot
} from "../../shared/model-job-types";
import type { ModelJobSettleEvent } from "../queue";

const DEFAULT_AUDIT_LIMIT = 30;
const PREVIEW_LENGTH = 160;
const REDACTED_VALUE = "[REDACTED]";
const SENSITIVE_KEY_PATTERN = /(api[-_]?key|authorization|bearer|credential|password|secret|token)/i;
const SECRET_VALUE_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b(?:sk|sess|ghp|github_pat|xox[baprs]?)[-_][A-Za-z0-9._~+/=-]{8,}/gi
];
const MODEL_JOB_STATUSES: ModelJobStatus[] = [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
  "expired",
  "dropped"
];

type PrimitiveSummary = {
  handled: boolean;
  value?: unknown;
};

/** Keeps a privacy-safe audit trail for queued background model work. */
export class ModelCallAuditLog {
  private readonly records = new Map<string, ModelJobDebugRecord>();
  private readonly recentIds: string[] = [];
  private readonly limit: number;
  private readonly now: () => number;

  /** Creates a bounded audit log with injectable time for tests. */
  public constructor(options: { limit?: number; now?: () => number } = {}) {
    this.limit = options.limit ?? DEFAULT_AUDIT_LIMIT;
    this.now = options.now ?? Date.now;
  }

  /** Records the current queue-owned state for a job. */
  public captureJob(job: ModelJob): void {
    this.storeRecord(this.recordFromJob(job));
  }

  /** Records jobs dropped while accepting or rejecting an enqueue request. */
  public captureDropped(jobs: ModelJob[]): void {
    for (const job of jobs) {
      this.captureJob(job);
    }
  }

  /** Records provider results and failures once queue execution settles. */
  public captureSettled(event: ModelJobSettleEvent): void {
    const record = this.recordFromJob(event.job);
    if (event.result !== undefined) {
      record.resultSummary = sanitizedSummary(event.result);
      record.providerAction = inferProviderAction(event.job, event.result);
      record.toolAction = inferToolAction(event.result);
    }
    if (event.error !== undefined) {
      record.error = redactText(errorMessage(event.error));
    }
    this.storeRecord(record);
  }

  /** Attaches stale-result or schema-validation decisions to a job. */
  public recordValidation(job: ModelJob, validation: ModelJobValidationAudit): void {
    job.validationResult = validation;
    this.captureJob(job);
  }

  /** Builds the serializable queue and recent-call snapshot for debug tooling. */
  public snapshot(jobs: ModelJob[]): ModelQueueDebugSnapshot {
    for (const job of jobs) {
      this.captureJob(job);
    }

    const jobRecords = jobs.map((job) => this.recordFromJob(job));
    return {
      generatedAt: this.now(),
      counts: countStatuses(jobRecords),
      jobs: jobRecords,
      recentModelCalls: this.recentIds
        .map((id) => this.records.get(id))
        .filter((record): record is ModelJobDebugRecord => record !== undefined)
    };
  }

  /** Converts live queue state into a redacted debug record. */
  private recordFromJob(job: ModelJob): ModelJobDebugRecord {
    const existing = this.records.get(job.id);
    return {
      id: job.id,
      kind: job.kind,
      status: job.status,
      priority: job.priority,
      tabId: job.tabId,
      pageId: job.pageId,
      contentHash: job.contentHash,
      chunkId: job.chunkId,
      questionSessionId: job.questionSessionId,
      conversationId: job.conversationId,
      attemptNumber: job.attemptNumber,
      createdAt: job.createdAt,
      expiresAt: job.expiresAt,
      completedAt: job.completedAt,
      validationResult: job.validationResult ?? existing?.validationResult ?? { status: "not_checked" },
      providerAction: existing?.providerAction,
      toolAction: existing?.toolAction,
      inputSummary: existing?.inputSummary ?? sanitizedSummary(job.input),
      resultSummary: existing?.resultSummary,
      error: existing?.error
    };
  }

  /** Stores one record and keeps the recent-call ring ordered newest first. */
  private storeRecord(record: ModelJobDebugRecord): void {
    this.records.set(record.id, record);
    const nextRecentIds = [record.id, ...this.recentIds.filter((id) => id !== record.id)].slice(0, this.limit);
    this.recentIds.splice(0, this.recentIds.length, ...nextRecentIds);
    trimRecordMap(this.records, this.recentIds);
  }
}

/** Creates a compact redacted summary of arbitrary model input or output. */
export function sanitizedSummary(value: unknown): Record<string, unknown> {
  const summary = summarizeValue(value, 0);
  return isRecord(summary) ? summary : { value: summary };
}

/** Counts queue jobs by terminal and active status. */
function countStatuses(records: ModelJobDebugRecord[]): ModelQueueDebugCounts {
  const counts = Object.fromEntries(MODEL_JOB_STATUSES.map((status) => [status, 0])) as ModelQueueDebugCounts;
  counts.total = records.length;
  for (const record of records) {
    counts[record.status] += 1;
  }
  return counts;
}

/** Produces a bounded summary for one JSON-like value. */
function summarizeValue(value: unknown, depth: number, key?: string): unknown {
  if (key !== undefined && SENSITIVE_KEY_PATTERN.test(key)) return REDACTED_VALUE;
  const primitive = summarizePrimitive(value);
  if (primitive.handled) return primitive.value;
  if (Array.isArray(value)) return summarizeArray(value, depth);
  if (isRecord(value)) return summarizeRecord(value, depth);
  return typeof value;
}

/** Summarizes primitive values and leaves objects for structured handlers. */
function summarizePrimitive(value: unknown): PrimitiveSummary {
  if (typeof value === "string") return { handled: true, value: summarizeString(value) };
  if (typeof value === "number" || typeof value === "boolean" || value === null) return { handled: true, value };
  if (value === undefined) return { handled: true };
  if (typeof value === "bigint") return { handled: true, value: value.toString() };
  if (typeof value === "symbol") return { handled: true, value: value.description ?? "symbol" };
  return { handled: false };
}

/** Summarizes a text field without exposing long prompt or secret content. */
function summarizeString(value: string): Record<string, unknown> {
  return {
    length: value.length,
    preview: truncateText(redactText(value), PREVIEW_LENGTH)
  };
}

/** Summarizes an array with only its size and first few redacted samples. */
function summarizeArray(value: unknown[], depth: number): Record<string, unknown> {
  if (depth >= 2) return { type: "array", length: value.length };
  return {
    type: "array",
    length: value.length,
    sample: value.slice(0, 3).map((item) => summarizeValue(item, depth + 1))
  };
}

/** Summarizes an object with bounded nesting and redacted sensitive fields. */
function summarizeRecord(value: Record<string, unknown>, depth: number): Record<string, unknown> {
  if (depth >= 2) return { type: "object", keys: Object.keys(value).sort() };
  const summary: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    summary[entryKey] = summarizeValue(entryValue, depth + 1, entryKey);
  }
  return summary;
}

/** Redacts obvious bearer tokens and API-key-like values from text previews. */
function redactText(value: string): string {
  return SECRET_VALUE_PATTERNS.reduce((text, pattern) => text.replace(pattern, REDACTED_VALUE), value);
}

/** Trims a string after redaction for stable debug snapshots. */
function truncateText(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length).trim()}...` : value;
}

/** Reads a provider or normalized result action when one is present. */
function inferProviderAction(job: ModelJob, result: unknown): string {
  if (!isRecord(result)) return job.kind;
  if (typeof result.action === "string") return result.action;
  if (typeof result.label === "string") return `grade:${result.label}`;
  if (typeof result.text === "string") return "chat_reply";
  return job.kind;
}

/** Reads a tool action from PI-style tool calls or normalized result fields. */
function inferToolAction(result: unknown): string | undefined {
  if (!isRecord(result)) return undefined;
  const toolCalls = Array.isArray(result.toolCalls) ? result.toolCalls : undefined;
  const toolNames = toolCalls?.map(toolNameFromCall).filter((name): name is string => name !== undefined);
  if (toolNames && toolNames.length > 0) return toolNames.join(",");
  if (typeof result.action === "string") return result.action;
  if (typeof result.label === "string") return "grade_answer";
  return undefined;
}

/** Extracts a tool-call name from a PI/OpenAI-like tool call record. */
function toolNameFromCall(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.name === "string") return value.name;
  const fn = value.function;
  return isRecord(fn) && typeof fn.name === "string" ? fn.name : undefined;
}

/** Converts thrown values to readable sanitized audit text. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Removes stale records once their ids leave the bounded recent ring. */
function trimRecordMap(records: Map<string, ModelJobDebugRecord>, recentIds: string[]): void {
  const keep = new Set(recentIds);
  for (const id of records.keys()) {
    if (!keep.has(id)) records.delete(id);
  }
}

/** Checks for plain object records. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
