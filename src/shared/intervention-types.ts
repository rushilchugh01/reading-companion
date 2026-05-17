import type { ReadingChunk, ReadingSignals } from "./reading-types";
import type { CompanionSettings, CognitiveMove, InterventionPolicyId } from "./settings-types";
import type { GradeLabel } from "./session-types";

export type InterventionAction =
  | "ask_question"
  | "offer_prediction"
  | "offer_observation"
  | "offer_help"
  | "stay_quiet";

export type ObservationType =
  | "key_point"
  | "hidden_assumption"
  | "contrast"
  | "contradiction"
  | "connection"
  | "warning"
  | "cool_fact"
  | "example_mapping";

export type PetIntent =
  | "quiet"
  | "curious"
  | "sharp_notice"
  | "playful_strict"
  | "concerned"
  | "helpful"
  | "pleased"
  | "explaining";

export type InterventionComposeAction = InterventionAction;
export type InterventionObservationType = ObservationType;

export type InterventionPageContext = {
  url?: string;
  title?: string;
  contentType?: string;
  headings?: string[];
  excerpt?: string;
};

export type InterventionPassageContext = {
  chunkId: string;
  heading?: string;
  text: string;
  preview?: string;
  order?: number;
};

export type InterventionReaderState = {
  signals?: Partial<ReadingSignals>;
  currentChunk?: Partial<ReadingChunk>;
  recentChunkIds?: string[];
  answeredQuestionIds?: string[];
  dismissedInterventions?: number;
  pageDwellMilliseconds?: number;
};

export type InterventionPolicyContext = {
  policyId: InterventionPolicyId;
  allowedActions: InterventionAction[];
  suggestedMoves?: CognitiveMove[];
  reason?: string;
  confidence?: number;
};

export type CompanionStyleContext = {
  personaId: string;
  tone?: string;
  strictness?: CompanionSettings["strictness"];
  readGatingMode?: CompanionSettings["readGatingMode"];
};

export type InterventionHistoryItem = {
  action: InterventionAction;
  chunkId?: string;
  userFacingText?: string;
  result?: string;
  createdAt: number;
};

export type InterventionComposeInput = {
  requestId: string;
  tabId: number;
  pageId: string;
  contentHash: string;
  chunkId: string;
  page: InterventionPageContext;
  currentPassage: InterventionPassageContext;
  readerState: InterventionReaderState;
  policy: InterventionPolicyContext;
  companionStyle: CompanionStyleContext;
  history: InterventionHistoryItem[];
  expiresAt: number;
};

/** Model-authored intervention that must pass schema and staleness validation. */
export type InterventionComposeResult = {
  requestId: string;
  action: InterventionAction;
  userFacingText?: string;
  expectedAnswer?: string;
  observationType?: ObservationType;
  followupOptions?: string[];
  petIntent: PetIntent;
  reasonForApp: string;
  confidence: number;
  expiresAt: number;
};

export type AnswerGradeInput = {
  requestId: string;
  questionId?: string;
  question: string;
  expectedAnswer: string;
  userAnswer: string;
  passage?: InterventionPassageContext;
  personaId: string;
  strictness: CompanionSettings["strictness"];
};

export type AnswerGradeResult = {
  requestId?: string;
  label: GradeLabel;
  feedback: string;
  hint?: string;
  missedPoint?: string;
  shouldRetry?: boolean;
};

export type ChatMessageInput = {
  role: "user" | "assistant";
  content: string;
};

export type ChatSendInput = {
  requestId: string;
  tabId?: number;
  pageId?: string;
  page?: InterventionPageContext;
  currentPassage?: InterventionPassageContext;
  companionStyle: CompanionStyleContext;
  history: ChatMessageInput[];
  message: string;
};

export type ChatSendResult = {
  requestId: string;
  text: string;
};

export type PageMapInput = {
  requestId: string;
  page: InterventionPageContext;
  chunks: InterventionPassageContext[];
};

export type PageMapResult = {
  requestId: string;
  summary: string;
  sections: Array<{ chunkId: string; heading?: string; summary: string }>;
};

export type ChunkSketchInput = {
  requestId: string;
  chunks: InterventionPassageContext[];
};

export type ChunkSketchResult = {
  requestId: string;
  sketches: Array<{ chunkId: string; keyPoint: string; concepts: string[] }>;
};
