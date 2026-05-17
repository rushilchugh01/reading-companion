import type { ReadingChunk, ReadingSignals } from "../shared/reading-types";
import type { CognitiveMove, CompanionSettings, InterventionPolicyId } from "../shared/settings-types";
import type {
  GradeResult,
  InterventionCandidate,
  QuestionSession,
  WeakConcept
} from "../shared/session-types";

/** Page context needed by intervention policy and weak concept creation. */
export type InterventionPageContext = {
  url: string;
  title: string;
  host: string;
  loadedAt: number;
};

/** Mutable-but-serializable cadence state owned by the intervention runtime. */
export type InterventionMemory = {
  lastAskedAt?: number;
  lastDismissedAt?: number;
  dismissalCount: number;
  askedChunkIds: string[];
  quietedChunkIds: string[];
  questionsByPage: number;
  activeSession?: QuestionSession;
};

/** Guardrail suppression reason exposed for debug surfaces and tests. */
export type SuppressionReason =
  | "disabled_site"
  | "disabled_page"
  | "page_load"
  | "inactive_tab"
  | "fast_scroll"
  | "cooldown"
  | "dismissal_backoff"
  | "max_questions_page"
  | "read_gating"
  | "low_meaningfulness"
  | "low_reading_confidence"
  | "active_session"
  | "no_candidate";

/** Human-readable reason a policy selected a candidate moment. */
export type InterventionOpportunityReason =
  | "section_checkpoint"
  | "dense_pause"
  | "revisit_confusion"
  | "definition_read"
  | "code_walkthrough"
  | "claim_boundary";

/** Rich opportunity handed from deterministic policy to model/persona layer. */
export type InterventionOpportunity = {
  targetChunkId: string;
  reason: InterventionOpportunityReason;
  confidence: number;
  suggestedMoves: CognitiveMove[];
  suppressedReasons: SuppressionReason[];
  policyId: InterventionPolicyId;
};

/** Result of checking whether an intervention may be shown now. */
export type PolicyDecision =
  | { allowed: true; candidate: InterventionCandidate; opportunity: InterventionOpportunity }
  | { allowed: false; reason: SuppressionReason; suppressedReasons: SuppressionReason[] };

/** Complete immutable input for intervention policy evaluation. */
export type PolicyInput = {
  settings: CompanionSettings;
  page: InterventionPageContext;
  signals: ReadingSignals;
  memory: InterventionMemory;
  candidates: InterventionCandidate[];
};

/** Tunable deterministic thresholds for intervention cadence. */
export type InterventionPolicyOptions = {
  pageLoadQuietMilliseconds: number;
  cooldownMilliseconds: Record<CompanionSettings["interventionFrequency"], number>;
  dismissalBaseMilliseconds: number;
  maxDismissalBackoffPower: number;
  maxQuestionsPerPage: Record<CompanionSettings["interventionFrequency"], number>;
  readinessThreshold: Record<CompanionSettings["readGatingMode"], number>;
  minimumMeaningfulness: number;
  minimumReadingConfidence: number;
};

/** State transition produced after an answer is graded. */
export type AnswerEvaluation = {
  action: "correct" | "hint" | "retry" | "explanation";
  feedback: string;
  hint?: string;
  explanation?: string;
  nextSession?: QuestionSession;
  weakConcept?: WeakConcept;
};

/** Input for deterministic answer lifecycle decisions. */
export type AnswerEvaluationInput = {
  session: QuestionSession;
  answer: string;
  grade: GradeResult;
  chunk: ReadingChunk;
  page: InterventionPageContext;
  personaId: string;
  now: number;
};
