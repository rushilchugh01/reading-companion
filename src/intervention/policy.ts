import type { InterventionCandidate } from "../shared/session-types";
import type {
  InterventionOpportunity,
  InterventionMemory,
  InterventionPageContext,
  InterventionPolicyOptions,
  PolicyDecision,
  PolicyInput,
  SuppressionReason
} from "./types";

const DEFAULT_OPTIONS: InterventionPolicyOptions = {
  pageLoadQuietMilliseconds: 10_000,
  cooldownMilliseconds: {
    low: 180_000,
    medium: 90_000,
    high: 45_000
  },
  dismissalBaseMilliseconds: 120_000,
  maxDismissalBackoffPower: 4,
  maxQuestionsPerPage: {
    low: 1,
    medium: 2,
    high: 4
  },
  readinessThreshold: {
    strict: 0.8,
    balanced: 0.55,
    look_ahead: 0.35
  },
  minimumMeaningfulness: 0.45,
  minimumReadingConfidence: 0.42
};

const POLICY_PACKS = {
  ambient_active_reading_v1: DEFAULT_OPTIONS,
  gentle_checkpoints: createPolicyOptions({
    pageLoadQuietMilliseconds: 20_000,
    cooldownMilliseconds: { low: 300_000, medium: 180_000, high: 90_000 },
    maxQuestionsPerPage: { low: 1, medium: 1, high: 2 },
    readinessThreshold: { strict: 0.86, balanced: 0.68, look_ahead: 0.48 },
    minimumMeaningfulness: 0.56,
    minimumReadingConfidence: 0.55
  }),
  brutal_tutor_dense: createPolicyOptions({
    pageLoadQuietMilliseconds: 8_000,
    cooldownMilliseconds: { low: 150_000, medium: 75_000, high: 35_000 },
    maxQuestionsPerPage: { low: 2, medium: 3, high: 5 },
    readinessThreshold: { strict: 0.76, balanced: 0.5, look_ahead: 0.32 },
    minimumMeaningfulness: 0.5,
    minimumReadingConfidence: 0.36
  })
} as const;

/** Creates an empty intervention memory snapshot. */
export function createInterventionMemory(): InterventionMemory {
  return {
    dismissalCount: 0,
    askedChunkIds: [],
    quietedChunkIds: [],
    questionsByPage: 0
  };
}

/** Merges caller thresholds with stable defaults. */
export function createPolicyOptions(
  overrides: Partial<InterventionPolicyOptions> = {}
): InterventionPolicyOptions {
  return {
    ...DEFAULT_OPTIONS,
    ...overrides,
    cooldownMilliseconds: {
      ...DEFAULT_OPTIONS.cooldownMilliseconds,
      ...overrides.cooldownMilliseconds
    },
    maxQuestionsPerPage: {
      ...DEFAULT_OPTIONS.maxQuestionsPerPage,
      ...overrides.maxQuestionsPerPage
    },
    readinessThreshold: {
      ...DEFAULT_OPTIONS.readinessThreshold,
      ...overrides.readinessThreshold
    },
    minimumMeaningfulness: overrides.minimumMeaningfulness
      ?? DEFAULT_OPTIONS.minimumMeaningfulness,
    minimumReadingConfidence: overrides.minimumReadingConfidence
      ?? DEFAULT_OPTIONS.minimumReadingConfidence
  };
}

/** Evaluates all intervention guardrails in deterministic priority order. */
export function evaluateInterventionPolicy(
  input: PolicyInput
): PolicyDecision {
  const options = resolvePolicyOptions(input);
  const coarseReason = evaluateCoarseGuardrails(input, options);
  if (coarseReason) {
    return denied(coarseReason);
  }

  const candidate = selectInterventionCandidate(input.candidates, input);
  if (!candidate) {
    return denied("no_candidate");
  }

  const candidateReason = evaluateCandidateGuardrails(candidate, input, options);
  if (candidateReason) {
    return denied(candidateReason);
  }

  return {
    allowed: true,
    candidate,
    opportunity: createInterventionOpportunity(candidate, input, options)
  };
}

/** Selects the highest-value eligible candidate for the current page. */
export function selectInterventionCandidate(
  candidates: InterventionCandidate[],
  input: PolicyInput
): InterventionCandidate | undefined {
  return candidates
    .filter((candidate) => isCandidateEligible(candidate, input))
    .toSorted(compareCandidatePriority)[0];
}

/** Records that a question was shown without mutating previous memory. */
export function markQuestionAsked(
  memory: InterventionMemory,
  candidate: InterventionCandidate,
  now: number
): InterventionMemory {
  return {
    ...memory,
    lastAskedAt: now,
    askedChunkIds: [...memory.askedChunkIds, candidate.chunk.id],
    questionsByPage: memory.questionsByPage + 1
  };
}

/** Records a model-chosen quiet deferral without counting it as a question. */
export function markModelStayedQuiet(
  memory: InterventionMemory,
  candidate: InterventionCandidate
): InterventionMemory {
  return {
    ...memory,
    quietedChunkIds: [...memory.quietedChunkIds, candidate.chunk.id]
  };
}

/** Records a user dismissal and resets no other cadence state. */
export function markInterventionDismissed(
  memory: InterventionMemory,
  now: number
): InterventionMemory {
  return {
    ...memory,
    lastDismissedAt: now,
    dismissalCount: memory.dismissalCount + 1
  };
}

function evaluateCoarseGuardrails(
  input: PolicyInput,
  options: InterventionPolicyOptions
): SuppressionReason | undefined {
  const { settings, page, signals } = input;
  if (isSiteDisabled(page, settings.hiddenSites) || isSiteDisabled(page, settings.blockedSites)) {
    return "disabled_site";
  }
  if (isPageDisabled(page, settings.hiddenPages)) {
    return "disabled_page";
  }
  if (signals.now - page.loadedAt < options.pageLoadQuietMilliseconds) {
    return "page_load";
  }
  if (!signals.tabVisible || !signals.windowFocused) {
    return "inactive_tab";
  }
  if (signals.isFastScrolling) {
    return "fast_scroll";
  }
  return evaluateCadenceGuardrails(input, options);
}

function evaluateCadenceGuardrails(
  input: PolicyInput,
  options: InterventionPolicyOptions
): SuppressionReason | undefined {
  const { settings, signals, memory } = input;
  const cooldown = options.cooldownMilliseconds[settings.interventionFrequency];
  if (memory.lastAskedAt !== undefined && signals.now - memory.lastAskedAt < cooldown) {
    return "cooldown";
  }
  if (isInDismissalBackoff(memory, signals.now, options)) {
    return "dismissal_backoff";
  }
  if (memory.questionsByPage >= options.maxQuestionsPerPage[settings.interventionFrequency]) {
    return "max_questions_page";
  }
  if (memory.activeSession) {
    return "active_session";
  }
  return undefined;
}

function isCandidateEligible(
  candidate: InterventionCandidate,
  input: PolicyInput
): boolean {
  return (
    !input.memory.askedChunkIds.includes(candidate.chunk.id) &&
    !(input.memory.quietedChunkIds ?? []).includes(candidate.chunk.id) &&
    candidate.chunk.text.trim().length > 0
  );
}

function evaluateCandidateGuardrails(
  candidate: InterventionCandidate,
  input: PolicyInput,
  options: InterventionPolicyOptions
): SuppressionReason | undefined {
  if (candidate.chunk.scores.meaningfulness < options.minimumMeaningfulness) {
    return "low_meaningfulness";
  }
  if (candidate.chunk.scores.readingConfidence < options.minimumReadingConfidence) {
    return "low_reading_confidence";
  }
  const threshold = options.readinessThreshold[input.settings.readGatingMode];
  return candidate.chunk.scores.interventionReadiness < threshold ? "read_gating" : undefined;
}

function isInDismissalBackoff(
  memory: InterventionMemory,
  now: number,
  options: InterventionPolicyOptions
): boolean {
  if (memory.lastDismissedAt === undefined || memory.dismissalCount === 0) {
    return false;
  }
  const power = Math.min(memory.dismissalCount - 1, options.maxDismissalBackoffPower);
  const backoff = options.dismissalBaseMilliseconds * 2 ** power;
  return now - memory.lastDismissedAt < backoff;
}

function isSiteDisabled(page: InterventionPageContext, disabledSites: string[]): boolean {
  return disabledSites.some((site) => page.host === site || page.host.endsWith(`.${site}`));
}

function isPageDisabled(page: InterventionPageContext, hiddenPages: string[]): boolean {
  return hiddenPages.includes(page.url);
}

function compareCandidatePriority(
  left: InterventionCandidate,
  right: InterventionCandidate
): number {
  return right.score - left.score || left.chunk.order - right.chunk.order;
}

function resolvePolicyOptions(input: PolicyInput): InterventionPolicyOptions {
  const policyId = input.settings.interventionPolicy.policyId;
  const base = POLICY_PACKS[policyId] ?? POLICY_PACKS.ambient_active_reading_v1;
  const overrides = input.settings.interventionPolicy.overrides;
  return createPolicyOptions({
    ...base,
    ...overrides,
    cooldownMilliseconds: {
      ...base.cooldownMilliseconds,
      ...overrides.cooldownMilliseconds
    },
    maxQuestionsPerPage: {
      ...base.maxQuestionsPerPage,
      ...overrides.maxQuestionsPerPage
    },
    readinessThreshold: {
      ...base.readinessThreshold,
      ...overrides.readinessThreshold
    }
  });
}

function denied(reason: SuppressionReason): PolicyDecision {
  return { allowed: false, reason, suppressedReasons: [reason] };
}

function createInterventionOpportunity(
  candidate: InterventionCandidate,
  input: PolicyInput,
  options: InterventionPolicyOptions
): InterventionOpportunity {
  const reason = classifyOpportunityReason(candidate);
  return {
    targetChunkId: candidate.chunk.id,
    reason,
    confidence: confidenceForOpportunity(candidate, options),
    suggestedMoves: suggestedMovesForReason(reason, input),
    suppressedReasons: [],
    policyId: input.settings.interventionPolicy.policyId
  };
}

function classifyOpportunityReason(
  candidate: InterventionCandidate
): InterventionOpportunity["reason"] {
  const { chunk } = candidate;
  if (chunk.state === "stuck_or_confused" || chunk.metrics.revisitCount >= 2) {
    return "revisit_confusion";
  }
  if (chunk.kind === "code") return "code_walkthrough";
  if (chunk.kind === "math" || chunk.kind === "table") return "dense_pause";
  if (chunk.kind === "heading") return "section_checkpoint";
  return chunk.text.includes(":") || /\bmeans\b|\bdefined\b/i.test(chunk.text)
    ? "definition_read"
    : "claim_boundary";
}

function confidenceForOpportunity(
  candidate: InterventionCandidate,
  options: InterventionPolicyOptions
): number {
  const readiness = candidate.chunk.scores.interventionReadiness;
  const threshold = Math.max(0.01, options.readinessThreshold.balanced);
  return Math.min(1, Math.round((candidate.score * readiness / threshold) * 100) / 100);
}

function suggestedMovesForReason(
  reason: InterventionOpportunity["reason"],
  input: PolicyInput
): InterventionOpportunity["suggestedMoves"] {
  if (input.settings.readGatingMode === "look_ahead") {
    return ["offer_prediction", "ask_question", "get_attention", "stay_quiet"];
  }
  if (reason === "revisit_confusion") {
    return ["get_attention", "ask_question", "offer_hint", "stay_quiet"];
  }
  if (reason === "section_checkpoint") {
    return ["ask_question", "offer_prediction", "stay_quiet"];
  }
  return ["ask_question", "get_attention", "stay_quiet"];
}
