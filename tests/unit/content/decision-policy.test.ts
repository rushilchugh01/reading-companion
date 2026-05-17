import { describe, expect, it } from "vitest";
import type { ContentDecisionInput } from "../../../src/content/runtime-state";
import {
  evaluateContentDecisionPolicy,
  setCooldown
} from "../../../src/content/runtime-state";

const NOW = 100_000;

describe("content decision policy gates", () => {
  it("blocks when the page is not ready", () => {
    expectDenied({ page: { value: "scanning", kind: "article" } }, "page_not_ready");
  });

  it("blocks non-askable page kinds", () => {
    expectDenied({ page: { value: "ready", kind: "feed" } }, "non_askable_page");
  });

  it("blocks weak attention", () => {
    expectDenied({ attention: { value: "skimming" } }, "attention_not_ready");
  });

  it("blocks proactive prompts during chat, snooze, or hidden states", () => {
    expectDenied({ interaction: { value: "chat_open" } }, "interaction_suppressed");
    expectDenied({ interaction: { value: "snoozed" } }, "interaction_suppressed");
    expectDenied({ interaction: { value: "hidden" } }, "interaction_suppressed");
  });

  it("blocks intervention cooldown state", () => {
    expectDenied({ intervention: { value: "cooldown" } }, "intervention_cooldown");
  });

  it("blocks junk chunks", () => {
    expectDenied({ chunk: { ...baseInput().chunk, isJunk: true } }, "junk_chunk");
  });

  it("blocks chunks below the page-kind threshold", () => {
    expectDenied({
      page: { value: "ready", kind: "docs" },
      chunk: { ...baseInput().chunk, valueScore: 0.71 }
    }, "chunk_below_threshold");
  });

  it("blocks high annoyance", () => {
    expectDenied({ annoyanceScore: 0.55 }, "annoyance_high");
  });

  it("blocks moments without a natural pause", () => {
    expectDenied({ naturalPause: false }, "no_natural_pause");
  });

  it("blocks page prompt limits", () => {
    expectDenied({ pagePromptCount: 2, maxPromptsPerPage: 2 }, "page_limit");
  });
});

describe("content decision policy cooldown gates", () => {
  it("blocks global, same-chunk, same-page, and channel cooldowns", () => {
    expectDenied({
      cooldowns: testCooldown("all_proactive")
    }, "cooldown_all_proactive");
    expectDenied({
      cooldowns: testCooldown("same_chunk")
    }, "cooldown_same_chunk");
    expectDenied({
      cooldowns: testCooldown("same_page")
    }, "cooldown_same_page");
    expectDenied({
      cooldowns: testCooldown("questions")
    }, "cooldown_questions");
  });
});

describe("content decision policy candidates", () => {
  it("allows a positive question candidate", () => {
    expect(evaluateContentDecisionPolicy(baseInput())).toMatchObject({
      allowed: true,
      candidateKind: "question",
      channel: "questions",
      targetChunkId: "chunk-a"
    });
  });

  it("selects help, observation, and prediction candidates by priority", () => {
    expect(evaluateContentDecisionPolicy(withChunk({ stuckScore: 0.9 }))).toMatchObject({
      allowed: true,
      candidateKind: "help"
    });
    expect(evaluateContentDecisionPolicy(withChunk({ hasContradiction: true }))).toMatchObject({
      allowed: true,
      candidateKind: "observation"
    });
    expect(evaluateContentDecisionPolicy(withChunk({ setsUpNextClaim: true }))).toMatchObject({
      allowed: true,
      candidateKind: "prediction"
    });
  });

  it("lets global dismissal cooldown beat an otherwise strong candidate", () => {
    expect(evaluateContentDecisionPolicy(withChunk({
      hasContradiction: true,
      cooldowns: testCooldown("all_proactive", 10_000)
    }))).toEqual({
      allowed: false,
      reason: "cooldown_all_proactive"
    });
  });

  it("blocks insight cooldown for observations while help can still pass", () => {
    expect(evaluateContentDecisionPolicy(withChunk({
      hasContradiction: true,
      cooldowns: testCooldown("insights", 10_000)
    }))).toEqual({
      allowed: false,
      reason: "cooldown_insights"
    });
    expect(evaluateContentDecisionPolicy(withChunk({
      stuckScore: 0.9,
      cooldowns: testCooldown("insights", 10_000)
    }))).toMatchObject({
      allowed: true,
      candidateKind: "help"
    });
  });
});

/** Builds a single active cooldown for decision tests. */
function testCooldown(
  channel: Parameters<typeof setCooldown>[1]["channel"],
  durationMs = 1_000
) {
  return setCooldown({}, { channel, now: NOW, durationMs });
}

/** Expects the decision policy to deny an input with the named reason. */
function expectDenied(
  overrides: Partial<ContentDecisionInput>,
  reason: Exclude<ReturnType<typeof evaluateContentDecisionPolicy>, { allowed: true }>["reason"]
) {
  expect(evaluateContentDecisionPolicy({ ...baseInput(), ...overrides })).toEqual({
    allowed: false,
    reason
  });
}

/** Builds a default passing decision input. */
function baseInput(): ContentDecisionInput {
  return {
    now: NOW,
    page: { value: "ready", kind: "article" },
    attention: { value: "active_reading" },
    interaction: { value: "pet_visible" },
    intervention: { value: "silent" },
    chunk: {
      id: "chunk-a",
      valueScore: 0.8,
      isJunk: false
    },
    annoyanceScore: 0.2,
    naturalPause: true,
    pagePromptCount: 0,
    maxPromptsPerPage: 2,
    cooldowns: {}
  };
}

/** Builds a passing input with chunk and top-level overrides. */
function withChunk(
  overrides: Partial<ContentDecisionInput["chunk"]> & Partial<ContentDecisionInput>
): ContentDecisionInput {
  const input = baseInput();
  return {
    ...input,
    ...overrides,
    chunk: {
      ...input.chunk,
      ...overrides
    }
  };
}
