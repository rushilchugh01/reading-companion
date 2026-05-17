import { MODEL_PROVIDER_IDS, PROVIDER_CATALOG, providerCatalogEntry, type ModelProviderId } from "../../src/shared/provider-catalog";
import type { CompanionSettings, ModelReasoningLevel } from "../../src/shared/settings-types";

type SettingsSectionProps = {
  settings: CompanionSettings;
  saveSettings: (settings: CompanionSettings) => void;
};

/** Renders PI provider settings with provider-specific configuration fields. */
export function ProviderSettings(props: SettingsSectionProps) {
  const provider = providerCatalogEntry(props.settings.provider.providerId);
  return (
    <section>
      <label>
        Provider
        <select
          value={provider.id}
          onChange={(event) => saveProviderId(props, event.currentTarget.value)}
        >
          {PROVIDER_CATALOG.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
        </select>
      </label>
      {provider.fields.includes("providerName") && <ProviderInput field="providerName" label="Provider name" {...props} />}
      {provider.fields.includes("apiKey") && <ProviderInput field="apiKey" label={apiKeyLabel(provider.id)} type="password" {...props} />}
      {provider.fields.includes("baseUrl") && <ProviderInput field="baseUrl" label="Base URL" {...props} />}
      {provider.fields.includes("azure") && <AzureProviderFields {...props} />}
      {provider.fields.includes("googleVertex") && <GoogleVertexFields {...props} />}
      {provider.fields.includes("bedrock") && <BedrockProviderFields {...props} />}
      <ProviderInput field="model" label="Model" {...props} />
      <ReasoningProviderInput {...props} />
      <NumberProviderInput field="timeout" label="Timeout" {...props} />
      <NumberProviderInput field="maxTokens" label="Max tokens" {...props} />
      <NumberProviderInput field="temperature" label="Temperature" step={0.1} {...props} />
    </section>
  );
}

function saveProviderId(props: SettingsSectionProps, value: string) {
  const provider = providerCatalogEntry(readProviderId(value));
  props.saveSettings({
    ...props.settings,
    provider: {
      ...props.settings.provider,
      providerId: provider.id,
      baseUrl: provider.defaultBaseUrl,
      model: provider.defaultModel,
      providerName: provider.label,
      reasoningLevel: props.settings.provider.reasoningLevel || "medium"
    }
  });
}

function AzureProviderFields(props: SettingsSectionProps) {
  return (
    <>
      <ProviderInput field="azureResourceName" label="Azure resource name" {...props} />
      <ProviderInput field="azureDeploymentName" label="Azure deployment name" {...props} />
      <ProviderInput field="azureApiVersion" label="Azure API version" {...props} />
      <ProviderInput field="baseUrl" label="Azure base URL" {...props} />
    </>
  );
}

function GoogleVertexFields(props: SettingsSectionProps) {
  return (
    <>
      <ProviderInput field="googleVertexProject" label="Google Cloud project" {...props} />
      <ProviderInput field="googleVertexLocation" label="Google Cloud location" {...props} />
    </>
  );
}

function BedrockProviderFields(props: SettingsSectionProps) {
  return (
    <>
      <ProviderInput field="bedrockRegion" label="AWS region" {...props} />
      <ProviderInput field="bedrockProfile" label="AWS profile" {...props} />
      <ProviderInput field="bedrockBearerToken" label="Bedrock bearer token" type="password" {...props} />
    </>
  );
}

function apiKeyLabel(providerId: ModelProviderId): string {
  if (providerId === "google-vertex") return "Vertex API key";
  if (providerId === "azure-openai-responses") return "Azure API key";
  return "API key";
}

function readProviderId(value: string): ModelProviderId {
  return MODEL_PROVIDER_IDS.includes(value as ModelProviderId) ? (value as ModelProviderId) : "custom";
}

const REASONING_LEVELS: ModelReasoningLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

function ProviderInput(props: ProviderInputProps) {
  const inputType = props.type ?? "text";
  return (
    <label>
      {props.label}
      <input
        type={inputType}
        value={props.settings.provider[props.field]}
        onChange={(event) => props.saveSettings({
          ...props.settings,
          provider: { ...props.settings.provider, [props.field]: event.currentTarget.value }
        })}
      />
    </label>
  );
}

function ReasoningProviderInput(props: SettingsSectionProps) {
  return (
    <label>
      Reasoning
      <select
        value={props.settings.provider.reasoningLevel}
        onChange={(event) => props.saveSettings({
          ...props.settings,
          provider: {
            ...props.settings.provider,
            reasoningLevel: readReasoningLevel(event.currentTarget.value)
          }
        })}
      >
        {REASONING_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
      </select>
    </label>
  );
}

function readReasoningLevel(value: string): ModelReasoningLevel {
  return REASONING_LEVELS.includes(value as ModelReasoningLevel) ? (value as ModelReasoningLevel) : "medium";
}

function NumberProviderInput(props: NumberProviderInputProps) {
  return (
    <label>
      {props.label}
      <input
        min={0}
        step={props.step ?? 1}
        type="number"
        value={props.settings.provider[props.field]}
        onChange={(event) => props.saveSettings({
          ...props.settings,
          provider: { ...props.settings.provider, [props.field]: Number(event.currentTarget.value) }
        })}
      />
    </label>
  );
}

type ProviderInputProps = SettingsSectionProps & {
  field:
    | "apiKey"
    | "azureApiVersion"
    | "azureDeploymentName"
    | "azureResourceName"
    | "baseUrl"
    | "bedrockBearerToken"
    | "bedrockProfile"
    | "bedrockRegion"
    | "googleVertexLocation"
    | "googleVertexProject"
    | "model"
    | "providerName";
  label: string;
  type?: string;
};

type NumberProviderInputProps = SettingsSectionProps & {
  field: "timeout" | "maxTokens" | "temperature";
  label: string;
  step?: number;
};
