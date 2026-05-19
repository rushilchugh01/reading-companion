import type { AnimationSlot, AvatarPack, AvatarSlotConfig } from "../../shared/animation-types";
import { resolveAvatarSlot as resolveSharedAvatarSlot, resolveAvatarSlotConfig as resolveSharedAvatarSlotConfig } from "../../shared/animation-types";
import { corgiDefaultPack, corgiStrictPack } from "./corgi-packs";

export { corgiDefaultPack, corgiStrictPack };

export const avatarPacks = [corgiDefaultPack, corgiStrictPack] as const;

/** Returns an exact supported slot for a pack, falling back only to idle. */
export function resolveAvatarSlot(pack: AvatarPack, slot: AnimationSlot): AnimationSlot {
  return resolveSharedAvatarSlot(pack, slot) ?? pack.motionProfile.reducedMotionSlot;
}

/** Returns the clip for a resolved slot, falling back to the pack's idle clip. */
export function resolveAvatarSlotConfig(pack: AvatarPack, slot: AnimationSlot): AvatarSlotConfig {
  const config = resolveSharedAvatarSlotConfig(pack, slot) ?? pack.animationSlots.idle;
  if (!config) throw new Error(`Avatar pack ${pack.id} has no slot config for ${slot}.`);
  return config;
}
