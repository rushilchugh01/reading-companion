import type { ReadingChunk } from "../shared/reading-types";
import type { GradeResult, QuestionSession, WeakConcept } from "../shared/session-types";
import type { InterventionPageContext } from "./types";

/** Builds a durable weak concept record from a missed or partial answer. */
export function createWeakConcept(input: {
  session: QuestionSession;
  answer: string;
  grade: GradeResult;
  chunk: ReadingChunk;
  page: InterventionPageContext;
  personaId: string;
  now: number;
}): WeakConcept {
  const missedPoint = input.grade.missedPoint ?? input.session.expectedPoint;
  return {
    id: `weak:${input.session.id}:${input.now}`,
    concept: createConceptLabel(input.chunk, missedPoint),
    sourceUrl: input.page.url,
    sourceTitle: input.page.title,
    chunkReference: input.chunk.heading || input.chunk.id,
    chunkPreview: input.chunk.preview,
    userAnswer: input.answer,
    gradingResult: input.grade.label,
    missedPoint,
    personaId: input.personaId,
    reviewed: false,
    createdAt: input.now
  };
}

function createConceptLabel(chunk: ReadingChunk, missedPoint: string): string {
  const heading = chunk.heading.trim();
  if (heading.length > 0) {
    return heading;
  }
  return missedPoint.split(/[.!?]/)[0]?.trim() || chunk.preview;
}
