import type { KnownProvider } from "@earendil-works/pi-ai";

export type ModelProviderId = KnownProvider | "custom";

export type ModelProviderApi =
  | "anthropic-messages"
  | "azure-openai-responses"
  | "bedrock-converse-stream"
  | "google-generative-ai"
  | "google-vertex"
  | "mistral-conversations"
  | "openai-codex-responses"
  | "openai-completions";

export type ProviderField =
  | "apiKey"
  | "azure"
  | "baseUrl"
  | "bedrock"
  | "googleVertex"
  | "providerName";

export type ProviderCatalogEntry = {
  id: ModelProviderId;
  label: string;
  api: ModelProviderApi;
  defaultBaseUrl: string;
  defaultModel: string;
  fields: ProviderField[];
};

export const PROVIDER_CATALOG = [
  openAiCompatible("openrouter", "OpenRouter", "https://openrouter.ai/api/v1", "openai/gpt-5.2"),
  openAiCompatible("openai", "OpenAI", "https://api.openai.com/v1", "gpt-5.2"),
  provider({ id: "anthropic", label: "Anthropic", api: "anthropic-messages", defaultBaseUrl: "https://api.anthropic.com", defaultModel: "claude-sonnet-4-6", fields: ["apiKey"] }),
  provider({ id: "google", label: "Google Gemini", api: "google-generative-ai", defaultBaseUrl: "", defaultModel: "gemini-3-pro-preview", fields: ["apiKey", "baseUrl"] }),
  provider({ id: "google-vertex", label: "Google Vertex AI", api: "google-vertex", defaultBaseUrl: "", defaultModel: "gemini-3-pro-preview", fields: ["apiKey", "googleVertex", "baseUrl"] }),
  provider({ id: "mistral", label: "Mistral", api: "mistral-conversations", defaultBaseUrl: "https://api.mistral.ai", defaultModel: "mistral-large-latest", fields: ["apiKey", "baseUrl"] }),
  provider({ id: "amazon-bedrock", label: "Amazon Bedrock", api: "bedrock-converse-stream", defaultBaseUrl: "", defaultModel: "anthropic.claude-sonnet-4-6", fields: ["bedrock", "baseUrl"] }),
  provider({ id: "azure-openai-responses", label: "Azure OpenAI", api: "azure-openai-responses", defaultBaseUrl: "", defaultModel: "gpt-5.2", fields: ["apiKey", "azure"] }),
  provider({ id: "openai-codex", label: "OpenAI Codex", api: "openai-codex-responses", defaultBaseUrl: "https://api.openai.com/v1", defaultModel: "gpt-5.2-codex", fields: ["apiKey", "baseUrl"] }),
  openAiCompatible("deepseek", "DeepSeek", "https://api.deepseek.com", "deepseek-chat"),
  openAiCompatible("github-copilot", "GitHub Copilot", "", "gpt-5.2"),
  openAiCompatible("xai", "xAI", "https://api.x.ai/v1", "grok-4"),
  openAiCompatible("groq", "Groq", "https://api.groq.com/openai/v1", "openai/gpt-oss-120b"),
  openAiCompatible("cerebras", "Cerebras", "https://api.cerebras.ai/v1", "gpt-oss-120b"),
  openAiCompatible("vercel-ai-gateway", "Vercel AI Gateway", "https://ai-gateway.vercel.sh/v1", "openai/gpt-5.2"),
  openAiCompatible("zai", "Z.ai", "https://api.z.ai/api/paas/v4", "glm-4.6"),
  openAiCompatible("minimax", "MiniMax", "https://api.minimax.io/v1", "MiniMax-M2"),
  openAiCompatible("minimax-cn", "MiniMax CN", "https://api.minimax.chat/v1", "MiniMax-M2"),
  openAiCompatible("moonshotai", "Moonshot AI", "https://api.moonshot.ai/v1", "kimi-k2-0905-preview"),
  openAiCompatible("moonshotai-cn", "Moonshot AI CN", "https://api.moonshot.cn/v1", "kimi-k2-0905-preview"),
  openAiCompatible("huggingface", "Hugging Face", "https://router.huggingface.co/v1", "openai/gpt-oss-120b"),
  openAiCompatible("fireworks", "Fireworks AI", "https://api.fireworks.ai/inference/v1", "accounts/fireworks/models/gpt-oss-120b"),
  openAiCompatible("opencode", "OpenCode", "https://api.opencode.ai/v1", "qwen/qwen3-coder"),
  openAiCompatible("opencode-go", "OpenCode Go", "https://api.opencode.ai/v1", "qwen/qwen3-coder"),
  openAiCompatible("kimi-coding", "Kimi Coding", "https://api.moonshot.ai/v1", "kimi-k2-0905-preview"),
  openAiCompatible("cloudflare-workers-ai", "Cloudflare Workers AI", "", "@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
  openAiCompatible("cloudflare-ai-gateway", "Cloudflare AI Gateway", "", "openai/gpt-5.2"),
  openAiCompatible("xiaomi", "Xiaomi", "", "mi-model"),
  openAiCompatible("xiaomi-token-plan-cn", "Xiaomi Token Plan CN", "", "mi-model"),
  openAiCompatible("xiaomi-token-plan-ams", "Xiaomi Token Plan AMS", "", "mi-model"),
  openAiCompatible("xiaomi-token-plan-sgp", "Xiaomi Token Plan SGP", "", "mi-model"),
  provider({ id: "custom", label: "Custom OpenAI-compatible", api: "openai-completions", defaultBaseUrl: "http://127.0.0.1:8318/v1", defaultModel: "gemini-3.1-pro-preview", fields: ["providerName", "apiKey", "baseUrl"] })
] as const satisfies ProviderCatalogEntry[];

export const MODEL_PROVIDER_IDS = PROVIDER_CATALOG.map((provider) => provider.id);

/** Returns the catalog entry for a provider id, falling back to OpenRouter. */
export function providerCatalogEntry(providerId: string | undefined): ProviderCatalogEntry {
  return PROVIDER_CATALOG.find((provider) => provider.id === providerId) ?? PROVIDER_CATALOG[0];
}

function provider(entry: ProviderCatalogEntry): ProviderCatalogEntry {
  return entry;
}

function openAiCompatible(
  id: ModelProviderId,
  label: string,
  defaultBaseUrl: string,
  defaultModel: string
): ProviderCatalogEntry {
  return provider({ id, label, api: "openai-completions", defaultBaseUrl, defaultModel, fields: ["apiKey", "baseUrl"] });
}
