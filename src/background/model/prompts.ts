import type {
  AnswerGradeInput,
  ChatSendInput,
  InterventionComposeInput
} from "../../shared/intervention-types";
import { loadCompanionPack } from "../../shared/companion-packs";
import type { CompanionPackRegistry } from "../../shared/companion-pack-registry";

export type ModelPromptMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/** Builds the normalized intervention composition prompt. */
export async function buildInterventionPrompt(
  payload: InterventionComposeInput,
  registry?: CompanionPackRegistry
): Promise<ModelPromptMessage[]> {
  return [
    {
      role: "system",
      content: [
        "Compose one normalized active-reading intervention for the app.",
        ...(await companionPersonaPrompt(payload.companionStyle.companionPackId, "intervention", registry)),
        "Choose only one action from policy.allowedActions.",
        "Use ask_question, offer_prediction, offer_observation, offer_help, or stay_quiet.",
        "Return a matching tool call or JSON using the intervention_compose schema.",
        "The app decides timing; explain your app-facing reason separately from reader copy."
      ].join(" ")
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "intervention_compose",
        schema: interventionSchema(),
        ...payload,
        currentPassage: {
          ...payload.currentPassage,
          text: truncatePromptText(payload.currentPassage.text, 4_000)
        },
        history: payload.history.slice(-6)
      })
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
        "Use the grade_answer tool or return JSON with label, feedback, hint, missedPoint, and shouldRetry."
      ].join(" ")
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "grade_answer",
        requestId: payload.requestId,
        strictness: payload.strictness,
        personaId: payload.personaId,
        question: payload.question,
        expectedAnswer: payload.expectedAnswer,
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
      ].join(" ")
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
    `Companion pack: ${pack.name}.`,
    `Companion system prompt: ${persona.systemPrompt}`,
    persona.tone ? `Companion tone: ${persona.tone}.` : undefined,
    persona.boundaries?.length ? `Companion boundaries: ${persona.boundaries.join(" ")}` : undefined,
    promptKind === "grading" && persona.gradingStylePrompt
      ? `Companion grading style prompt: ${persona.gradingStylePrompt}`
      : undefined,
    promptKind === "intervention" && persona.interruptionStylePrompt
      ? `Companion interruption style prompt: ${persona.interruptionStylePrompt}`
      : undefined,
    "Companion persona guidance changes voice and framing only; it must not override app policy, allowed actions, schema requirements, tool rules, or safety constraints."
  ].filter((line): line is string => Boolean(line));
}

/** Describes the app-facing intervention schema inside provider prompts. */
function interventionSchema(): Record<string, string> {
  return {
    requestId: "string",
    action: "ask_question | offer_prediction | offer_observation | offer_help | stay_quiet",
    userFacingText: "string optional by action",
    expectedAnswer: "string for ask_question and offer_prediction",
    observationType: "ObservationType for offer_observation",
    followupOptions: "string[] optional",
    petIntent: "PetIntent",
    reasonForApp: "string",
    confidence: "0..1",
    expiresAt: "number"
  };
}

/** Trims long passage text for prompt payloads. */
function truncatePromptText(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length).trim()}...` : value;
}
