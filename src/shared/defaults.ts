import type { CompanionSettings } from "./settings-types";
import { createDefaultCompanionPackRegistry } from "./companion-pack-registry";

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
      apiKey: "",
      model: "gemini-3-flash-preview",
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
