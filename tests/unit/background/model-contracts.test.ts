import type { InterventionComposeInput } from "@/shared/intervention-types";
import { normalizeInterventionRecord } from "@/background/model/result-normalizer";

const baseInput: Pick<InterventionComposeInput, "requestId" | "expiresAt"> = {
  requestId: "contract-1",
  expiresAt: 1_700_000_060_000
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
