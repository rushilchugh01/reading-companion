import type {
  ChunkMetrics,
  ReadingChunk,
  ReadingSignals
} from "../shared/reading-types";

/** One visibility sample collected for a chunk in the current viewport pass. */
export type VisibilityObservation = {
  readonly visibleRatio: number;
  readonly observedAt: number;
  readonly previousObservedAt?: number;
  readonly scrollVelocity?: number;
  readonly selected?: boolean;
};

/** Creates deterministic focus and scroll-derived reading signals. */
export function createReadingSignals(input: {
  readonly tabVisible: boolean;
  readonly windowFocused: boolean;
  readonly idleMilliseconds: number;
  readonly scrollDelta: number;
  readonly elapsedMilliseconds: number;
  readonly now: number;
}): ReadingSignals {
  const scrollVelocity = input.elapsedMilliseconds > 0
    ? Math.abs(input.scrollDelta) / input.elapsedMilliseconds
    : 0;

  return {
    tabVisible: input.tabVisible,
    windowFocused: input.windowFocused,
    idleMilliseconds: Math.max(0, input.idleMilliseconds),
    scrollVelocity,
    isFastScrolling: scrollVelocity > 2.4,
    now: input.now
  };
}

/** Updates a chunk's visibility metrics without mutating the original chunk. */
export function updateVisibilityMetrics(
  chunk: ReadingChunk,
  observation: VisibilityObservation
): ChunkMetrics {
  const visibleRatio = clamp01(observation.visibleRatio);
  const previousVisible = chunk.metrics.visibleRatio >= 0.5;
  const currentlyVisible = visibleRatio >= 0.5;
  const elapsed = observation.previousObservedAt === undefined
    ? 0
    : Math.max(0, observation.observedAt - observation.previousObservedAt);

  return {
    visibleRatio,
    visibleMilliseconds: chunk.metrics.visibleMilliseconds
      + (currentlyVisible ? elapsed : 0),
    revisitCount: chunk.metrics.revisitCount
      + (!previousVisible && currentlyVisible ? 1 : 0),
    lastSeenAt: currentlyVisible ? observation.observedAt : chunk.metrics.lastSeenAt,
    scrollVelocity: Math.max(0, observation.scrollVelocity ?? chunk.metrics.scrollVelocity),
    selectionCount: chunk.metrics.selectionCount + (observation.selected ? 1 : 0)
  };
}

/** Returns a copy of a chunk with updated visibility metrics. */
export function applyVisibilityObservation(
  chunk: ReadingChunk,
  observation: VisibilityObservation
): ReadingChunk {
  return { ...chunk, metrics: updateVisibilityMetrics(chunk, observation) };
}

/** Clamps any score-like number into the inclusive zero-to-one interval. */
export function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}
