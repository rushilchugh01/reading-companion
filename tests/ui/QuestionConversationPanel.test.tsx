import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CompanionPetApp } from "@/ui";
import type { QuestionSession } from "@/shared/session-types";
import type { CompanionConversationMessage } from "@/ui";

const questionSession: QuestionSession = {
  id: "question-1",
  attemptCount: 0,
  chunkId: "chunk-1",
  createdAt: 1,
  expectedAnswer: "The premise changed.",
  question: "What caused this to happen?",
  style: "why_how"
};

describe("Question conversation panel", () => {
  it("renders PI-shaped user and assistant conversation messages", async () => {
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

    expect(await screen.findByRole("log", { name: "Question conversation" })).toBeInTheDocument();
    expect(screen.getByText("Because the premise changed.")).toBeInTheDocument();
    expect(screen.getByText("Right, that change is the hinge.")).toBeInTheDocument();
  });

  it("renders supported PI tool-call content in the conversation", async () => {
    render(
      <CompanionPetApp
        questionSession={questionSession}
        conversationMessages={[
          assistantToolCallMessage("question-1:tool-question", {
            expectedAnswer: "The premise changed.",
            question: "Which detail changed the premise?",
            style: "why_how",
            targetChunkId: "chunk-1"
          })
        ]}
      />
    );

    expect(await screen.findByText("Which detail changed the premise?")).toBeInTheDocument();
  });

  it("keeps a completed transcript visible with follow-up chat input", async () => {
    const onAnswerSubmit = vi.fn();
    render(
      <CompanionPetApp
        onAnswerSubmit={onAnswerSubmit}
        conversationMessages={[
          assistantMessage("question-1:question", "What caused this to happen?"),
          userMessage("question-1:answer", "Because the premise changed."),
          assistantMessage("question-1:feedback", "Right, that change is the hinge.")
        ]}
      />
    );

    expect(await screen.findByRole("log", { name: "Question conversation" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Type a quick answer...")).not.toBeInTheDocument();
    const input = screen.getByLabelText("Ask a follow-up...");
    fireEvent.change(input, { target: { value: "Can you say that another way?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(onAnswerSubmit).toHaveBeenCalledWith("Can you say that another way?");
  });

});

describe("Question conversation transcript scrolling", () => {
  it("scrolls the transcript to the newest message", async () => {
    const { rerender } = render(
      <CompanionPetApp
        questionSession={questionSession}
        conversationMessages={[
          assistantMessage("question-1:question", "What caused this to happen?")
        ]}
      />
    );
    const transcript = await screen.findByRole("log", { name: "Question conversation" });
    Object.defineProperty(transcript, "scrollHeight", { configurable: true, value: 640 });
    transcript.scrollTop = 0;

    rerender(
      <CompanionPetApp
        questionSession={questionSession}
        conversationMessages={[
          assistantMessage("question-1:question", "What caused this to happen?"),
          userMessage("question-1:answer", "Because the premise changed."),
          assistantMessage("question-1:feedback", "Right, that change is the hinge.")
        ]}
      />
    );

    await waitFor(() => expect(transcript.scrollTop).toBe(640));
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
