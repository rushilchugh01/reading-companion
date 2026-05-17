import { describe, expect, it } from "vitest";
import {
  scoreAnnoyance,
  scoreCurrentChunkValue,
  scoreReading,
  scoreSkimming,
  scoreStuck,
  detectNaturalPause,
  type ReaderSignalEvidence
} from "../../../src/content/heuristics/reading-signals";

describe("reading signal heuristics", () => {
  it("suppresses reading evidence for inactive tabs, quiet pages, and junk chunks", () => {
    expect(scoreReading(makeEvidence({ tabVisible: false })).score).toBe(0);
    expect(scoreReading(makeEvidence({ pageKind: "search" })).score).toBe(0);
    expect(scoreReading(makeEvidence({
      chunk: makeChunk("Accept all cookies and manage privacy preferences.")
    })).score).toBe(0);
  });

  it("scores focused reading and high skimming deterministically", () => {
    const reading = scoreReading(makeEvidence({
      dwellMilliseconds: 42_000,
      scrollVelocity: 0.05,
      selectionCount: 1
    }));
    const skimming = scoreSkimming(makeEvidence({
      dwellMilliseconds: 800,
      scrollVelocity: 2.8
    }));

    expect(reading.score).toBeGreaterThan(0.55);
    expect(reading.reasons).toContain("Dwell time matches reading pace.");
    expect(skimming.score).toBeGreaterThan(0.65);
  });

  it("suppresses stuck evidence for inactive, chat-open, and quiet page states", () => {
    expect(scoreStuck(makeEvidence({ windowFocused: false })).score).toBe(0);
    expect(scoreStuck(makeEvidence({ chatOpen: true })).score).toBe(0);
    expect(scoreStuck(makeEvidence({ pageKind: "dashboard" })).score).toBe(0);
  });

  it("scores stuck, value, annoyance, and natural pause evidence", () => {
    const evidence = makeEvidence({
      dismissalsLastFiveMinutes: 1,
      dwellMilliseconds: 40_000,
      promptCountLastTenMinutes: 2,
      revisitCount: 3
    });

    expect(scoreStuck(evidence).score).toBeGreaterThan(0.55);
    expect(scoreCurrentChunkValue(evidence).score).toBeGreaterThan(0.45);
    expect(scoreAnnoyance(evidence).score).toBeGreaterThan(0.4);
    expect(detectNaturalPause(evidence)).toMatchObject({ isNaturalPause: true });
  });

  it("gives junk chunks no value but keeps definitions and examples", () => {
    const junk = scoreCurrentChunkValue(makeEvidence({
      chunk: makeChunk("Sponsored: subscribe to the newsletter for more updates.")
    }));
    const valuable = scoreCurrentChunkValue(makeEvidence({
      chunk: makeChunk("A schema is a structured model because it explains how parts fit together. For example, a table schema names each field.")
    }));

    expect(junk.score).toBe(0);
    expect(valuable.score).toBeGreaterThan(0.5);
    expect(valuable.reasons.join(" ")).toContain("definition");
  });
});

/** Creates deterministic signal evidence with focused reading defaults. */
function makeEvidence(overrides: Partial<ReaderSignalEvidence> = {}): ReaderSignalEvidence {
  return {
    chatOpen: false,
    chunk: makeChunk(),
    dismissalsLastFiveMinutes: 0,
    dwellMilliseconds: 12_000,
    idleMilliseconds: 1_000,
    pageKind: "article",
    promptCountLastTenMinutes: 0,
    revisitCount: 1,
    scrollVelocity: 0.1,
    selectionCount: 0,
    tabVisible: true,
    windowFocused: true,
    ...overrides
  };
}

/** Creates a chunk-shaped fixture for signal heuristics. */
function makeChunk(
  text = "The central claim is that retrieval practice works because readers must reconstruct meaning rather than simply reread the same words."
): ReaderSignalEvidence["chunk"] {
  return {
    headingPath: ["Learning"],
    kind: "paragraph",
    text,
    visibleRatio: 0.8
  };
}
