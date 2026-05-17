import {
  MODEL_JOB_PRIORITY,
  type ModelJob,
  type ModelJobDedupeParts,
  type ModelJobKind
} from "../../shared/model-job-types";

const INTERACTIVE_KINDS = new Set<ModelJobKind>([
  "user_chat",
  "answer_grade",
  "intervention_compose"
]);

/** Returns true when a job competes for the interactive model lane. */
export function isInteractiveModelJob(kind: ModelJobKind): boolean {
  return INTERACTIVE_KINDS.has(kind);
}

/** Builds a stable dedupe key from the runtime identity carried by a job. */
export function createModelJobDedupeKey(parts: ModelJobDedupeParts): string {
  const fields = [
    parts.kind,
    numberPart(parts.tabId),
    parts.pageId ?? "",
    parts.contentHash ?? "",
    parts.chunkId ?? "",
    parts.questionSessionId ?? "",
    parts.conversationId ?? "",
    numberPart(parts.attemptNumber)
  ];

  return fields.join("|");
}

/** Sorts pending jobs by priority, then FIFO creation order. */
export function compareModelJobScheduleOrder(
  left: ModelJob,
  right: ModelJob,
  sequenceFor: (job: ModelJob) => number
): number {
  if (left.priority !== right.priority) return left.priority - right.priority;
  return sequenceFor(left) - sequenceFor(right);
}

/** Chooses the lowest-value pending job to drop when a queue limit overflows. */
export function chooseOverflowDropCandidate(
  jobs: ModelJob[],
  sequenceFor: (job: ModelJob) => number
): ModelJob | undefined {
  const pendingJobs = jobs.filter((job) => job.status === "pending");
  pendingJobs.sort((left, right) => {
    if (left.priority !== right.priority) return right.priority - left.priority;
    return sequenceFor(left) - sequenceFor(right);
  });

  return pendingJobs[0];
}

/** Returns the configured priority for a job kind. */
export function defaultModelJobPriority(kind: ModelJobKind): number {
  return MODEL_JOB_PRIORITY[kind];
}

/** Serializes an optional number for dedupe key construction. */
function numberPart(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}
