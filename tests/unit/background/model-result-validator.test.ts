import {
  validateAnswerGradeResult,
  validateInterventionComposeResult,
  validateUserChatResult
} from "@/background/model/model-result-validator";
import type {
  AnswerGradeModelInput,
  ModelJob,
  UserChatModelInput
} from "@/shared/model-job-types";
import type { CurrentRuntimeSnapshot } from "@/shared/runtime-types";
import type { GradeResult } from "@/shared/session-types";

const validGrade: GradeResult = {
  label: "correct",
  feedback: "Good."
};

/** Builds a model job with stable defaults for validator tests. */
function job<TInput>(overrides: Partial<ModelJob<TInput>> & { input: TInput }): ModelJob<TInput> {
  return {
    id: "job-1",
    kind: "intervention_compose",
    priority: 1,
    createdAt: 100,
    expiresAt: 1_000,
    tabId: 1,
    pageId: "page-1",
    contentHash: "hash-1",
    chunkId: "chunk-1",
    status: "running",
    abortController: new AbortController(),
    ...overrides
  };
}

/** Builds a current runtime snapshot with stable defaults for validator tests. */
function snapshot(overrides: Partial<CurrentRuntimeSnapshot> = {}): CurrentRuntimeSnapshot {
  return {
    now: 200,
    tabId: 1,
    pageId: "page-1",
    contentHash: "hash-1",
    activeChunkId: "chunk-1",
    chatOpen: false,
    cooldownUntil: 0,
    conversationId: "conversation-1",
    cancelledMessageIds: [],
    answerSession: {
      id: "session-1",
      attemptNumber: 2,
      status: "answer_pending"
    },
    ...overrides
  };
}

describe("validateInterventionComposeResult", () => {
  const interventionJob = job({ input: {} });
  const validResult = {
    action: "ask_question",
    userFacingText: "What is the claim?",
    expectedAnswer: "The central claim."
  };

  it.each([
    ["expired", snapshot({ now: 1_001 })],
    ["tab_changed", snapshot({ tabId: 2 })],
    ["page_changed", snapshot({ pageId: "page-2" })],
    ["content_changed", snapshot({ contentHash: "hash-2" })],
    ["chunk_changed", snapshot({ activeChunkId: "chunk-2" })],
    ["chat_open", snapshot({ chatOpen: true })],
    ["cooldown", snapshot({ cooldownUntil: 500 })]
  ])("rejects stale intervention results: %s", (reason, currentSnapshot) => {
    expect(validateInterventionComposeResult(interventionJob, validResult, currentSnapshot)).toEqual({
      valid: false,
      reason
    });
  });

  it.each([
    [{ action: "ask_question", userFacingText: "Ask" }],
    [{ action: "offer_prediction", userFacingText: "Predict" }],
    [{ action: "offer_observation", userFacingText: "Notice" }],
    [{ action: "offer_help" }],
    [{ action: "stay_quiet", userFacingText: "Nope" }],
    [{ action: "dance" }]
  ])("rejects invalid intervention schema %#", (result) => {
    expect(validateInterventionComposeResult(interventionJob, result, snapshot())).toEqual({
      valid: false,
      reason: "invalid_schema"
    });
  });

  it.each([
    [{ action: "ask_question", userFacingText: "Ask", expectedAnswer: "Answer" }],
    [{ action: "offer_prediction", userFacingText: "Predict", expectedAnswer: "Outcome" }],
    [{ action: "offer_observation", userFacingText: "Notice", observationType: "claim" }],
    [{ action: "offer_help", userFacingText: "Try rereading the prior paragraph." }],
    [{ action: "stay_quiet" }]
  ])("accepts valid intervention schema %#", (result) => {
    expect(validateInterventionComposeResult(interventionJob, result, snapshot())).toMatchObject({
      valid: true,
      result
    });
  });
});

describe("validateAnswerGradeResult", () => {
  const gradeJob = job<AnswerGradeModelInput>({
    kind: "answer_grade",
    priority: 0,
    questionSessionId: "session-1",
    attemptNumber: 2,
    input: {
      attemptNumber: 2,
      questionId: "session-1",
      userAnswer: "Light energy"
    }
  });

  it.each([
    ["session_changed", snapshot({ answerSession: { id: "session-2", attemptNumber: 2, status: "answer_pending" } })],
    ["attempt_changed", snapshot({ answerSession: { id: "session-1", attemptNumber: 3, status: "answer_pending" } })],
    ["session_not_answer_pending", snapshot({ answerSession: { id: "session-1", attemptNumber: 2, status: "answered" } })]
  ])("rejects stale answer grade results: %s", (reason, currentSnapshot) => {
    expect(validateAnswerGradeResult(gradeJob, validGrade, currentSnapshot)).toEqual({
      valid: false,
      reason
    });
  });

  it("accepts an answer grade for the current pending attempt", () => {
    expect(validateAnswerGradeResult(gradeJob, validGrade, snapshot())).toEqual({
      valid: true,
      result: validGrade
    });
  });
});

describe("validateUserChatResult", () => {
  const chatJob = job<UserChatModelInput>({
    kind: "user_chat",
    priority: 0,
    conversationId: "conversation-1",
    input: {
      messageId: "message-1",
      prompt: "Can you explain this?"
    }
  });

  it("rejects chat results for an old conversation", () => {
    expect(validateUserChatResult(chatJob, { text: "old" }, snapshot({ conversationId: "conversation-2" }))).toEqual({
      valid: false,
      reason: "conversation_changed"
    });
  });

  it("rejects chat results when the source message was cancelled", () => {
    expect(validateUserChatResult(chatJob, { text: "cancelled" }, snapshot({
      cancelledMessageIds: ["message-1"]
    }))).toEqual({
      valid: false,
      reason: "message_cancelled"
    });
  });

  it("accepts chat results for the current uncancelled conversation", () => {
    const result = { text: "Here is the short version." };

    expect(validateUserChatResult(chatJob, result, snapshot())).toEqual({
      valid: true,
      result
    });
  });
});
