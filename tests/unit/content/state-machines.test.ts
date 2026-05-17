import { describe, expect, it } from "vitest";
import {
  ACTIVE_READING_ENTER_MS,
  ACTIVE_READING_EXIT_MS,
  createAttentionState,
  createInteractionState,
  createInterventionState,
  createQuestionSessionState,
  routeChatSubmit,
  suppressesAllInteraction,
  suppressesProactivePrompts,
  transitionAttentionState,
  transitionInteractionState,
  transitionInterventionState,
  transitionPageState,
  transitionQuestionSessionState
} from "../../../src/content/runtime-state";

describe("content page state", () => {
  it("classifies askable, quiet, scanning, inactive, and unsupported pages", () => {
    expect(pageState({ kind: "article" })).toBe("ready");
    expect(pageState({ kind: "feed" })).toBe("quiet");
    expect(pageState({ parserStatus: "scanning" })).toBe("scanning");
    expect(pageState({ visible: false })).toBe("inactive");
    expect(pageState({ kind: "unsupported", parserStatus: "unsupported" })).toBe("unsupported");
  });
});

describe("attention state hysteresis", () => {
  it("requires sustained high score before entering active reading", () => {
    const initial = createAttentionState("not_reading", 0);
    const candidate = transitionAttentionState(initial, attentionEvidence({ now: 1_000 }));
    const active = transitionAttentionState(candidate, attentionEvidence({
      now: 1_000 + ACTIVE_READING_ENTER_MS
    }));

    expect(candidate.value).toBe("reading_candidate");
    expect(active.value).toBe("active_reading");
  });

  it("requires sustained low score before exiting active reading", () => {
    const active = createAttentionState("active_reading", 0);
    const stillActive = transitionAttentionState(active, attentionEvidence({
      now: 2_000,
      readingScore: 0.1
    }));
    const exited = transitionAttentionState(stillActive, attentionEvidence({
      now: 2_000 + ACTIVE_READING_EXIT_MS,
      readingScore: 0.1
    }));

    expect(stillActive.value).toBe("active_reading");
    expect(exited.value).toBe("not_reading");
  });

  it("marks away, note taking, done, and stuck from direct evidence", () => {
    expect(transitionAttentionState(
      createAttentionState(),
      attentionEvidence({ visible: false })
    ).value).toBe("away");
    expect(transitionAttentionState(
      createAttentionState(),
      attentionEvidence({ noteTaking: true })
    ).value).toBe("note_taking");
    expect(transitionAttentionState(
      createAttentionState(),
      attentionEvidence({ done: true })
    ).value).toBe("done");
    expect(transitionAttentionState(
      createAttentionState("active_reading"),
      attentionEvidence({ stuckScore: 0.9 })
    ).value).toBe("stuck");
  });
});

describe("interaction and intervention state", () => {
  it("applies proactive and all-interaction suppression rules", () => {
    const chat = transitionInteractionState(createInteractionState(), { type: "open_chat", now: 1 });
    const snoozed = transitionInteractionState(chat, { type: "snooze", now: 2, until: 10 });
    const hidden = transitionInteractionState(snoozed, { type: "hide", now: 3 });

    expect(suppressesProactivePrompts(chat)).toBe(true);
    expect(suppressesProactivePrompts(snoozed)).toBe(true);
    expect(suppressesAllInteraction(hidden)).toBe(true);
  });

  it("moves intervention candidates through prompt and cooldown", () => {
    const candidate = transitionInterventionState(
      createInterventionState(),
      { type: "candidate_found", now: 1, candidateId: "chunk-1" }
    );
    const queued = transitionInterventionState(candidate, { type: "queue", now: 2 });
    const prompting = transitionInterventionState(queued, { type: "prompt", now: 3 });
    const cooldown = transitionInterventionState(prompting, { type: "cooldown", now: 4, until: 10 });

    expect(candidate.value).toBe("candidate");
    expect(queued.value).toBe("queued");
    expect(prompting.value).toBe("prompting");
    expect(cooldown.value).toBe("cooldown");
  });
});

describe("question session and chat routing", () => {
  it("marks an active session stale on page change", () => {
    const active = startSession();
    const stale = transitionQuestionSessionState(active, {
      type: "page_changed",
      now: 2,
      pageId: "page-b"
    });

    expect(stale.value).toBe("stale");
  });

  it("accepts only matching session and attempt grades", () => {
    const pending = transitionQuestionSessionState(startSession(), {
      type: "submit_answer",
      now: 2,
      sessionId: "session-1"
    });
    const staleGrade = transitionQuestionSessionState(pending, {
      type: "grade",
      now: 3,
      sessionId: "session-1",
      attempt: 2,
      grade: "correct"
    });
    const correctGrade = transitionQuestionSessionState(pending, {
      type: "grade",
      now: 4,
      sessionId: "session-1",
      attempt: 1,
      grade: "correct"
    });

    expect(staleGrade.value).toBe("answer_pending");
    expect(correctGrade.value).toBe("graded_correct");
  });

  it("routes active questions before selection help and free chat", () => {
    expect(routeChatSubmit({
      questionSession: startSession(),
      hasSelectionContext: true
    })).toBe("answer");
    expect(routeChatSubmit({
      questionSession: createQuestionSessionState(),
      hasSelectionContext: true
    })).toBe("selection_help");
    expect(routeChatSubmit({
      questionSession: createQuestionSessionState(),
      hasSelectionContext: false
    })).toBe("free_chat");
  });
});

/** Builds a page state value from default ready-page evidence. */
function pageState(overrides: Partial<Parameters<typeof transitionPageState>[0]> = {}) {
  return transitionPageState({
    kind: "article",
    now: 1,
    visible: true,
    focused: true,
    parserStatus: "ready",
    readableChunkCount: 3,
    ...overrides
  }).value;
}

/** Builds attention evidence with a high reading score by default. */
function attentionEvidence(
  overrides: Partial<Parameters<typeof transitionAttentionState>[1]> = {}
) {
  return {
    now: 1,
    readingScore: 0.8,
    visible: true,
    focused: true,
    ...overrides
  };
}

/** Starts a stable question session for reducer tests. */
function startSession() {
  return transitionQuestionSessionState(createQuestionSessionState(), {
    type: "start",
    now: 1,
    sessionId: "session-1",
    pageId: "page-a",
    chunkId: "chunk-a"
  });
}
