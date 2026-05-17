import type { ReadingChunk } from "../shared/reading-types";
import type { InterventionCandidate } from "../shared/session-types";

const STATE_WEIGHT: Record<ReadingChunk["state"], number> = {
  unseen: -1,
  seen: 0.1,
  skimmed: 0.25,
  probably_read: 0.7,
  deep_read: 0.9,
  stuck_or_confused: 1,
  abandoned: -0.5
};

/** Builds deterministic intervention candidates from parser chunks. */
export function createInterventionCandidates(
  chunks: ReadingChunk[],
  now: number
): InterventionCandidate[] {
  return chunks
    .map((chunk) => createCandidate(chunk, now))
    .filter((candidate) => candidate.score > 0)
    .toSorted((left, right) => right.score - left.score || left.chunk.order - right.chunk.order);
}

/** Builds one intervention candidate with a transparent scoring reason. */
export function createCandidate(chunk: ReadingChunk, now: number): InterventionCandidate {
  const confidence = chunk.scores.readingConfidence;
  const meaningfulness = chunk.scores.meaningfulness;
  const readiness = chunk.scores.interventionReadiness;
  const stateWeight = STATE_WEIGHT[chunk.state];
  const score = roundScore(readiness * 0.45 + confidence * 0.25 + meaningfulness * 0.2 + stateWeight * 0.1);
  return {
    chunk,
    reason: describeCandidateReason(chunk, score),
    score,
    createdAt: now
  };
}

function describeCandidateReason(chunk: ReadingChunk, score: number): string {
  const label = chunk.state === "stuck_or_confused" ? "possible confusion" : "readiness";
  return `${label}:${score.toFixed(3)}:${chunk.kind}`;
}

function roundScore(value: number): number {
  return Math.max(0, Math.round(value * 1000) / 1000);
}
