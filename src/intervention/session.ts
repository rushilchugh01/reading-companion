import type { ReadingChunk } from "../shared/reading-types";
import type { QuestionSession, QuestionStyle } from "../shared/session-types";

/** Starts a deterministic question session for a selected chunk. */
export function startQuestionSession(input: {
  chunk: ReadingChunk;
  question: string;
  expectedAnswer: string;
  style: QuestionStyle;
  now: number;
}): QuestionSession {
  return {
    id: `question:${input.chunk.id}:${input.now}`,
    chunkId: input.chunk.id,
    question: input.question,
    style: input.style,
    expectedAnswer: input.expectedAnswer,
    attemptCount: 0,
    createdAt: input.now
  };
}

/** Returns the next retry session after an attempted answer. */
export function incrementAttempt(session: QuestionSession): QuestionSession {
  return {
    ...session,
    attemptCount: session.attemptCount + 1
  };
}

/** Ends an active session in immutable memory snapshots. */
export function clearActiveSession<T extends { activeSession?: QuestionSession }>(memory: T): T {
  const rest = { ...memory };
  delete rest.activeSession;
  return rest;
}

/** Stores the active question session in immutable memory snapshots. */
export function setActiveSession<T extends { activeSession?: QuestionSession }>(
  memory: T,
  session: QuestionSession
): T {
  return {
    ...memory,
    activeSession: session
  };
}
