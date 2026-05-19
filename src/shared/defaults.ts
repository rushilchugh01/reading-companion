import type { CompanionSettings } from "./settings-types";
import { createDefaultCompanionPackRegistry } from "./companion-pack-registry";

declare const __DEFAULT_PROVIDER_API_KEY__: string | undefined;

function defaultProviderApiKey(): string {
  return typeof __DEFAULT_PROVIDER_API_KEY__ === "string" ? __DEFAULT_PROVIDER_API_KEY__ : "";
}

/** Default settings preserve local-first privacy and OpenAI-compatible proxy support. */
export function createDefaultSettings(): CompanionSettings {
  return {
    enabledGlobally: true,
    showPet: true,
    debugMode: true,
    blockedSites: [],
    allowedSites: [],
    hiddenPages: [],
    hiddenSites: [],
    placement: {
      x: 24,
      y: Math.max(24, globalThis.innerHeight ? globalThis.innerHeight - 200 : 500),
      size: "medium",
      panelWidth: 340,
      panelHeight: 420
    },
    interventionPolicy: {
      policyId: "ambient_active_reading_v1",
      overrides: {}
    },
    questionGenerationStrategyId: "candidate_ranked_v1",
    interventionFrequency: "medium",
    readGatingMode: "balanced",
    companionPackId: "builtin-corgi",
    companionPackRegistry: createDefaultCompanionPackRegistry(),
    personaId: "brutal-tutor-dog",
    avatarPackId: "builtin-corgi",
    strictness: "medium",
    storageMode: "local_only",
    provider: {
      providerId: "custom",
      baseUrl: "http://127.0.0.1:8318/v1",
      apiKey: defaultProviderApiKey(),
      model: "gemini-3.1-pro-preview",
      providerName: "OpenAI Compatible",
      reasoningLevel: "medium",
      azureApiVersion: "2025-04-01-preview",
      azureDeploymentName: "",
      azureResourceName: "",
      bedrockBearerToken: "",
      bedrockProfile: "",
      bedrockRegion: "us-east-1",
      googleVertexLocation: "us-central1",
      googleVertexProject: "",
      timeout: 30_000,
      maxTokens: 500,
      temperature: 0.3
    }
  };
}
