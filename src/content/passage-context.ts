import type { InterventionPassageContext, InterventionSurroundingPassages } from "../shared/intervention-types";
import type { ReadingChunk } from "../shared/reading-types";

/** Builds bounded nearby passage context around the selected intervention chunk. */
export function surroundingPassagesFromChunks(
  chunks: ReadingChunk[],
  current: ReadingChunk
): InterventionSurroundingPassages {
  const ordered = [...chunks].filter(isPromptUsefulChunk).toSorted((left, right) => left.order - right.order);
  const previous = ordered
    .filter((chunk) => chunk.order < current.order)
    .slice(-2)
    .map((chunk) => passageSnippetFromChunk(chunk, 1_600));
  const next = ordered
    .filter((chunk) => chunk.order > current.order)
    .slice(0, 1)
    .map((chunk) => passageSnippetFromChunk(chunk, 1_000));
  const selected = new Set([current.id, ...previous.map((chunk) => chunk.chunkId), ...next.map((chunk) => chunk.chunkId)]);
  const recent = ordered
    .filter((chunk) => !selected.has(chunk.id) && isRecentlySeen(chunk))
    .toSorted((left, right) => (right.metrics.lastSeenAt ?? 0) - (left.metrics.lastSeenAt ?? 0))
    .slice(0, 3)
    .map((chunk) => passageSnippetFromChunk(chunk, 900));
  return { previous, next, recent };
}

function passageSnippetFromChunk(chunk: ReadingChunk, length: number): InterventionPassageContext {
  const text = chunk.preview || chunk.text;
  return {
    chunkId: chunk.id,
    heading: chunk.heading,
    order: chunk.order,
    preview: chunk.preview,
    text: truncateRuntimeText(text, length)
  };
}

function isPromptUsefulChunk(chunk: ReadingChunk): boolean {
  return chunk.id.length > 0 && chunk.text.trim().length > 0 && chunk.scores.meaningfulness >= 0.25;
}

function isRecentlySeen(chunk: ReadingChunk): boolean {
  return chunk.metrics.lastSeenAt !== undefined || chunk.metrics.visibleMilliseconds > 0 || chunk.metrics.visibleRatio > 0;
}

function truncateRuntimeText(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length).trim()}...` : value;
}
