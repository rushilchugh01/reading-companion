import { describe, expect, it } from "vitest";
import {
  getCooldownRemainingMs,
  isCooldownActive,
  setCooldown,
  setCooldowns
} from "../../../src/content/runtime-state";

const NOW = 50_000;

describe("cooldown policy", () => {
  it("reports active and expired cooldowns", () => {
    const cooldowns = setCooldown({}, { channel: "questions", now: NOW, durationMs: 1_000 });

    expect(isCooldownActive(cooldowns, "questions", NOW + 999)).toBe(true);
    expect(isCooldownActive(cooldowns, "questions", NOW + 1_000)).toBe(false);
  });

  it("does not shorten an existing longer cooldown", () => {
    const longer = setCooldown({}, { channel: "insights", now: NOW, durationMs: 10_000 });
    const shorter = setCooldown(longer, {
      channel: "insights",
      now: NOW + 1_000,
      durationMs: 1_000
    });

    expect(getCooldownRemainingMs(shorter, "insights", NOW)).toBe(10_000);
  });

  it("sets multiple channel cooldowns", () => {
    const cooldowns = setCooldowns({}, NOW, {
      all_proactive: 8_000,
      same_chunk: 60_000
    });

    expect(getCooldownRemainingMs(cooldowns, "all_proactive", NOW)).toBe(8_000);
    expect(getCooldownRemainingMs(cooldowns, "same_chunk", NOW)).toBe(60_000);
  });
});
