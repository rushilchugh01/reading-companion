import type { AnimationSlot, AvatarPack, AvatarVariant } from "./animation-types";
import { ANIMATION_SLOTS, resolveAvatarSlotConfig, selectAvatarVariant } from "./animation-types";
import type {
  CompanionPack,
  CompanionPackManifest,
  CompanionPersona
} from "./companion-pack-schema";
import { companionPackFromManifest } from "./companion-pack-schema";
import type {
  CompanionPackRegistry,
  CompanionPackRegistryEntry
} from "./companion-pack-registry";
import {
  createDefaultCompanionPackRegistry,
  enabledCompanionPackEntries,
  resolveCompanionPackEntry
} from "./companion-pack-registry";
import {
  BUILTIN_CORGI_MANIFEST_BASE_PATH,
  BUILTIN_CORGI_PACK_ID,
  DEFAULT_CORGI_COMPANION_PACK_MANIFEST
} from "./default-companion-pack-manifest";

export { BUILTIN_CORGI_PACK_ID };
export type {
  CompanionPack,
  CompanionPackManifest,
  CompanionPackRegistry,
  CompanionPackRegistryEntry,
  CompanionPersona
};

const loadedCompanionPacks = new Map<string, Promise<CompanionPack>>();
const defaultCompanionPackRegistry = createDefaultCompanionPackRegistry();

/** Built-in static corgi companion pack used when runtime manifest loading is unavailable. */
export const builtinCorgiCompanionPack = companionPackFromManifest(
  DEFAULT_CORGI_COMPANION_PACK_MANIFEST,
  BUILTIN_CORGI_MANIFEST_BASE_PATH
);

/** Built-in static corgi avatar used as the guaranteed local fallback. */
export const builtinCorgiAvatarPack = builtinCorgiCompanionPack.avatar;

export const builtinCorgiPack = builtinCorgiAvatarPack;

/** Returns a built-in companion pack by id, falling back to the bundled corgi. */
export function getBuiltInCompanionPack(packId: string | undefined): CompanionPack {
  if (!packId || packId === BUILTIN_CORGI_PACK_ID) return builtinCorgiCompanionPack;
  return builtinCorgiCompanionPack;
}

/** Returns a built-in avatar pack by id, falling back to the bundled corgi avatar. */
export function getBuiltInAvatarPack(packId: string | undefined): AvatarPack {
  return getBuiltInCompanionPack(packId).avatar;
}

/** Lists the enabled companion packs currently known to the default registry. */
export function listCompanionPacks(): CompanionPackRegistryEntry[] {
  return enabledCompanionPackEntries(defaultCompanionPackRegistry);
}

/** Returns the default active companion pack id. */
export function getDefaultActiveCompanionPackId(): string {
  return defaultCompanionPackRegistry.activePackId;
}

/** Loads a companion pack manifest, using the bundled corgi if loading fails. */
export async function loadCompanionPack(
  packId: string | undefined,
  registry: CompanionPackRegistry = defaultCompanionPackRegistry
): Promise<CompanionPack> {
  const entry = companionPackLoadEntry(registry, packId);
  const cacheKey = `${entry.source}:${entry.id}:${entry.manifestPath}`;
  const cached = loadedCompanionPacks.get(cacheKey);
  if (cached) return cached;
  const pending = fetchCompanionPack(entry).catch(() => builtinCorgiCompanionPack);
  loadedCompanionPacks.set(cacheKey, pending);
  return pending;
}

/** Returns a renderable variant for the requested slot, using built-in idle as a last resort. */
export function resolveRenderableAvatarVariant(
  pack: AvatarPack,
  slot: AnimationSlot,
  rng?: () => number
): AvatarVariant {
  const config = resolveAvatarSlotConfig(pack, slot)
    ?? resolveAvatarSlotConfig(builtinCorgiAvatarPack, "idle");
  if (!config) throw new Error("Built-in avatar pack is missing the idle slot.");
  return selectAvatarVariant(config, rng);
}

/** Returns true when the built-in pack can resolve every known animation slot. */
export function builtInPackCoversAnimationSlots(): boolean {
  return ANIMATION_SLOTS.every((slot) => Boolean(builtinCorgiAvatarPack.animationSlots[slot]?.length));
}

async function fetchCompanionPack(entry: CompanionPackRegistryEntry): Promise<CompanionPack> {
  const manifestUrl = companionPackManifestUrl(entry);
  const response = await fetch(manifestUrl);
  if (!response.ok) throw new Error(`Companion pack manifest failed: ${response.status}`);
  const manifest = await response.json() as CompanionPackManifest;
  return companionPackFromManifest(manifest, companionPackBasePath(manifestUrl));
}

function companionPackLoadEntry(
  registry: CompanionPackRegistry,
  packId: string | undefined
): CompanionPackRegistryEntry {
  if (packId && /^https?:\/\//.test(packId)) {
    return {
      id: packId,
      name: packId,
      version: "remote",
      source: "remote",
      manifestPath: packId,
      enabled: true
    };
  }
  return resolveCompanionPackEntry(registry, packId);
}

function companionPackManifestUrl(entry: CompanionPackRegistryEntry): string {
  if (/^https?:\/\//.test(entry.manifestPath)) return entry.manifestPath;
  return extensionResourceUrl(entry.manifestPath);
}

function companionPackBasePath(manifestUrl: string): string {
  if (/^(https?:|chrome-extension:)/.test(manifestUrl)) return new URL(".", manifestUrl).href;
  return manifestUrl.replace(/[^/]*$/, "");
}

function extensionResourceUrl(path: string): string {
  const runtime = (globalThis as typeof globalThis & {
    chrome?: { runtime?: { getURL?: (resourcePath: string) => string } };
  }).chrome?.runtime;
  return runtime?.getURL?.(path) ?? `/${path.replace(/^\//, "")}`;
}
