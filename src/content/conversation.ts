import { providerCatalogEntry } from "../shared/provider-catalog";
import type { CompanionSettings } from "../shared/settings-types";
import type { QuestionSession } from "../shared/session-types";
import type { AnswerEvaluation } from "../intervention";
import type { CompanionConversationMessage } from "../ui/types";

type AssistantStatusInput = {
  id: string;
  settings: CompanionSettings;
  status: CompanionConversationMessage["status"];
  text: string;
  timestamp: number;
};

type ConversationState = {
  conversationMessages: CompanionConversationMessage[];
  settings: CompanionSettings;
};

/** Returns the existing PI-shaped transcript for a session, seeding the question if needed. */
export function conversationForSession(
  state: ConversationState,
  session: QuestionSession
): CompanionConversationMessage[] {
  const sessionMessages = state.conversationMessages.filter((message) => message.id.startsWith(`${session.id}:`));
  return sessionMessages.length > 0 ? sessionMessages : [assistantQuestionMessage(session, state.settings)];
}

/** Builds the assistant question as a provider-tagged PI assistant message. */
export function assistantQuestionMessage(
  session: QuestionSession,
  settings: CompanionSettings
): CompanionConversationMessage {
  return assistantTextMessage(`${session.id}:question`, session.question, settings, session.createdAt);
}

/** Builds the user's answer using PI's user message shape plus UI metadata. */
export function userAnswerMessage(
  session: QuestionSession,
  answer: string,
  timestamp: number
): CompanionConversationMessage {
  return {
    id: `${session.id}:answer:${timestamp}`,
    role: "user",
    content: answer,
    status: "sent",
    timestamp
  };
}

/** Builds a temporary assistant status turn for pending or failed grading. */
export function assistantStatusMessage(input: AssistantStatusInput): CompanionConversationMessage {
  return {
    ...assistantTextMessage(input.id, input.text, input.settings, input.timestamp),
    status: input.status
  };
}

/** Builds the assistant feedback turn from the deterministic answer evaluation. */
export function assistantFeedbackMessage(
  id: string,
  evaluation: AnswerEvaluation,
  settings: CompanionSettings
): CompanionConversationMessage {
  return assistantTextMessage(id, assistantFeedbackText(evaluation), settings, Date.now());
}

/** Replaces a pending transcript turn while preserving surrounding conversation order. */
export function replaceConversationMessage(
  messages: CompanionConversationMessage[],
  id: string,
  replacement: CompanionConversationMessage
): CompanionConversationMessage[] {
  return messages.some((message) => message.id === id)
    ? messages.map((message) => message.id === id ? replacement : message)
    : [...messages, replacement];
}

function assistantTextMessage(
  id: string,
  text: string,
  settings: CompanionSettings,
  timestamp: number
): CompanionConversationMessage {
  return {
    id,
    role: "assistant",
    content: [{ type: "text", text }],
    api: providerCatalogEntry(settings.provider.providerId).api,
    provider: providerNameForPi(settings),
    model: settings.provider.model,
    usage: emptyUsage(),
    stopReason: "stop",
    timestamp
  };
}

function assistantFeedbackText(evaluation: AnswerEvaluation): string {
  if (evaluation.action === "hint" && evaluation.hint) {
    return `${evaluation.feedback}\n\nHint: ${evaluation.hint}`;
  }
  if (evaluation.action === "retry" && evaluation.hint) {
    return `${evaluation.feedback}\n\nTry again with this: ${evaluation.hint}`;
  }
  if (evaluation.action === "explanation" && evaluation.explanation) {
    return `${evaluation.feedback}\n\nThe key idea: ${evaluation.explanation}`;
  }
  return evaluation.feedback;
}

function providerNameForPi(settings: CompanionSettings): string {
  if (settings.provider.providerId && settings.provider.providerId !== "custom") return settings.provider.providerId;
  if (settings.provider.baseUrl.includes("openrouter.ai")) return "openrouter";
  return settings.provider.providerName.trim().toLowerCase().replaceAll(/\s+/g, "-") || "custom";
}

function emptyUsage() {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0
    }
  };
}
