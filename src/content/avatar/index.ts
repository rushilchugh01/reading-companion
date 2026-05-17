import type { AnimationSlot, AvatarClip, AvatarPack } from "../../shared/animation-types";
import { corgiDefaultPack, corgiStrictPack } from "./corgi-packs";

export { corgiDefaultPack, corgiStrictPack };

export const avatarPacks = [corgiDefaultPack, corgiStrictPack] as const;

/** Returns the nearest supported slot for a pack by following its fallback chain. */
export function resolveAvatarSlot(pack: AvatarPack, slot: AnimationSlot): AnimationSlot {
  const visitedSlots = new Set<AnimationSlot>();
  let currentSlot: AnimationSlot | undefined = slot;

  while (currentSlot && !visitedSlots.has(currentSlot)) {
    if (pack.supportedSlots.includes(currentSlot)) return currentSlot;
    visitedSlots.add(currentSlot);
    currentSlot = pack.fallback[currentSlot];
  }

  return pack.motionProfile.reducedMotionSlot;
}

/** Returns the clip for a resolved slot, falling back to the pack's idle clip. */
export function resolveAvatarClip(pack: AvatarPack, slot: AnimationSlot): AvatarClip {
  const resolvedSlot = resolveAvatarSlot(pack, slot);
  const clip = pack.clips[resolvedSlot] ?? pack.clips.idle;
  if (!clip) throw new Error(`Avatar pack ${pack.id} has no clip for ${slot}.`);
  return clip;
}
