import type { PageKind, ReadableChunk } from "../../shared/page-types";
import { isQuietPageKind } from "../observe/page-kind-classifier";
import { classifyChunkJunk, scoreChunkValue } from "./junk-filter";

export type ReaderSignalEvidence = {
  readonly tabVisible: boolean;
  readonly windowFocused: boolean;
  readonly chatOpen?: boolean;
  readonly pageKind: PageKind;
  readonly chunk: Pick<ReadableChunk, "text" | "headingPath" | "kind" | "visibleRatio">;
  readonly dwellMilliseconds: number;
  readonly scrollVelocity: number;
  readonly selectionCount: number;
  readonly revisitCount: number;
  readonly idleMilliseconds: number;
  readonly dismissalsLastFiveMinutes?: number;
  readonly promptCountLastTenMinutes?: number;
};

export type ScoreWithReasons = {
  readonly score: number;
  readonly reasons: readonly string[];
  readonly suppressed?: boolean;
};

export type NaturalPauseResult = {
  readonly isNaturalPause: boolean;
  readonly score: number;
  readonly reasons: readonly string[];
};

/** Scores evidence that the reader is actively reading the current chunk. */
export function scoreReading(evidence: ReaderSignalEvidence): ScoreWithReasons {
  const suppression = getReadingSuppression(evidence);
  if (suppression) {
    return { reasons: [suppression], score: 0, suppressed: true };
  }

  const expected = expectedReadingMilliseconds(evidence.chunk.text);
  const dwell = clamp01(evidence.dwellMilliseconds / expected);
  const visibility = clamp01((evidence.chunk.visibleRatio ?? 0) / 0.75);
  const selection = clamp01(evidence.selectionCount / 2) * 0.12;
  const revisit = clamp01(evidence.revisitCount / 2) * 0.1;
  const speedPenalty = evidence.scrollVelocity > 1.2 ? 0.22 : 0;

  return {
    reasons: createScoreReasons([
      [dwell > 0.35, "Dwell time matches reading pace."],
      [visibility > 0.6, "Chunk is substantially visible."],
      [selection > 0, "Reader selected text in the chunk."],
      [speedPenalty > 0, "Fast scrolling weakens reading evidence."]
    ]),
    score: clamp01((dwell * 0.5) + (visibility * 0.25) + selection + revisit - speedPenalty)
  };
}

/** Scores evidence that the reader is skimming rather than reading closely. */
export function scoreSkimming(evidence: ReaderSignalEvidence): ScoreWithReasons {
  if (!evidence.tabVisible || !evidence.windowFocused || isQuietPageKind(evidence.pageKind)) {
    return { reasons: ["Inactive or quiet page suppresses skimming evidence."], score: 0, suppressed: true };
  }

  const speed = clamp01(evidence.scrollVelocity / 2.4);
  const lowDwell = clamp01(1 - (evidence.dwellMilliseconds / 4_000));
  const noSelection = evidence.selectionCount === 0 ? 0.12 : 0;
  const visible = evidence.chunk.visibleRatio ?? 0;

  return {
    reasons: createScoreReasons([
      [speed > 0.45, "Scroll velocity is high."],
      [lowDwell > 0.5, "Chunk dwell is brief."],
      [noSelection > 0, "No selection evidence."],
      [visible >= 0.5, "Chunk crossed the viewport."]
    ]),
    score: clamp01((speed * 0.52) + (lowDwell * 0.28) + noSelection + (visible >= 0.5 ? 0.08 : 0))
  };
}

/** Scores evidence that the reader may be stuck or confused. */
export function scoreStuck(evidence: ReaderSignalEvidence): ScoreWithReasons {
  const suppression = getStuckSuppression(evidence);
  if (suppression) {
    return { reasons: [suppression], score: 0, suppressed: true };
  }

  const dwell = clamp01(evidence.dwellMilliseconds / 35_000);
  const revisits = clamp01(evidence.revisitCount / 4);
  const idlePenalty = evidence.idleMilliseconds > 75_000 ? 0.2 : 0;
  const value = scoreChunkValue(evidence.chunk, evidence.pageKind).score;

  return {
    reasons: createScoreReasons([
      [dwell > 0.45, "Long dwell on this chunk."],
      [revisits > 0.4, "Reader revisited the chunk."],
      [value > 0.45, "Chunk appears conceptually meaningful."],
      [idlePenalty > 0, "Long idle time weakens stuck evidence."]
    ]),
    score: clamp01((dwell * 0.42) + (revisits * 0.28) + (value * 0.24) - idlePenalty)
  };
}

/** Scores whether recent assistant behavior risks annoying the reader. */
export function scoreAnnoyance(evidence: ReaderSignalEvidence): ScoreWithReasons {
  const dismissals = clamp01((evidence.dismissalsLastFiveMinutes ?? 0) / 2);
  const prompts = clamp01((evidence.promptCountLastTenMinutes ?? 0) / 3);
  const chatOpen = evidence.chatOpen ? 0.15 : 0;
  return {
    reasons: createScoreReasons([
      [dismissals > 0, "Recent dismissals observed."],
      [prompts > 0, "Recent prompts increase interruption risk."],
      [chatOpen > 0, "Chat is already open."]
    ]),
    score: clamp01((dismissals * 0.55) + (prompts * 0.3) + chatOpen)
  };
}

/** Detects natural pauses where assistance may be less disruptive later. */
export function detectNaturalPause(evidence: ReaderSignalEvidence): NaturalPauseResult {
  if (!evidence.tabVisible || !evidence.windowFocused || isQuietPageKind(evidence.pageKind)) {
    return {
      isNaturalPause: false,
      reasons: ["Inactive or quiet page is not a natural reading pause."],
      score: 0
    };
  }

  const sentenceEnd = /[.!?]["')\]]?$/.test(evidence.chunk.text.trim()) ? 0.24 : 0;
  const mediumDwell = evidence.dwellMilliseconds >= 5_000 && evidence.dwellMilliseconds <= 45_000 ? 0.28 : 0;
  const slowScroll = evidence.scrollVelocity < 0.35 ? 0.22 : 0;
  const visible = (evidence.chunk.visibleRatio ?? 0) >= 0.5 ? 0.16 : 0;
  const score = clamp01(sentenceEnd + mediumDwell + slowScroll + visible);

  return {
    isNaturalPause: score >= 0.58,
    reasons: createScoreReasons([
      [sentenceEnd > 0, "Chunk ends at a sentence boundary."],
      [mediumDwell > 0, "Dwell time suggests a pause."],
      [slowScroll > 0, "Scroll motion is quiet."],
      [visible > 0, "Chunk remains visible."]
    ]),
    score
  };
}

/** Scores the chunk's local value after junk filtering. */
export function scoreCurrentChunkValue(evidence: ReaderSignalEvidence): ScoreWithReasons {
  const value = scoreChunkValue(evidence.chunk, evidence.pageKind);
  return { reasons: value.reasons, score: value.score };
}

/** Returns the first reason reading evidence must be suppressed. */
function getReadingSuppression(evidence: ReaderSignalEvidence): string | undefined {
  if (!evidence.tabVisible) return "Inactive tab suppresses reading evidence.";
  if (!evidence.windowFocused) return "Inactive window suppresses reading evidence.";
  if (isQuietPageKind(evidence.pageKind)) return "Quiet page kind suppresses reading evidence.";
  if (classifyChunkJunk(evidence.chunk, evidence.pageKind).isJunk) return "Junk chunk suppresses reading evidence.";
  return undefined;
}

/** Returns the first reason stuck evidence must be suppressed. */
function getStuckSuppression(evidence: ReaderSignalEvidence): string | undefined {
  if (!evidence.tabVisible) return "Inactive tab suppresses stuck evidence.";
  if (!evidence.windowFocused) return "Inactive window suppresses stuck evidence.";
  if (evidence.chatOpen) return "Open chat suppresses stuck evidence.";
  if (isQuietPageKind(evidence.pageKind)) return "Quiet page kind suppresses stuck evidence.";
  return undefined;
}

/** Estimates reading time for a chunk using a conservative WPM baseline. */
function expectedReadingMilliseconds(text: string): number {
  const words = text.match(/[a-z0-9]+(?:'[a-z0-9]+)?/gi)?.length ?? 0;
  return Math.max(2_000, (words / 220) * 60_000);
}

/** Keeps only the reasons whose evidence contributed to the score. */
function createScoreReasons(entries: readonly (readonly [boolean, string])[]): readonly string[] {
  return entries.filter(([include]) => include).map(([, reason]) => reason);
}

/** Clamps a score into the zero-to-one interval. */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
