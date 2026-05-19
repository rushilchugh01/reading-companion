import type { ModelProviderId } from "./provider-catalog";
import type { CompanionPackRegistry } from "./companion-pack-registry";

export type ModelReasoningLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

/** User-configurable provider settings for PI-backed model APIs. */
export type ModelProviderSettings = {
  providerId: ModelProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
  providerName: string;
  reasoningLevel: ModelReasoningLevel;
  azureApiVersion: string;
  azureDeploymentName: string;
  azureResourceName: string;
  bedrockBearerToken: string;
  bedrockProfile: string;
  bedrockRegion: string;
  googleVertexLocation: string;
  googleVertexProject: string;
  timeout: number;
  maxTokens: number;
  temperature: number;
};

/** Persisted pet geometry in viewport coordinates. */
export type PetPlacement = {
  x: number;
  y: number;
  size: "medium" | "large";
  panelWidth: number;
  panelHeight: number;
};

/** Cognitive moves the policy may allow a model/persona to choose from. */
export type CognitiveMove =
  | "ask_question"
  | "get_attention"
  | "offer_prediction"
  | "offer_hint"
  | "stay_quiet";

/** Built-in deterministic policy packs. */
export type InterventionPolicyId =
  | "ambient_active_reading_v1"
  | "gentle_checkpoints"
  | "brutal_tutor_dense";

/** User-tunable intervention policy thresholds. */
export type InterventionPolicyOverrides = {
  pageLoadQuietMilliseconds?: number;
  cooldownMilliseconds?: Partial<Record<"low" | "medium" | "high", number>>;
  dismissalBaseMilliseconds?: number;
  maxDismissalBackoffPower?: number;
  maxQuestionsPerPage?: Partial<Record<"low" | "medium" | "high", number>>;
  readinessThreshold?: Partial<Record<"strict" | "balanced" | "look_ahead", number>>;
  minimumMeaningfulness?: number;
  minimumReadingConfidence?: number;
};

/** Selects and customizes the deterministic intervention policy pack. */
export type InterventionPolicySettings = {
  policyId: InterventionPolicyId;
  overrides: InterventionPolicyOverrides;
};

/** Top-level settings persisted in extension storage. */
export type CompanionSettings = {
  enabledGlobally: boolean;
  showPet: boolean;
  debugMode: boolean;
  blockedSites: string[];
  allowedSites: string[];
  hiddenPages: string[];
  hiddenSites: string[];
  placement: PetPlacement;
  interventionPolicy: InterventionPolicySettings;
  interventionFrequency: "low" | "medium" | "high";
  readGatingMode: "strict" | "balanced" | "look_ahead";
  companionPackId: string;
  companionPackRegistry: CompanionPackRegistry;
  /** @deprecated Use companionPackId. Kept for stored settings migration. */
  personaId: string;
  /** @deprecated Use companionPackId. Kept for stored settings migration. */
  avatarPackId: string;
  strictness: "chill" | "medium" | "strict";
  storageMode: "local_only" | "local_plus_cloud" | "cloud_only";
  provider: ModelProviderSettings;
};
