import type { GradeResult } from "../../shared/session-types";
import type {
  AnswerGradeModelInput,
  ModelJob,
  UserChatModelInput
} from "../../shared/model-job-types";
import type { CurrentRuntimeSnapshot, RuntimeAnswerSessionSnapshot } from "../../shared/runtime-types";
import type { InterventionComposeResult } from "../../shared/intervention-types";

export type InterventionInvalidReason =
  | "expired"
  | "tab_changed"
  | "page_changed"
  | "content_changed"
  | "chunk_changed"
  | "chat_open"
  | "cooldown"
  | "invalid_schema";

export type AnswerGradeInvalidReason =
  | "session_changed"
  | "attempt_changed"
  | "session_not_answer_pending";

export type ChatInvalidReason =
  | "conversation_changed"
  | "message_cancelled";

export type ModelResultValidation<TReason extends string, TResult> =
  | { valid: true; result: TResult }
  | { valid: false; reason: TReason };

/** Validates an intervention result against current page state and schema. */
export function validateInterventionComposeResult(
  job: ModelJob,
  result: unknown,
  snapshot: CurrentRuntimeSnapshot
): ModelResultValidation<InterventionInvalidReason, InterventionComposeResult> {
  const staleReason = interventionStaleReason(job, snapshot);
  if (staleReason) return { valid: false, reason: staleReason };
  if (!isInterventionComposeResult(result)) return { valid: false, reason: "invalid_schema" };

  return { valid: true, result };
}

/** Validates an answer grade before applying it to a question session. */
export function validateAnswerGradeResult(
  job: ModelJob<AnswerGradeModelInput>,
  result: GradeResult,
  snapshot: CurrentRuntimeSnapshot
): ModelResultValidation<AnswerGradeInvalidReason, GradeResult> {
  const session = currentAnswerSession(snapshot);
  if (!session || session.id !== expectedSessionId(job)) {
    return { valid: false, reason: "session_changed" };
  }

  if (job.attemptNumber !== undefined && session.attemptNumber !== job.attemptNumber) {
    return { valid: false, reason: "attempt_changed" };
  }

  if (session.status !== "answer_pending") {
    return { valid: false, reason: "session_not_answer_pending" };
  }

  return { valid: true, result };
}

/** Validates a chat result before appending it to the active conversation. */
export function validateUserChatResult<TResult>(
  job: ModelJob<UserChatModelInput>,
  result: TResult,
  snapshot: CurrentRuntimeSnapshot
): ModelResultValidation<ChatInvalidReason, TResult> {
  if (job.conversationId && currentConversationId(snapshot) !== job.conversationId) {
    return { valid: false, reason: "conversation_changed" };
  }

  if (snapshot.cancelledMessageIds?.includes(job.input.messageId)) {
    return { valid: false, reason: "message_cancelled" };
  }

  return { valid: true, result };
}

/** Finds the first intervention staleness reason for a job. */
function interventionStaleReason(
  job: ModelJob,
  snapshot: CurrentRuntimeSnapshot
): InterventionInvalidReason | undefined {
  if (snapshot.now > job.expiresAt) return "expired";
  if (changedNumber(job.tabId, snapshot.tabId)) return "tab_changed";
  if (changedString(job.pageId, snapshot.pageId)) return "page_changed";
  if (changedString(job.contentHash, snapshot.contentHash)) return "content_changed";
  if (changedString(job.chunkId, currentChunkId(snapshot))) return "chunk_changed";
  if (snapshot.chatOpen === true) return "chat_open";
  if (isInCooldown(snapshot)) return "cooldown";

  return undefined;
}

/** Checks whether a proposed intervention obeys the result contract. */
function isInterventionComposeResult(value: unknown): value is InterventionComposeResult {
  if (!isRecord(value) || !isKnownAction(value.action)) return false;

  switch (value.action) {
    case "ask_question":
    case "offer_prediction":
      return hasText(value.userFacingText) && hasText(value.expectedAnswer);
    case "offer_observation":
      return hasText(value.userFacingText) && hasText(value.observationType);
    case "offer_help":
      return hasText(value.userFacingText);
    case "stay_quiet":
      return !Object.hasOwn(value, "userFacingText");
  }
}

/** Returns the active answer session snapshot, if one exists. */
function currentAnswerSession(snapshot: CurrentRuntimeSnapshot): RuntimeAnswerSessionSnapshot | undefined {
  return snapshot.answerSession ?? snapshot.questionSession;
}

/** Returns the expected answer session id carried by a grade job. */
function expectedSessionId(job: ModelJob<AnswerGradeModelInput>): string | undefined {
  return job.questionSessionId ?? job.input.questionId;
}

/** Returns the active conversation id from either old or new snapshot fields. */
function currentConversationId(snapshot: CurrentRuntimeSnapshot): string | undefined {
  return snapshot.currentConversationId ?? snapshot.conversationId;
}

/** Returns the current chunk identity from either old or new snapshot fields. */
function currentChunkId(snapshot: CurrentRuntimeSnapshot): string | undefined {
  return snapshot.activeChunkId ?? snapshot.chunkId;
}

/** Checks whether an optional number identity changed. */
function changedNumber(previous: number | undefined, current: number | undefined): boolean {
  return previous !== undefined && current !== undefined && previous !== current;
}

/** Checks whether an optional string identity changed. */
function changedString(previous: string | undefined, current: string | undefined): boolean {
  return previous !== undefined && current !== undefined && previous !== current;
}

/** Checks whether intervention cadence currently suppresses output. */
function isInCooldown(snapshot: CurrentRuntimeSnapshot): boolean {
  const cooldownUntil = snapshot.cooldownUntil ?? snapshot.interventionCooldownUntil;
  return cooldownUntil !== undefined && snapshot.now < cooldownUntil;
}

/** Checks whether an unknown value is an object record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Checks whether an unknown action is part of the compose result contract. */
function isKnownAction(action: unknown): action is InterventionComposeResult["action"] {
  return action === "ask_question"
    || action === "offer_prediction"
    || action === "offer_observation"
    || action === "offer_help"
    || action === "stay_quiet";
}

/** Checks whether a schema field contains non-empty text. */
function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
