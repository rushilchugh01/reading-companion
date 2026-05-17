import type { AnimationSlot, AvatarPack, AvatarSlotConfig, AvatarVariant } from "../../shared/animation-types";

const FALLBACK_CHAIN: AvatarPack["fallbacks"] = {
  deep_focus: "focus",
  skim_watch: "idle",
  concern: "focus",
  raise_paw: "bubble_peek",
  happy: "idle",
  dismissed_settle: "quiet_idle",
  sit_back_down: "idle",
  back_off: "quiet_idle",
  low_energy_idle: "quiet_idle",
  error_soft: "quiet_idle",
  quiet_idle: "idle"
};

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
  "raise_paw",
  "bubble_peek",
  "listen",
  "think",
  "explain",
  "happy",
  "dismissed_settle",
  "error_soft",
  "sit_back_down",
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
  "bubble_peek",
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
  slots: createSlots(DEFAULT_SUPPORTED_SLOTS, "default"),
  fallbacks: FALLBACK_CHAIN,
  personality: {
    tone: "gentle",
    promptStyle: "curious and brief",
    backoffCopy: "Settling down for a bit."
  },
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
  slots: createSlots(STRICT_SUPPORTED_SLOTS, "strict"),
  fallbacks: FALLBACK_CHAIN,
  personality: {
    tone: "strict",
    promptStyle: "direct and sparse",
    backoffCopy: "Backing off. Resume only when useful."
  },
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
  slots: readonly AnimationSlot[],
  packKey: "default" | "strict"
): Partial<Record<AnimationSlot, AvatarSlotConfig>> {
  return Object.fromEntries(slots.map((slot) => [slot, { primary: createVariant(slot, packKey) }]));
}

/** Creates one deterministic variant descriptor for an avatar slot. */
function createVariant(slot: AnimationSlot, packKey: "default" | "strict"): AvatarVariant {
  return {
    id: `${packKey}-${slot}`,
    src: `/assets/avatar/corgi/${packKey}/${slot}.json`,
    type: "lottie",
    durationMilliseconds: durationForSlot(slot),
    intensity: intensityForSlot(slot, packKey),
    loop: loopingSlot(slot)
  };
}

/** Returns the nominal playback duration for a slot. */
function durationForSlot(slot: AnimationSlot): number {
  if (slot === "hidden") return 0;
  if (slot === "raise_paw" || slot === "bubble_peek") return 700;
  if (slot === "think" || slot === "explain") return 1_100;
  return 1_600;
}

/** Returns the motion intensity for a slot within a pack profile. */
function intensityForSlot(slot: AnimationSlot, packKey: "default" | "strict"): 0 | 1 | 2 | 3 {
  if (slot === "hidden" || slot === "sleep" || slot === "quiet_idle") return 0;
  if (packKey === "strict") return 1;
  if (slot === "raise_paw" || slot === "happy") return 2;
  return 1;
}

/** Reports whether a slot should loop while the state remains active. */
function loopingSlot(slot: AnimationSlot): boolean {
  return slot === "idle" || slot === "focus" || slot === "listen" || slot === "quiet_idle";
}
