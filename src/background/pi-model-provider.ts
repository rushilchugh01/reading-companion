import { getModels, stream } from "@earendil-works/pi-ai";
import type { Api, AssistantMessage, Context, Model, OpenAICompletionsCompat, ProviderResponse, ProviderStreamOptions } from "@earendil-works/pi-ai";
import { companionToolsForRoute, normalizeToolCalls, type CompanionToolCall, type CompanionToolRoute } from "./companion-tools";
import { createCompanionLogger } from "../shared/logger";
import { providerCatalogEntry, type ModelProviderApi, type ModelProviderId } from "../shared/provider-catalog";
import type { CompanionSettings, ModelReasoningLevel } from "../shared/settings-types";

/** Complete prompt and provider settings passed from the model client to PI. */
export type PiRequest = {
  settings: CompanionSettings;
  systemPrompt: string;
  userPrompt: string;
  responseFormat?: "text";
  tools?: CompanionToolRoute;
};

/** Provider response distilled into text, tool calls, and debug metadata. */
export type PiModelResult = {
  text: string;
  toolCalls: CompanionToolCall[];
  status?: number;
  responseModel?: string;
  responseId?: string;
  totalTokens?: number;
};

const piLogger = createCompanionLogger("pi");

/** Runs PI's configured provider with companion tools enabled. */
export async function runPiModelRequest(request: PiRequest): Promise<PiModelResult> {
  const model = createPiModel(request.settings);
  let status: number | undefined;
  piLogger.info("starting model request", { baseUrl: model.baseUrl, model: model.id, provider: model.provider });
  const messageStream = stream(
    model,
    createContext(request),
    createStreamOptions(request, model.api, (response) => {
      status = response.status;
    })
  );
  const result = resultFromMessage(await messageStream.result(), status);
  piLogger.info("model request completed", { status, tools: result.toolCalls.map((toolCall) => toolCall.name), totalTokens: result.totalTokens });
  return result;
}

function createStreamOptions(
  request: PiRequest,
  api: Api,
  onResponse: (response: ProviderResponse) => void
): ProviderStreamOptions {
  return {
    apiKey: providerApiKey(request.settings),
    maxTokens: request.settings.provider.maxTokens,
    temperature: request.settings.provider.temperature,
    timeoutMs: request.settings.provider.timeout,
    toolChoice: toolChoiceForRoute(api, request.tools),
    reasoning: streamReasoningLevel(request.settings.provider.reasoningLevel),
    azureApiVersion: request.settings.provider.azureApiVersion || undefined,
    azureDeploymentName: request.settings.provider.azureDeploymentName || undefined,
    azureResourceName: request.settings.provider.azureResourceName || undefined,
    bearerToken: request.settings.provider.bedrockBearerToken || undefined,
    headers: providerHeaders(request.settings),
    location: request.settings.provider.googleVertexLocation || undefined,
    profile: request.settings.provider.bedrockProfile || undefined,
    project: request.settings.provider.googleVertexProject || undefined,
    region: request.settings.provider.bedrockRegion || undefined,
    onResponse
  };
}

function toolChoiceForRoute(api: Api, route: CompanionToolRoute | undefined): string | undefined {
  if (route === undefined || route === "none") return undefined;
  return usesRequiredToolChoice(api) ? "required" : "any";
}

function usesRequiredToolChoice(api: Api): boolean {
  return api === "openai-completions"
    || api === "mistral-conversations"
    || api === "azure-openai-responses"
    || api === "openai-codex-responses";
}

function providerApiKey(settings: CompanionSettings): string {
  return settings.provider.apiKey || "not-needed";
}

function providerHeaders(settings: CompanionSettings): ProviderStreamOptions["headers"] {
  if (settings.provider.providerId === "custom" && !settings.provider.apiKey) {
    return { Authorization: null } as unknown as ProviderStreamOptions["headers"];
  }

  return undefined;
}

/** Creates a PI model from user-configured provider settings. */
export function createPiModel(settings: CompanionSettings): Model<Api> {
  const catalogEntry = providerCatalogEntry(settings.provider.providerId);
  const provider = inferProvider(settings.provider);
  const catalogModel = getCatalogModel(settings.provider.providerId, settings.provider.model);
  const model = catalogModel
    ? { ...catalogModel }
    : createCustomModel(settings, catalogEntry.api, provider);
  return {
    ...model,
    id: settings.provider.model,
    name: settings.provider.model,
    provider,
    baseUrl: settings.provider.baseUrl.replace(/\/$/, "") || model.baseUrl,
    maxTokens: settings.provider.maxTokens,
    compat: model.api === "openai-completions"
      ? openAiCompat(provider, model.compat)
      : model.compat
  };
}

function createContext(request: PiRequest): Context {
  return {
    systemPrompt: request.systemPrompt,
    messages: [{
      role: "user",
      content: request.userPrompt,
      timestamp: Date.now()
    }],
    tools: companionToolsForRoute(request.tools ?? "intervention")
  };
}

function resultFromMessage(message: AssistantMessage, status?: number): PiModelResult {
  if (message.stopReason === "error" || message.stopReason === "aborted") {
    throw new Error(message.errorMessage || "PI model request failed.");
  }
  return {
    text: textFromMessage(message),
    toolCalls: normalizeToolCalls(message.content),
    status,
    responseModel: message.responseModel,
    responseId: message.responseId,
    totalTokens: message.usage.totalTokens
  };
}

function textFromMessage(message: AssistantMessage): string {
  return message.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}

function inferProvider(provider: CompanionSettings["provider"]): string {
  if (provider.providerId && provider.providerId !== "custom") return provider.providerId;
  if (provider.baseUrl.includes("openrouter.ai")) return "openrouter";
  return provider.providerName.trim().toLowerCase().replaceAll(/\s+/g, "-") || "custom";
}

function streamReasoningLevel(reasoningLevel: ModelReasoningLevel): ProviderStreamOptions["reasoning"] {
  return reasoningLevel === "off" ? undefined : reasoningLevel;
}

function getCatalogModel(provider: ModelProviderId, modelId: string): Model<Api> | undefined {
  if (provider === "custom") return undefined;
  try {
    return getModels(provider).find((model) => model.id === modelId);
  } catch {
    return undefined;
  }
}

function openAiCompat(
  provider: string,
  compat: OpenAICompletionsCompat | undefined
): OpenAICompletionsCompat {
  return {
    ...compat,
    maxTokensField: "max_tokens",
    supportsStore: false,
    thinkingFormat: provider === "openrouter" ? "openrouter" : compat?.thinkingFormat ?? "openai"
  };
}

function createCustomModel(
  settings: CompanionSettings,
  api: ModelProviderApi,
  provider: string
): Model<Api> {
  return {
    id: settings.provider.model,
    name: settings.provider.model,
    api,
    provider,
    baseUrl: settings.provider.baseUrl.replace(/\/$/, ""),
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: settings.provider.maxTokens,
    compat: api === "openai-completions"
      ? {
        maxTokensField: "max_tokens",
        supportsStore: false,
        thinkingFormat: provider === "openrouter" ? "openrouter" : "openai"
      }
      : undefined
  };
}

/** PI provider response type re-exported for tests and future diagnostics. */
export type { ProviderResponse };
