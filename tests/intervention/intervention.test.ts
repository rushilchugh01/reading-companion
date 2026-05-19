import { describe, expect, it } from "vitest";
import type { ReadingChunk, ReadingSignals } from "../../src/shared/reading-types";
import type { CompanionSettings } from "../../src/shared/settings-types";
import type { InterventionCandidate, QuestionSession } from "../../src/shared/session-types";
import { createDefaultSettings } from "../../src/shared/defaults";
import {
  createInterventionCandidates,
  createInterventionMemory,
  evaluateAnswer,
  evaluateInterventionPolicy,
  markInterventionDismissed,
  markModelStayedQuiet,
  markQuestionAsked,
  startQuestionSession
} from "../../src/intervention";
import type { InterventionMemory, InterventionPageContext } from "../../src/intervention";

const NOW = 100_000;

describe("intervention policy guardrails", () => {
  it("reports deterministic suppression reasons before asking", () => {
    expect(policyReason({ page: { loadedAt: NOW - 1_000 } })).toBe("page_load");
    expect(policyReason({ signals: { tabVisible: false } })).toBe("inactive_tab");
    expect(policyReason({ signals: { isFastScrolling: true } })).toBe("fast_scroll");
    expect(policyReason({ settings: { hiddenSites: ["example.com"] } })).toBe("disabled_site");
    expect(policyReason({ settings: { hiddenPages: ["https://example.com/a"] } })).toBe(
      "disabled_page"
    );
  });

  it("applies cadence cooldown and page maximums", () => {
    const settings = createSettings({ interventionFrequency: "low" });
    const candidate = makeCandidate();
    const asked = markQuestionAsked(createInterventionMemory(), candidate, NOW - 60_000);
    const cooldown = evaluateInterventionPolicy(makeInput({ settings, memory: asked }));

    expect(cooldown).toMatchObject({ allowed: false, reason: "cooldown" });

    const maxed: InterventionMemory = {
      ...createInterventionMemory(),
      questionsByPage: 1
    };
    const maxQuestions = evaluateInterventionPolicy(makeInput({ settings, memory: maxed }));

    expect(maxQuestions).toMatchObject({ allowed: false, reason: "max_questions_page" });
  });

  it("backs off exponentially after dismissals", () => {
    const once = markInterventionDismissed(createInterventionMemory(), NOW - 119_999);
    const twice = markInterventionDismissed(once, NOW - 200_000);

    expect(evaluateInterventionPolicy(makeInput({ memory: once }))).toMatchObject({
      allowed: false,
      reason: "dismissal_backoff"
    });
    expect(evaluateInterventionPolicy(makeInput({ memory: twice }))).toMatchObject({
      allowed: false,
      reason: "dismissal_backoff"
    });
    expect(evaluateInterventionPolicy(makeInput({ memory: { ...twice, lastDismissedAt: -200_000 } }))).toMatchObject({
      allowed: true
    });
  });

  it("gates unread chunks by configured read-gating mode", () => {
    const strict = createSettings({ readGatingMode: "strict" });
    const lookAhead = createSettings({ readGatingMode: "look_ahead" });
    const candidate = makeCandidate({ readiness: 0.5 });

    expect(evaluateInterventionPolicy(makeInput({ settings: strict, candidates: [candidate] }))).toMatchObject({
      allowed: false,
      reason: "read_gating"
    });
    expect(evaluateInterventionPolicy(makeInput({ settings: lookAhead, candidates: [candidate] }))).toMatchObject({
      allowed: true
    });
  });
});

describe("slottable intervention policies", () => {
  it("returns a rich opportunity from the selected policy pack", () => {
    const decision = evaluateInterventionPolicy(makeInput({
      settings: createSettings({
        interventionPolicy: {
          policyId: "brutal_tutor_dense",
          overrides: { minimumReadingConfidence: 0.3 }
        }
      }),
      candidates: [makeCandidate({ chunk: makeChunk({ kind: "code" }) })]
    }));

    if (!decision.allowed) throw new Error("Expected policy to allow intervention.");
    expect(decision.opportunity.policyId).toBe("brutal_tutor_dense");
    expect(decision.opportunity.reason).toBe("code_walkthrough");
    expect(decision.opportunity.suggestedMoves).toContain("ask_question");
    expect(decision.opportunity.suggestedMoves).toContain("stay_quiet");
  });

  it("allows threshold overrides without replacing the whole policy", () => {
    const lowMeaning = makeCandidate({ chunk: makeChunk({ meaningfulness: 0.3 }) });
    const defaultDecision = evaluateInterventionPolicy(makeInput({ candidates: [lowMeaning] }));
    const overrideDecision = evaluateInterventionPolicy(makeInput({
      settings: createSettings({
        interventionPolicy: {
          policyId: "ambient_active_reading_v1",
          overrides: { minimumMeaningfulness: 0.2 }
        }
      }),
      candidates: [lowMeaning]
    }));

    expect(defaultDecision).toMatchObject({ allowed: false, reason: "low_meaningfulness" });
    expect(overrideDecision).toMatchObject({ allowed: true });
  });
});

describe("candidate and answer lifecycle", () => {
  it("selects stronger candidates before lower scoring read chunks", () => {
    const chunks = [
      makeChunk({ id: "low", order: 1, readiness: 0.6 }),
      makeChunk({ id: "high", order: 2, readiness: 0.95, confidence: 0.95 })
    ];

    expect(createInterventionCandidates(chunks, NOW)[0]?.chunk.id).toBe("high");
  });

  it("does not reselect a chunk after the model chooses to stay quiet", () => {
    const candidate = makeCandidate();
    const memory = markModelStayedQuiet(createInterventionMemory(), candidate);

    expect(evaluateInterventionPolicy(makeInput({ memory, candidates: [candidate] }))).toMatchObject({
      allowed: false,
      reason: "no_candidate"
    });
  });

  it("offers hint, then retry, then explanation and weak concept", () => {
    const chunk = makeChunk();
    const session = makeSession(chunk);
    const partial = evaluateAnswer(makeAnswerInput({ chunk, session, grade: "partially_correct" }));

    expect(partial.action).toBe("hint");
    expect(partial.nextSession?.attemptCount).toBe(1);

    const retry = evaluateAnswer(makeAnswerInput({
      session: partial.nextSession as QuestionSession,
      grade: "handwavy",
      now: NOW + 1
    }));

    expect(retry.action).toBe("retry");
    expect(retry.nextSession?.attemptCount).toBe(2);

    const final = evaluateAnswer(makeAnswerInput({
      session: retry.nextSession as QuestionSession,
      answer: "nope",
      grade: "missed_key_point",
      now: NOW + 2
    }));

    expect(final.action).toBe("explanation");
    expect(final.weakConcept).toMatchObject({
      concept: "Heading",
      sourceUrl: "https://example.com/a",
      gradingResult: "missed_key_point",
      userAnswer: "nope",
      reviewed: false
    });
  });
});

function policyReason(overrides: {
  settings?: Partial<CompanionSettings>;
  page?: Partial<InterventionPageContext>;
  signals?: Partial<ReadingSignals>;
}): string | undefined {
  const decision = evaluateInterventionPolicy(makeInput(overrides));
  return decision.allowed ? undefined : decision.reason;
}

function makeAnswerInput(overrides: {
  chunk?: ReadingChunk;
  session: QuestionSession;
  answer?: string;
  grade: "partially_correct" | "handwavy" | "missed_key_point";
  now?: number;
}) {
  return {
    session: overrides.session,
    answer: overrides.answer ?? "still vague",
    grade: {
      label: overrides.grade,
      feedback: overrides.grade,
      hint: "Name the mechanism.",
      missedPoint: "The mechanism matters."
    },
    chunk: overrides.chunk ?? makeChunk(),
    page: makePage(),
    personaId: "teacher",
    now: overrides.now ?? NOW
  };
}

function makeInput(overrides: {
  settings?: Partial<CompanionSettings>;
  page?: Partial<InterventionPageContext>;
  signals?: Partial<ReadingSignals>;
  memory?: InterventionMemory;
  candidates?: InterventionCandidate[];
}) {
  return {
    settings: createSettings(overrides.settings),
    page: { ...makePage(), ...overrides.page },
    signals: { ...makeSignals(), ...overrides.signals },
    memory: overrides.memory ?? createInterventionMemory(),
    candidates: overrides.candidates ?? [makeCandidate()]
  };
}

function createSettings(overrides: Partial<CompanionSettings> = {}): CompanionSettings {
  return {
    ...createDefaultSettings(),
    ...overrides
  };
}

function makePage(overrides: Partial<InterventionPageContext> = {}): InterventionPageContext {
  return {
    url: "https://example.com/a",
    title: "Example",
    host: "example.com",
    loadedAt: NOW - 20_000,
    ...overrides
  };
}

function makeSignals(overrides: Partial<ReadingSignals> = {}): ReadingSignals {
  return {
    tabVisible: true,
    windowFocused: true,
    idleMilliseconds: 0,
    scrollVelocity: 0,
    isFastScrolling: false,
    now: NOW,
    ...overrides
  };
}

function makeCandidate(overrides: { readiness?: number; chunk?: ReadingChunk } = {}): InterventionCandidate {
  const chunk = overrides.chunk ?? makeChunk({ readiness: overrides.readiness });
  return {
    chunk,
    reason: "test",
    score: 1,
    createdAt: NOW
  };
}

function makeSession(chunk = makeChunk()): QuestionSession {
  return startQuestionSession({
    chunk,
    question: "What matters?",
    expectedAnswer: "The mechanism matters.",
    style: "recall",
    now: NOW
  });
}

function makeChunk(overrides: {
  id?: string;
  order?: number;
  readiness?: number;
  confidence?: number;
  kind?: ReadingChunk["kind"];
  meaningfulness?: number;
} = {}): ReadingChunk {
  return {
    id: overrides.id ?? "chunk-1",
    hash: "hash",
    heading: "Heading",
    text: "A useful paragraph about mechanisms and outcomes.",
    preview: "A useful paragraph.",
    kind: overrides.kind ?? "paragraph",
    order: overrides.order ?? 1,
    selector: "#chunk-1",
    state: "probably_read",
    scores: {
      readingConfidence: overrides.confidence ?? 0.8,
      meaningfulness: overrides.meaningfulness ?? 0.8,
      interventionReadiness: overrides.readiness ?? 0.8
    },
    metrics: {
      visibleRatio: 1,
      visibleMilliseconds: 20_000,
      revisitCount: 1,
      lastSeenAt: NOW,
      scrollVelocity: 0,
      selectionCount: 0
    }
  };
}
