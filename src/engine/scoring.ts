import type {
  ChunkScores,
  ReadingChunk,
  ReadingSignals
} from "../shared/reading-types";
import { clamp01 } from "./signals";

/** Scores how information-dense a chunk is based on words, symbols, and structure. */
export function scoreDensity(chunk: ReadingChunk): number {
  const wordCount = countWords(chunk.text);
  const punctuationCount = (chunk.text.match(/[.;:!?()[\]{}=+\-*/]/g) ?? []).length;
  const structureBoost = getStructureBoost(chunk.kind);
  const lengthScore = clamp01(wordCount / 90);
  const symbolScore = clamp01(punctuationCount / Math.max(12, wordCount));

  return clamp01((lengthScore * 0.65) + (symbolScore * 0.2) + structureBoost);
}

/** Scores whether a chunk has enough semantic content to deserve reading attention. */
export function scoreMeaningfulness(chunk: ReadingChunk): number {
  const words = tokenize(chunk.text);
  const uniqueWords = new Set(words);
  const uniqueRatio = words.length > 0 ? uniqueWords.size / words.length : 0;
  const headingBoost = chunk.heading.length > 0 ? 0.08 : 0;
  const kindBoost = chunk.kind === "heading" ? -0.15 : getStructureBoost(chunk.kind);

  return clamp01((clamp01(words.length / 45) * 0.58) + (uniqueRatio * 0.24)
    + headingBoost + kindBoost);
}

/** Scores confidence that the user has meaningfully read a chunk. */
export function scoreReadingConfidence(
  chunk: ReadingChunk,
  signals: ReadingSignals
): number {
  if (!signals.tabVisible || !signals.windowFocused || signals.isFastScrolling) {
    return clamp01(chunk.scores.readingConfidence * 0.75);
  }

  const expectedMilliseconds = expectedReadingMilliseconds(chunk);
  const dwellScore = clamp01(chunk.metrics.visibleMilliseconds / expectedMilliseconds);
  const visibilityScore = chunk.metrics.visibleRatio >= 0.6 ? 0.2 : 0;
  const revisitScore = clamp01(chunk.metrics.revisitCount / 2) * 0.12;
  const selectionScore = clamp01(chunk.metrics.selectionCount / 2) * 0.1;
  const idlePenalty = signals.idleMilliseconds > 60_000 ? 0.2 : 0;

  return clamp01(dwellScore * 0.58 + visibilityScore + revisitScore
    + selectionScore - idlePenalty);
}

/** Combines reading, density, and meaningfulness into intervention readiness. */
export function scoreInterventionReadiness(
  chunk: ReadingChunk,
  signals: ReadingSignals
): number {
  const meaningfulness = scoreMeaningfulness(chunk);
  const readingConfidence = scoreReadingConfidence(chunk, signals);
  const density = scoreDensity(chunk);
  const unreadNeed = 1 - readingConfidence;

  if (!signals.tabVisible || !signals.windowFocused || signals.isFastScrolling) {
    return 0;
  }

  return clamp01((meaningfulness * 0.42) + (density * 0.28) + (unreadNeed * 0.3));
}

/** Calculates all chunk scores from current metrics and signals. */
export function scoreChunk(chunk: ReadingChunk, signals: ReadingSignals): ChunkScores {
  const readingConfidence = scoreReadingConfidence(chunk, signals);
  const meaningfulness = scoreMeaningfulness(chunk);
  const interventionReadiness = scoreInterventionReadiness(chunk, signals);

  return { readingConfidence, meaningfulness, interventionReadiness };
}

/** Returns whether a chunk is ready for an active-reading intervention. */
export function isInterventionReady(chunk: ReadingChunk, signals: ReadingSignals): boolean {
  const scores = scoreChunk(chunk, signals);
  return scores.interventionReadiness >= 0.62
    && scores.meaningfulness >= 0.45
    && scores.readingConfidence < 0.82;
}

function expectedReadingMilliseconds(chunk: ReadingChunk): number {
  const words = countWords(chunk.text);
  const base = Math.max(1_800, (words / 220) * 60_000);
  return chunk.kind === "code" || chunk.kind === "math" ? base * 1.8 : base;
}

function countWords(text: string): number {
  return tokenize(text).length;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+(?:'[a-z0-9]+)?/g) ?? [];
}

function getStructureBoost(kind: ReadingChunk["kind"]): number {
  if (kind === "code" || kind === "table" || kind === "math") {
    return 0.16;
  }

  if (kind === "list") {
    return 0.12;
  }

  return kind === "heading" ? 0.04 : 0.08;
}
