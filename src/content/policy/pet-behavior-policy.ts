import type { CooldownState } from "./cooldown-policy";
import { setCooldowns } from "./cooldown-policy";

export type InterventionOutcome =
  | "shown"
  | "clicked"
  | "answered"
  | "ignored_timeout"
  | "dismissed"
  | "not_now"
  | "expanded"
  | "converted_to_chat"
  | "expired"
  | "stale_discarded";

export type InterventionSurface =
  | "question"
  | "prediction"
  | "observation"
  | "help_offer";

export type PetIntent =
  | "none"
  | "stay_available"
  | "settle"
  | "back_off"
  | "keep_question_session";

export type PetBehaviorInput = {
  now: number;
  surface: InterventionSurface;
  outcome: InterventionOutcome;
  cooldowns?: CooldownState;
  answerGrade?: "correct" | "partial" | "wrong";
};

export type PetBehaviorDecision = {
  cooldowns: CooldownState;
  intent: PetIntent;
  keepQuestionSession: boolean;
};

const MINUTE = 60_000;

/** Converts user response outcomes into cooldowns and pet posture. */
export function applyPetBehaviorOutcome(input: PetBehaviorInput): PetBehaviorDecision {
  const cooldowns = input.cooldowns ?? {};

  if (isInsightSurface(input.surface)) {
    return applyInsightOutcome(input, cooldowns);
  }

  if (input.surface === "question") {
    return applyQuestionOutcome(input, cooldowns);
  }

  if (input.surface === "help_offer") {
    return applyHelpOfferOutcome(input, cooldowns);
  }

  return { cooldowns, intent: "none", keepQuestionSession: false };
}

/** Applies insight-specific backoff for ignored or dismissed observations. */
function applyInsightOutcome(
  input: PetBehaviorInput,
  cooldowns: CooldownState
): PetBehaviorDecision {
  if (input.outcome === "ignored_timeout") {
    return {
      cooldowns: setCooldowns(cooldowns, input.now, {
        insights: 20 * MINUTE,
        same_chunk: 50 * MINUTE
      }, "ignored_insight"),
      intent: "stay_available",
      keepQuestionSession: false
    };
  }

  if (input.outcome === "dismissed" || input.outcome === "not_now") {
    return {
      cooldowns: setCooldowns(cooldowns, input.now, {
        insights: 30 * MINUTE,
        all_proactive: 10 * MINUTE,
        same_chunk: 60 * MINUTE
      }, "dismissed_insight"),
      intent: "back_off",
      keepQuestionSession: false
    };
  }

  return { cooldowns, intent: "none", keepQuestionSession: false };
}

/** Applies question-specific backoff while preserving wrong-answer sessions. */
function applyQuestionOutcome(
  input: PetBehaviorInput,
  cooldowns: CooldownState
): PetBehaviorDecision {
  if (input.outcome === "ignored_timeout") {
    return {
      cooldowns: setCooldowns(cooldowns, input.now, {
        all_proactive: 8 * MINUTE,
        questions: 15 * MINUTE,
        same_chunk: 60 * MINUTE
      }, "ignored_question"),
      intent: "stay_available",
      keepQuestionSession: false
    };
  }

  if (input.outcome === "answered" && input.answerGrade === "correct") {
    return {
      cooldowns: setCooldowns(cooldowns, input.now, {
        questions: 4 * MINUTE
      }, "correct_answer"),
      intent: "stay_available",
      keepQuestionSession: false
    };
  }

  if (
    input.outcome === "answered"
    && (input.answerGrade === "partial" || input.answerGrade === "wrong")
  ) {
    return {
      cooldowns,
      intent: "keep_question_session",
      keepQuestionSession: true
    };
  }

  if (input.outcome === "dismissed" || input.outcome === "not_now") {
    return {
      cooldowns: setCooldowns(cooldowns, input.now, {
        all_proactive: 10 * MINUTE,
        questions: 20 * MINUTE,
        same_chunk: 60 * MINUTE
      }, "dismissed_question"),
      intent: "settle",
      keepQuestionSession: false
    };
  }

  return { cooldowns, intent: "none", keepQuestionSession: false };
}

/** Applies help-offer backoff without affecting insight or question channels. */
function applyHelpOfferOutcome(
  input: PetBehaviorInput,
  cooldowns: CooldownState
): PetBehaviorDecision {
  if (input.outcome === "ignored_timeout" || input.outcome === "dismissed") {
    return {
      cooldowns: setCooldowns(cooldowns, input.now, {
        help_offers: 15 * MINUTE,
        same_chunk: 45 * MINUTE
      }, "declined_help"),
      intent: "back_off",
      keepQuestionSession: false
    };
  }

  return { cooldowns, intent: "none", keepQuestionSession: false };
}

/** Returns true for intervention surfaces governed by the insights channel. */
function isInsightSurface(surface: InterventionSurface): boolean {
  return surface === "observation" || surface === "prediction";
}
