import type {
  InterventionComposeInput,
  InterventionComposeResult,
  InterventionPassageContext,
  QuestionDepth
} from "../../shared/intervention-types";
import type { QuestionGenerationStrategyId } from "../../shared/settings-types";
import type { PiModelResult } from "../pi-model-provider";
import { normalizeInterventionResult } from "./result-normalizer";

const QUESTION_DEPTHS: QuestionDepth[] = [
  "recall",
  "explain_why",
  "hidden_assumption",
  "evidence_check",
  "connection",
  "implication",
  "transfer",
  "self_explanation"
];

const REASONING_MARKERS = [
  "why",
  "how",
  "because",
  "evidence",
  "assumption",
  "imply",
  "tradeoff",
  "condition",
  "failure",
  "compare",
  "connect",
  "apply"
];

const SHALLOW_STARTS = [
  "what is",
  "what are",
  "what does the passage say",
  "which thing",
  "which of",
  "who is",
  "when did",
  "where is"
];

export type QuestionGenerationStrategy = {
  id: QuestionGenerationStrategyId;
  buildSystemInstructions(input: InterventionComposeInput): string[];
  buildUserPayload(input: InterventionComposeInput): Record<string, unknown>;
  normalizeResult(result: PiModelResult, input: InterventionComposeInput): InterventionComposeResult;
  validateResult(result: InterventionComposeResult, input: InterventionComposeInput): void;
};

/** Resolves a strategy id to the implemented strategy, falling back safely. */
export function resolveQuestionGenerationStrategy(
  id: string | undefined
): QuestionGenerationStrategy {
  if (id === "candidate_ranked_v1") return candidateRankedStrategy;
  if (id === "sketch_then_rank_v1") return sketchThenRankStrategy;
  return singleShotStrategy;
}

/** Applies local shallow-question checks for ranked strategy tests and runtime validation. */
export function validateRankedQuestionResult(
  result: InterventionComposeResult,
  input: InterventionComposeInput
): void {
  if (result.action !== "ask_question" && result.action !== "offer_prediction") return;
  requireText(result.expectedAnswer, "candidate_ranked_v1 requires expectedAnswer.");
  requireText(result.questionDepth, "candidate_ranked_v1 requires questionDepth.");
  if (result.questionDepth === "recall" && !allowsRecall(input)) {
    throw new Error("candidate_ranked_v1 rejected recall depth for this policy.");
  }
  rejectShallowQuestionText(result.userFacingText ?? "");
  rejectPassageCopy(result.userFacingText ?? "", input.currentPassage.preview || input.currentPassage.text);
}

const singleShotStrategy: QuestionGenerationStrategy = {
  id: "single_shot_v1",
  /** Builds legacy one-shot generation instructions. */
  buildSystemInstructions: () => [
    "Use currentPassage as the anchor; use surroundingPassages only for local context, contrast, or avoiding repetition.",
    "Keep userFacingText reader-facing and reasonForApp app-facing."
  ],
  /** Builds the legacy prompt payload. */
  buildUserPayload: (input) => basePayload(input, "single_shot_v1"),
  /** Normalizes a one-shot provider result. */
  normalizeResult: (result, input) => withStrategyId(normalizeInterventionResult(result, input), "single_shot_v1"),
  /** Keeps the legacy strategy schema-compatible without depth enforcement. */
  validateResult: () => undefined
};

const candidateRankedStrategy: QuestionGenerationStrategy = {
  id: "candidate_ranked_v1",
  /** Builds internal candidate-ranking instructions. */
  buildSystemInstructions: () => [
    "Use currentPassage as the anchor for any question or prediction.",
    "Use surroundingPassages for setup, contrast, consequences, nearby claims, and recent ideas the reader has already seen.",
    "If asking a question or prediction, internally generate 3-5 candidate questions first.",
    "Each candidate must be answerable from currentPassage plus surroundingPassages.",
    "Classify each candidate with one questionDepth from the supplied depth taxonomy.",
    "Reject shallow, copyable, context-free, over-broad, or passage-lookup candidates before selecting the best one.",
    "For ask_question and offer_prediction include questionStrategyId, questionDepth, targetIdea, and reasoningNeeded.",
    "Keep userFacingText reader-facing and reasonForApp app-facing."
  ],
  /** Builds the ranked strategy payload with depth taxonomy. */
  buildUserPayload: (input) => ({
    ...basePayload(input, "candidate_ranked_v1"),
    strategy: {
      id: "candidate_ranked_v1",
      candidateCount: "3-5 internal candidates",
      anchor: "currentPassage",
      contextUse: [
        "Use previous passages for setup, definitions, claims, or contrast.",
        "Use next passages only when provided and helpful for prediction or trajectory.",
        "Use recent passages to avoid repeats and connect ideas the reader has already encountered."
      ],
      selectionRule: "prefer questions that require explaining why, connecting claims, checking evidence, naming assumptions, or applying the idea",
      reject: [
        "missing expected answer",
        "not answerable from provided context",
        "copyable recall unless strict read-gating asks for recall",
        "question text too similar to the passage",
        "questions answerable by quoting one sentence",
        "questions requiring outside knowledge",
        "questions about passages not included in currentPassage or surroundingPassages"
      ]
    },
    depthTaxonomy: QUESTION_DEPTHS
  }),
  /** Normalizes a ranked provider result. */
  normalizeResult: (result, input) => withStrategyId(normalizeInterventionResult(result, input), "candidate_ranked_v1"),
  /** Enforces ranked question metadata and shallow-question checks. */
  validateResult: validateRankedQuestionResult
};

const sketchThenRankStrategy: QuestionGenerationStrategy = {
  id: "sketch_then_rank_v1",
  /** Builds sketch-then-rank instructions for higher-quality local reasoning. */
  buildSystemInstructions: () => [
    "Use currentPassage as the anchor for any question or prediction.",
    "Silently sketch the local argument from currentPassage and surroundingPassages before choosing an action.",
    "If asking a question or prediction, internally generate 3-5 candidate questions from that sketch.",
    "Prefer candidates about structure, implication, hidden assumption, evidence check, transfer, or connection.",
    "Each candidate must be answerable from currentPassage plus surroundingPassages.",
    "Reject shallow, copyable, context-free, over-broad, or outside-knowledge candidates before selecting the best one.",
    "For ask_question and offer_prediction include questionStrategyId, questionDepth, targetIdea, and reasoningNeeded.",
    "Return only the final selected intervention; do not expose the sketch or candidate list.",
    "Keep userFacingText reader-facing and reasonForApp app-facing."
  ],
  /** Builds the sketch-then-rank payload with shared context and depth taxonomy. */
  buildUserPayload: (input) => ({
    ...basePayload(input, "sketch_then_rank_v1"),
    strategy: {
      id: "sketch_then_rank_v1",
      internalSteps: [
        "Sketch the local argument from currentPassage plus surroundingPassages.",
        "Generate 3-5 candidate questions or predictions.",
        "Rank candidates by groundedness, reasoning depth, and usefulness for this exact moment.",
        "Return only the selected intervention."
      ],
      anchor: "currentPassage",
      selectionRule: "prefer questions that test a relation, assumption, implication, evidence role, or transfer rather than recall"
    },
    depthTaxonomy: QUESTION_DEPTHS
  }),
  /** Normalizes a sketch-then-rank provider result. */
  normalizeResult: (result, input) => withStrategyId(normalizeInterventionResult(result, input), "sketch_then_rank_v1"),
  /** Reuses ranked metadata and shallow-question checks for sketch-ranked output. */
  validateResult: validateRankedQuestionResult
};

/** Builds the common intervention prompt payload with bounded passage fields. */
function basePayload(
  input: InterventionComposeInput,
  strategyId: QuestionGenerationStrategyId
): Record<string, unknown> {
  return {
    task: "intervention_compose",
    strategyId,
    allowedActions: input.policy.allowedActions,
    ...input,
    currentPassage: {
      ...input.currentPassage,
      text: truncatePromptText(input.currentPassage.text, 4_000)
    },
    surroundingPassages: {
      previous: truncatePassages(input.surroundingPassages?.previous ?? [], 1_800),
      next: truncatePassages(input.surroundingPassages?.next ?? [], 900),
      recent: truncatePassages(input.surroundingPassages?.recent ?? [], 1_200)
    },
    page: {
      ...input.page,
      excerpt: input.page.excerpt ? truncatePromptText(input.page.excerpt, 1_500) : undefined
    },
    history: input.history.slice(-6)
  };
}

/** Trims a group of passages to a shared prompt text budget. */
function truncatePassages(
  passages: InterventionPassageContext[],
  totalLength: number
): InterventionPassageContext[] {
  const perPassage = Math.max(1, Math.floor(totalLength / Math.max(1, passages.length)));
  return passages.map((passage) => ({
    ...passage,
    text: truncatePromptText(passage.text, perPassage)
  }));
}

/** Adds strategy metadata to question-like results when the model omitted it. */
function withStrategyId(
  result: InterventionComposeResult,
  strategyId: QuestionGenerationStrategyId
): InterventionComposeResult {
  if (result.action !== "ask_question" && result.action !== "offer_prediction") return result;
  return { ...result, questionStrategyId: result.questionStrategyId ?? strategyId };
}

/** Trims long passage text for prompt payloads. */
function truncatePromptText(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length).trim()}...` : value;
}

/** Requires a non-empty provider text value. */
function requireText(value: string | undefined, message: string): void {
  if (!value || !value.trim()) throw new Error(message);
}

/** Returns whether deterministic policy/read-gating permits recall questions. */
function allowsRecall(input: InterventionComposeInput): boolean {
  return input.companionStyle.readGatingMode === "strict"
    || input.policy.reason?.toLowerCase().includes("recall") === true;
}

/** Rejects shallow question stems unless they contain an explicit reasoning marker. */
function rejectShallowQuestionText(question: string): void {
  const normalized = question.trim().toLowerCase();
  const hasShallowStart = SHALLOW_STARTS.some((prefix) => normalized.startsWith(prefix));
  const hasReasoningMarker = REASONING_MARKERS.some((marker) => normalized.includes(marker));
  if (hasShallowStart && !hasReasoningMarker) {
    throw new Error("candidate_ranked_v1 rejected an obvious shallow question.");
  }
}

/** Rejects questions that copy or over-match the passage preview. */
function rejectPassageCopy(question: string, passage: string): void {
  const normalizedQuestion = normalizeForSimilarity(question);
  if (!normalizedQuestion) return;
  for (const sentence of passageSentences(passage)) {
    const normalizedSentence = normalizeForSimilarity(sentence);
    if (normalizedSentence && normalizedQuestion.includes(normalizedSentence)) {
      throw new Error("candidate_ranked_v1 rejected copied passage text.");
    }
  }
  if (jaccardSimilarity(normalizedQuestion, normalizeForSimilarity(passage)) > 0.72) {
    throw new Error("candidate_ranked_v1 rejected a question too similar to the passage.");
  }
}

/** Splits passage text into sentence-like copy-check units. */
function passageSentences(passage: string): string[] {
  return passage.split(/[.!?]\s+/).map((part) => part.trim()).filter((part) => part.length > 24);
}

/** Normalizes text before copy and overlap checks. */
function normalizeForSimilarity(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9\s]/g, " ").replaceAll(/\s+/g, " ").trim();
}

/** Computes token-level Jaccard overlap for shallow-copy detection. */
function jaccardSimilarity(left: string, right: string): number {
  const leftWords = new Set(left.split(" ").filter((word) => word.length > 3));
  const rightWords = new Set(right.split(" ").filter((word) => word.length > 3));
  if (leftWords.size === 0 || rightWords.size === 0) return 0;
  const intersection = [...leftWords].filter((word) => rightWords.has(word)).length;
  return intersection / new Set([...leftWords, ...rightWords]).size;
}
