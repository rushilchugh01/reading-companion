import { describe, expect, it } from "vitest";
import {
  applyVisibilityObservation,
  createReadingSignals,
  isInterventionReady,
  scoreChunk,
  scoreDensity,
  scoreMeaningfulness
} from "../../src/engine";
import type { ReadingChunk } from "../../src/shared/reading-types";

describe("reading scoring", () => {
  it("scores dense meaningful chunks higher than short labels", () => {
    const dense = makeChunk(
      "paragraph",
      "A retrieval practice loop asks readers to recall the claim, compare it with evidence, and revise the model when the evidence does not fit."
    );
    const label = makeChunk("heading", "Notes");

    expect(scoreDensity(dense)).toBeGreaterThan(scoreDensity(label));
    expect(scoreMeaningfulness(dense)).toBeGreaterThan(scoreMeaningfulness(label));
  });

  it("updates visibility and confidence from focused reading signals", () => {
    const chunk = applyVisibilityObservation(makeChunk("paragraph", longText()), {
      visibleRatio: 0.9,
      observedAt: 8_000,
      previousObservedAt: 0,
      scrollVelocity: 0.3,
      selected: true
    });
    const signals = createReadingSignals({
      tabVisible: true,
      windowFocused: true,
      idleMilliseconds: 1_000,
      scrollDelta: 20,
      elapsedMilliseconds: 1_000,
      now: 8_000
    });

    const scores = scoreChunk(chunk, signals);

    expect(chunk.metrics.visibleMilliseconds).toBe(8_000);
    expect(chunk.metrics.revisitCount).toBe(1);
    expect(scores.readingConfidence).toBeGreaterThan(0.5);
  });

  it("suppresses intervention readiness while fast scrolling", () => {
    const chunk = {
      ...makeChunk("paragraph", longText()),
      metrics: {
        visibleRatio: 0.8,
        visibleMilliseconds: 2_000,
        revisitCount: 1,
        scrollVelocity: 3,
        selectionCount: 0
      }
    };
    const signals = createReadingSignals({
      tabVisible: true,
      windowFocused: true,
      idleMilliseconds: 0,
      scrollDelta: 3_000,
      elapsedMilliseconds: 500,
      now: 10_000
    });

    expect(isInterventionReady(chunk, signals)).toBe(false);
    expect(scoreChunk(chunk, signals).interventionReadiness).toBe(0);
  });
});

function makeChunk(kind: ReadingChunk["kind"], text: string): ReadingChunk {
  return {
    id: "chunk",
    hash: "hash",
    heading: "Section",
    text,
    preview: text.slice(0, 160),
    kind,
    order: 0,
    selector: "p:nth-of-type(1)",
    state: "unseen",
    scores: {
      readingConfidence: 0,
      meaningfulness: 0.6,
      interventionReadiness: 0
    },
    metrics: {
      visibleRatio: 0,
      visibleMilliseconds: 0,
      revisitCount: 0,
      scrollVelocity: 0,
      selectionCount: 0
    }
  };
}

function longText(): string {
  return "The reader has spent enough focused time on a conceptually dense passage to make a useful question timely, but not so much time that the system should assume mastery already.";
}
