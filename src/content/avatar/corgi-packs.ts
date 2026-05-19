import type { AnimationSlot, AvatarAnimation, AvatarPack, AvatarSlotConfig } from "../../shared/animation-types";

const DEFAULT_SUPPORTED_SLOTS: readonly AnimationSlot[] = [
  "hidden",
  "idle",
  "sleep",
  "scan",
  "article_found",
  "focus",
  "deep_focus",
  "skim_watch",
  "concern",
  "prompt",
  "peek",
  "listen",
  "think",
  "explain",
  "happy",
  "dismissed_settle",
  "error_soft",
  "settle",
  "back_off",
  "quiet_idle",
  "low_energy_idle"
];

const STRICT_SUPPORTED_SLOTS: readonly AnimationSlot[] = [
  "hidden",
  "idle",
  "sleep",
  "scan",
  "article_found",
  "focus",
  "peek",
  "listen",
  "think",
  "explain",
  "quiet_idle"
];

/** Default warm corgi avatar pack for ambient reading support. */
export const corgiDefaultPack: AvatarPack = {
  id: "corgi-default",
  name: "Corgi Default",
  version: "1.0.0",
  species: "corgi",
  animationSlots: createSlots(DEFAULT_SUPPORTED_SLOTS, "default"),
  thresholds: {
    maxIntensity: 2,
    proactiveMotionMinimumMilliseconds: 900,
    backoffQuietMilliseconds: 120_000
  },
  motionProfile: {
    energy: "medium",
    bounce: 0.35,
    gazeTracking: true,
    reducedMotionSlot: "quiet_idle"
  }
};

/** Stricter low-motion corgi pack for direct tutoring modes. */
export const corgiStrictPack: AvatarPack = {
  id: "corgi-strict",
  name: "Corgi Strict",
  version: "1.0.0",
  species: "corgi",
  animationSlots: createSlots(STRICT_SUPPORTED_SLOTS, "strict"),
  thresholds: {
    maxIntensity: 1,
    proactiveMotionMinimumMilliseconds: 1_500,
    backoffQuietMilliseconds: 240_000
  },
  motionProfile: {
    energy: "low",
    bounce: 0.12,
    gazeTracking: false,
    reducedMotionSlot: "quiet_idle"
  }
};

/** Creates placeholder slot descriptors for every supported slot in a pack. */
function createSlots(
  animationSlots: readonly AnimationSlot[],
  packKey: "default" | "strict"
): Partial<Record<AnimationSlot, AvatarSlotConfig>> {
  return Object.fromEntries(animationSlots.map((slot) => [slot, [createAnimation(slot, packKey)]]));
}

/** Creates one deterministic animation descriptor for an avatar slot. */
function createAnimation(slot: AnimationSlot, packKey: "default" | "strict"): AvatarAnimation {
  return {
    id: `${packKey}-${slot}`,
    src: `/assets/avatar/corgi/${packKey}/${slot}.json`,
    type: "lottie",
    role: "primary",
    durationMilliseconds: durationForSlot(slot),
    intensity: intensityForSlot(slot, packKey),
    loop: loopingSlot(slot)
  };
}

/** Returns the nominal playback duration for a slot. */
function durationForSlot(slot: AnimationSlot): number {
  if (slot === "hidden") return 0;
  if (slot === "prompt" || slot === "peek") return 700;
  if (slot === "think" || slot === "explain") return 1_100;
  return 1_600;
}

/** Returns the motion intensity for a slot within a pack profile. */
function intensityForSlot(slot: AnimationSlot, packKey: "default" | "strict"): 0 | 1 | 2 | 3 {
  if (slot === "hidden" || slot === "sleep" || slot === "quiet_idle") return 0;
  if (packKey === "strict") return 1;
  if (slot === "prompt" || slot === "happy") return 2;
  return 1;
}

/** Reports whether a slot should loop while the state remains active. */
function loopingSlot(slot: AnimationSlot): boolean {
  return slot === "idle" || slot === "focus" || slot === "listen" || slot === "quiet_idle";
}
