export type RuntimeAnswerSessionStatus =
  | "answer_pending"
  | "grading"
  | "answered"
  | "cancelled";

export type RuntimeAnswerSessionSnapshot = {
  id: string;
  attemptNumber: number;
  status: RuntimeAnswerSessionStatus;
};

/** Minimal runtime state needed to validate model results before applying them. */
export type CurrentRuntimeSnapshot = {
  now: number;
  tabId?: number;
  pageId?: string;
  contentHash?: string;
  activeChunkId?: string;
  chunkId?: string;
  chatOpen?: boolean;
  cooldownUntil?: number;
  interventionCooldownUntil?: number;
  answerSession?: RuntimeAnswerSessionSnapshot;
  questionSession?: RuntimeAnswerSessionSnapshot;
  conversationId?: string;
  currentConversationId?: string;
  cancelledMessageIds?: string[];
};
