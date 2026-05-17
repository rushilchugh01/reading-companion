import { mergeSettingsWithDefaults } from "../shared/settings-normalization";
import type { CompanionSettings } from "../shared/settings-types";
import { SETTINGS_KEY } from "../shared/storage-keys";

type StorageArea = {
  get: (key: string) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
};

/** Persists companion settings in browser.storage.local with default merging. */
export class SettingsRepository {
  private readonly storage: StorageArea;

  /** Creates a repository around a browser-compatible storage area. */
  public constructor(storage: StorageArea) {
    this.storage = storage;
  }

  /** Reads settings and overlays any persisted partial values on defaults. */
  public async get(): Promise<CompanionSettings> {
    const stored = await this.storage.get(SETTINGS_KEY);
    return mergeSettingsWithDefaults(stored[SETTINGS_KEY]);
  }

  /** Persists a complete settings snapshot after normalizing missing defaults. */
  public async set(settings: CompanionSettings): Promise<CompanionSettings> {
    const normalized = mergeSettingsWithDefaults(settings);
    await this.storage.set({ [SETTINGS_KEY]: normalized });
    return normalized;
  }

  /** Applies a partial update to the current settings snapshot. */
  public async update(
    patch: Partial<CompanionSettings>
  ): Promise<CompanionSettings> {
    const current = await this.get();
    const next = mergeSettingsWithDefaults({
      ...current,
      ...patch,
      placement: { ...current.placement, ...patch.placement },
      interventionPolicy: {
        ...current.interventionPolicy,
        ...patch.interventionPolicy,
        overrides: {
          ...current.interventionPolicy.overrides,
          ...patch.interventionPolicy?.overrides
        }
      },
      provider: { ...current.provider, ...patch.provider }
    });
    await this.storage.set({ [SETTINGS_KEY]: next });
    return next;
  }
}
