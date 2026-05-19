import type {
  ChatMessageInput,
  ChatSendInput,
  InterventionAction,
  InterventionComposeInput,
  InterventionComposeResult,
  InterventionHistoryItem
} from "../shared/intervention-types";
import { createContentHash, createPageId, normalizeUrl } from "../shared/page-types";
import type { CurrentRuntimeSnapshot } from "../shared/runtime-types";
import type { CompanionSettings } from "../shared/settings-types";
import type { ParserSnapshot, ReadingChunk, ReadingSignals } from "../shared/reading-types";
import type { QuestionSession, QuestionStyle } from "../shared/session-types";
import type { CompanionConversationMessage } from "../ui/types";
import type { InterventionMemory, InterventionPageContext, PolicyDecision } from "../intervention";
import { createAttentionState, transitionAttentionState } from "./state/attention";
import { createInteractionState, transitionInteractionState } from "./state/interaction";
import { createInterventionState, transitionInterventionState } from "./state/intervention";
import { transitionPageState, type PageKind } from "./state/page";
import {
  createQuestionSessionState,
  transitionQuestionSessionState,
  type QuestionGrade
} from "./state/question-session";
import { routeChatSubmit, type ChatSubmitRoute } from "./state/chat";

export * from "./policy";
export * from "./state";

const DEFAULT_TAB_ID = 0;
const INTERVENTION_TTL_MS = 60_000;

type RuntimeIdentity = {
  contentHash: string;
  normalizedUrl: string;
  pageId: string;
};

export type RuntimeMachineSnapshot = {
  attention: ReturnType<typeof transitionAttentionState>;
  chatRoute: ChatSubmitRoute;
  interaction: ReturnType<typeof createInteractionState>;
  intervention: ReturnType<typeof createInterventionState>;
  page: ReturnType<typeof transitionPageState>;
  questionSession: ReturnType<typeof createQuestionSessionState>;
};

type RuntimeMachineSnapshotInput = {
  chunks: ReadingChunk[];
  conversationMessages: CompanionConversationMessage[];
  grade?: { label: string };
  lastDecision?: { allowed: boolean; targetChunkId?: string };
  parser: ParserSnapshot;
  page: InterventionPageContext;
  petState: string;
  session?: QuestionSession;
  now?: number;
};

type SnapshotInput = {
  activeChunkId?: string;
  chunks: ReadingChunk[];
  conversationMessages: CompanionConversationMessage[];
  page: InterventionPageContext;
  petState: string;
  session?: QuestionSession;
  now?: number;
};

type ComposePayloadInput = {
  chunks: ReadingChunk[];
  decision: Extract<PolicyDecision, { allowed: true }>;
  memory: InterventionMemory;
  page: InterventionPageContext;
  parser: ParserSnapshot;
  settings: CompanionSettings;
  signals: ReadingSignals;
  tabId?: number;
};

type ChatPayloadInput = {
  chunks: ReadingChunk[];
  conversationMessages: CompanionConversationMessage[];
  message: string;
  page: InterventionPageContext;
  settings: CompanionSettings;
  session?: QuestionSession;
  tabId?: number;
  now?: number;
};

/** Builds stable page identity fields for runtime snapshots and queued model jobs. */
export function createRuntimeIdentity(
  page: InterventionPageContext,
  chunks: ReadingChunk[]
): RuntimeIdentity {
  const normalizedUrl = normalizeUrl(page.url);
  const contentHash = createContentHash(chunks.map((chunk) => chunk.hash || chunk.text));
  return {
    contentHash,
    normalizedUrl,
    pageId: createPageId(normalizedUrl, contentHash)
  };
}

/** Builds the minimal runtime snapshot consumed by queued result validators. */
export function createCurrentRuntimeSnapshot(input: SnapshotInput): CurrentRuntimeSnapshot {
  const identity = createRuntimeIdentity(input.page, input.chunks);
  const now = input.now ?? Date.now();
  const activeChunkId = input.activeChunkId ?? input.session?.chunkId ?? mostRelevantChunk(input.chunks)?.id;
  const answerSession = input.session ? {
    attemptNumber: input.session.attemptCount,
    id: input.session.id,
    status: input.petState === "grading" ? "grading" as const : "answer_pending" as const
  } : undefined;
  return {
    activeChunkId,
    answerSession,
    chatOpen: input.conversationMessages.length > 0 && !input.session,
    chunkId: activeChunkId,
    contentHash: identity.contentHash,
    conversationId: input.session?.id,
    currentConversationId: input.session?.id,
    now,
    pageId: identity.pageId,
    questionSession: answerSession,
    tabId: DEFAULT_TAB_ID
  };
}

/** Creates the normalized intervention compose payload for proactive model work. */
export function createInterventionComposePayload(input: ComposePayloadInput): InterventionComposeInput {
  const now = input.signals.now;
  const chunk = input.decision.candidate.chunk;
  const identity = createRuntimeIdentity(input.page, input.chunks);
  return {
    requestId: requestId("intervention", now, chunk.id),
    tabId: input.tabId ?? DEFAULT_TAB_ID,
    pageId: identity.pageId,
    contentHash: identity.contentHash,
    chunkId: chunk.id,
    page: {
      contentType: input.parser.contentType,
      excerpt: input.chunks.slice(0, 2).map((candidate) => candidate.preview).join("\n\n"),
      headings: headingsFromChunks(input.chunks),
      title: input.page.title,
      url: input.page.url
    },
    currentPassage: passageFromChunk(chunk),
    readerState: {
      answeredQuestionIds: input.memory.askedChunkIds,
      currentChunk: chunk,
      dismissedInterventions: input.memory.dismissalCount,
      pageDwellMilliseconds: Math.max(0, now - input.page.loadedAt),
      recentChunkIds: recentChunkIds(input.chunks),
      signals: input.signals
    },
    policy: {
      allowedActions: allowedInterventionActions(),
      confidence: input.decision.opportunity.confidence,
      policyId: input.decision.opportunity.policyId,
      reason: input.decision.opportunity.reason,
      suggestedMoves: input.decision.opportunity.suggestedMoves
    },
    companionStyle: {
      personaId: input.settings.personaId,
      readGatingMode: input.settings.readGatingMode,
      strictness: input.settings.strictness
    },
    history: interventionHistory(input.memory),
    expiresAt: now + INTERVENTION_TTL_MS
  };
}

/** Converts normalized ask/prediction interventions into the current question UI shape. */
export function questionSessionFromIntervention(
  result: InterventionComposeResult,
  chunk: ReadingChunk,
  settings: CompanionSettings,
  now = Date.now()
): QuestionSession | undefined {
  if (result.action !== "ask_question" && result.action !== "offer_prediction") return undefined;
  if (!result.userFacingText || !result.expectedAnswer) return undefined;
  return {
    id: result.requestId,
    chunkId: chunk.id,
    question: result.userFacingText,
    style: result.action === "offer_prediction" ? "prediction" : questionStyleFor(settings.readGatingMode),
    expectedAnswer: result.expectedAnswer,
    attemptCount: 0,
    createdAt: now
  };
}

/** Creates a queued natural-language chat payload from the home-panel input. */
export function createChatSendPayload(input: ChatPayloadInput): ChatSendInput {
  const now = input.now ?? Date.now();
  const identity = createRuntimeIdentity(input.page, input.chunks);
  const chunk = input.session
    ? input.chunks.find((candidate) => candidate.id === input.session?.chunkId)
    : mostRelevantChunk(input.chunks);
  return {
    requestId: requestId("chat", now, input.message),
    tabId: input.tabId ?? DEFAULT_TAB_ID,
    pageId: identity.pageId,
    page: {
      excerpt: input.chunks.slice(0, 2).map((candidate) => candidate.preview).join("\n\n"),
      title: input.page.title,
      url: input.page.url
    },
    currentPassage: chunk ? passageFromChunk(chunk) : undefined,
    companionStyle: {
      personaId: input.settings.personaId,
      readGatingMode: input.settings.readGatingMode,
      strictness: input.settings.strictness
    },
    history: input.conversationMessages.map(chatMessageFromConversation).filter((message): message is ChatMessageInput => Boolean(message)),
    message: input.message
  };
}

/** Routes a text submit through the new chat state reducer. */
export function routeRuntimeChatSubmit(session: QuestionSession | undefined): ChatSubmitRoute {
  let questionSession = createQuestionSessionState(Date.now());
  if (session) {
    questionSession = transitionQuestionSessionState(questionSession, {
      type: "start",
      chunkId: session.chunkId,
      now: session.createdAt,
      pageId: "current",
      sessionId: session.id
    });
  }
  return routeChatSubmit({ hasSelectionContext: false, questionSession });
}

/** Builds a content-side state-machine snapshot for debug surfaces. */
export function createRuntimeMachineSnapshot(input: RuntimeMachineSnapshotInput): RuntimeMachineSnapshot {
  const now = input.now ?? Date.now();
  const page = transitionPageState({
    focused: true,
    kind: pageKindFor(input.parser, input.page),
    now,
    parserStatus: parserStatusForMachine(input.parser),
    readableChunkCount: input.chunks.length,
    visible: true
  });
  const attention = transitionAttentionState(attentionSeed(input.chunks, now), {
    focused: true,
    now,
    readingScore: maxReadingScore(input.chunks),
    stuckScore: input.chunks.some((chunk) => chunk.state === "stuck_or_confused") ? 0.8 : 0,
    visible: true
  });
  const interaction = input.conversationMessages.length > 0
    ? transitionInteractionState(createInteractionState(now), { type: "open_chat", now })
    : createInteractionState(now);
  const intervention = interventionSnapshot(input, now);
  const questionSession = questionSessionSnapshot(input, now);
  return {
    attention,
    chatRoute: routeChatSubmit({ hasSelectionContext: false, questionSession }),
    interaction,
    intervention,
    page,
    questionSession
  };
}

/** Formats state-machine values into one compact debug log line. */
export function formatRuntimeMachineSnapshot(snapshot: RuntimeMachineSnapshot): string {
  return [
    `machines page=${snapshot.page.value}/${snapshot.page.kind}`,
    `attention=${snapshot.attention.value}`,
    `interaction=${snapshot.interaction.value}`,
    `intervention=${snapshot.intervention.value}`,
    `question=${snapshot.questionSession.value}`,
    `chatRoute=${snapshot.chatRoute}`
  ].join(" ");
}

function allowedInterventionActions(): InterventionAction[] {
  return ["ask_question", "offer_prediction", "offer_observation", "offer_help", "stay_quiet"];
}

function passageFromChunk(chunk: ReadingChunk) {
  return {
    chunkId: chunk.id,
    heading: chunk.heading,
    order: chunk.order,
    preview: chunk.preview,
    text: chunk.text
  };
}

function headingsFromChunks(chunks: ReadingChunk[]): string[] {
  return [...new Set(chunks.map((chunk) => chunk.heading).filter(Boolean))].slice(0, 8);
}

function recentChunkIds(chunks: ReadingChunk[]): string[] {
  return [...chunks]
    .filter((chunk) => chunk.metrics.lastSeenAt !== undefined || chunk.metrics.visibleRatio > 0)
    .toSorted((left, right) => (right.metrics.lastSeenAt ?? 0) - (left.metrics.lastSeenAt ?? 0))
    .slice(0, 6)
    .map((chunk) => chunk.id);
}

function interventionHistory(memory: InterventionMemory): InterventionHistoryItem[] {
  const asked = memory.askedChunkIds.slice(-4).map((chunkId) => ({
    action: "ask_question" as const,
    chunkId,
    createdAt: memory.lastAskedAt ?? 0,
    result: "shown"
  }));
  const quiet = memory.quietedChunkIds.slice(-4).map((chunkId) => ({
    action: "stay_quiet" as const,
    chunkId,
    createdAt: memory.lastAskedAt ?? 0,
    result: "model_quiet"
  }));
  return [...asked, ...quiet].filter((item) => item.createdAt > 0);
}

function questionStyleFor(mode: CompanionSettings["readGatingMode"]): QuestionStyle {
  if (mode === "strict") return "recall";
  if (mode === "look_ahead") return "prediction";
  return "why_how";
}

function mostRelevantChunk(chunks: ReadingChunk[]): ReadingChunk | undefined {
  return [...chunks].toSorted((left, right) => {
    const confidence = right.scores.readingConfidence - left.scores.readingConfidence;
    if (confidence !== 0) return confidence;
    return right.metrics.visibleRatio - left.metrics.visibleRatio;
  })[0];
}

function requestId(prefix: string, now: number, seed: string): string {
  return `${prefix}-${now}-${smallHash(seed)}`;
}

function smallHash(value: string): string {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash.toString(16);
}

function chatMessageFromConversation(message: CompanionConversationMessage): ChatMessageInput | undefined {
  const content = conversationText(message);
  if (!content) return undefined;
  return {
    role: message.role === "assistant" ? "assistant" : "user",
    content
  };
}

function conversationText(message: CompanionConversationMessage): string {
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => typeof part === "object" && part && "text" in part ? String(part.text) : "")
      .join(" ")
      .trim();
  }
  return "";
}

function pageKindFor(parser: ParserSnapshot, page: InterventionPageContext): PageKind {
  if (parser.status === "unsupported") return "unsupported";
  if (parser.contentType === "pdf") return "pdf_text";
  if (parser.contentType === "local_file" || parser.contentType === "unknown") return "unsupported";
  return /\/(docs|guide|reference|api|learn)\b/i.test(page.url) ? "docs" : "article";
}

function parserStatusForMachine(parser: ParserSnapshot): "ready" | "scanning" | "unsupported" {
  if (parser.status === "unsupported") return "unsupported";
  return parser.chunks.length > 0 ? "ready" : "scanning";
}

function attentionSeed(chunks: ReadingChunk[], now: number) {
  return maxReadingScore(chunks) >= 0.72
    ? createAttentionState("active_reading", now)
    : createAttentionState("not_reading", now);
}

function maxReadingScore(chunks: ReadingChunk[]): number {
  return Math.max(0, ...chunks.map((chunk) => chunk.scores.readingConfidence));
}

function interventionSnapshot(input: RuntimeMachineSnapshotInput, now: number) {
  const initial = createInterventionState(now);
  if (!input.lastDecision?.allowed || !input.lastDecision.targetChunkId) return initial;
  const candidate = transitionInterventionState(initial, {
    type: "candidate_found",
    candidateId: input.lastDecision.targetChunkId,
    now
  });
  return input.session || input.conversationMessages.length > 0
    ? transitionInterventionState(candidate, { type: "prompt", now })
    : candidate;
}

function questionSessionSnapshot(input: RuntimeMachineSnapshotInput, now: number) {
  let snapshot = createQuestionSessionState(now);
  if (!input.session) return snapshot;
  snapshot = transitionQuestionSessionState(snapshot, {
    type: "start",
    chunkId: input.session.chunkId,
    now: input.session.createdAt,
    pageId: createRuntimeIdentity(input.page, input.chunks).pageId,
    sessionId: input.session.id
  });
  if (input.petState === "grading") {
    return transitionQuestionSessionState(snapshot, { type: "submit_answer", now, sessionId: input.session.id });
  }
  const grade = gradeForQuestionState(input.grade?.label);
  return grade
    ? transitionQuestionSessionState(
      transitionQuestionSessionState(snapshot, { type: "submit_answer", now, sessionId: input.session.id }),
      { type: "grade", attempt: 1, grade, now, sessionId: input.session.id }
    )
    : snapshot;
}

function gradeForQuestionState(label: string | undefined): QuestionGrade | undefined {
  if (!label) return undefined;
  if (label === "correct") return "correct";
  if (label === "partially_correct" || label === "handwavy") return "partial";
  return "wrong";
}
