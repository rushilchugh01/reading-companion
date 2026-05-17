import type { AttentionStateValue } from "../state/attention";
import type { InteractionStateValue } from "../state/interaction";
import type { InterventionStateValue } from "../state/intervention";
import type { AskablePageKind, PageKind, PageStateValue } from "../state/page";
import { isAskablePageKind } from "../state/page";
import type { CooldownChannel, CooldownState } from "./cooldown-policy";
import { isCooldownActive } from "./cooldown-policy";

export type ContentCandidateKind = "help" | "observation" | "prediction" | "question";

export type DecisionSuppressionReason =
  | "page_not_ready"
  | "non_askable_page"
  | "attention_not_ready"
  | "interaction_suppressed"
  | "intervention_cooldown"
  | "junk_chunk"
  | "chunk_below_threshold"
  | "annoyance_high"
  | "no_natural_pause"
  | "page_limit"
  | "cooldown_all_proactive"
  | "cooldown_questions"
  | "cooldown_predictions"
  | "cooldown_insights"
  | "cooldown_help_offers"
  | "cooldown_same_chunk"
  | "cooldown_same_page";

export type ContentDecisionInput = {
  now: number;
  page: {
    value: PageStateValue;
    kind: PageKind;
  };
  attention: {
    value: AttentionStateValue;
  };
  interaction: {
    value: InteractionStateValue;
  };
  intervention: {
    value: InterventionStateValue;
  };
  chunk: {
    id: string;
    valueScore: number;
    isJunk: boolean;
    stuckScore?: number;
    hasContrast?: boolean;
    hasHiddenAssumption?: boolean;
    hasContradiction?: boolean;
    setsUpNextClaim?: boolean;
  };
  annoyanceScore: number;
  naturalPause: boolean;
  pagePromptCount: number;
  maxPromptsPerPage: number;
  cooldowns?: CooldownState;
};

export type ContentDecision =
  | {
    allowed: true;
    candidateKind: ContentCandidateKind;
    channel: CooldownChannel;
    targetChunkId: string;
    threshold: number;
  }
  | {
    allowed: false;
    reason: DecisionSuppressionReason;
  };

const CHUNK_VALUE_THRESHOLDS: Record<AskablePageKind, number> = {
  article: 0.65,
  docs: 0.72,
  academic_paper: 0.68,
  pdf_text: 0.72
};

/** Evaluates conservative gates before allowing a content intervention candidate. */
export function evaluateContentDecisionPolicy(input: ContentDecisionInput): ContentDecision {
  const baseDenial = evaluateBaseGuardrails(input);
  if (baseDenial) {
    return denied(baseDenial);
  }

  const cooldownDenial = evaluateSharedCooldowns(input);
  if (cooldownDenial) {
    return denied(cooldownDenial);
  }

  return evaluateAllowedCandidate(input);
}

/** Checks non-cadence guardrails before candidate selection. */
function evaluateBaseGuardrails(
  input: ContentDecisionInput
): DecisionSuppressionReason | undefined {
  if (input.page.value !== "ready") {
    return "page_not_ready";
  }

  if (!isAskablePageKind(input.page.kind)) {
    return "non_askable_page";
  }

  if (!canInterveneForAttention(input.attention.value)) {
    return "attention_not_ready";
  }

  if (suppressesProactive(input.interaction.value)) {
    return "interaction_suppressed";
  }

  if (input.intervention.value === "cooldown") {
    return "intervention_cooldown";
  }

  if (input.chunk.isJunk) {
    return "junk_chunk";
  }

  const threshold = chunkValueThresholdFor(input.page.kind);
  if (input.chunk.valueScore < threshold) {
    return "chunk_below_threshold";
  }

  if (input.annoyanceScore >= 0.55) {
    return "annoyance_high";
  }

  if (!input.naturalPause) {
    return "no_natural_pause";
  }

  if (input.pagePromptCount >= input.maxPromptsPerPage) {
    return "page_limit";
  }

  return undefined;
}

/** Checks shared cooldowns that apply before candidate channel selection. */
function evaluateSharedCooldowns(
  input: ContentDecisionInput
): DecisionSuppressionReason | undefined {
  if (isCooldownActive(input.cooldowns ?? {}, "all_proactive", input.now)) {
    return "cooldown_all_proactive";
  }

  if (isCooldownActive(input.cooldowns ?? {}, "same_chunk", input.now)) {
    return "cooldown_same_chunk";
  }

  if (isCooldownActive(input.cooldowns ?? {}, "same_page", input.now)) {
    return "cooldown_same_page";
  }

  return undefined;
}

/** Builds an allowed candidate or denies it for a channel-specific cooldown. */
function evaluateAllowedCandidate(input: ContentDecisionInput): ContentDecision {
  const candidateKind = selectCandidateKind(input);
  const channel = channelForCandidateKind(candidateKind);
  const channelReason = cooldownReasonForChannel(channel);
  const threshold = chunkValueThresholdFor(input.page.kind);

  if (isCooldownActive(input.cooldowns ?? {}, channel, input.now)) {
    return denied(channelReason);
  }

  return {
    allowed: true,
    candidateKind,
    channel,
    targetChunkId: input.chunk.id,
    threshold
  };
}

/** Returns the configured chunk value threshold for askable page kinds. */
function chunkValueThresholdFor(kind: PageKind): number {
  return isAskablePageKind(kind) ? CHUNK_VALUE_THRESHOLDS[kind] : Number.POSITIVE_INFINITY;
}

/** Chooses the candidate type from evidence in deterministic priority order. */
export function selectCandidateKind(input: ContentDecisionInput): ContentCandidateKind {
  if ((input.chunk.stuckScore ?? 0) > 0.75) {
    return "help";
  }

  if (
    input.chunk.hasContrast
    || input.chunk.hasHiddenAssumption
    || input.chunk.hasContradiction
  ) {
    return "observation";
  }

  if (input.chunk.setsUpNextClaim) {
    return "prediction";
  }

  return "question";
}

/** Maps candidate kinds onto the cooldown channel that owns their cadence. */
export function channelForCandidateKind(kind: ContentCandidateKind): CooldownChannel {
  switch (kind) {
    case "help":
      return "help_offers";
    case "observation":
      return "insights";
    case "prediction":
      return "predictions";
    case "question":
      return "questions";
  }
}

/** Returns true when attention is deep enough to consider an intervention. */
function canInterveneForAttention(value: AttentionStateValue): boolean {
  return value === "active_reading" || value === "stuck" || value === "done";
}

/** Returns true when the interaction state suppresses proactive behavior. */
function suppressesProactive(value: InteractionStateValue): boolean {
  return value === "chat_open" || value === "snoozed" || value === "hidden";
}

/** Converts a cooldown channel into the matching denial reason. */
function cooldownReasonForChannel(channel: CooldownChannel): DecisionSuppressionReason {
  switch (channel) {
    case "all_proactive":
      return "cooldown_all_proactive";
    case "questions":
      return "cooldown_questions";
    case "predictions":
      return "cooldown_predictions";
    case "insights":
      return "cooldown_insights";
    case "help_offers":
      return "cooldown_help_offers";
    case "same_chunk":
      return "cooldown_same_chunk";
    case "same_page":
      return "cooldown_same_page";
  }
}

/** Creates a denied decision with a stable suppression reason. */
function denied(reason: DecisionSuppressionReason): ContentDecision {
  return { allowed: false, reason };
}
