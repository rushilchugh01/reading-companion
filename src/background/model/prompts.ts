import type {
  AnswerGradeInput,
  ChatSendInput,
  InterventionComposeInput
} from "../../shared/intervention-types";
import { loadCompanionPack } from "../../shared/companion-packs";
import type { CompanionPackRegistry } from "../../shared/companion-pack-registry";
import { resolveQuestionGenerationStrategy } from "./question-strategies";

export type ModelPromptMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/** Builds the normalized intervention composition prompt. */
export async function buildInterventionPrompt(
  payload: InterventionComposeInput,
  registry?: CompanionPackRegistry
): Promise<ModelPromptMessage[]> {
  const strategy = resolveQuestionGenerationStrategy(payload.questionGenerationStrategyId);
  return [
    {
      role: "system",
      content: [
        ...(await companionPersonaPrompt(payload.companionStyle.companionPackId, "intervention", registry)),
        "Compose one active-reading intervention by calling exactly one available intervention tool whose name is listed in policy.allowedActions.",
        ...strategy.buildSystemInstructions(payload)
      ].join("\n\n")
    },
    {
      role: "user",
      content: JSON.stringify(strategy.buildUserPayload(payload))
    }
  ];
}

/** Builds the normalized answer grading prompt. */
export async function buildAnswerGradePrompt(
  payload: AnswerGradeInput,
  registry?: CompanionPackRegistry
): Promise<ModelPromptMessage[]> {
  return [
    {
      role: "system",
      content: [
        "Grade the answer to an active-reading prompt.",
        ...(await companionPersonaPrompt(payload.companionPackId, "grading", registry)),
        "Call the grade_answer tool."
      ].join("\n\n")
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "grade_answer",
        requestId: payload.requestId,
        sessionId: payload.sessionId,
        strictness: payload.strictness,
        personaId: payload.personaId,
        question: payload.question,
        expectedAnswer: payload.expectedAnswer,
        questionStrategyId: payload.questionStrategyId,
        questionDepth: payload.questionDepth,
        targetIdea: payload.targetIdea,
        reasoningNeeded: payload.reasoningNeeded,
        answer: payload.userAnswer,
        passage: payload.passage
          ? { ...payload.passage, text: truncatePromptText(payload.passage.text, 4_000) }
          : undefined
      })
    }
  ];
}

/** Builds a natural prose chat prompt without tools or JSON response format. */
export async function buildChatPrompt(
  payload: ChatSendInput,
  registry?: CompanionPackRegistry
): Promise<ModelPromptMessage[]> {
  return [
    {
      role: "system",
      content: [
        "You are a reading companion chatting naturally with the reader.",
        ...(await companionPersonaPrompt(payload.companionStyle.companionPackId, "chat", registry)),
        "Reply in plain prose only. Do not return JSON. Do not call tools.",
        "Keep the answer concise, helpful, and grounded in the visible passage when provided."
      ].join("\n\n")
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "chat_send",
        personaId: payload.companionStyle.personaId,
        page: payload.page,
        currentPassage: payload.currentPassage
          ? { ...payload.currentPassage, text: truncatePromptText(payload.currentPassage.text, 3_000) }
          : undefined,
        history: payload.history.slice(-8),
        message: payload.message
      })
    }
  ];
}

/** Builds persona prompt lines from the selected companion pack. */
async function companionPersonaPrompt(
  companionPackId: string | undefined,
  promptKind: "chat" | "grading" | "intervention",
  registry: CompanionPackRegistry | undefined
): Promise<string[]> {
  const pack = await loadCompanionPack(companionPackId, registry);
  const persona = pack.persona;
  return [
    persona.systemPrompt,
    persona.tone ? `Sound ${persona.tone}.` : undefined,
    persona.boundaries?.length ? persona.boundaries.join(" ") : undefined,
    promptKind === "grading" && persona.gradingStylePrompt
      ? persona.gradingStylePrompt
      : undefined,
    promptKind === "intervention" && persona.interruptionStylePrompt
      ? persona.interruptionStylePrompt
      : undefined,
    "Persona affects reader-facing wording only; policy, tool schemas, safety rules, and provided page context are binding."
  ].filter((line): line is string => Boolean(line));
}

/** Trims long passage text for prompt payloads. */
function truncatePromptText(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length).trim()}...` : value;
}
