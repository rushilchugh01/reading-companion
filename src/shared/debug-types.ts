import type { PetStateKey } from "./companion-types";
import type { ContentType, ReadingChunk } from "./reading-types";
import type { CognitiveMove, CompanionSettings, InterventionPolicyId } from "./settings-types";

/** Event codes persisted for local debug inspection. */
export type DebugEventCode =
  | "PAGE_PARSED"
  | "CHUNK_VISIBLE"
  | "CHUNK_PROBABLY_READ"
  | "USER_FAST_SCROLLING"
  | "INTERVENTION_SUPPRESSED_COOLDOWN"
  | "INTERVENTION_SUPPRESSED_LOW_MEANINGFULNESS"
  | "INTERVENTION_TRIGGERED"
  | "INTERVENTION_MODEL_STAYED_QUIET"
  | "MODEL_REQUEST_FAILED"
  | "QUESTION_GENERATED"
  | "ANSWER_GRADED"
  | "WEAK_CONCEPT_SAVED";

/** Local-only debug event. */
export type DebugEvent = {
  id: string;
  code: DebugEventCode;
  message: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
};

/** Policy and settings snapshot shown in the in-page debug panel. */
export type DebugPolicySnapshot = {
  policyId: InterventionPolicyId;
  interventionFrequency: CompanionSettings["interventionFrequency"];
  readGatingMode: CompanionSettings["readGatingMode"];
  personaId: string;
  strictness: CompanionSettings["strictness"];
  storageMode: CompanionSettings["storageMode"];
  overrides: {
    minimumMeaningfulness?: number;
    minimumReadingConfidence?: number;
    pageLoadQuietMilliseconds?: number;
  };
  lastDecision?: {
    allowed: boolean;
    reason?: string;
    targetChunkId?: string;
    opportunityReason?: string;
    confidence?: number;
    suggestedMoves: CognitiveMove[];
    suppressedReasons: string[];
  };
};

/** Runtime-spine migration status shown in debug tooling. */
export type DebugRuntimeSpineSnapshot = {
  runtimeMode: "content_shell_with_spine_modules" | "runtime_controller";
  modelQueue: "background_router_enabled" | "not_wired";
  modelQueueSnapshot?: DebugModelQueueSnapshot;
  recentModelCalls?: DebugModelCallSnapshot[];
  resultValidator: "intervention_compose_enabled" | "not_wired";
  pageHistory: "store_available" | "not_wired";
  stateMachines: "module_ready" | "runtime_wired";
  stateMachineSnapshots?: DebugStateMachineSnapshot[];
  animationResolver: "module_ready" | "runtime_wired";
  recentLogLines: string[];
};

/** Compact transition row for runtime state-machine debug displays. */
export type DebugTransitionSnapshot = {
  at?: number;
  event?: string;
  from?: string;
  reason?: string;
  to: string;
};

/** Display-only runtime state-machine status exposed to debug tooling. */
export type DebugStateMachineSnapshot = {
  id: string;
  label?: string;
  activeState: string;
  recentTransitions?: DebugTransitionSnapshot[];
};

/** Display-only model queue counters exposed to debug tooling. */
export type DebugModelQueueSnapshot = {
  activeJobIds?: string[];
  completedCount?: number;
  failedCount?: number;
  lastUpdatedAt?: number;
  pendingCount?: number;
  queuedJobIds?: string[];
  runningCount?: number;
  status?: string;
  totalCount?: number;
};

/** Display-only recent model call summary exposed to debug tooling. */
export type DebugModelCallSnapshot = {
  action?: string;
  durationMilliseconds?: number;
  error?: string;
  id: string;
  input?: string;
  jobStatus?: string;
  kind?: string;
  model?: string;
  result?: string;
  status: "pass" | "fail" | "pending";
  timestamp?: number;
  validation?: string;
};

/** Debug snapshot shown in the compact panel. */
export type DebugSnapshot = {
  url: string;
  title: string;
  contentType: ContentType;
  parserStatus: string;
  parserMessage?: string;
  visibleChunkIds: string[];
  currentState: PetStateKey;
  activeAvatarPack: string;
  currentAnimation: string;
  cooldownRemainingMilliseconds: number;
  dismissalCount: number;
  providerName: string;
  providerBaseUrl: string;
  model: string;
  policy: DebugPolicySnapshot;
  runtimeSpine?: DebugRuntimeSpineSnapshot;
  recentEvents: DebugEvent[];
  chunks: ReadingChunk[];
  lastPrompt?: string;
};
