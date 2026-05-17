import type { PetStateKey } from "../shared/companion-types";
import type {
  DebugEvent,
  DebugModelCallSnapshot,
  DebugModelQueueSnapshot,
  DebugPolicySnapshot,
  DebugStateMachineSnapshot
} from "../shared/debug-types";
import type { ModelJobDebugRecord, ModelQueueDebugSnapshot } from "../shared/model-job-types";
import type { ParserSnapshot, ReadingChunk } from "../shared/reading-types";
import type { CompanionSettings } from "../shared/settings-types";
import type { InterventionMemory, InterventionPageContext, PolicyDecision } from "../intervention";
import { companionLogs } from "../shared/logger";
import { createRuntimeMachineSnapshot, formatRuntimeMachineSnapshot } from "./runtime-state";
import type { CompanionConversationMessage, RetryDisplay } from "../ui/types";
import type { GradeResult, QuestionSession } from "../shared/session-types";

type DebugState = {
  settings: CompanionSettings;
  parser: ParserSnapshot;
  chunks: ReadingChunk[];
  memory: InterventionMemory;
  events: DebugEvent[];
  conversationMessages: CompanionConversationMessage[];
  grade?: GradeResult;
  retry?: RetryDisplay;
  session?: QuestionSession;
  petState: PetStateKey;
  lastPolicyDecision?: DebugPolicySnapshot["lastDecision"];
  modelDebug?: ModelQueueDebugSnapshot;
};

/** Builds the debug panel snapshot from current runtime state. */
export function createDebugSnapshot(state: DebugState, page: InterventionPageContext) {
  return {
    activeAvatarPack: state.settings.avatarPackId,
    chunks: state.chunks,
    contentType: state.parser.contentType,
    cooldownRemainingMilliseconds: 0,
    currentAnimation: state.petState,
    currentState: state.petState,
    dismissalCount: state.memory.dismissalCount,
    model: state.settings.provider.model,
    parserMessage: state.parser.message,
    parserStatus: state.parser.status,
    providerBaseUrl: state.settings.provider.baseUrl,
    providerName: state.settings.provider.providerName,
    policy: createPolicyDebugSnapshot(state),
    recentEvents: state.events,
    runtimeSpine: createRuntimeSpineDebugSnapshot(state, page),
    title: page.title,
    url: page.url,
    visibleChunkIds: state.chunks.filter((chunk) => chunk.metrics.visibleRatio > 0).map((chunk) => chunk.id)
  };
}

/** Converts a policy decision into compact debug-panel data. */
export function createDecisionDebug(decision: PolicyDecision): DebugPolicySnapshot["lastDecision"] {
  if (!decision.allowed) {
    return { allowed: false, reason: decision.reason, suggestedMoves: [], suppressedReasons: decision.suppressedReasons };
  }
  const opportunity = decision.opportunity;
  return {
    allowed: true,
    confidence: opportunity.confidence,
    opportunityReason: opportunity.reason,
    suggestedMoves: opportunity.suggestedMoves,
    suppressedReasons: opportunity.suppressedReasons,
    targetChunkId: opportunity.targetChunkId
  };
}

/** Creates a timestamped debug event with a stable id. */
export function createDebugEvent(code: DebugEvent["code"], message: string): DebugEvent {
  return { code, id: crypto.randomUUID(), message, timestamp: Date.now() };
}

/** Prepends a debug event while keeping the event list bounded. */
export function prependEvent(events: DebugEvent[], event: DebugEvent, limit = 8): DebugEvent[] {
  return [event, ...events].slice(0, limit);
}

function createPolicyDebugSnapshot(state: DebugState): DebugPolicySnapshot {
  const { settings } = state;
  const { overrides } = settings.interventionPolicy;
  return {
    interventionFrequency: settings.interventionFrequency,
    lastDecision: state.lastPolicyDecision,
    overrides: {
      minimumMeaningfulness: overrides.minimumMeaningfulness,
      minimumReadingConfidence: overrides.minimumReadingConfidence,
      pageLoadQuietMilliseconds: overrides.pageLoadQuietMilliseconds
    },
    personaId: settings.personaId,
    policyId: settings.interventionPolicy.policyId,
    readGatingMode: settings.readGatingMode,
    storageMode: settings.storageMode,
    strictness: settings.strictness
  };
}

/** Reports the currently wired runtime-spine capabilities without overstating migration status. */
function createRuntimeSpineDebugSnapshot(state: DebugState, page: InterventionPageContext) {
  const machines = createRuntimeMachineSnapshot({
    chunks: state.chunks,
    conversationMessages: state.conversationMessages,
    grade: state.grade,
    lastDecision: state.lastPolicyDecision,
    page,
    parser: state.parser,
    petState: state.petState,
    session: state.session
  });
  return {
    animationResolver: "module_ready" as const,
    modelQueue: "background_router_enabled" as const,
    modelQueueSnapshot: modelQueueDebugSnapshot(state.modelDebug),
    pageHistory: "store_available" as const,
    recentModelCalls: modelCallDebugSnapshots(state.modelDebug, state.settings.provider.model),
    recentLogLines: [
      formatRuntimeMachineSnapshot(machines),
      ...companionLogs().slice(0, 5).map(formatLogLine)
    ],
    resultValidator: "intervention_compose_enabled" as const,
    runtimeMode: "content_shell_with_spine_modules" as const,
    stateMachineSnapshots: stateMachineDebugSnapshots(machines),
    stateMachines: "runtime_wired" as const
  };
}

/** Formats one central log entry for compact debug display. */
function formatLogLine(entry: ReturnType<typeof companionLogs>[number]): string {
  return `${entry.level} ${entry.scope}: ${entry.message}`;
}

function modelQueueDebugSnapshot(snapshot: ModelQueueDebugSnapshot | undefined): DebugModelQueueSnapshot {
  if (!snapshot) {
    return { status: "not reported" };
  }
  const activeJobs = snapshot.jobs.filter((job) => job.status === "pending" || job.status === "running");
  return {
    activeJobIds: activeJobs.map((job) => job.id),
    completedCount: snapshot.counts.completed,
    failedCount: snapshot.counts.failed,
    lastUpdatedAt: snapshot.generatedAt,
    pendingCount: snapshot.counts.pending,
    queuedJobIds: snapshot.jobs.filter((job) => job.status === "pending").map((job) => job.id),
    runningCount: snapshot.counts.running,
    status: queueStatus(snapshot),
    totalCount: snapshot.counts.total
  };
}

function modelCallDebugSnapshots(
  snapshot: ModelQueueDebugSnapshot | undefined,
  model: string
): DebugModelCallSnapshot[] {
  if (!snapshot) return [];
  return snapshot.recentModelCalls.map((job) => ({
    action: job.providerAction ?? job.toolAction,
    durationMilliseconds: durationMs(job),
    error: job.error,
    id: job.id,
    input: stringifySummary(job.inputSummary),
    jobStatus: job.status,
    kind: job.kind,
    model,
    result: stringifySummary(job.resultSummary),
    status: callStatus(job),
    timestamp: job.completedAt ?? job.createdAt,
    validation: validationText(job)
  }));
}

function stateMachineDebugSnapshots(
  machines: ReturnType<typeof createRuntimeMachineSnapshot>
): DebugStateMachineSnapshot[] {
  return [
    machineSnapshot({ activeState: machines.page.value, at: machines.page.updatedAt, id: "page", label: "Page", reason: `kind:${machines.page.kind}` }),
    machineSnapshot({ activeState: machines.attention.value, at: machines.attention.updatedAt, id: "attention", label: "Attention" }),
    machineSnapshot({ activeState: machines.interaction.value, at: machines.interaction.updatedAt, id: "interaction", label: "Interaction" }),
    machineSnapshot({ activeState: machines.intervention.value, at: machines.intervention.updatedAt, id: "intervention", label: "Intervention" }),
    machineSnapshot({ activeState: machines.questionSession.value, at: machines.questionSession.updatedAt, id: "question-session", label: "Question session" }),
    machineSnapshot({ activeState: machines.chatRoute, id: "chat", label: "Chat route" })
  ];
}

function machineSnapshot(input: {
  activeState: string;
  at?: number;
  id: string;
  label: string;
  reason?: string;
}): DebugStateMachineSnapshot {
  return {
    activeState: input.activeState,
    id: input.id,
    label: input.label,
    recentTransitions: [{ at: input.at, reason: input.reason, to: input.activeState }]
  };
}

function queueStatus(snapshot: ModelQueueDebugSnapshot): string {
  if (snapshot.counts.running > 0) return "running";
  if (snapshot.counts.pending > 0) return "queued";
  if (snapshot.counts.failed > 0) return "failed";
  if (snapshot.counts.expired > 0 || snapshot.counts.cancelled > 0) return "settled_with_discards";
  return snapshot.counts.total > 0 ? "idle_with_history" : "idle";
}

function callStatus(job: ModelJobDebugRecord): DebugModelCallSnapshot["status"] {
  if (job.status === "pending" || job.status === "running") return "pending";
  if (job.status === "completed" && job.validationResult.status !== "invalid") return "pass";
  return "fail";
}

function durationMs(job: ModelJobDebugRecord): number | undefined {
  return job.completedAt === undefined ? undefined : Math.max(0, job.completedAt - job.createdAt);
}

function validationText(job: ModelJobDebugRecord): string {
  const reason = job.validationResult.reason ? `:${job.validationResult.reason}` : "";
  return `${job.validationResult.status}${reason}`;
}

function stringifySummary(summary: Record<string, unknown> | undefined): string | undefined {
  if (!summary) return undefined;
  return JSON.stringify(summary);
}
