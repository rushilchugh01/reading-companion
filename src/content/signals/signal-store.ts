import type { ChunkId, DOMRectLike, PageId } from "../../shared/page-types";

export type ScrollSample = {
  readonly y: number;
  readonly timestamp: number;
};

export type DwellSample = {
  readonly chunkId: ChunkId;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly visibleRatio: number;
};

export type SelectionSample = {
  readonly text: string;
  readonly chunkId?: ChunkId;
  readonly timestamp: number;
};

export type TabVisibilitySample = {
  readonly tabVisible: boolean;
  readonly windowFocused: boolean;
  readonly timestamp: number;
};

export type ViewportSample = {
  readonly width: number;
  readonly height: number;
  readonly timestamp: number;
};

export type ChunkViewportSample = {
  readonly chunkId: ChunkId;
  readonly rect: DOMRectLike;
  readonly visibleRatio: number;
  readonly timestamp: number;
};

export type SignalStoreSnapshot = {
  readonly pageId: PageId;
  readonly scrollSamples: readonly ScrollSample[];
  readonly dwellSamples: readonly DwellSample[];
  readonly selectionSamples: readonly SelectionSample[];
  readonly visibilitySamples: readonly TabVisibilitySample[];
  readonly viewportSamples: readonly ViewportSample[];
  readonly chunkViewportSamples: readonly ChunkViewportSample[];
};

export type SignalStore = {
  readonly pageId: PageId;
  readonly addScroll: (sample: ScrollSample) => SignalStore;
  readonly addDwell: (sample: DwellSample) => SignalStore;
  readonly addSelection: (sample: SelectionSample) => SignalStore;
  readonly addVisibility: (sample: TabVisibilitySample) => SignalStore;
  readonly addViewport: (sample: ViewportSample) => SignalStore;
  readonly addChunkViewport: (sample: ChunkViewportSample) => SignalStore;
  readonly snapshot: () => SignalStoreSnapshot;
};

const DEFAULT_LIMIT = 80;

/** Creates an immutable store for browser evidence signals. */
export function createSignalStore(pageId: PageId, limit = DEFAULT_LIMIT): SignalStore {
  return new ImmutableSignalStore(limit, {
    chunkViewportSamples: [],
    dwellSamples: [],
    pageId,
    scrollSamples: [],
    selectionSamples: [],
    viewportSamples: [],
    visibilitySamples: []
  });
}

/** Computes deterministic scroll velocity from the two latest scroll samples. */
export function getScrollVelocity(samples: readonly ScrollSample[]): number {
  const previous = samples.at(-2);
  const current = samples.at(-1);
  if (!previous || !current) {
    return 0;
  }

  const elapsed = Math.max(1, current.timestamp - previous.timestamp);
  return Math.abs(current.y - previous.y) / elapsed;
}

/** Returns visible dwell time for one chunk across collected dwell samples. */
export function getChunkDwellMilliseconds(
  samples: readonly DwellSample[],
  chunkId: ChunkId
): number {
  return samples
    .filter((sample) => sample.chunkId === chunkId && sample.visibleRatio >= 0.5)
    .reduce((total, sample) => total + Math.max(0, sample.endedAt - sample.startedAt), 0);
}

/** Counts selections associated with a chunk. */
export function getChunkSelectionCount(
  samples: readonly SelectionSample[],
  chunkId: ChunkId
): number {
  return samples.filter((sample) => sample.chunkId === chunkId).length;
}

/** Returns the latest tab/window visibility evidence, defaulting to active. */
export function getLatestVisibility(
  samples: readonly TabVisibilitySample[]
): TabVisibilitySample {
  return samples.at(-1) ?? { tabVisible: true, timestamp: 0, windowFocused: true };
}

/** Appends one sample while retaining the configured history limit. */
function appendLimited<T>(items: readonly T[], item: T, limit: number): readonly T[] {
  return [...items, item].slice(Math.max(0, items.length + 1 - limit));
}

/** Immutable implementation of the browser evidence signal store. */
class ImmutableSignalStore implements SignalStore {
  readonly pageId: PageId;

  /** Stores the immutable snapshot and retention limit. */
  constructor(
    private readonly limit: number,
    private readonly state: SignalStoreSnapshot
  ) {
    this.pageId = state.pageId;
  }

  /** Adds one scroll sample to the immutable store. */
  addScroll(sample: ScrollSample): SignalStore {
    return this.withState({ scrollSamples: appendLimited(this.state.scrollSamples, sample, this.limit) });
  }

  /** Adds one visible-dwell sample to the immutable store. */
  addDwell(sample: DwellSample): SignalStore {
    return this.withState({ dwellSamples: appendLimited(this.state.dwellSamples, sample, this.limit) });
  }

  /** Adds one text-selection sample to the immutable store. */
  addSelection(sample: SelectionSample): SignalStore {
    return this.withState({ selectionSamples: appendLimited(this.state.selectionSamples, sample, this.limit) });
  }

  /** Adds one tab/window visibility sample to the immutable store. */
  addVisibility(sample: TabVisibilitySample): SignalStore {
    return this.withState({ visibilitySamples: appendLimited(this.state.visibilitySamples, sample, this.limit) });
  }

  /** Adds one viewport-size sample to the immutable store. */
  addViewport(sample: ViewportSample): SignalStore {
    return this.withState({ viewportSamples: appendLimited(this.state.viewportSamples, sample, this.limit) });
  }

  /** Adds one chunk viewport-position sample to the immutable store. */
  addChunkViewport(sample: ChunkViewportSample): SignalStore {
    return this.withState({
      chunkViewportSamples: appendLimited(this.state.chunkViewportSamples, sample, this.limit)
    });
  }

  /** Returns the current immutable signal snapshot. */
  snapshot(): SignalStoreSnapshot {
    return this.state;
  }

  /** Creates a new store with a partial snapshot update. */
  private withState(patch: Partial<SignalStoreSnapshot>): SignalStore {
    return new ImmutableSignalStore(this.limit, { ...this.state, ...patch });
  }
}
