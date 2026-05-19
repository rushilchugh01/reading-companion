import { createDefaultSettings } from "@/shared/defaults";
import type { AnswerGradeInput, ChatSendInput, InterventionComposeInput } from "@/shared/intervention-types";
import type { CompanionPackManifest } from "@/shared/companion-pack-schema";
import { ModelClient } from "@/background/model-client";
import { gradingTools, interventionTools } from "@/background/companion-tools";
import { createPiModel, type PiModelResult, type PiRequest } from "@/background/pi-model-provider";

const passageText = "Photosynthesis converts light energy into chemical energy for plants.";
const personaId = "brutal-tutor-dog";

function createClient(piRunner = vi.fn<(request: PiRequest) => Promise<PiModelResult>>()) {
  return new ModelClient({ piRunner });
}

function gradePayload(answer: string): AnswerGradeInput {
  return {
    requestId: "question-1:grade:0",
    sessionId: "question-1",
    attemptNumber: 0,
    chunkId: "chunk-a",
    question: "What does photosynthesis convert?",
    expectedAnswer: "Photosynthesis converts light energy into chemical energy.",
    userAnswer: answer,
    passage: {
      chunkId: "chunk-a",
      heading: "Photosynthesis",
      text: passageText
    },
    companionPackId: "builtin-corgi",
    personaId,
    strictness: "medium"
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
      text: passageText
    },
    readerState: {},
    policy: {
      policyId: "ambient_active_reading_v1",
      allowedActions: ["ask_question", "offer_prediction", "offer_observation", "offer_help", "stay_quiet"]
    },
    companionStyle: { companionPackId: "builtin-corgi", personaId },
    questionGenerationStrategyId: "single_shot_v1",
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
      text: passageText
    },
    companionStyle: { companionPackId: "builtin-corgi", personaId },
    history: [],
    message: "Can you explain that plainly?"
  };
}

function clientPackManifest(): CompanionPackManifest {
  return {
    id: "client-lynx",
    name: "Client Lynx",
    avatar: {
      id: "client-lynx",
      name: "Client Lynx",
      version: "1.0.0",
      species: "lynx",
      animationSlots: {
        idle: [{ id: "lynx-idle", src: "idle.webp", type: "animated-webp", role: "primary" }]
      },
      thresholds: {
        maxIntensity: 2,
        proactiveMotionMinimumMilliseconds: 900,
        backoffQuietMilliseconds: 90_000
      },
      motionProfile: {
        energy: "medium",
        bounce: 0.2,
        gazeTracking: true,
        reducedMotionSlot: "idle"
      }
    },
    persona: {
      systemPrompt: "You are Client Lynx."
    }
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
    expect(request.body.model).toBe("gemini-3.1-pro-preview");
    expect(request.body.max_tokens).toBe(500);
    expect(request.body.tools?.map((tool) => tool.function.name)).toContain("ask_question");
    expect(request.body.tools?.map((tool) => tool.function.name)).not.toContain("grade_answer");
    expect(request.init.headers).toMatchObject({
      "content-type": "application/json",
      authorization: "Bearer "
    });
  });

  it("builds PI model config and tool payloads", () => {
    const settings = createDefaultSettings();
    const model = createPiModel(settings);

    expect(model.api).toBe("openai-completions");
    expect(model.provider).toBe("openai-compatible");
    expect(interventionTools().map((tool) => tool.name)).toEqual([
      "ask_question",
      "offer_prediction",
      "offer_observation",
      "offer_help",
      "stay_quiet"
    ]);
    expect(gradingTools().map((tool) => tool.name)).toEqual(["grade_answer"]);
  });

  it("classifies the proxy as OpenAI-compatible with configurable reasoning", () => {
    const settings = createDefaultSettings();
    settings.provider.model = "gemini-3.1-pro-preview";
    settings.provider.reasoningLevel = "high";

    const model = createPiModel(settings);

    expect(model.api).toBe("openai-completions");
    expect(model.provider).toBe("openai-compatible");
    expect(model.id).toBe("gemini-3.1-pro-preview");
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
    expect(piRunner.mock.calls[0]?.[0]).toMatchObject({ tools: "intervention" });
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

});

describe("ModelClient ranked question strategy validation", () => {
  it("accepts ranked strategy question tool output with metadata", async () => {
    const piRunner = vi.fn<(request: PiRequest) => Promise<PiModelResult>>(() => Promise.resolve({
      text: "",
      toolCalls: [{
        name: "ask_question",
        arguments: {
          userFacingText: "Why does the conversion matter for later plant growth?",
          expectedAnswer: "Stored chemical energy can later support plant growth.",
          questionStrategyId: "candidate_ranked_v1",
          questionDepth: "implication",
          targetIdea: "stored energy supports growth",
          reasoningNeeded: "Infer a downstream consequence of energy storage.",
          petIntent: "curious",
          reasonForApp: "The selected question tests implication rather than recall.",
          confidence: 0.82
        }
      }]
    }));
    const input = {
      ...interventionInput(),
      questionGenerationStrategyId: "candidate_ranked_v1" as const
    };

    await expect(createClient(piRunner).composeIntervention(input, createDefaultSettings()))
      .resolves.toMatchObject({
        action: "ask_question",
        questionStrategyId: "candidate_ranked_v1",
        questionDepth: "implication",
        targetIdea: "stored energy supports growth"
      });
  });

  it("rejects invalid ranked strategy question output with provider error", async () => {
    const piRunner = vi.fn<(request: PiRequest) => Promise<PiModelResult>>(() => Promise.resolve({
      text: "",
      toolCalls: [{
        name: "ask_question",
        arguments: {
          userFacingText: "What is photosynthesis?",
          expectedAnswer: "Photosynthesis converts light energy into chemical energy.",
          petIntent: "curious",
          reasonForApp: "Question approved.",
          confidence: 0.7
        }
      }]
    }));
    const input = {
      ...interventionInput(),
      questionGenerationStrategyId: "candidate_ranked_v1" as const
    };

    await expect(createClient(piRunner).composeIntervention(input, createDefaultSettings()))
      .rejects.toThrow("Provider request failed: candidate_ranked_v1 requires questionDepth.");
  });

});

describe("ModelClient chat path", () => {
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

describe("ModelClient companion pack selection", () => {
  it("sends the selected companion pack persona through the model client", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(clientPackManifest())
    } as Response);
    const piRunner = vi.fn<(request: PiRequest) => Promise<PiModelResult>>(() => Promise.resolve({
      text: "Selected pack reply.",
      toolCalls: []
    }));
    const settings = createDefaultSettings();
    settings.companionPackId = "client-lynx";
    settings.companionPackRegistry = {
      activePackId: "client-lynx",
      entries: [{
        id: "client-lynx",
        name: "Client Lynx",
        version: "1.0.0",
        source: "remote",
        manifestPath: "https://packs.example/client-lynx/companion-pack.json",
        enabled: true
      }]
    };

    await createClient(piRunner).sendChat({
      ...chatPayload(),
      companionStyle: { companionPackId: "client-lynx", personaId }
    }, settings);

    expect(piRunner.mock.calls[0]?.[0].systemPrompt).toContain("You are Client Lynx.");
    expect(fetchMock).toHaveBeenCalledWith("https://packs.example/client-lynx/companion-pack.json");
    fetchMock.mockRestore();
  });
});

describe("ModelClient invalid provider output", () => {
  it("wraps missing intervention tool calls in the provider error contract", async () => {
    const piRunner = vi.fn<(request: PiRequest) => Promise<PiModelResult>>(() => Promise.resolve({
      text: "plain text",
      toolCalls: []
    }));
    const settings = createDefaultSettings();
    settings.provider.apiKey = "secret";

    await expect(createClient(piRunner).composeIntervention(interventionInput(), settings))
      .rejects.toThrow("Provider request failed: Provider did not return a required intervention tool call.");
  });

  it("wraps wrong-route intervention tool calls in the provider error contract", async () => {
    const piRunner = vi.fn<(request: PiRequest) => Promise<PiModelResult>>(() => Promise.resolve({
      text: "",
      toolCalls: [{ name: "grade_answer", arguments: { label: "correct", feedback: "Fine.", shouldRetry: false } }]
    }));
    const settings = createDefaultSettings();

    await expect(createClient(piRunner).composeIntervention(interventionInput(), settings))
      .rejects.toThrow("Provider request failed: Provider returned a non-intervention tool call.");
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
    expect(piRunner.mock.calls[0]?.[0]).toMatchObject({ tools: "grading" });
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

describe("ModelClient grading route tools", () => {
  it("throws a visible provider error when grading returns no tool call", async () => {
    const piRunner = vi.fn<(request: PiRequest) => Promise<PiModelResult>>(() => Promise.resolve({
      text: "Looks correct.",
      toolCalls: []
    }));

    await expect(createClient(piRunner).gradeAnswer(gradePayload("plants"), createDefaultSettings())).rejects.toThrow(
      "Provider request failed: Provider did not return a required grading tool call."
    );
  });

  it("throws a visible provider error when grading returns an intervention tool", async () => {
    const piRunner = vi.fn<(request: PiRequest) => Promise<PiModelResult>>(() => Promise.resolve({
      text: "",
      toolCalls: [{ name: "stay_quiet", arguments: { petIntent: "quiet", reasonForApp: "Wrong route.", confidence: 0.1 } }]
    }));

    await expect(createClient(piRunner).gradeAnswer(gradePayload("plants"), createDefaultSettings())).rejects.toThrow(
      "Provider request failed: Provider returned a non-grading tool call."
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
