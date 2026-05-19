import { describe, expect, it } from "vitest";
import {
  resolveQuestionGenerationStrategy,
  validateRankedQuestionResult
} from "@/background/model/question-strategies";
import type { InterventionComposeInput, InterventionComposeResult } from "@/shared/intervention-types";

describe("question generation strategies", () => {
  it("resolves known strategies and safely falls back for unknown ids", () => {
    expect(resolveQuestionGenerationStrategy("single_shot_v1").id).toBe("single_shot_v1");
    expect(resolveQuestionGenerationStrategy("candidate_ranked_v1").id).toBe("candidate_ranked_v1");
    expect(resolveQuestionGenerationStrategy("sketch_then_rank_v1").id).toBe("sketch_then_rank_v1");
    expect(resolveQuestionGenerationStrategy("unknown").id).toBe("single_shot_v1");
  });

  it("keeps single_shot_v1 compatible with the current valid question shape", () => {
    const strategy = resolveQuestionGenerationStrategy("single_shot_v1");
    expect(() => strategy.validateResult(questionResult({ questionDepth: undefined }), input())).not.toThrow();
  });

  it("rejects ranked questions without depth metadata", () => {
    expect(() => validateRankedQuestionResult(
      questionResult({ questionDepth: undefined }),
      input()
    )).toThrow("candidate_ranked_v1 requires questionDepth.");
  });

  it("rejects obvious shallow recall questions for ranked generation", () => {
    expect(() => validateRankedQuestionResult(
      questionResult({ questionDepth: "recall", userFacingText: "What is the fallback gate?" }),
      input()
    )).toThrow("candidate_ranked_v1 rejected recall depth");
  });

  it("accepts inferential ranked question metadata", () => {
    expect(() => validateRankedQuestionResult(
      questionResult({
        questionDepth: "hidden_assumption",
        userFacingText: "Why does the fallback gate depend on retry budget before escalation?"
      }),
      input()
    )).not.toThrow();
  });
});

function questionResult(overrides: Partial<InterventionComposeResult>): InterventionComposeResult {
  return {
    action: "ask_question",
    confidence: 0.8,
    expectedAnswer: "The retry budget is a guardrail that prevents premature escalation.",
    expiresAt: 2_000,
    petIntent: "curious",
    questionDepth: "hidden_assumption",
    questionStrategyId: "candidate_ranked_v1",
    reasonForApp: "Tests whether the reader inferred the operational tradeoff.",
    requestId: "intervention-1",
    targetIdea: "retry budget as escalation guardrail",
    userFacingText: "Why does the fallback gate depend on retry budget before escalation?",
    ...overrides
  };
}

function input(): InterventionComposeInput {
  return {
    requestId: "intervention-1",
    tabId: 1,
    pageId: "page-1",
    contentHash: "hash-1",
    chunkId: "chunk-1",
    page: { title: "Operational Playbook" },
    currentPassage: {
      chunkId: "chunk-1",
      text: "The fallback gate opens only after retry budget is exhausted. This avoids escalation when local recovery is still likely."
    },
    readerState: {},
    policy: { allowedActions: ["ask_question"], policyId: "ambient_active_reading_v1" },
    companionStyle: { companionPackId: "builtin-corgi", readGatingMode: "balanced" },
    questionGenerationStrategyId: "candidate_ranked_v1",
    history: [],
    expiresAt: 2_000
  };
}
