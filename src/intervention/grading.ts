import { incrementAttempt } from "./session";
import { createWeakConcept } from "./weak-concepts";
import type { AnswerEvaluation, AnswerEvaluationInput } from "./types";

const MAX_RETRY_ATTEMPTS = 2;

/** Evaluates a graded answer into the next user-visible session action. */
export function evaluateAnswer(input: AnswerEvaluationInput): AnswerEvaluation {
  if (input.grade.label === "correct") {
    return {
      action: "correct",
      feedback: input.grade.feedback
    };
  }

  if (shouldOfferHint(input)) {
    return {
      action: "hint",
      feedback: input.grade.feedback,
      hint: input.grade.hint ?? input.session.expectedPoint,
      nextSession: incrementAttempt(input.session)
    };
  }

  if (shouldRetry(input)) {
    return {
      action: "retry",
      feedback: input.grade.feedback,
      hint: input.grade.hint,
      nextSession: incrementAttempt(input.session)
    };
  }

  return {
    action: "explanation",
    feedback: input.grade.feedback,
    explanation: input.grade.missedPoint ?? input.session.expectedPoint,
    weakConcept: createWeakConcept(input)
  };
}

function shouldOfferHint(input: AnswerEvaluationInput): boolean {
  return input.session.attemptCount === 0 && input.grade.label === "partially_correct";
}

function shouldRetry(input: AnswerEvaluationInput): boolean {
  return input.session.attemptCount < MAX_RETRY_ATTEMPTS && input.grade.label !== "wrong";
}
