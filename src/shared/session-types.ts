import type { ReadingChunk } from "./reading-types";

/** Generated question for a read-gated chunk. */
export type QuestionSession = {
  id: string;
  chunkId: string;
  question: string;
  style: QuestionStyle;
  expectedAnswer: string;
  attemptCount: number;
  createdAt: number;
};

/** Supported active-reading question styles. */
export type QuestionStyle =
  | "recall"
  | "why_how"
  | "prediction"
  | "analogy"
  | "code_walkthrough"
  | "counterexample"
  | "compare_contrast"
  | "hidden_assumption";

/** Medium-strict grading labels. */
export type GradeLabel =
  | "correct"
  | "partially_correct"
  | "wrong"
  | "handwavy"
  | "missed_key_point";

/** Result returned by model-backed grading. */
export type GradeResult = {
  label: GradeLabel;
  feedback: string;
  hint?: string;
  missedPoint?: string;
};

/** Weak concept saved for future resurfacing. */
export type WeakConcept = {
  id: string;
  concept: string;
  sourceUrl: string;
  sourceTitle: string;
  chunkReference: string;
  chunkPreview: string;
  userAnswer: string;
  gradingResult: GradeLabel;
  missedPoint: string;
  personaId: string;
  reviewed: boolean;
  createdAt: number;
};

/** Candidate produced by scoring before policy checks. */
export type InterventionCandidate = {
  chunk: ReadingChunk;
  reason: string;
  score: number;
  createdAt: number;
};
