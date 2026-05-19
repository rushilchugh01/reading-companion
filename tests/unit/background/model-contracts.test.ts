import type { InterventionComposeInput } from "@/shared/intervention-types";
import {
  normalizeGradeResult,
  normalizeInterventionRecord,
  normalizeInterventionResult
} from "@/background/model/result-normalizer";

const baseInput: Pick<InterventionComposeInput, "requestId" | "expiresAt"> = {
  requestId: "contract-1",
  expiresAt: 1_700_000_060_000
};

const composeInput: InterventionComposeInput = {
  requestId: baseInput.requestId,
  tabId: 1,
  pageId: "page-1",
  contentHash: "hash-1",
  chunkId: "chunk-1",
  page: { title: "Contract" },
  currentPassage: { chunkId: "chunk-1", text: "A passage." },
  readerState: {},
  policy: { allowedActions: ["ask_question"], policyId: "ambient_active_reading_v1" },
  companionStyle: { companionPackId: "builtin-corgi" },
  questionGenerationStrategyId: "single_shot_v1",
  history: [],
  expiresAt: baseInput.expiresAt
};

describe("intervention result contracts", () => {
  it("requires ask_question reader text and expected answer", () => {
    expect(() => normalizeInterventionRecord({
      action: "ask_question",
      userFacingText: "What changed?",
      petIntent: "curious",
      reasonForApp: "The app approved a recall check.",
      confidence: 0.8
    }, baseInput)).toThrow("ask_question requires expectedAnswer.");
  });

  it("requires prediction reader text and expected answer", () => {
    expect(() => normalizeInterventionRecord({
      action: "offer_prediction",
      expectedAnswer: "The next paragraph should describe glucose storage.",
      petIntent: "curious",
      reasonForApp: "Prediction is allowed here.",
      confidence: 0.8
    }, baseInput)).toThrow("offer_prediction requires userFacingText.");
  });

  it("requires observation text and type", () => {
    expect(() => normalizeInterventionRecord({
      action: "offer_observation",
      userFacingText: "This claim depends on light being available.",
      petIntent: "sharp_notice",
      reasonForApp: "The passage has a hidden premise.",
      confidence: 0.8
    }, baseInput)).toThrow("offer_observation requires observationType.");
  });

  it("allows help text but rejects quiet text", () => {
    expect(normalizeInterventionRecord({
      action: "offer_help",
      userFacingText: "Want a simpler version of that sentence?",
      petIntent: "helpful",
      reasonForApp: "The reader appears stuck.",
      confidence: 0.6
    }, baseInput)).toMatchObject({ action: "offer_help" });

    expect(() => normalizeInterventionRecord({
      action: "stay_quiet",
      userFacingText: "I will be quiet.",
      petIntent: "quiet",
      reasonForApp: "No useful intervention.",
      confidence: 0.4
    }, baseInput)).toThrow("stay_quiet must not include userFacingText.");
  });

});

describe("intervention question metadata contracts", () => {
  it("preserves optional question strategy metadata", () => {
    expect(normalizeInterventionRecord({
      action: "ask_question",
      userFacingText: "Why does the gate wait for retry exhaustion?",
      expectedAnswer: "Waiting preserves local recovery before escalation.",
      questionStrategyId: "candidate_ranked_v1",
      questionDepth: "hidden_assumption",
      targetIdea: "retry exhaustion gate",
      reasoningNeeded: "Infer why the condition is a guardrail.",
      petIntent: "curious",
      reasonForApp: "Tests a hidden assumption.",
      confidence: 0.8
    }, baseInput)).toMatchObject({
      questionStrategyId: "candidate_ranked_v1",
      questionDepth: "hidden_assumption",
      targetIdea: "retry exhaustion gate",
      reasoningNeeded: "Infer why the condition is a guardrail."
    });
  });
});

describe("provider tool-call normalization", () => {
  it("requires an intervention tool call", () => {
    expect(() => normalizeInterventionResult({ text: "plain text", toolCalls: [] }, composeInput))
      .toThrow("Provider did not return a required intervention tool call.");
  });

  it("rejects wrong-route tool calls for interventions and grading", () => {
    expect(() => normalizeInterventionResult({
      text: "",
      toolCalls: [{ name: "grade_answer", arguments: { label: "correct", feedback: "Fine." } }]
    }, composeInput)).toThrow("Provider returned a non-intervention tool call.");

    expect(() => normalizeGradeResult({
      text: "",
      toolCalls: [{ name: "stay_quiet", arguments: { petIntent: "quiet", reasonForApp: "Wrong route.", confidence: 0 } }]
    })).toThrow("Provider returned a non-grading tool call.");
  });

  it("requires a grading tool call", () => {
    expect(() => normalizeGradeResult({ text: "correct", toolCalls: [] }))
      .toThrow("Provider did not return a required grading tool call.");
  });
});
