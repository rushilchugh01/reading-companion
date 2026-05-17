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
      policy: {
        allowedActions: ["ask_question", "offer_prediction", "offer_observation", "offer_help", "stay_quiet"],
        policyId: settings.interventionPolicy.policyId
      }
    });
    expect(payload.pageId).toMatch(/^page_/);
    expect(payload.expiresAt).toBe(72_000);
  });

});

describe("content runtime-state intervention mapping", () => {
  it("turns prediction interventions into answerable question sessions", () => {
    expect(questionSessionFromIntervention(predictionResult(), chunk, settings, 12_000)).toMatchObject({
      chunkId: "chunk-1",
      expectedPoint: "The runtime should queue the next intervention.",
      id: "prediction-1",
      question: "What do you think happens next?",
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
});

describe("content runtime-state routing", () => {
  it("routes text submit to free chat without an active question", () => {
    expect(routeRuntimeChatSubmit(undefined)).toBe("free_chat");
    expect(routeRuntimeChatSubmit({
      attemptCount: 0,
      chunkId: "chunk-1",
      createdAt: 1,
      expectedPoint: "An answer",
      id: "session-1",
      question: "Question?",
      style: "why_how"
    })).toBe("answer");
  });
});

function allowedDecision(): Extract<PolicyDecision, { allowed: true }> {
  return {
    allowed: true,
    candidate: {
      chunk,
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
    reasonForApp: "prediction is useful",
    requestId: "prediction-1",
    userFacingText: "What do you think happens next?"
  };
}

function makeChunk(): ReadingChunk {
  return {
    hash: "abc123",
    heading: "Overview",
    id: "chunk-1",
    kind: "paragraph",
    metrics: {
      lastSeenAt: 11_000,
      revisitCount: 0,
      scrollVelocity: 0,
      selectionCount: 0,
      visibleMilliseconds: 9_000,
      visibleRatio: 1
    },
    order: 0,
    preview: "The runtime spine queues proactive intervention work.",
    scores: {
      interventionReadiness: 0.9,
      meaningfulness: 0.9,
      readingConfidence: 0.9
    },
    selector: "p:nth-of-type(1)",
    state: "deep_read",
    text: "The runtime spine queues proactive intervention work before applying validated results."
  };
}
