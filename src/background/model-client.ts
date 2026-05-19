import type {
  AnswerGradeInput,
  AnswerGradeResult,
  ChatSendInput,
  ChatSendResult,
  ChunkSketchInput,
  ChunkSketchResult,
  InterventionComposeInput,
  InterventionComposeResult,
  PageMapInput,
  PageMapResult
} from "../shared/intervention-types";
import { createCompanionLogger } from "../shared/logger";
import type { CompanionSettings } from "../shared/settings-types";
import { interventionTools } from "./companion-tools";
import {
  normalizeGradeResult,
} from "./model/result-normalizer";
import {
  buildAnswerGradePrompt,
  buildChatPrompt,
  buildInterventionPrompt,
  type ModelPromptMessage
} from "./model/prompts";
import { resolveQuestionGenerationStrategy } from "./model/question-strategies";
import { runPiModelRequest, type PiModelResult } from "./pi-model-provider";

type PiRunner = typeof runPiModelRequest;

type ChatCompletionRequest = {
  model: string;
  messages: ModelPromptMessage[];
  temperature: number;
  max_tokens: number;
  tools?: Array<{ type: "function"; function: { name: string } }>;
};

type ClientOptions = {
  piRunner?: PiRunner;
};

type RequestBuild = {
  url: string;
  init: RequestInit;
  body: ChatCompletionRequest;
};

const modelLogger = createCompanionLogger("model");

/** Trims text to a stable preview length. */
function truncateText(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length).trim()}...` : value;
}

/** Builds PI-backed OpenAI-compatible requests for intervention, grading, and chat. */
export class ModelClient {
  private readonly piRunner: PiRunner;

  /** Creates a model client with an injectable PI runner. */
  public constructor(options: ClientOptions = {}) {
    this.piRunner = options.piRunner ?? runPiModelRequest;
  }

  /** Builds the OpenAI-compatible request shape for config/debug tests. */
  public buildChatRequest(
    provider: CompanionSettings["provider"],
    messages: ModelPromptMessage[]
  ): RequestBuild {
    const tools = interventionTools().map((tool) => ({
      type: "function" as const,
      function: { name: tool.name }
    }));
    const body = {
      model: provider.model,
      messages,
      temperature: provider.temperature,
      max_tokens: provider.maxTokens,
      tools
    };
    return {
      url: `${provider.baseUrl.replace(/\/$/, "")}/chat/completions`,
      init: {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${provider.apiKey}`
        },
        body: JSON.stringify(body)
      },
      body
    };
  }

  /** Composes one app-level intervention result from a model provider. */
  public async composeIntervention(
    payload: InterventionComposeInput,
    settings: CompanionSettings
  ): Promise<InterventionComposeResult> {
    try {
      const result = await this.runPrompt(
        settings,
        await buildInterventionPrompt(payload, settings.companionPackRegistry),
        { tools: "intervention" }
      );
      const strategy = resolveQuestionGenerationStrategy(payload.questionGenerationStrategyId);
      const normalized = strategy.normalizeResult(result, payload);
      strategy.validateResult(normalized, payload);
      return normalized;
    } catch (error) {
      modelLogger.warn("intervention provider request failed", { error: errorMessage(error) });
      throw providerRequestError(error);
    }
  }

  /** Grades an answer with a configured model provider. */
  public async gradeAnswer(
    payload: AnswerGradeInput,
    settings: CompanionSettings
  ): Promise<AnswerGradeResult> {
    try {
      const messages = await buildAnswerGradePrompt(payload, settings.companionPackRegistry);
      const result = await this.runPrompt(settings, messages, { tools: "grading" });
      return this.gradeFromModelResult(result, payload.requestId);
    } catch (error) {
      modelLogger.warn("grading provider request failed", { error: errorMessage(error) });
      throw providerRequestError(error);
    }
  }

  /** Sends a natural-language chat turn without JSON or tool coercion. */
  public async sendChat(
    payload: ChatSendInput,
    settings: CompanionSettings
  ): Promise<ChatSendResult> {
    try {
      const result = await this.runPrompt(settings, await buildChatPrompt(payload, settings.companionPackRegistry), { responseFormat: "text", tools: "none" });
      return {
        requestId: payload.requestId,
        text: result.text.trim()
      };
    } catch (error) {
      modelLogger.warn("chat provider request failed", { error: errorMessage(error) });
      throw providerRequestError(error);
    }
  }

  /** Creates a lightweight page map for future model-facing callers. */
  public mapPage(payload: PageMapInput): PageMapResult {
    return {
      requestId: payload.requestId,
      summary: payload.page.excerpt || payload.page.title || "",
      sections: payload.chunks.map((chunk) => ({
        chunkId: chunk.chunkId,
        heading: chunk.heading,
        summary: truncateText(chunk.preview || chunk.text, 180)
      }))
    };
  }

  /** Sketches chunk key points without invoking provider-specific tools. */
  public sketchChunks(payload: ChunkSketchInput): ChunkSketchResult {
    return {
      requestId: payload.requestId,
      sketches: payload.chunks.map((chunk) => ({
        chunkId: chunk.chunkId,
        keyPoint: truncateText(chunk.preview || chunk.text, 160),
        concepts: conceptTokens(chunk.heading || chunk.text)
      }))
    };
  }

  /** Runs a prepared prompt through the configured PI runner. */
  private async runPrompt(
    settings: CompanionSettings,
    messages: ModelPromptMessage[],
    options: Pick<Parameters<PiRunner>[0], "responseFormat" | "tools"> = {}
  ): Promise<PiModelResult> {
    return this.piRunner({
      settings,
      systemPrompt: messages[0]?.content ?? "",
      userPrompt: messages[1]?.content ?? "",
      responseFormat: options.responseFormat,
      tools: options.tools
    });
  }

  /** Converts provider output into the grade result contract. */
  private gradeFromModelResult(result: PiModelResult, requestId?: string): AnswerGradeResult {
    modelLogger.debug("grading model result received", { tools: result.toolCalls.map((toolCall) => toolCall.name) });
    return normalizeGradeResult(result, requestId);
  }
}

/** Wraps provider failures in the public model-client error prefix. */
function providerRequestError(error: unknown): Error {
  return new Error(`Provider request failed: ${errorMessage(error)}`);
}

/** Converts unknown thrown values into readable messages. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Pulls a few stable concept-like tokens for local chunk sketches. */
function conceptTokens(text: string): string[] {
  const seen = new Set<string>();
  for (const token of text.matchAll(/\b[A-Z]?[a-z][A-Za-z-]{4,}\b/g)) {
    const concept = token[0].toLowerCase();
    if (!seen.has(concept)) seen.add(concept);
    if (seen.size >= 5) break;
  }
  return [...seen];
}
