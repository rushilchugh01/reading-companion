import type {
  AnimationSlot,
  AvatarPack,
  AvatarSlotConfig,
  AvatarVariant
} from "../shared/animation-types";
import { ANIMATION_SLOTS, resolveAvatarSlotConfig, selectAvatarVariant } from "../shared/animation-types";

export const BUILTIN_CORGI_PACK_ID = "builtin-corgi";

const CORGI_FALLBACKS: AvatarPack["fallbacks"] = {
  deep_focus: "focus",
  skim_watch: "idle",
  quiet_idle: "idle",
  low_energy_idle: "quiet_idle",
  concern: "error_soft",
  article_found: "focus"
};

const CORGI_SLOT_ASSETS: Partial<Record<AnimationSlot, string>> = {
  idle: "idle",
  sleep: "sleeping",
  scan: "curious",
  focus: "reading-detected",
  concern: "confused",
  raise_paw: "about-to-ask",
  bubble_peek: "curious",
  listen: "listening",
  think: "thinking",
  explain: "curious",
  happy: "celebratory",
  dismissed_settle: "sleeping",
  error_soft: "confused",
  sit_back_down: "idle",
  back_off: "sleeping",
  quiet_idle: "idle"
};

/** Built-in static corgi pack used as the guaranteed local fallback. */
export const builtinCorgiPack: AvatarPack = {
  id: BUILTIN_CORGI_PACK_ID,
  name: "Corgi",
  version: "1.0.0",
  species: "corgi",
  slots: Object.fromEntries(
    Object.entries(CORGI_SLOT_ASSETS).map(([slot, assetName]) => [
      slot,
      createStaticSlot(slot as AnimationSlot, assetName)
    ])
  ),
  fallbacks: CORGI_FALLBACKS,
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

const BUILT_IN_AVATAR_PACKS: Record<string, AvatarPack> = {
  [BUILTIN_CORGI_PACK_ID]: builtinCorgiPack
};

/** Returns a built-in avatar pack by id, falling back to the bundled corgi pack. */
export function getBuiltInAvatarPack(packId: string | undefined): AvatarPack {
  return BUILT_IN_AVATAR_PACKS[packId ?? ""] ?? builtinCorgiPack;
}

/** Returns a renderable variant for the requested slot, using built-in idle as a last resort. */
export function resolveRenderableAvatarVariant(
  pack: AvatarPack,
  slot: AnimationSlot,
  rng?: () => number
): AvatarVariant {
  const config = resolveAvatarSlotConfig(pack, slot)
    ?? resolveAvatarSlotConfig(builtinCorgiPack, "idle");
  if (!config) throw new Error("Built-in avatar pack is missing the idle slot.");
  return selectAvatarVariant(config, rng);
}

/** Returns true when the built-in pack can resolve every known animation slot. */
export function builtInPackCoversAnimationSlots(): boolean {
  return ANIMATION_SLOTS.every((slot) => Boolean(resolveAvatarSlotConfig(builtinCorgiPack, slot)));
}

function createStaticSlot(slot: AnimationSlot, assetName: string): AvatarSlotConfig {
  return {
    primary: {
      id: `corgi-${slot}`,
      src: `/assets/corgi-states-transparent/${assetName}.png`,
      type: "sprite",
      durationMilliseconds: 1_600,
      intensity: slotIntensity(slot),
      loop: true,
      weight: 1
    }
  };
}

function slotIntensity(slot: AnimationSlot): 0 | 1 | 2 | 3 {
  if (slot === "sleep" || slot === "quiet_idle" || slot === "low_energy_idle") return 0;
  if (slot === "raise_paw" || slot === "happy") return 2;
  return 1;
}
