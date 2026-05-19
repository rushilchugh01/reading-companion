import { createDefaultSettings } from "./defaults";
import { normalizeCompanionPackRegistry } from "./companion-pack-registry";
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

  const companionPackId = stringValue(saved.companionPackId)
    ?? stringValue(saved.avatarPackId)
    ?? defaults.companionPackId;
  const companionPackRegistry = normalizeCompanionPackRegistry(
    saved.companionPackRegistry,
    companionPackId
  );

  return {
    ...defaults,
    ...saved,
    questionGenerationStrategyId: questionStrategyValue(saved.questionGenerationStrategyId)
      ?? defaults.questionGenerationStrategyId,
    companionPackId: companionPackRegistry.activePackId,
    companionPackRegistry,
    avatarPackId: stringValue(saved.avatarPackId) ?? companionPackRegistry.activePackId,
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

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function questionStrategyValue(value: unknown): CompanionSettings["questionGenerationStrategyId"] | undefined {
  return value === "single_shot_v1" || value === "candidate_ranked_v1" || value === "sketch_then_rank_v1"
    ? value
    : undefined;
}
