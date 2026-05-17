import { describe, expect, it } from "vitest";
import { createReadingSignals, transitionReadingState } from "../../src/engine";
import type { ReadingChunk } from "../../src/shared/reading-types";

describe("reading-state transitions", () => {
  it("moves from unseen to probably read after sustained visibility", () => {
    const chunk = makeChunk({
      visibleMilliseconds: 4_000,
      visibleRatio: 0.85,
      revisitCount: 1,
      scrollVelocity: 0.2,
      selectionCount: 1
    });

    expect(transitionReadingState(chunk, focusedSignals()).state).toBe("probably_read");
  });

  it("marks skimmed when visible time happens during fast movement", () => {
    const chunk = makeChunk({
      visibleMilliseconds: 1_000,
      visibleRatio: 0.5,
      revisitCount: 1,
      scrollVelocity: 2,
      selectionCount: 0
    });

    expect(transitionReadingState(chunk, focusedSignals()).state).toBe("skimmed");
  });

  it("marks abandoned when a lightly seen chunk has been left behind", () => {
    const chunk = makeChunk({
      visibleMilliseconds: 1_000,
      visibleRatio: 0,
      revisitCount: 1,
      lastSeenAt: 1_000,
      scrollVelocity: 0.3,
      selectionCount: 0
    });
    const signals = createReadingSignals({
      tabVisible: true,
      windowFocused: true,
      idleMilliseconds: 0,
      scrollDelta: 0,
      elapsedMilliseconds: 1_000,
      now: 130_000
    });

    expect(transitionReadingState(chunk, signals).state).toBe("abandoned");
  });
});

function makeChunk(metrics: ReadingChunk["metrics"]): ReadingChunk {
  return {
    id: "chunk",
    hash: "hash",
    heading: "State",
    text: "A medium length passage gives the state machine enough substance to score reading confidence from dwell and visibility.",
    preview: "A medium length passage",
    kind: "paragraph",
    order: 0,
    selector: "p:nth-of-type(1)",
    state: "unseen",
    scores: {
      readingConfidence: 0,
      meaningfulness: 0.7,
      interventionReadiness: 0
    },
    metrics
  };
}

function focusedSignals() {
  return createReadingSignals({
    tabVisible: true,
    windowFocused: true,
    idleMilliseconds: 0,
    scrollDelta: 0,
    elapsedMilliseconds: 1_000,
    now: 30_000
  });
}
