import { describe, expect, it } from "vitest";
import {
  applyPetBehaviorOutcome,
  getCooldownRemainingMs,
  isCooldownActive
} from "../../../src/content/runtime-state";

const NOW = 200_000;
const MINUTE = 60_000;

describe("pet behavior policy", () => {
  it("backs off ignored insights without global proactive cooldown", () => {
    const decision = applyPetBehaviorOutcome({
      now: NOW,
      surface: "observation",
      outcome: "ignored_timeout"
    });

    expect(getCooldownRemainingMs(decision.cooldowns, "insights", NOW)).toBe(20 * MINUTE);
    expect(getCooldownRemainingMs(decision.cooldowns, "same_chunk", NOW)).toBe(50 * MINUTE);
    expect(isCooldownActive(decision.cooldowns, "all_proactive", NOW)).toBe(false);
  });

  it("backs off dismissed insights globally and per chunk", () => {
    const decision = applyPetBehaviorOutcome({
      now: NOW,
      surface: "prediction",
      outcome: "dismissed"
    });

    expect(getCooldownRemainingMs(decision.cooldowns, "insights", NOW)).toBe(30 * MINUTE);
    expect(getCooldownRemainingMs(decision.cooldowns, "all_proactive", NOW)).toBe(10 * MINUTE);
    expect(getCooldownRemainingMs(decision.cooldowns, "same_chunk", NOW)).toBe(60 * MINUTE);
    expect(decision.intent).toBe("back_off");
  });

  it("backs off ignored questions and suppresses same chunk", () => {
    const decision = applyPetBehaviorOutcome({
      now: NOW,
      surface: "question",
      outcome: "ignored_timeout"
    });

    expect(getCooldownRemainingMs(decision.cooldowns, "all_proactive", NOW)).toBe(8 * MINUTE);
    expect(getCooldownRemainingMs(decision.cooldowns, "questions", NOW)).toBe(15 * MINUTE);
    expect(getCooldownRemainingMs(decision.cooldowns, "same_chunk", NOW)).toBe(60 * MINUTE);
  });

  it("uses a short question cooldown after correct answers", () => {
    const decision = applyPetBehaviorOutcome({
      now: NOW,
      surface: "question",
      outcome: "answered",
      answerGrade: "correct"
    });

    expect(getCooldownRemainingMs(decision.cooldowns, "questions", NOW)).toBe(4 * MINUTE);
    expect(decision.keepQuestionSession).toBe(false);
  });

  it("keeps partial and wrong answers inside the question session", () => {
    for (const answerGrade of ["partial", "wrong"] as const) {
      const decision = applyPetBehaviorOutcome({
        now: NOW,
        surface: "question",
        outcome: "answered",
        answerGrade
      });

      expect(decision.keepQuestionSession).toBe(true);
      expect(decision.intent).toBe("keep_question_session");
      expect(decision.cooldowns).toEqual({});
    }
  });
});
