import type { QuestionSessionState } from "./question-session";
import { isAnswerableSession } from "./question-session";

export type ChatSubmitRoute = "answer" | "selection_help" | "free_chat";

export type ChatSubmitContext = {
  questionSession: QuestionSessionState;
  hasSelectionContext: boolean;
};

/** Routes chat submissions to the active question, selection help, or free chat. */
export function routeChatSubmit(context: ChatSubmitContext): ChatSubmitRoute {
  if (isAnswerableSession(context.questionSession)) {
    return "answer";
  }

  if (context.hasSelectionContext) {
    return "selection_help";
  }

  return "free_chat";
}
