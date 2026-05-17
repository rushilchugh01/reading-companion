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
import type { GradePromptPayload, QuestionPromptPayload } from "../shared/messages";
import type { CompanionSettings } from "../shared/settings-types";
import type { GradeResult, QuestionGenerationResult, QuestionSession, QuestionStyle } from "../shared/session-types";
import {
  legacyQuestionRecordFromResult,
  normalizeGradeResult,
  normalizeInterventionResult,
  stringField
} from "./model/result-normalizer";
import {
  buildAnswerGradePrompt,
  buildChatPrompt,
  buildGradePrompt,
  buildInterventionPrompt,
  type ModelPromptMessage
} from "./model/prompts";
import { runPiModelRequest, type PiModelResult } from "./pi-model-provider";

type PiRunner = typeof runPiModelRequest;

type ChatCompletionRequest = {
  model: string;
  messages: ModelPromptMessage[];
  temperature: number;
  max_tokens: number;
  response_format?: { type: "json_object" };
  tools?: Array<{ type: "function"; function: { name: string } }>;
};

type ClientOptions = {
  piRunner?: PiRunner;
  now?: () => number;
  idFactory?: () => string;
};

type RequestBuild = {
  url: string;
  init: RequestInit;
  body: ChatCompletionRequest;
};

const STYLE_BY_MODE: Record<CompanionSettings["readGatingMode"], QuestionStyle> = {
  balanced: "why_how",
  look_ahead: "prediction",
  strict: "recall"
};

const LEGACY_QUIET_ACTIONS = new Set<InterventionComposeResult["action"]>([
  "stay_quiet",
  "offer_observation",
  "offer_help"
]);

const modelLogger = createCompanionLogger("model");

/** Trims text to a stable preview length. */
function truncateText(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length).trim()}...` : value;
}

/** Reads a legacy question style when the provider supplied one. */
function styleField(record: Record<string, unknown>): QuestionStyle | undefined {
  const value = record.style;
  const styles = new Set<QuestionStyle>([
    "recall",
    "why_how",
    "prediction",
    "analogy",
    "code_walkthrough",
    "counterexample",
    "compare_contrast",
    "hidden_assumption"
  ]);
  return styles.has(value as QuestionStyle) ? (value as QuestionStyle) : undefined;
}

/** Derives a deterministic fallback chunk id from text. */
function chunkIdFromText(text: string): string {
  let hash = 0;
  for (const character of text) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return `chunk-${hash.toString(16)}`;
}

/** Builds PI-backed OpenAI-compatible requests for question generation and grading. */
export class ModelClient {
  private readonly piRunner: PiRunner;
  private readonly now: () => number;
  private readonly idFactory: () => string;

  /** Creates a model client with injectable PI runner, clock, and id hooks. */
  public constructor(options: ClientOptions = {}) {
    this.piRunner = options.piRunner ?? runPiModelRequest;
    this.now = options.now ?? Date.now;
    this.idFactory = options.idFactory ?? crypto.randomUUID.bind(crypto);
  }

  /** Builds the legacy JSON request shape for config/debug tests. */
  public buildChatRequest(
    provider: CompanionSettings["provider"],
    messages: ModelPromptMessage[]
  ): RequestBuild {
    const tools = [
      { type: "function" as const, function: { name: "ask_question" } },
      { type: "function" as const, function: { name: "grade_answer" } },
      { type: "function" as const, function: { name: "offer_prediction" } },
      { type: "function" as const, function: { name: "offer_observation" } },
      { type: "function" as const, function: { name: "offer_help" } },
      { type: "function" as const, function: { name: "stay_quiet" } }
    ];
    const body = {
      model: provider.model,
      messages,
      temperature: provider.temperature,
      max_tokens: provider.maxTokens,
      response_format: { type: "json_object" as const },
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

  /** Generates a question from a configured model provider. */
  public async generateQuestion(
    payload: QuestionPromptPayload,
    settings: CompanionSettings
  ): Promise<QuestionGenerationResult> {
    try {
      const input = this.questionPayloadToInterventionInput(payload, settings);
      const result = await this.runPrompt(settings, buildInterventionPrompt(input));
      return this.questionFromModelResult(result, payload, input);
    } catch (error) {
      modelLogger.warn("question provider request failed", { error: errorMessage(error) });
      throw providerRequestError(error);
    }
  }

  /** Composes one app-level intervention result from a model provider. */
  public async composeIntervention(
    payload: InterventionComposeInput,
    settings: CompanionSettings
  ): Promise<InterventionComposeResult> {
    try {
      const result = await this.runPrompt(settings, buildInterventionPrompt(payload));
      return normalizeInterventionResult(result, payload);
    } catch (error) {
      modelLogger.warn("intervention provider request failed", { error: errorMessage(error) });
      throw providerRequestError(error);
    }
  }

  /** Grades an answer with a configured model provider. */
  public async gradeAnswer(
    payload: GradePromptPayload,
    settings: CompanionSettings
  ): Promise<GradeResult>;

  /** Grades an answer with the normalized answer grading contract. */
  public async gradeAnswer(
    payload: AnswerGradeInput,
    settings: CompanionSettings
  ): Promise<AnswerGradeResult>;

  /** Grades an answer with either legacy or normalized inputs. */
  public async gradeAnswer(
    payload: GradePromptPayload | AnswerGradeInput,
    settings: CompanionSettings
  ): Promise<GradeResult | AnswerGradeResult> {
    try {
      const messages = isAnswerGradeInput(payload)
        ? buildAnswerGradePrompt(payload)
        : buildGradePrompt(payload);
      const result = await this.runPrompt(settings, messages);
      return this.gradeFromModelResult(result, isAnswerGradeInput(payload) ? payload.requestId : undefined);
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
      const result = await this.runPrompt(settings, buildChatPrompt(payload), { responseFormat: "text", tools: "none" });
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

  /** Builds the legacy question session from normalized text fields. */
  private createQuestionSession(
    payload: QuestionPromptPayload,
    record: Record<string, unknown>
  ): QuestionSession {
    const question = stringField(record, "question");
    const expectedPoint = stringField(record, "expectedPoint");
    if (!question || !expectedPoint) {
      throw new Error("Provider returned an incomplete question payload.");
    }
    return {
      id: this.idFactory(),
      chunkId: payload.opportunity?.targetChunkId ?? chunkIdFromText(payload.chunkText),
      question,
      style: STYLE_BY_MODE[payload.readGatingMode],
      expectedPoint,
      attemptCount: 0,
      createdAt: this.now()
    };
  }

  /** Runs a prepared prompt through the configured PI runner. */
  private async runPrompt(
    settings: CompanionSettings,
    messages: ModelPromptMessage[],
    options: { responseFormat?: "json" | "text"; tools?: "companion" | "none" } = {}
  ): Promise<PiModelResult> {
    return this.piRunner({
      settings,
      systemPrompt: messages[0]?.content ?? "",
      userPrompt: messages[1]?.content ?? "",
      responseFormat: options.responseFormat,
      tools: options.tools
    });
  }

  /** Converts provider output into the legacy question-generation result. */
  private questionFromModelResult(
    result: PiModelResult,
    payload: QuestionPromptPayload,
    input: InterventionComposeInput
  ): QuestionGenerationResult {
    modelLogger.debug("question model result received", { tools: result.toolCalls.map((toolCall) => toolCall.name) });
    const intervention = tryNormalizeIntervention(result, input);
    if (intervention) {
      const sourceRecord = result.toolCalls.length > 0 ? legacyQuestionRecordFromResult(result) : undefined;
      return this.questionFromInterventionResult(intervention, payload, sourceRecord);
    }
    const record = legacyQuestionRecordFromResult(result);
    if (stringField(record, "action") === "stay_quiet") {
      return this.stayQuietResult(record, payload);
    }
    return this.askQuestionResult({
      ...this.createQuestionSession(payload, record),
      style: styleField(record) ?? STYLE_BY_MODE[payload.readGatingMode]
    });
  }

  /** Wraps a question session in the legacy result envelope. */
  private askQuestionResult(session: QuestionSession): QuestionGenerationResult {
    return { action: "ask_question", session };
  }

  /** Builds a legacy stay-quiet result from provider fields. */
  private stayQuietResult(
    record: Record<string, unknown>,
    payload: QuestionPromptPayload
  ): QuestionGenerationResult {
    return {
      action: "stay_quiet",
      createdAt: this.now(),
      nextBestMoment: stringField(record, "nextBestMoment") || undefined,
      reason: stringField(record, "reason") || "The model judged this moment low-value.",
      targetChunkId: stringField(record, "targetChunkId") || payload.opportunity?.targetChunkId
    };
  }

  /** Converts normalized intervention actions back to legacy question results. */
  private questionFromInterventionResult(
    result: InterventionComposeResult,
    payload: QuestionPromptPayload,
    sourceRecord?: Record<string, unknown>
  ): QuestionGenerationResult {
    if (LEGACY_QUIET_ACTIONS.has(result.action)) {
      return this.stayQuietResult({
        reason: result.reasonForApp,
        nextBestMoment: sourceRecord ? stringField(sourceRecord, "nextBestMoment") : undefined,
        targetChunkId: payload.opportunity?.targetChunkId
      }, payload);
    }
    return this.askQuestionResult({
      id: this.idFactory(),
      chunkId: payload.opportunity?.targetChunkId ?? chunkIdFromText(payload.chunkText),
      question: result.userFacingText ?? "",
      style: interventionQuestionStyle(result, payload, sourceRecord),
      expectedPoint: result.expectedAnswer ?? "",
      attemptCount: 0,
      createdAt: this.now()
    });
  }

  /** Adapts a legacy question prompt into the normalized intervention input. */
  private questionPayloadToInterventionInput(
    payload: QuestionPromptPayload,
    settings: CompanionSettings
  ): InterventionComposeInput {
    return {
      requestId: this.idFactory(),
      tabId: 0,
      pageId: payload.heading || "legacy-question",
      contentHash: chunkIdFromText(payload.chunkText),
      chunkId: payload.opportunity?.targetChunkId ?? chunkIdFromText(payload.chunkText),
      page: { title: payload.heading },
      currentPassage: {
        chunkId: payload.opportunity?.targetChunkId ?? chunkIdFromText(payload.chunkText),
        heading: payload.heading,
        text: payload.chunkText,
        preview: truncateText(payload.chunkText, 240)
      },
      readerState: {},
      policy: {
        policyId: payload.opportunity?.policyId ?? settings.interventionPolicy.policyId,
        allowedActions: ["ask_question", "offer_prediction", "stay_quiet"],
        suggestedMoves: payload.opportunity?.suggestedMoves,
        reason: payload.opportunity?.reason,
        confidence: payload.opportunity?.confidence
      },
      companionStyle: {
        personaId: payload.personaId,
        strictness: settings.strictness,
        readGatingMode: payload.readGatingMode
      },
      history: [],
      expiresAt: this.now() + 60_000
    };
  }

  /** Converts provider output into either grade result contract. */
  private gradeFromModelResult(result: PiModelResult, requestId?: string): GradeResult | AnswerGradeResult {
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

/** Distinguishes the normalized grade contract from the legacy prompt payload. */
function isAnswerGradeInput(payload: GradePromptPayload | AnswerGradeInput): payload is AnswerGradeInput {
  return "userAnswer" in payload;
}

/** Returns undefined when a result is a legacy question JSON shape. */
function tryNormalizeIntervention(
  result: PiModelResult,
  input: InterventionComposeInput
): InterventionComposeResult | undefined {
  try {
    return normalizeInterventionResult(result, input);
  } catch {
    return undefined;
  }
}

/** Chooses a legacy question style for normalized intervention results. */
function interventionQuestionStyle(
  result: InterventionComposeResult,
  payload: QuestionPromptPayload,
  sourceRecord?: Record<string, unknown>
): QuestionStyle {
  const sourceStyle = styleField(sourceRecord ?? {});
  if (sourceStyle) return sourceStyle;
  return result.action === "offer_prediction" ? "prediction" : STYLE_BY_MODE[payload.readGatingMode];
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
