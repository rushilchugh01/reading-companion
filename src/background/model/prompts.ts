import type {
  AnswerGradeInput,
  ChatSendInput,
  InterventionComposeInput
} from "../../shared/intervention-types";

export type ModelPromptMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/** Builds the normalized intervention composition prompt. */
export function buildInterventionPrompt(payload: InterventionComposeInput): ModelPromptMessage[] {
  return [
    {
      role: "system",
      content: [
        "Compose one normalized active-reading intervention for the app.",
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
export function buildAnswerGradePrompt(payload: AnswerGradeInput): ModelPromptMessage[] {
  return [
    {
      role: "system",
      content: [
        "Grade the answer to an active-reading prompt.",
        "Use the grade_answer tool or return JSON with label, feedback, hint, missedPoint, and shouldRetry."
      ].join(" ")
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
        answer: payload.userAnswer,
        passage: payload.passage
          ? { ...payload.passage, text: truncatePromptText(payload.passage.text, 4_000) }
          : undefined
      })
    }
  ];
}

/** Builds a natural prose chat prompt without tools or JSON response format. */
export function buildChatPrompt(payload: ChatSendInput): ModelPromptMessage[] {
  return [
    {
      role: "system",
      content: [
        "You are a reading companion chatting naturally with the reader.",
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
