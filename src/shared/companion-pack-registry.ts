import {
  BUILTIN_CORGI_MANIFEST_PATH,
  BUILTIN_CORGI_PACK_ID,
  DEFAULT_CORGI_COMPANION_PACK_MANIFEST
} from "./default-companion-pack-manifest";

export type CompanionPackSource = "bundled" | "installed" | "remote";

export type CompanionPackRegistryEntry = {
  id: string;
  name: string;
  version: string;
  source: CompanionPackSource;
  manifestPath: string;
  enabled: boolean;
  installedAt?: number;
};

export type CompanionPackRegistry = {
  activePackId: string;
  entries: CompanionPackRegistryEntry[];
};

export const DEFAULT_COMPANION_PACK_ENTRY: CompanionPackRegistryEntry = {
  id: BUILTIN_CORGI_PACK_ID,
  name: DEFAULT_CORGI_COMPANION_PACK_MANIFEST.name,
  version: DEFAULT_CORGI_COMPANION_PACK_MANIFEST.avatar.version,
  source: "bundled",
  manifestPath: BUILTIN_CORGI_MANIFEST_PATH,
  enabled: true
};

/** Creates the default companion pack registry with only the bundled corgi installed. */
export function createDefaultCompanionPackRegistry(): CompanionPackRegistry {
  return {
    activePackId: BUILTIN_CORGI_PACK_ID,
    entries: [DEFAULT_COMPANION_PACK_ENTRY]
  };
}

/** Returns all enabled pack entries in a registry. */
export function enabledCompanionPackEntries(
  registry: CompanionPackRegistry
): CompanionPackRegistryEntry[] {
  return registry.entries.filter((entry) => entry.enabled);
}

/** Resolves a pack entry from a registry, falling back to the bundled corgi entry. */
export function resolveCompanionPackEntry(
  registry: CompanionPackRegistry,
  packId: string | undefined
): CompanionPackRegistryEntry {
  const effectivePackId = packId || registry.activePackId;
  return registry.entries.find((entry) => entry.enabled && entry.id === effectivePackId)
    ?? DEFAULT_COMPANION_PACK_ENTRY;
}

/** Normalizes stored registry data and keeps exactly one active pack id. */
export function normalizeCompanionPackRegistry(
  saved: unknown,
  activePackId = BUILTIN_CORGI_PACK_ID
): CompanionPackRegistry {
  const entries = registryEntries(saved);
  const requestedActivePackId = registryActivePackId(saved) ?? activePackId;
  const activeEntry = entries.find((entry) => entry.enabled && entry.id === requestedActivePackId)
    ?? DEFAULT_COMPANION_PACK_ENTRY;
  return {
    activePackId: activeEntry.id,
    entries
  };
}

function registryEntries(saved: unknown): CompanionPackRegistryEntry[] {
  const entries = isRecord(saved) && Array.isArray(saved.entries)
    ? saved.entries.map(normalizeEntry).filter((entry): entry is CompanionPackRegistryEntry => Boolean(entry))
    : [];
  return mergeDefaultEntry(entries);
}

function registryActivePackId(saved: unknown): string | undefined {
  if (!isRecord(saved)) return undefined;
  return stringValue(saved.activePackId);
}

function mergeDefaultEntry(entries: CompanionPackRegistryEntry[]): CompanionPackRegistryEntry[] {
  const customEntries = entries.filter((entry) => entry.id !== BUILTIN_CORGI_PACK_ID);
  return [DEFAULT_COMPANION_PACK_ENTRY, ...customEntries];
}

function normalizeEntry(value: unknown): CompanionPackRegistryEntry | undefined {
  if (!isRecord(value)) return undefined;
  const id = stringValue(value.id);
  const name = stringValue(value.name);
  const version = stringValue(value.version);
  const manifestPath = stringValue(value.manifestPath);
  const source = packSource(value.source);
  if (!id || !name || !version || !manifestPath || !source) return undefined;
  return {
    id,
    name,
    version,
    source,
    manifestPath,
    enabled: value.enabled !== false,
    installedAt: typeof value.installedAt === "number" ? value.installedAt : undefined
  };
}

function packSource(value: unknown): CompanionPackSource | undefined {
  return value === "bundled" || value === "installed" || value === "remote" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
