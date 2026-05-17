import { createDefaultSettings } from "./defaults";
import type { CompanionSettings } from "./settings-types";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Merges a stored settings value over defaults, preserving nested defaults. */
export function mergeSettingsWithDefaults(saved: unknown): CompanionSettings {
  const defaults = createDefaultSettings();
  if (!isPlainRecord(saved)) {
    return defaults;
  }

  return {
    ...defaults,
    ...saved,
    placement: {
      ...defaults.placement,
      ...(isPlainRecord(saved.placement) ? saved.placement : {})
    },
    interventionPolicy: {
      ...defaults.interventionPolicy,
      ...(isPlainRecord(saved.interventionPolicy) ? saved.interventionPolicy : {}),
      overrides: {
        ...defaults.interventionPolicy.overrides,
        ...(isPlainRecord(saved.interventionPolicy)
          && isPlainRecord(saved.interventionPolicy.overrides)
          ? saved.interventionPolicy.overrides
          : {})
      }
    },
    provider: {
      ...defaults.provider,
      ...(isPlainRecord(saved.provider) ? saved.provider : {})
    }
  };
}
