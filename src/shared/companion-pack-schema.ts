import type {
  AnimationSlot,
  AvatarAnimation,
  AvatarAssetType,
  AvatarPack
} from "./animation-types";
import { ANIMATION_SLOTS } from "./animation-types";

export type CompanionPersona = {
  systemPrompt: string;
  tone?: string;
  boundaries?: string[];
  gradingStylePrompt?: string;
  interruptionStylePrompt?: string;
};

export type CompanionPack = {
  id: string;
  name: string;
  avatar: AvatarPack;
  persona: CompanionPersona;
};

export type CompanionPackManifest = {
  id: string;
  name: string;
  avatar: Omit<AvatarPack, "animationSlots"> & {
    animationSlots: Partial<Record<AnimationSlot, AvatarAnimation[]>>;
  };
  persona: CompanionPersona;
};

const ASSET_TYPES = new Set<AvatarAssetType>(["sprite", "animated-webp", "video", "lottie"]);
const SLOT_SET = new Set<string>(ANIMATION_SLOTS);

/** Converts a companion-pack manifest into the internal runtime pack shape. */
export function companionPackFromManifest(
  manifest: CompanionPackManifest,
  basePath = ""
): CompanionPack {
  validateManifest(manifest);
  return {
    id: manifest.id,
    name: manifest.name,
    avatar: {
      ...manifest.avatar,
      animationSlots: materializeAnimationSlots(manifest, basePath)
    },
    persona: manifest.persona
  };
}

/** Returns whether a value is one of the canonical animation slots. */
export function isAnimationSlot(value: string): value is AnimationSlot {
  return SLOT_SET.has(value);
}

/** Resolves a manifest-relative asset path into an extension-packaged asset path. */
export function resolveManifestAssetPath(assetPath: string, basePath: string): string {
  if (/^(blob:|data:|https?:|chrome-extension:)/.test(assetPath)) return assetPath;
  const baseUrl = manifestBaseUrl(basePath);
  const resolvedUrl = new URL(assetPath, baseUrl);
  return /^(https?:|chrome-extension:)/.test(basePath) ? resolvedUrl.href : resolvedUrl.pathname;
}

/** Performs minimal structural validation before a manifest is trusted by runtime code. */
export function validateManifest(manifest: CompanionPackManifest): void {
  if (!manifest.id || !manifest.name) throw new Error("Companion pack manifest needs id and name.");
  if (manifest.avatar.id !== manifest.id) throw new Error("Companion pack avatar id must match pack id.");
  if (!manifest.persona.systemPrompt.trim()) throw new Error("Companion pack needs a persona systemPrompt.");
  if (!manifest.avatar.animationSlots.idle?.length) throw new Error("Companion pack needs an idle animation slot.");
  for (const [slot, animations] of Object.entries(manifest.avatar.animationSlots)) {
    if (!isAnimationSlot(slot)) throw new Error(`Unknown companion animation slot: ${slot}`);
    validateAnimations(slot, animations);
  }
}

function materializeAnimationSlots(
  manifest: CompanionPackManifest,
  basePath: string
): AvatarPack["animationSlots"] {
  return Object.fromEntries(Object.entries(manifest.avatar.animationSlots).map(([slot, animations]) => [
    slot,
    animations?.map((animation) => ({
      ...animation,
      src: resolveManifestAssetPath(animation.src, basePath)
    }))
  ]));
}

function validateAnimations(slot: string, animations: AvatarAnimation[] | undefined): void {
  if (!animations?.length) throw new Error(`Companion animation slot ${slot} must include animations.`);
  for (const animation of animations) {
    if (!animation.id || !animation.src) throw new Error(`Animation in slot ${slot} needs id and src.`);
    if (!ASSET_TYPES.has(animation.type)) throw new Error(`Animation ${animation.id} has invalid type.`);
  }
}

function manifestBaseUrl(basePath: string): string {
  if (/^(https?:|chrome-extension:)/.test(basePath)) return basePath.replace(/\/?$/, "/");
  return `https://companion-pack.local/${basePath.replace(/\/?$/, "/")}`;
}
