import { describe, expect, it } from "vitest";
import {
  resolveAvatarSlotConfig,
  resolveAnimationSlot,
  selectAvatarVariant,
  type AnimationRuntimeState
} from "../../../src/shared/animation-types";
import { animationSlotForPetState } from "../../../src/ui/animation-state";
import { builtInPackCoversAnimationSlots, builtinCorgiPack } from "../../../src/ui/avatar-pack";
import { corgiStrictPack, resolveAvatarSlot } from "../../../src/content/avatar";

describe("resolveAnimationSlot", () => {
  it("applies the slot priority order without behavior side effects", () => {
    expect(resolveAnimationSlot({ hidden: true, chat: { open: true } })).toBe("hidden");
    expect(resolveAnimationSlot({ chat: { open: true, pending: true } })).toBe("think");
    expect(resolveAnimationSlot({ chat: { open: true, lastAssistantMode: "explain" } })).toBe(
      "explain"
    );
    expect(resolveAnimationSlot({ petBehavior: { dismissedSettle: true } })).toBe(
      "dismissed_settle"
    );
    expect(resolveAnimationSlot({ cooldown: { allProactive: true }, intervention: { prompting: true } })).toBe(
      "quiet_idle"
    );
    expect(resolveAnimationSlot({ intervention: { prompting: true } })).toBe("raise_paw");
    expect(resolveAnimationSlot({ intervention: { queued: true } })).toBe("think");
    expect(resolveAnimationSlot({ page: { scanning: true } })).toBe("scan");
    expect(resolveAnimationSlot({ attention: { stuck: true } })).toBe("concern");
    expect(resolveAnimationSlot({ attention: { deepFocus: true } })).toBe("deep_focus");
    expect(resolveAnimationSlot({ attention: { activeReading: true } })).toBe("focus");
    expect(resolveAnimationSlot({ attention: { skimming: true } })).toBe("skim_watch");
    expect(resolveAnimationSlot({ attention: { done: true } })).toBe("happy");
    expect(resolveAnimationSlot({ attention: { away: true } })).toBe("sleep");
  });

  it("keeps chat-open attention stuck in the listen branch", () => {
    expect(resolveAnimationSlot({ chat: { open: true }, attention: { stuck: true } })).toBe(
      "listen"
    );
  });

  it("resolves quiet and unsupported pages to low-motion idles", () => {
    expect(resolveAnimationSlot({ page: { quiet: true } })).toBe("quiet_idle");
    expect(resolveAnimationSlot({ page: { unsupported: true } })).toBe("idle");
  });

  it("expresses dismissal and backoff consequences before interventions", () => {
    expect(resolveAnimationSlot({ petBehavior: { backOff: true }, intervention: { queued: true } })).toBe(
      "back_off"
    );
    expect(resolveAnimationSlot({ petBehavior: { sitBackDown: true } })).toBe("sit_back_down");
    expect(resolveAnimationSlot({ petBehavior: { lowEnergy: true } })).toBe("low_energy_idle");
  });

  it("does not mutate the state object while resolving", () => {
    const state: AnimationRuntimeState = {
      chat: { open: false },
      page: { scanning: true },
      attention: { activeReading: true }
    };
    const before = structuredClone(state);

    expect(resolveAnimationSlot(deepFreeze(state))).toBe("scan");
    expect(state).toEqual(before);
  });
});

describe("avatar pack fallback", () => {
  it("maps unsupported strict-pack slots through the fallback chain", () => {
    expect(resolveAvatarSlot(corgiStrictPack, "deep_focus")).toBe("focus");
    expect(resolveAvatarSlot(corgiStrictPack, "skim_watch")).toBe("idle");
    expect(resolveAvatarSlot(corgiStrictPack, "concern")).toBe("focus");
    expect(resolveAvatarSlot(corgiStrictPack, "raise_paw")).toBe("bubble_peek");
    expect(resolveAvatarSlot(corgiStrictPack, "happy")).toBe("idle");
    expect(resolveAvatarSlot(corgiStrictPack, "back_off")).toBe("quiet_idle");
  });

  it("resolves every known slot in the built-in corgi pack", () => {
    expect(builtInPackCoversAnimationSlots()).toBe(true);
    expect(resolveAvatarSlotConfig(builtinCorgiPack, "deep_focus")?.primary.src).toContain(
      "reading-detected.png"
    );
    expect(resolveAvatarSlotConfig(builtinCorgiPack, "low_energy_idle")?.primary.src).toContain(
      "idle.png"
    );
  });
});

describe("legacy pet-state bridge", () => {
  it("maps live pet states into animation slots", () => {
    expect(animationSlotForPetState("idle")).toBe("idle");
    expect(animationSlotForPetState("reading_detected")).toBe("focus");
    expect(animationSlotForPetState("curious")).toBe("scan");
    expect(animationSlotForPetState("thinking")).toBe("think");
    expect(animationSlotForPetState("about_to_ask")).toBe("raise_paw");
    expect(animationSlotForPetState("listening")).toBe("listen");
    expect(animationSlotForPetState("grading")).toBe("think");
    expect(animationSlotForPetState("confused")).toBe("concern");
    expect(animationSlotForPetState("celebratory")).toBe("happy");
    expect(animationSlotForPetState("sleeping")).toBe("sleep");
    expect(animationSlotForPetState("debug_active")).toBe("scan");
  });
});

describe("avatar variant selection", () => {
  it("uses primary when no variants exist", () => {
    const config = resolveAvatarSlotConfig(builtinCorgiPack, "idle");

    expect(config && selectAvatarVariant(config).id).toBe("corgi-idle");
  });

  it("chooses weighted variants from a slot config", () => {
    const selected = selectAvatarVariant({
      primary: { id: "primary", src: "primary.png", type: "sprite", weight: 1 },
      variants: [
        { id: "rare", src: "rare.png", type: "sprite", weight: 1 },
        { id: "common", src: "common.png", type: "sprite", weight: 8 }
      ]
    }, () => 0.15);

    expect(selected.id).toBe("rare");
  });
});

/** Recursively freezes test state so resolver mutation would throw. */
function deepFreeze<T extends object>(value: T): T {
  for (const nestedValue of Object.values(value)) {
    if (nestedValue && typeof nestedValue === "object") deepFreeze(nestedValue);
  }
  return Object.freeze(value);
}
