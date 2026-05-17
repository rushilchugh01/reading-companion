/** Model job kinds owned by the background queue. */
export const MODEL_JOB_KINDS = [
  "user_chat",
  "answer_grade",
  "intervention_compose",
  "page_map",
  "chunk_sketch",
  "weak_concept_save",
  "session_summary"
] as const;

export type ModelJobKind = typeof MODEL_JOB_KINDS[number];

/** Lower numbers run before higher numbers. */
export const MODEL_JOB_PRIORITY: Record<ModelJobKind, number> = {
  user_chat: 0,
  answer_grade: 0,
  intervention_compose: 1,
  page_map: 2,
  chunk_sketch: 2,
  weak_concept_save: 3,
  session_summary: 4
};

/** Time-to-live budget for queued and running model jobs. */
export const JOB_TTL_MS: Record<ModelJobKind, number> = {
  user_chat: 60_000,
  answer_grade: 45_000,
  intervention_compose: 20_000,
  page_map: 600_000,
  chunk_sketch: 600_000,
  weak_concept_save: 120_000,
  session_summary: 1_800_000
};

export type ModelJobStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired"
  | "dropped";

export type ModelJobValidationAudit = {
  status: "valid" | "invalid" | "not_checked";
  reason?: string;
  checkedAt?: number;
};

export type ModelJobDebugRecord = {
  id: string;
  kind: ModelJobKind;
  status: ModelJobStatus;
  priority: number;
  tabId?: number;
  pageId?: string;
  contentHash?: string;
  chunkId?: string;
  questionSessionId?: string;
  conversationId?: string;
  attemptNumber?: number;
  createdAt: number;
  expiresAt: number;
  completedAt?: number;
  validationResult: ModelJobValidationAudit;
  providerAction?: string;
  toolAction?: string;
  inputSummary: Record<string, unknown>;
  resultSummary?: Record<string, unknown>;
  error?: string;
};

export type ModelQueueDebugCounts = Record<ModelJobStatus, number> & {
  total: number;
};

export type ModelQueueDebugSnapshot = {
  generatedAt: number;
  counts: ModelQueueDebugCounts;
  jobs: ModelJobDebugRecord[];
  recentModelCalls: ModelJobDebugRecord[];
};

export type ModelJob<TInput = unknown> = {
  id: string;
  kind: ModelJobKind;
  priority: number;
  createdAt: number;
  expiresAt: number;
  completedAt?: number;
  tabId?: number;
  pageId?: string;
  contentHash?: string;
  chunkId?: string;
  questionSessionId?: string;
  conversationId?: string;
  attemptNumber?: number;
  dedupeKey?: string;
  status: ModelJobStatus;
  validationResult?: ModelJobValidationAudit;
  input: TInput;
  abortController: AbortController;
};

export type UserChatModelInput = {
  messageId: string;
  prompt: string;
};

export type AnswerGradeModelInput = {
  answer: string;
  sessionId: string;
  attemptNumber: number;
};

export type InterventionComposeModelInput = {
  suggestedMove?: string;
  targetChunkId?: string;
};

export type ModelJobDraft<TInput = unknown> = {
  id?: string;
  kind: ModelJobKind;
  priority?: number;
  createdAt?: number;
  expiresAt?: number;
  tabId?: number;
  pageId?: string;
  contentHash?: string;
  chunkId?: string;
  questionSessionId?: string;
  conversationId?: string;
  attemptNumber?: number;
  dedupeKey?: string;
  input: TInput;
  abortController?: AbortController;
};

export type ModelQueueConfig = {
  maxTotalJobs: number;
  maxJobsPerPage: number;
  maxRunning: number;
  maxRunningInteractive: number;
  maxRunningBackground: number;
  kindLimits: Partial<Record<ModelJobKind, number>>;
};

export const DEFAULT_MODEL_QUEUE_CONFIG: ModelQueueConfig = {
  maxTotalJobs: 50,
  maxJobsPerPage: 12,
  maxRunning: 2,
  maxRunningInteractive: 1,
  maxRunningBackground: 1,
  kindLimits: {
    intervention_compose: 8,
    page_map: 4,
    chunk_sketch: 12,
    session_summary: 4
  }
};

export type ModelJobDedupeParts = {
  kind: ModelJobKind;
  tabId?: number;
  pageId?: string;
  contentHash?: string;
  chunkId?: string;
  questionSessionId?: string;
  conversationId?: string;
  attemptNumber?: number;
};
