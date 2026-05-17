import type {
  ChunkReadingState,
  ReadingChunk,
  ReadingSignals
} from "../shared/reading-types";
import { scoreChunk } from "./scoring";

/** Advances a chunk through deterministic reading-state transitions. */
export function transitionReadingState(
  chunk: ReadingChunk,
  signals: ReadingSignals
): ReadingChunk {
  const scores = scoreChunk(chunk, signals);
  const state = getNextReadingState(chunk, scores.readingConfidence, signals);
  return { ...chunk, scores, state };
}

/** Calculates the next state label for a chunk without mutating it. */
export function getNextReadingState(
  chunk: ReadingChunk,
  readingConfidence: number,
  signals: ReadingSignals
): ChunkReadingState {
  if (shouldMarkAbandoned(chunk, signals)) {
    return "abandoned";
  }

  if (shouldMarkConfused(chunk, signals)) {
    return "stuck_or_confused";
  }

  if (readingConfidence >= 0.86) {
    return "deep_read";
  }

  if (readingConfidence >= 0.58) {
    return "probably_read";
  }

  if (chunk.metrics.visibleMilliseconds > 0 && chunk.metrics.scrollVelocity > 1.8) {
    return "skimmed";
  }

  if (chunk.metrics.visibleMilliseconds > 0 || chunk.metrics.visibleRatio > 0) {
    return "seen";
  }

  return chunk.state === "unseen" ? "unseen" : chunk.state;
}

function shouldMarkConfused(chunk: ReadingChunk, signals: ReadingSignals): boolean {
  return chunk.metrics.revisitCount >= 3
    && chunk.metrics.visibleMilliseconds > 20_000
    && chunk.scores.meaningfulness >= 0.45
    && signals.idleMilliseconds < 45_000;
}

function shouldMarkAbandoned(chunk: ReadingChunk, signals: ReadingSignals): boolean {
  if (chunk.state === "deep_read" || chunk.state === "probably_read") {
    return false;
  }

  const lastSeenAt = chunk.metrics.lastSeenAt;
  return lastSeenAt !== undefined
    && signals.now - lastSeenAt > 120_000
    && chunk.metrics.visibleMilliseconds < 2_500;
}
