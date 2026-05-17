import { createDefaultSettings } from "@/shared/defaults";
import type { ChatSendInput, InterventionComposeInput } from "@/shared/intervention-types";
import type { GradePromptPayload, QuestionPromptPayload } from "@/shared/messages";
import { ModelClient } from "@/background/model-client";
import { companionTools } from "@/background/companion-tools";
import { createPiModel, enforceJsonPayload, type PiModelResult, type PiRequest } from "@/background/pi-model-provider";

const questionPayload: QuestionPromptPayload = {
  chunkText: "Photosynthesis converts light energy into chemical energy for plants.",
  heading: "Photosynthesis",
  personaId: "brutal-tutor-dog",
  readGatingMode: "balanced"
};

function createClient(piRunner = vi.fn<(request: PiRequest) => Promise<PiModelResult>>()) {
  return new ModelClient({
    piRunner,
    now: () => 1_700_000_000_000,
    idFactory: () => "question-1"
  });
}

function gradePayload(answer: string): GradePromptPayload {
  return {
    answer,
    chunkText: questionPayload.chunkText,
    personaId: questionPayload.personaId,
    strictness: "medium",
    session: {
      id: "question-1",
      chunkId: "chunk-a",
      question: "What does photosynthesis convert?",
      style: "recall",
      expectedPoint: "Photosynthesis converts light energy into chemical energy.",
      attemptCount: 0,
      createdAt: 1
    }
  };
}

/** Creates a normalized intervention input for model-client tests. */
function interventionInput(): InterventionComposeInput {
  return {
    requestId: "intervention-1",
    tabId: 7,
    pageId: "page-1",
    contentHash: "hash-1",
    chunkId: "chunk-a",
    page: { title: "Photosynthesis" },
    currentPassage: {
      chunkId: "chunk-a",
      heading: "Photosynthesis",
      text: questionPayload.chunkText
    },
    readerState: {},
    policy: {
      policyId: "ambient_active_reading_v1",
      allowedActions: ["ask_question", "offer_prediction", "offer_observation", "offer_help", "stay_quiet"]
    },
    companionStyle: { personaId: questionPayload.personaId },
    history: [],
    expiresAt: 1_700_000_060_000
  };
}

/** Creates a chat-send input for natural prose tests. */
function chatPayload(): ChatSendInput {
  return {
    requestId: "chat-1",
    page: { title: "Photosynthesis" },
    currentPassage: {
      chunkId: "chunk-a",
      text: questionPayload.chunkText
    },
    companionStyle: { personaId: questionPayload.personaId },
    history: [],
    message: "Can you explain that plainly?"
  };
}

describe("ModelClient", () => {
  it("constructs an OpenAI-compatible proxy request", () => {
    const settings = createDefaultSettings();
    const client = createClient();
    const request = client.buildChatRequest(settings.provider, [
      { role: "user", content: "hello" }
    ]);

    expect(request.url).toBe("http://127.0.0.1:8318/v1/chat/completions");
    expect(request.body.model).toBe("gemini-3-flash-preview");
    expect(request.body.max_tokens).toBe(500);
    expect(request.body.tools?.map((tool) => tool.function.name)).toContain("ask_question");
    expect(request.body.tools?.map((tool) => tool.function.name)).toContain("grade_answer");
    expect(request.init.headers).toMatchObject({
      "content-type": "application/json",
      authorization: "Bearer "
    });
  });

  it("builds PI model config and tool payloads", () => {
    const settings = createDefaultSettings();
    const model = createPiModel(settings);
    const payload = enforceJsonPayload({ model: "x", tools: [] });

    expect(model.api).toBe("openai-completions");
    expect(model.provider).toBe("openai-compatible");
    expect(companionTools().map((tool) => tool.name)).toEqual([
      "ask_question",
      "offer_prediction",
      "offer_observation",
      "offer_help",
      "stay_quiet",
      "grade_answer",
    ]);
    expect(payload).toMatchObject({ response_format: { type: "json_object" } });
  });

  it("classifies the proxy as OpenAI-compatible with configurable reasoning", () => {
    const settings = createDefaultSettings();
    settings.provider.model = "gemini-3-flash-preview";
    settings.provider.reasoningLevel = "high";

    const model = createPiModel(settings);

    expect(model.api).toBe("openai-completions");
    expect(model.provider).toBe("openai-compatible");
    expect(model.id).toBe("gemini-3-flash-preview");
  });

  it("builds a native PI model for Anthropic settings", () => {
    const settings = createDefaultSettings();
    settings.provider.providerId = "anthropic";
    settings.provider.providerName = "Anthropic";
    settings.provider.baseUrl = "https://api.anthropic.com";
    settings.provider.model = "claude-sonnet-4-6";

    const model = createPiModel(settings);

    expect(model.api).toBe("anthropic-messages");
    expect(model.provider).toBe("anthropic");
    expect(model.baseUrl).toBe("https://api.anthropic.com");
  });
});

describe("ModelClient intervention composition", () => {
  it("normalizes an observation tool result", async () => {
    const piRunner = vi.fn<(request: PiRequest) => Promise<PiModelResult>>(() => Promise.resolve({
      text: "",
      toolCalls: [{
        name: "offer_observation",
        arguments: {
          userFacingText: "Key point: the plant stores captured light as chemical energy.",
          observationType: "key_point",
          petIntent: "sharp_notice",
          reasonForApp: "The passage states the central mechanism.",
          confidence: 0.84
        }
      }]
    }));
    const result = await createClient(piRunner).composeIntervention(interventionInput(), createDefaultSettings());

    expect(result).toMatchObject({
      action: "offer_observation",
      observationType: "key_point",
      petIntent: "sharp_notice",
      requestId: "intervention-1"
    });
  });

  it("rejects action payloads that miss required fields", async () => {
    const piRunner = vi.fn<(request: PiRequest) => Promise<PiModelResult>>(() => Promise.resolve({
      text: "",
      toolCalls: [{
        name: "ask_question",
        arguments: {
          userFacingText: "What changes form?",
          petIntent: "curious",
          reasonForApp: "Question approved.",
          confidence: 0.7
        }
      }]
    }));

    await expect(createClient(piRunner).composeIntervention(interventionInput(), createDefaultSettings()))
      .rejects.toThrow("Provider request failed: ask_question requires expectedAnswer.");
  });

  it("keeps chat_send on the natural prose path", async () => {
    const piRunner = vi.fn<(request: PiRequest) => Promise<PiModelResult>>(() => Promise.resolve({
      text: "It means the plant turns light into stored chemical energy.",
      toolCalls: []
    }));
    const result = await createClient(piRunner).sendChat(chatPayload(), createDefaultSettings());

    expect(result.text).toBe("It means the plant turns light into stored chemical energy.");
    expect(piRunner.mock.calls[0]?.[0]).toMatchObject({
      responseFormat: "text",
      tools: "none"
    });
  });
});

describe("ModelClient generation", () => {
  it("uses the ask_question tool response when an API key is configured", async () => {
    const piRunner = vi.fn<(request: PiRequest) => Promise<PiModelResult>>(() => Promise.resolve({
      text: "",
      toolCalls: [{
        name: "ask_question",
        arguments: {
          question: "What changes form in photosynthesis?",
          expectedPoint: "Light energy becomes chemical energy.",
          style: "recall",
          targetChunkId: "chunk-a"
        }
      }]
    }));
    const settings = createDefaultSettings();
    settings.provider.apiKey = "secret";

    const result = await createClient(piRunner).generateQuestion(questionPayload, settings);

    expect(piRunner).toHaveBeenCalledOnce();
    expect(piRunner.mock.calls[0]?.[0].userPrompt).toContain("Photosynthesis");
    expect(result.action).toBe("ask_question");
    if (result.action !== "ask_question") throw new Error("Expected question result.");
    const { session: question } = result;
    expect(question.question).toBe("What changes form in photosynthesis?");
    expect(question.expectedPoint).toBe("Light energy becomes chemical energy.");
    expect(question.style).toBe("recall");
  });

  it("allows custom OpenAI-compatible question generation without an API key", async () => {
    const piRunner = vi.fn<(request: PiRequest) => Promise<PiModelResult>>(() => Promise.resolve({
      text: "",
      toolCalls: [{
        name: "ask_question",
        arguments: {
          expectedPoint: "Light energy becomes chemical energy.",
          question: "What changes form in photosynthesis?",
          style: "recall"
        }
      }]
    }));

    await expect(createClient(piRunner).generateQuestion(
      questionPayload,
      createDefaultSettings()
    )).resolves.toMatchObject({ action: "ask_question" });

    expect(piRunner).toHaveBeenCalledOnce();
  });

});

describe("ModelClient legacy question compatibility", () => {
  it("normalizes new intervention ask_question fields for legacy callers", async () => {
    const piRunner = vi.fn<(request: PiRequest) => Promise<PiModelResult>>(() => Promise.resolve({
      text: "",
      toolCalls: [{
        name: "ask_question",
        arguments: {
          userFacingText: "What energy conversion is happening?",
          expectedAnswer: "Light energy becomes chemical energy.",
          petIntent: "curious",
          reasonForApp: "The passage contains a core claim.",
          confidence: 0.9
        }
      }]
    }));
    const result = await createClient(piRunner).generateQuestion(questionPayload, createDefaultSettings());

    expect(result.action).toBe("ask_question");
    if (result.action !== "ask_question") throw new Error("Expected question result.");
    expect(result.session.question).toBe("What energy conversion is happening?");
    expect(result.session.expectedPoint).toBe("Light energy becomes chemical energy.");
  });
});

describe("ModelClient generation provider errors", () => {
  it("lets hosted question generation reach the provider without an API key", async () => {
    const piRunner = vi.fn<(request: PiRequest) => Promise<PiModelResult>>(() => Promise.reject(new Error("provider rejected auth")));
    const settings = createDefaultSettings();
    settings.provider.providerId = "anthropic";

    await expect(createClient(piRunner).generateQuestion(questionPayload, settings))
      .rejects.toThrow("Provider request failed: provider rejected auth");

    expect(piRunner).toHaveBeenCalledOnce();
  });

  it("throws a visible provider error when the provider returns an incomplete question", async () => {
    const piRunner = vi.fn<(request: PiRequest) => Promise<PiModelResult>>(() => Promise.resolve({
      text: "",
      toolCalls: [{ name: "ask_question", arguments: { question: "What changes form?" } }]
    }));
    const settings = createDefaultSettings();
    settings.provider.apiKey = "secret";

    await expect(createClient(piRunner).generateQuestion(questionPayload, settings)).rejects.toThrow(
      "Provider request failed: Provider returned an incomplete question payload."
    );
  });

  it("throws a visible provider error when configured question generation fails", async () => {
    const piRunner = vi.fn<(request: PiRequest) => Promise<PiModelResult>>(() => Promise.reject(new Error("offline")));
    const settings = createDefaultSettings();
    settings.provider.apiKey = "secret";

    await expect(createClient(piRunner).generateQuestion(questionPayload, settings)).rejects.toThrow("Provider request failed: offline");

    expect(piRunner).toHaveBeenCalledOnce();
  });
});

describe("ModelClient invalid provider output", () => {
  it("wraps invalid JSON text in the provider error contract", async () => {
    const piRunner = vi.fn<(request: PiRequest) => Promise<PiModelResult>>(() => Promise.resolve({
      text: "not-json",
      toolCalls: []
    }));
    const settings = createDefaultSettings();
    settings.provider.apiKey = "secret";

    await expect(createClient(piRunner).generateQuestion(questionPayload, settings))
      .rejects.toThrow("Provider request failed:");
  });
});

describe("ModelClient quiet generation", () => {
  it("returns stay_quiet when the model chooses silence", async () => {
    const piRunner = vi.fn<(request: PiRequest) => Promise<PiModelResult>>(() => Promise.resolve({
      text: "",
      toolCalls: [{
        name: "stay_quiet",
        arguments: {
          reason: "This candidate is not worth interrupting yet.",
          nextBestMoment: "after the section checkpoint"
        }
      }]
    }));
    const settings = createDefaultSettings();
    settings.provider.apiKey = "secret";

    const result = await createClient(piRunner).generateQuestion(questionPayload, settings);

    expect(result).toMatchObject({
      action: "stay_quiet",
      reason: "This candidate is not worth interrupting yet.",
      nextBestMoment: "after the section checkpoint"
    });
  });
});

describe("ModelClient grading", () => {
  it("throws a visible provider error when configured grading fails", async () => {
    const piRunner = vi.fn<(request: PiRequest) => Promise<PiModelResult>>(() => Promise.reject(new Error("offline")));
    const settings = createDefaultSettings();
    settings.provider.apiKey = "secret";

    await expect(createClient(piRunner).gradeAnswer(
      gradePayload("It turns light energy into chemical energy."),
      settings
    )).rejects.toThrow("Provider request failed: offline");

    expect(piRunner).toHaveBeenCalledOnce();
  });

  it("uses the grade_answer tool result when available", async () => {
    const piRunner = vi.fn<(request: PiRequest) => Promise<PiModelResult>>(() => Promise.resolve({
      text: "",
      toolCalls: [{
        name: "grade_answer",
        arguments: {
          label: "missed_key_point",
          feedback: "You missed the energy conversion.",
          missedPoint: "Light energy becomes chemical energy.",
          shouldRetry: true
        }
      }]
    }));
    const settings = createDefaultSettings();
    settings.provider.apiKey = "secret";

    const result = await createClient(piRunner).gradeAnswer(gradePayload("plants"), settings);

    expect(result.label).toBe("missed_key_point");
    expect(result.feedback).toBe("You missed the energy conversion.");
    expect(result.missedPoint).toBe("Light energy becomes chemical energy.");
  });

  it("throws a visible provider error when the provider returns an incomplete grade", async () => {
    const piRunner = vi.fn<(request: PiRequest) => Promise<PiModelResult>>(() => Promise.resolve({
      text: "",
      toolCalls: [{ name: "grade_answer", arguments: { label: "handwavy" } }]
    }));
    const settings = createDefaultSettings();
    settings.provider.apiKey = "secret";

    await expect(createClient(piRunner).gradeAnswer(gradePayload("plants"), settings)).rejects.toThrow(
      "Provider request failed: Provider returned an incomplete grading payload."
    );
  });

});

describe("ModelClient grading without API keys", () => {
  it("allows custom OpenAI-compatible grading without an API key", async () => {
    const piRunner = vi.fn<(request: PiRequest) => Promise<PiModelResult>>(() => Promise.resolve({
      text: "",
      toolCalls: [{
        name: "grade_answer",
        arguments: {
          feedback: "That identifies the conversion.",
          label: "correct"
        }
      }]
    }));

    await expect(createClient(piRunner).gradeAnswer(
      gradePayload("It turns light energy into chemical energy."),
      createDefaultSettings()
    )).resolves.toMatchObject({ label: "correct" });

    expect(piRunner).toHaveBeenCalledOnce();
  });

  it("lets hosted grading reach the provider without an API key", async () => {
    const piRunner = vi.fn<(request: PiRequest) => Promise<PiModelResult>>(() => Promise.reject(new Error("provider rejected auth")));
    const settings = createDefaultSettings();
    settings.provider.providerId = "anthropic";

    await expect(createClient(piRunner).gradeAnswer(gradePayload("stuff"), settings))
      .rejects.toThrow("Provider request failed: provider rejected auth");

    expect(piRunner).toHaveBeenCalledOnce();
  });
});
