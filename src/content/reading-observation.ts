import {
  applyVisibilityObservation,
  createReadingSignals,
  transitionReadingState
} from "../engine";
import type { PetStateKey } from "../shared/companion-types";
import type { ReadingChunk, ReadingSignals } from "../shared/reading-types";

export type SignalTracker = {
  lastScrollY: number;
  lastTime: number;
  lastActivity: number;
  selectedText: string;
};

/** Applies the latest viewport and interaction signals to parsed reading chunks. */
export function updateChunks(
  chunks: ReadingChunk[],
  signals: ReadingSignals,
  selectedText: string
): ReadingChunk[] {
  return chunks.map((chunk) => transitionReadingState(
    applyVisibilityObservation(chunk, {
      observedAt: signals.now,
      previousObservedAt: chunk.metrics.lastSeenAt,
      selected: isChunkSelected(chunk, selectedText),
      scrollVelocity: signals.scrollVelocity,
      visibleRatio: visibleRatioForChunk(chunk)
    }),
    signals
  ));
}

/** Creates mutable signal bookkeeping for one content-runtime mount. */
export function createSignalTracker(): SignalTracker {
  return {
    lastActivity: Date.now(),
    lastScrollY: window.scrollY,
    lastTime: Date.now(),
    selectedText: ""
  };
}

/** Binds page activity listeners that feed the reading signal tracker. */
export function bindActivityTracking(tracker: SignalTracker) {
  const markActive = () => {
    tracker.lastActivity = Date.now();
  };
  const markSelection = () => {
    tracker.selectedText = document.getSelection()?.toString().trim() ?? "";
    markActive();
  };
  window.addEventListener("keydown", markActive);
  window.addEventListener("mousedown", markActive);
  window.addEventListener("mousemove", markActive);
  window.addEventListener("copy", markSelection);
  window.addEventListener("scroll", markActive, { passive: true });
  document.addEventListener("selectionchange", markSelection);
  return () => {
    window.removeEventListener("keydown", markActive);
    window.removeEventListener("mousedown", markActive);
    window.removeEventListener("mousemove", markActive);
    window.removeEventListener("copy", markSelection);
    window.removeEventListener("scroll", markActive);
    document.removeEventListener("selectionchange", markSelection);
  };
}

/** Converts tracker deltas into deterministic reading signals. */
export function readSignals(tracker: SignalTracker): ReadingSignals {
  const now = Date.now();
  const scrollDelta = window.scrollY - tracker.lastScrollY;
  const elapsedMilliseconds = now - tracker.lastTime;
  const signals = createReadingSignals({
    elapsedMilliseconds,
    idleMilliseconds: now - tracker.lastActivity,
    now,
    scrollDelta,
    tabVisible: document.visibilityState === "visible",
    windowFocused: document.hasFocus()
  });
  tracker.lastScrollY = window.scrollY;
  tracker.lastTime = now;
  return signals;
}

/** Selects the ambient pet state implied by the current chunk states. */
export function petStateForChunks(chunks: ReadingChunk[]): PetStateKey {
  return chunks.some((chunk) => chunk.state === "probably_read" || chunk.state === "deep_read")
    ? "reading_detected"
    : "idle";
}

function visibleRatioForChunk(chunk: ReadingChunk): number {
  const element = document.querySelector(chunk.selector);
  if (!element) return 0;
  const rect = element.getBoundingClientRect();
  const visibleTop = Math.max(0, rect.top);
  const visibleBottom = Math.min(window.innerHeight, rect.bottom);
  const visibleHeight = Math.max(0, visibleBottom - visibleTop);
  return rect.height > 0 ? Math.min(1, visibleHeight / rect.height) : 0;
}

function isChunkSelected(chunk: ReadingChunk, selectedText: string): boolean {
  return selectedText.length > 0 && chunk.text.includes(selectedText);
}
