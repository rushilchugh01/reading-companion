import { describe, expect, it } from "vitest";
import {
  createCurrentRuntimeSnapshot,
  createInterventionComposePayload,
  createRuntimeMachineSnapshot,
  questionSessionFromIntervention,
  routeRuntimeChatSubmit
} from "../../../src/content/runtime-state";
import { createDefaultSettings } from "../../../src/shared/defaults";
import type { ParserSnapshot, ReadingChunk, ReadingSignals } from "../../../src/shared/reading-types";
import type { PolicyDecision } from "../../../src/intervention";
import type { InterventionComposeResult } from "../../../src/shared/intervention-types";
import type { CompanionConversationMessage } from "../../../src/ui/types";

const chunk = makeChunk();
const settings = createDefaultSettings();
const page = {
  host: "example.com",
  loadedAt: 1_000,
  title: "Runtime Spine",
  url: "https://example.com/docs/runtime?utm_source=test#part"
};
const parser: ParserSnapshot = {
  chunks: [chunk],
  contentType: "html",
  status: "ready"
};
const signals: ReadingSignals = {
  idleMilliseconds: 0,
  isFastScrolling: false,
  now: 12_000,
  scrollVelocity: 0,
  tabVisible: true,
  windowFocused: true
};

describe("content runtime-state compose payload", () => {
  it("builds normalized intervention compose payloads for proactive work", () => {
    const payload = createInterventionComposePayload({
      chunks: [chunk],
      decision: allowedDecision(),
      memory: {
        askedChunkIds: ["old-question"],
        dismissalCount: 1,
        questionsByPage: 1,
        quietedChunkIds: []
      },
      page,
      parser,
      settings,
      signals
    });

    expect(payload).toMatchObject({
      chunkId: "chunk-1",
      currentPassage: { chunkId: "chunk-1", heading: "Overview" },
      questionGenerationStrategyId: "candidate_ranked_v1",
      policy: {
        allowedActions: ["ask_question", "offer_prediction", "offer_observation", "offer_help", "stay_quiet"],
        policyId: settings.interventionPolicy.policyId
      }
    });
    expect(payload.pageId).toMatch(/^page_/);
    expect(payload.expiresAt).toBe(72_000);
  });

  it("adds bounded surrounding passage context around the selected chunk", () => {
    const chunks = [
      makeChunk({ id: "chunk-0", order: 0, text: "Previous setup", preview: "Previous setup", lastSeenAt: 8_000 }),
      makeChunk({ id: "chunk-1", order: 1 }),
      makeChunk({ id: "chunk-2", order: 2, text: "Next consequence", preview: "Next consequence" }),
      makeChunk({ id: "chunk-3", order: 3, text: "Recent earlier idea", preview: "Recent earlier idea", lastSeenAt: 11_500 })
    ];
    const payload = createInterventionComposePayload({
      chunks,
      decision: allowedDecision(chunks[1]),
      memory: {
        askedChunkIds: [],
        dismissalCount: 0,
        questionsByPage: 0,
        quietedChunkIds: []
      },
      page,
      parser: { ...parser, chunks },
      settings,
      signals
    });

    expect(payload.surroundingPassages).toMatchObject({
      previous: [{ chunkId: "chunk-0", text: "Previous setup" }],
      next: [{ chunkId: "chunk-2", text: "Next consequence" }],
      recent: [{ chunkId: "chunk-3", text: "Recent earlier idea" }]
    });
  });

});

describe("content runtime-state intervention mapping", () => {
  it("turns prediction interventions into answerable question sessions", () => {
    expect(questionSessionFromIntervention(predictionResult(), chunk, settings, 12_000)).toMatchObject({
      chunkId: "chunk-1",
      expectedAnswer: "The runtime should queue the next intervention.",
      id: "prediction-1",
      question: "What do you think happens next?",
      questionDepth: "implication",
      questionStrategyId: "candidate_ranked_v1",
      targetIdea: "runtime queue ordering",
      style: "prediction"
    });
  });
});

describe("content runtime-state snapshots", () => {
  it("creates validator snapshots and reducer machine snapshots from runtime state", () => {
    const snapshot = createCurrentRuntimeSnapshot({
      activeChunkId: chunk.id,
      chunks: [chunk],
      conversationMessages: [],
      now: 12_000,
      page,
      petState: "idle"
    });
    const machines = createRuntimeMachineSnapshot({
      chunks: [chunk],
      conversationMessages: [],
      lastDecision: { allowed: true, targetChunkId: chunk.id },
      page,
      parser,
      petState: "about_to_ask"
    });

    expect(snapshot).toMatchObject({
      activeChunkId: "chunk-1",
      chunkId: "chunk-1",
      tabId: 0
    });
    expect(machines.page.value).toBe("ready");
    expect(machines.attention.value).toBe("active_reading");
    expect(machines.intervention.value).toBe("candidate");
    expect(machines.chatRoute).toBe("free_chat");
  });

  it("does not treat completed chat history as an open chat", () => {
    const snapshot = createCurrentRuntimeSnapshot({
      activeChunkId: chunk.id,
      chunks: [chunk],
      conversationMessages: [conversationMessage("sent")],
      now: 12_000,
      page,
      petState: "listening"
    });

    expect(snapshot.chatOpen).toBe(false);
  });

  it("keeps pending freeform chat closed to proactive interventions", () => {
    const snapshot = createCurrentRuntimeSnapshot({
      activeChunkId: chunk.id,
      chunks: [chunk],
      conversationMessages: [conversationMessage("pending")],
      now: 12_000,
      page,
      petState: "thinking"
    });

    expect(snapshot.chatOpen).toBe(true);
  });
});

describe("content runtime-state routing", () => {
  it("routes text submit to free chat without an active question", () => {
    expect(routeRuntimeChatSubmit(undefined)).toBe("free_chat");
    expect(routeRuntimeChatSubmit({
      attemptCount: 0,
      chunkId: "chunk-1",
      createdAt: 1,
      expectedAnswer: "An answer",
      id: "session-1",
      question: "Question?",
      style: "why_how"
    })).toBe("answer");
  });
});

function allowedDecision(selectedChunk = chunk): Extract<PolicyDecision, { allowed: true }> {
  return {
    allowed: true,
    candidate: {
      chunk: selectedChunk,
      createdAt: 12_000,
      reason: "dense_pause",
      score: 0.9
    },
    opportunity: {
      confidence: 0.82,
      policyId: settings.interventionPolicy.policyId,
      reason: "dense_pause",
      suggestedMoves: ["ask_question"],
      suppressedReasons: [],
      targetChunkId: chunk.id
    }
  };
}

function predictionResult(): InterventionComposeResult {
  return {
    action: "offer_prediction",
    confidence: 0.9,
    expectedAnswer: "The runtime should queue the next intervention.",
    expiresAt: 70_000,
    petIntent: "curious",
    questionDepth: "implication",
    questionStrategyId: "candidate_ranked_v1",
    reasonForApp: "prediction is useful",
    targetIdea: "runtime queue ordering",
    requestId: "prediction-1",
    userFacingText: "What do you think happens next?"
  };
}

function conversationMessage(status: CompanionConversationMessage["status"]): CompanionConversationMessage {
  return {
    id: `chat-${status}`,
    role: "assistant",
    content: [{ type: "text", text: "Chat reply" }],
    status,
    timestamp: 12_000
  } as CompanionConversationMessage;
}

function makeChunk(overrides: Partial<ReadingChunk> & { lastSeenAt?: number } = {}): ReadingChunk {
  return {
    hash: "abc123",
    heading: overrides.heading ?? "Overview",
    id: overrides.id ?? "chunk-1",
    kind: "paragraph",
    metrics: {
      lastSeenAt: overrides.lastSeenAt ?? 11_000,
      revisitCount: 0,
      scrollVelocity: 0,
      selectionCount: 0,
      visibleMilliseconds: 9_000,
      visibleRatio: 1
    },
    order: overrides.order ?? 0,
    preview: overrides.preview ?? "The runtime spine queues proactive intervention work.",
    scores: {
      interventionReadiness: 0.9,
      meaningfulness: 0.9,
      readingConfidence: 0.9
    },
    selector: "p:nth-of-type(1)",
    state: "deep_read",
    text: overrides.text ?? "The runtime spine queues proactive intervention work before applying validated results."
  };
}
