import type { AnimationSlot, AvatarPack, AvatarSlotConfig } from "../../shared/animation-types";
import { corgiDefaultPack, corgiStrictPack } from "./corgi-packs";

export { corgiDefaultPack, corgiStrictPack };

export const avatarPacks = [corgiDefaultPack, corgiStrictPack] as const;

/** Returns the nearest supported slot for a pack by following its fallback chain. */
export function resolveAvatarSlot(pack: AvatarPack, slot: AnimationSlot): AnimationSlot {
  const visitedSlots = new Set<AnimationSlot>();
  let currentSlot: AnimationSlot | undefined = slot;

  while (currentSlot && !visitedSlots.has(currentSlot)) {
    if (pack.slots[currentSlot]) return currentSlot;
    visitedSlots.add(currentSlot);
    currentSlot = pack.fallbacks[currentSlot];
  }

  return pack.motionProfile.reducedMotionSlot;
}

/** Returns the clip for a resolved slot, falling back to the pack's idle clip. */
export function resolveAvatarSlotConfig(pack: AvatarPack, slot: AnimationSlot): AvatarSlotConfig {
  const resolvedSlot = resolveAvatarSlot(pack, slot);
  const config = pack.slots[resolvedSlot] ?? pack.slots.idle;
  if (!config) throw new Error(`Avatar pack ${pack.id} has no slot config for ${slot}.`);
  return config;
}
