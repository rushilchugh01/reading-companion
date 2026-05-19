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

    expect(systemPrompt).toContain("Companion pack: Corgi.");
    expect(systemPrompt).toContain("corgi-like presence");
    expect(systemPrompt).toContain("Companion grading style prompt: Grade with friendly directness.");
  });

  it("uses the selected pack persona for intervention prompts", async () => {
    const registry = remoteRegistry("prompt-owl-intervention");
    const fetchMock = mockPackFetch(packManifest("prompt-owl-intervention", "Intervention Owl"));

    const messages = await buildInterventionPrompt(
      interventionInput("prompt-owl-intervention"),
      registry
    );
    const systemPrompt = messages[0]?.content ?? "";

    expect(systemPrompt).toContain("Companion pack: Intervention Owl.");
    expect(systemPrompt).toContain("You are Intervention Owl, a selected companion.");
    expect(systemPrompt).toContain("Companion interruption style prompt: Interrupt in the selected pack voice.");
    expect(systemPrompt).not.toContain("Companion grading style prompt");
    fetchMock.mockRestore();
  });

  it("keeps grading and chat prompt-specific persona instructions separate", async () => {
    const registry = remoteRegistry("prompt-owl-grade-chat");
    const fetchMock = mockPackFetch(packManifest("prompt-owl-grade-chat", "Prompt Owl"));

    const grading = await buildAnswerGradePrompt(answerGradeInput("prompt-owl-grade-chat"), registry);
    const chat = await buildChatPrompt(chatInput("prompt-owl-grade-chat"), registry);

    expect(grading[0]?.content).toContain("Companion grading style prompt: Grade in the selected pack voice.");
    expect(grading[0]?.content).not.toContain("Companion interruption style prompt");
    expect(chat[0]?.content).toContain("Companion pack: Prompt Owl.");
    expect(chat[0]?.content).not.toContain("Companion grading style prompt");
    expect(chat[0]?.content).not.toContain("Companion interruption style prompt");
    fetchMock.mockRestore();
  });
});

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
