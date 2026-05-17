import type { PageKind } from "../../shared/page-types";
import { compileChatContext, sanitizeContext, type CompiledChatContext } from "./chat-context";

export type AnswerGradeContextInput = {
  readonly pageTitle: string;
  readonly pageKind: PageKind;
  readonly currentPassage: string;
  readonly headingPath: readonly string[];
  readonly previousContext?: string;
  readonly readerState: string;
  readonly whyThisMatters: string;
  readonly companionStyle: string;
  readonly allowedMoves: readonly string[];
  readonly question: string;
  readonly answer: string;
};

/** Compiles context for grading a reader answer without leaking internal runtime fields. */
export function compileAnswerGradeContext(input: AnswerGradeContextInput): CompiledChatContext {
  const base = compileChatContext(input);
  const text = sanitizeContext([
    base.text,
    `Question: ${input.question}`,
    `Reader answer: ${input.answer}`,
    "Output contract: Grade the answer against the passage, name one strength, name one gap, and suggest a next step."
  ].join("\n"));

  return { sections: text.split("\n"), text };
}
