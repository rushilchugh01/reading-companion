import { describe, expect, it, vi } from "vitest";
import {
  buildAnswerGradePrompt,
  buildChatPrompt,
  buildInterventionPrompt
} from "../../../src/background/model/prompts";
import type { CompanionPackManifest } from "../../../src/shared/companion-pack-schema";
import type { CompanionPackRegistry } from "../../../src/shared/companion-pack-registry";
import type {
  AnswerGradeInput,
  ChatSendInput,
  InterventionComposeInput
} from "../../../src/shared/intervention-types";

describe("model prompt companion packs", () => {
  it("uses the default corgi persona when no registry override is selected", async () => {
    const messages = await buildAnswerGradePrompt(answerGradeInput("builtin-corgi"));
    const systemPrompt = messages[0]?.content ?? "";

    expect(systemPrompt).toContain("corgi-like presence");
    expect(systemPrompt).toContain("Sound sarcastic, brutal, fair, and brief.");
    expect(systemPrompt).toContain("Grade with brutal fairness and dry humor.");
    expect(systemPrompt).toContain("Call the grade_answer tool.");
    expect(systemPrompt).not.toContain("return JSON");
  });

  it("uses the selected pack persona for intervention prompts", async () => {
    const registry = remoteRegistry("prompt-owl-intervention");
    const fetchMock = mockPackFetch(packManifest("prompt-owl-intervention", "Intervention Owl"));

    const messages = await buildInterventionPrompt(
      interventionInput("prompt-owl-intervention"),
      registry
    );
    const systemPrompt = messages[0]?.content ?? "";

    expect(systemPrompt).toContain("You are Intervention Owl, a selected companion.");
    expect(systemPrompt).toContain("Interrupt in the selected pack voice.");
    expect(systemPrompt).toContain("calling exactly one available intervention tool");
    expect(systemPrompt).not.toContain("Grade in the selected pack voice.");
    fetchMock.mockRestore();
  });

  it("keeps grading and chat prompt-specific persona instructions separate", async () => {
    const registry = remoteRegistry("prompt-owl-grade-chat");
    const fetchMock = mockPackFetch(packManifest("prompt-owl-grade-chat", "Prompt Owl"));

    const grading = await buildAnswerGradePrompt(answerGradeInput("prompt-owl-grade-chat"), registry);
    const chat = await buildChatPrompt(chatInput("prompt-owl-grade-chat"), registry);

    expect(grading[0]?.content).toContain("Grade in the selected pack voice.");
    expect(grading[0]?.content).not.toContain("Interrupt in the selected pack voice.");
    expect(chat[0]?.content).toContain("You are Prompt Owl, a selected companion.");
    expect(chat[0]?.content).not.toContain("Grade in the selected pack voice.");
    expect(chat[0]?.content).not.toContain("Interrupt in the selected pack voice.");
    fetchMock.mockRestore();
  });

});

describe("model prompt question strategies", () => {
  it("includes selected strategy id and ranked instructions in intervention prompts", async () => {
    const input = {
      ...interventionInput("builtin-corgi"),
      questionGenerationStrategyId: "candidate_ranked_v1" as const
    };
    const messages = await buildInterventionPrompt(input);
    const userPayload = JSON.parse(messages[1]?.content ?? "{}") as Record<string, unknown>;

    expect(messages[0]?.content).toContain("internally generate 3-5 candidate questions");
    expect(messages[0]?.content).toContain("calling exactly one available intervention tool");
    expect(userPayload.strategyId).toBe("candidate_ranked_v1");
    expect(userPayload.schema).toBeUndefined();
    expect(userPayload.strategy).toMatchObject({ id: "candidate_ranked_v1" });
    expect(userPayload.depthTaxonomy).toEqual(expect.arrayContaining(["hidden_assumption", "transfer"]));
  });

});

describe("model prompt passage context", () => {
  it("keeps passage truncation bounded while preserving persona guidance", async () => {
    const input = {
      ...interventionInput("builtin-corgi"),
      currentPassage: {
        chunkId: "chunk-1",
        text: "A".repeat(5_000)
      },
      surroundingPassages: {
        previous: [{ chunkId: "chunk-0", text: "B".repeat(3_000) }],
        next: [{ chunkId: "chunk-2", text: "C".repeat(3_000) }],
        recent: [{ chunkId: "chunk-3", text: "D".repeat(3_000) }]
      }
    };
    const messages = await buildInterventionPrompt(input);
    const userPayload = interventionUserPayload(messages);
    const surrounding = userPayload.surroundingPassages;

    expect(messages[0]?.content).toContain("corgi-like presence");
    expect(userPayload.currentPassage?.text?.length).toBeLessThanOrEqual(4_003);
    expect(surrounding.previous[0]?.text.length).toBeLessThanOrEqual(1_803);
    expect(surrounding.next[0]?.text.length).toBeLessThanOrEqual(903);
    expect(surrounding.recent[0]?.text.length).toBeLessThanOrEqual(1_203);
  });

  it("builds sketch_then_rank_v1 prompts with shared context", async () => {
    const input = {
      ...interventionInput("builtin-corgi"),
      questionGenerationStrategyId: "sketch_then_rank_v1" as const,
      surroundingPassages: {
        previous: [{ chunkId: "chunk-0", text: "The setup defines the retry budget." }],
        next: [],
        recent: []
      }
    };
    const messages = await buildInterventionPrompt(input);
    const userPayload = JSON.parse(messages[1]?.content ?? "{}") as Record<string, unknown>;

    expect(messages[0]?.content).toContain("Silently sketch the local argument");
    expect(userPayload.strategyId).toBe("sketch_then_rank_v1");
    expect(userPayload.surroundingPassages).toMatchObject({
      previous: [{ chunkId: "chunk-0" }]
    });
  });
});

type InterventionUserPayload = {
  currentPassage?: { text?: string };
  surroundingPassages: {
    previous: Array<{ chunkId?: string; text: string }>;
    next: Array<{ chunkId?: string; text: string }>;
    recent: Array<{ chunkId?: string; text: string }>;
  };
};

function interventionUserPayload(messages: Array<{ content: string }>): InterventionUserPayload {
  return JSON.parse(messages[1]?.content ?? "{}") as InterventionUserPayload;
}

function answerGradeInput(companionPackId: string): AnswerGradeInput {
  return {
    requestId: "grade-1",
    sessionId: "question-1",
    attemptNumber: 0,
    chunkId: "chunk-1",
    question: "What changed?",
    expectedAnswer: "Light became stored energy.",
    userAnswer: "Light became energy.",
    companionPackId,
    personaId: "legacy-persona",
    strictness: "medium"
  };
}

function interventionInput(companionPackId: string): InterventionComposeInput {
  return {
    requestId: "intervention-1",
    tabId: 1,
    pageId: "page-1",
    contentHash: "hash-1",
    chunkId: "chunk-1",
    page: { title: "Energy" },
    currentPassage: { chunkId: "chunk-1", text: "Light becomes stored chemical energy." },
    readerState: {},
    policy: { allowedActions: ["ask_question"], policyId: "ambient_active_reading_v1" },
    companionStyle: { companionPackId, personaId: "legacy-persona" },
    questionGenerationStrategyId: "single_shot_v1",
    history: [],
    expiresAt: 2
  };
}

function chatInput(companionPackId: string): ChatSendInput {
  return {
    requestId: "chat-1",
    page: { title: "Energy" },
    companionStyle: { companionPackId, personaId: "legacy-persona" },
    history: [],
    message: "Explain this."
  };
}

function remoteRegistry(packId: string): CompanionPackRegistry {
  return {
    activePackId: packId,
    entries: [{
      id: packId,
      name: packId,
      version: "1.0.0",
      source: "remote",
      manifestPath: `https://packs.example/${packId}/companion-pack.json`,
      enabled: true
    }]
  };
}

function mockPackFetch(manifest: CompanionPackManifest) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(manifest)
  } as Response);
}

function packManifest(id: string, name: string): CompanionPackManifest {
  return {
    id,
    name,
    avatar: {
      id,
      name,
      version: "1.0.0",
      species: "owl",
      animationSlots: {
        idle: [{ id: `${id}-idle`, src: "idle.webp", type: "animated-webp", role: "primary" }]
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
      systemPrompt: `You are ${name}, a selected companion.`,
      gradingStylePrompt: "Grade in the selected pack voice.",
      interruptionStylePrompt: "Interrupt in the selected pack voice."
    }
  };
}
