import { fireEvent, render, screen } from "@testing-library/react";
import { CompanionPetApp } from "@/ui";
import type { QuestionSession } from "@/shared/session-types";
import type { CompanionConversationMessage } from "@/ui";

const questionSession: QuestionSession = {
  id: "question-1",
  attemptCount: 0,
  chunkId: "chunk-1",
  createdAt: 1,
  expectedPoint: "The premise changed.",
  question: "What caused this to happen?",
  style: "why_how"
};

describe("Question conversation panel", () => {
  it("renders PI-shaped user and assistant conversation messages", () => {
    render(
      <CompanionPetApp
        questionSession={questionSession}
        conversationMessages={[
          assistantMessage("question-1:question", "What caused this to happen?"),
          userMessage("question-1:answer", "Because the premise changed."),
          assistantMessage("question-1:feedback", "Right, that change is the hinge.")
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open reading companion" }));

    expect(screen.getByRole("log", { name: "Question conversation" })).toBeInTheDocument();
    expect(screen.getByText("Because the premise changed.")).toBeInTheDocument();
    expect(screen.getByText("Right, that change is the hinge.")).toBeInTheDocument();
  });

  it("renders supported PI tool-call content in the conversation", () => {
    render(
      <CompanionPetApp
        questionSession={questionSession}
        conversationMessages={[
          assistantToolCallMessage("question-1:tool-question", {
            expectedPoint: "The premise changed.",
            question: "Which detail changed the premise?",
            style: "why_how",
            targetChunkId: "chunk-1"
          })
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open reading companion" }));

    expect(screen.getByText("Which detail changed the premise?")).toBeInTheDocument();
  });

  it("keeps a completed transcript visible without accepting more answers", () => {
    render(
      <CompanionPetApp
        conversationMessages={[
          assistantMessage("question-1:question", "What caused this to happen?"),
          userMessage("question-1:answer", "Because the premise changed."),
          assistantMessage("question-1:feedback", "Right, that change is the hinge.")
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open reading companion" }));

    expect(screen.getByRole("log", { name: "Question conversation" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Type a quick answer...")).not.toBeInTheDocument();
  });
});

function userMessage(id: string, text: string): CompanionConversationMessage {
  return {
    id,
    role: "user",
    content: text,
    status: "sent",
    timestamp: 1
  };
}

function assistantMessage(id: string, text: string): CompanionConversationMessage {
  return {
    id,
    role: "assistant",
    content: text ? [{ type: "text", text }] : [],
    api: "openai-completions",
    provider: "openai",
    model: "test-model",
    usage: testUsage(),
    stopReason: "stop",
    timestamp: 1
  };
}

function assistantToolCallMessage(id: string, argumentsRecord: Record<string, unknown>): CompanionConversationMessage {
  return {
    id,
    role: "assistant",
    content: [{
      type: "toolCall",
      id: "tool-1",
      name: "ask_question",
      arguments: argumentsRecord
    }],
    api: "openai-completions",
    provider: "openai",
    model: "test-model",
    usage: testUsage(),
    stopReason: "toolUse",
    timestamp: 1
  };
}

function testUsage() {
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
