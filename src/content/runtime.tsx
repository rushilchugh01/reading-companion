/* eslint max-lines: off */
import { useEffect, useMemo, useRef, useState } from "react";
import { browser } from "wxt/browser";
import { parseDocumentSurface } from "../engine";
import {
  createInterventionCandidates,
  createInterventionMemory,
  evaluateAnswer,
  evaluateInterventionPolicy,
  markModelStayedQuiet,
  markQuestionAsked
} from "../intervention";
import type { PetStateKey } from "../shared/pet-state-types";
import type { DebugEvent, DebugPolicySnapshot } from "../shared/debug-types";
import type { AnswerGradeInput, ChatSendResult, InterventionComposeResult } from "../shared/intervention-types";
import type { RuntimeDebugModelJobsResult, RuntimeMessage } from "../shared/messages";
import type { ModelQueueDebugSnapshot } from "../shared/model-job-types";
import type { ParserSnapshot, ReadingChunk } from "../shared/reading-types";
import { createDefaultSettings } from "../shared/defaults";
import { createCompanionLogger } from "../shared/logger";
import type { CompanionSettings } from "../shared/settings-types";
import type { GradeResult, QuestionSession } from "../shared/session-types";
import type { InterventionMemory, InterventionPageContext, PolicyDecision } from "../intervention";
import { CompanionPetApp } from "../ui";
import type { CompanionConversationMessage, PanelSize, PetPosition, RetryDisplay } from "../ui/types";
import {
  assistantFeedbackMessage,
  assistantQuestionMessage,
  assistantStatusMessage,
  conversationForSession,
  replaceConversationMessage,
  userAnswerMessage
} from "./conversation";
import { handleHomeAction } from "./home-actions";
import { createPageContext } from "./page-context";
import {
  bindActivityTracking,
  createSignalTracker,
  petStateForChunks,
  readSignals,
  updateChunks,
  type SignalTracker
} from "./reading-observation";
import {
  createDebugEvent,
  createDebugSnapshot,
  createDecisionDebug,
  prependEvent
} from "./runtime-debug";
import {
  createChatSendPayload,
  createCurrentRuntimeSnapshot,
  createInterventionComposePayload,
  questionSessionFromIntervention,
  routeRuntimeChatSubmit
} from "./runtime-state";
import { bindSettingsSync, settingsPanelSize, settingsPosition } from "./settings-sync";
import { explainCompanionVisibility, shouldShowCompanion } from "./visibility";

const OBSERVE_INTERVAL_MS = 2_000;
const runtimeLogger = createCompanionLogger("runtime");
type RuntimeState = {
  settings: CompanionSettings;
  parser: ParserSnapshot;
  chunks: ReadingChunk[];
  memory: InterventionMemory;
  events: DebugEvent[];
  conversationMessages: CompanionConversationMessage[];
  session?: QuestionSession;
  grade?: GradeResult;
  retry?: RetryDisplay;
  petState: PetStateKey;
  lastPolicyDecision?: DebugPolicySnapshot["lastDecision"];
  modelDebug?: ModelQueueDebugSnapshot;
};
type RuntimeStateSetter = React.Dispatch<React.SetStateAction<RuntimeState | undefined>>;

/** Connects page-reading signals, intervention policy, background services, and pet UI. */
export function ContentCompanionRuntime() {
  const page = useMemo(createPageContext, []);
  const signalRef = useRef(createSignalTracker());
  const [state, setState] = useState<RuntimeState>();

  useEffect(() => void bootstrapRuntime(page, setState), [page]);
  useEffect(() => bindActivityTracking(signalRef.current), []);
  useEffect(() => bindSettingsSync(setState), []);
  useEffect(() => bindReadingLoop(page, signalRef, state, setState), [page, state]);
  useEffect(() => bindModelDebugLoop(state?.settings.debugMode ?? false, setState), [state?.settings.debugMode]);

  if (!state) {
    return null;
  }

  const visibility = explainCompanionVisibility(state.settings, page);
  const hiddenOnThisPage = visibility.reason === "hidden_page";
  if (!visibility.visible && !hiddenOnThisPage) {
    return null;
  }

  return (
    <CompanionPetApp
      debugSnapshot={createDebugSnapshot(state, page)}
      debugMode={state.settings.debugMode}
      gradeResult={state.grade}
      conversationMessages={state.conversationMessages}
      greeting="hieee — I’ll stay quiet unless something worth checking shows up."
      companionPackId={state.settings.companionPackId}
      companionPackRegistry={state.settings.companionPackRegistry}
      avatarPackId={state.settings.avatarPackId}
      hidden={hiddenOnThisPage}
      initialPanelSize={settingsPanelSize(state.settings)}
      initialPosition={settingsPosition(state.settings)}
      petState={state.petState}
      questionSession={state.session}
      retryDisplay={state.retry}
      onAnswerSubmit={(answer) => void submitChatInput(answer, state, page, setState)}
      onDisableGlobally={() => void disableGlobally(state.settings, setState)}
      onHide={() => void hidePage(state.settings, page.url, setState)}
      onHideSite={() => void hideSite(state.settings, page.host, setState)}
      onHomeAction={(actionId) => handleHomeAction(actionId, state)}
      onOpenSettings={openCompanionSettings}
      onPanelSizeChange={(size) => void savePanelSize(state.settings, size)}
      onPositionChange={(position) => void savePosition(state.settings, position)}
      onRestore={() => void restorePage(state.settings, page.url, setState)}
      onRetry={() => setState((current) => current && { ...current, grade: undefined, petState: "about_to_ask", retry: undefined })}
    />
  );
}

async function bootstrapRuntime(page: InterventionPageContext, setState: RuntimeStateSetter) {
  const settings = await requestBackground<CompanionSettings>({ type: "settings:get" })
    .catch(createDefaultSettings);
  const parser = parseDocumentSurface({ document, url: page.url });
  const event = createDebugEvent("PAGE_PARSED", `Parsed ${parser.chunks.length} chunks.`);
  runtimeLogger.info("bootstrapped page", { chunks: parser.chunks.length, parserStatus: parser.status, visibility: explainCompanionVisibility(settings, page) });
  await sendDebugEvent(event);
  setState({
    settings,
    parser,
    chunks: parser.chunks,
    conversationMessages: [],
    memory: createInterventionMemory(),
    events: [event],
    petState: "idle"
  });
}

function bindReadingLoop(
  page: InterventionPageContext,
  signalRef: React.MutableRefObject<SignalTracker>,
  state: RuntimeState | undefined,
  setState: RuntimeStateSetter
) {
  if (!state || !shouldShowCompanion(state.settings, page)) return;
  const intervalId = window.setInterval(() => {
    void observeReading(page, signalRef.current, state, setState);
  }, OBSERVE_INTERVAL_MS);
  return () => window.clearInterval(intervalId);
}

async function observeReading(
  page: InterventionPageContext,
  tracker: SignalTracker,
  state: RuntimeState,
  setState: RuntimeStateSetter
) {
  const signals = readSignals(tracker);
  const chunks = updateChunks(state.chunks, signals, tracker.selectedText);
  tracker.selectedText = "";
  const memory = state.memory;
  const candidates = createInterventionCandidates(chunks, signals.now);
  const decision = evaluateInterventionPolicy({ settings: state.settings, page, signals, memory, candidates });
  if (!decision.allowed) {
    setState((current) => current && {
      ...current,
      chunks,
      lastPolicyDecision: createDecisionDebug(decision),
      petState: petStateForChunks(chunks)
    });
    return;
  }

  const generation = await requestInterventionCompose({ chunks, decision, page, setState, signals, state });
  if (!generation) return;
  if (generation.action === "stay_quiet") {
    await applyStayQuietIntervention({ chunks, decision, generation, memory, setState });
    return;
  }
  await applyVisibleIntervention({ chunks, decision, generation, memory, setState, settings: state.settings, signals });
}

async function applyStayQuietIntervention(input: {
  chunks: ReadingChunk[];
  decision: Extract<PolicyDecision, { allowed: true }>;
  generation: InterventionComposeResult;
  memory: InterventionMemory;
  setState: RuntimeStateSetter;
}) {
  const event = createDebugEvent("INTERVENTION_MODEL_STAYED_QUIET", input.generation.reasonForApp);
  await sendDebugEvent(event);
  input.setState((current) => current && {
    ...current,
    chunks: input.chunks,
    events: prependEvent(current.events, event),
    lastPolicyDecision: createDecisionDebug(input.decision),
    memory: markModelStayedQuiet(input.memory, input.decision.candidate),
    petState: petStateForChunks(input.chunks)
  });
}

async function applyVisibleIntervention(input: {
  chunks: ReadingChunk[];
  decision: Extract<PolicyDecision, { allowed: true }>;
  generation: InterventionComposeResult;
  memory: InterventionMemory;
  setState: RuntimeStateSetter;
  settings: CompanionSettings;
  signals: ReturnType<typeof readSignals>;
}) {
  const { chunks, decision, generation, memory, setState, settings, signals } = input;
  const event = createDebugEvent("INTERVENTION_TRIGGERED", `${generation.action}: ${decision.candidate.reason}`);
  const session = questionSessionFromIntervention(generation, decision.candidate.chunk, settings, signals.now);
  await sendDebugEvent(event);
  if (!session) {
    setState((current) => current && {
      ...current,
      chunks,
      events: prependEvent(current.events, event),
      conversationMessages: [
        assistantStatusMessage({
          id: generation.requestId,
          settings,
          status: "sent",
          text: generation.userFacingText ?? generation.reasonForApp,
          timestamp: signals.now
        })
      ],
      lastPolicyDecision: createDecisionDebug(decision),
      memory: markQuestionAsked(memory, decision.candidate, signals.now),
      petState: petStateForIntervention(generation),
      retry: undefined,
      session: undefined
    });
    return;
  }
  setState((current) => current && {
    ...current,
    chunks,
    events: prependEvent(current.events, event),
    conversationMessages: [assistantQuestionMessage(session, settings)],
    lastPolicyDecision: createDecisionDebug(decision),
    memory: { ...markQuestionAsked(memory, decision.candidate, signals.now), activeSession: session },
    grade: undefined,
    petState: "about_to_ask",
    retry: undefined,
    session
  });
}

async function submitChatInput(
  answer: string,
  state: RuntimeState,
  page: InterventionPageContext,
  setState: RuntimeStateSetter
) {
  if (routeRuntimeChatSubmit(state.session) === "answer") {
    await submitAnswer(answer, state, page, setState);
    return;
  }
  await submitFreeformChat(answer, state, page, setState);
}

async function submitAnswer(
  answer: string,
  state: RuntimeState,
  page: InterventionPageContext,
  setState: RuntimeStateSetter
) {
  if (!state.session || state.petState === "grading") return;
  const session = state.session;
  const chunk = state.chunks.find((candidate) => candidate.id === state.session?.chunkId);
  if (!chunk) return;
  const submittedAt = Date.now();
  const pendingMessageId = `${session.id}:grade:${submittedAt}`;
  appendPendingAnswer({ answer, pendingMessageId, session, setState, settings: state.settings, submittedAt });
  const grade = await requestAnswerGrade(answer, chunk, state, setState);
  if (!grade) {
    replacePendingAnswerWithError(setState, pendingMessageId);
    return;
  }
  const evaluation = evaluateAnswer({ answer, chunk, grade, now: Date.now(), page, personaId: state.settings.personaId, session });
  if (evaluation.weakConcept) {
    await requestBackground({ type: "weakConcept:save", concept: evaluation.weakConcept }).catch((error) => {
      runtimeLogger.warn("weak concept save failed", { error: errorMessage(error) });
    });
  }
  setState((current) => current && {
    ...current,
    conversationMessages: replaceConversationMessage(
      current.conversationMessages,
      pendingMessageId,
      assistantFeedbackMessage(pendingMessageId, evaluation, state.settings)
    ),
    grade,
    memory: { ...current.memory, activeSession: evaluation.nextSession },
    petState: evaluation.action === "correct" ? "celebratory" : "confused",
    retry: evaluation.nextSession ? { message: evaluation.hint ?? evaluation.feedback } : undefined,
    session: evaluation.nextSession
  });
}

function appendPendingAnswer(input: {
  answer: string;
  pendingMessageId: string;
  session: QuestionSession;
  setState: RuntimeStateSetter;
  settings: CompanionSettings;
  submittedAt: number;
}) {
  input.setState((current) => current && {
    ...current,
    conversationMessages: [
      ...conversationForSession(current, input.session),
      userAnswerMessage(input.session, input.answer, input.submittedAt),
      assistantStatusMessage({
        id: input.pendingMessageId,
        settings: input.settings,
        status: "pending",
        text: "Checking your answer...",
        timestamp: input.submittedAt
      })
    ],
    grade: undefined,
    petState: "grading",
    retry: undefined
  });
}

function replacePendingAnswerWithError(setState: RuntimeStateSetter, pendingMessageId: string) {
  setState((current) => current && {
    ...current,
    conversationMessages: replaceConversationMessage(
      current.conversationMessages,
      pendingMessageId,
      assistantStatusMessage({
        id: pendingMessageId,
        settings: current.settings,
        status: "error",
        text: "I could not grade that because the provider could not be reached. Check settings, then try again.",
        timestamp: Date.now()
      })
    )
  });
}

async function requestInterventionCompose(input: {
  chunks: ReadingChunk[];
  decision: Extract<PolicyDecision, { allowed: true }>;
  page: InterventionPageContext;
  setState: RuntimeStateSetter;
  signals: ReturnType<typeof readSignals>;
  state: RuntimeState;
}): Promise<InterventionComposeResult | undefined> {
  const { chunks, decision, page, setState, signals, state } = input;
  const payload = createInterventionComposePayload({
    chunks,
    decision,
    memory: state.memory,
    page,
    parser: state.parser,
    settings: state.settings,
    signals
  });
  try {
    await sendRuntimeSnapshot({ activeChunkId: decision.candidate.chunk.id, chunks, now: signals.now, page, state });
    return await requestBackground<InterventionComposeResult>({ type: "intervention:compose", payload });
  } catch (error) {
    const event = createDebugEvent("MODEL_REQUEST_FAILED", `Intervention provider failed: ${errorMessage(error)}`);
    await sendDebugEvent(event);
    setState((current) => current && {
      ...current,
      chunks,
      events: prependEvent(current.events, event),
      lastPolicyDecision: createDecisionDebug(decision),
      petState: "confused",
      retry: { message: "I could not reach the reading model. Check provider settings, then retry." }
    });
    return undefined;
  } finally {
    await refreshModelDebug(setState);
  }
}

async function submitFreeformChat(
  message: string,
  state: RuntimeState,
  page: InterventionPageContext,
  setState: RuntimeStateSetter
) {
  const submittedAt = Date.now();
  const payload = createChatSendPayload({
    chunks: state.chunks,
    conversationMessages: state.conversationMessages,
    message,
    page,
    settings: state.settings,
    now: submittedAt
  });
  const userMessageId = `${payload.requestId}:user`;
  const pendingMessageId = `${payload.requestId}:assistant`;
  appendPendingChat({ message, pendingMessageId, setState, settings: state.settings, submittedAt, userMessageId });
  try {
    await sendRuntimeSnapshot({
      activeChunkId: payload.currentPassage?.chunkId,
      chunks: state.chunks,
      now: submittedAt,
      page,
      state
    });
    const result = await requestBackground<ChatSendResult>({ type: "chat:send", payload });
    applyChatSuccess(setState, pendingMessageId, result);
  } catch (error) {
    await applyChatError(setState, pendingMessageId, error);
  } finally {
    await refreshModelDebug(setState);
  }
}

function applyChatSuccess(
  setState: RuntimeStateSetter,
  pendingMessageId: string,
  result: ChatSendResult
) {
  setState((current) => current && {
    ...current,
    conversationMessages: replaceConversationMessage(
      current.conversationMessages,
      pendingMessageId,
      assistantStatusMessage({
        id: pendingMessageId,
        settings: current.settings,
        status: "sent",
        text: result.text,
        timestamp: Date.now()
      })
    ),
    petState: "listening",
    retry: undefined
  });
}

async function applyChatError(
  setState: RuntimeStateSetter,
  pendingMessageId: string,
  error: unknown
) {
  const event = createDebugEvent("MODEL_REQUEST_FAILED", `Chat provider failed: ${errorMessage(error)}`);
  await sendDebugEvent(event);
  setState((current) => current && {
    ...current,
    conversationMessages: replaceConversationMessage(
      current.conversationMessages,
      pendingMessageId,
      assistantStatusMessage({
        id: pendingMessageId,
        settings: current.settings,
        status: "error",
        text: "I could not answer that because the provider could not be reached. Check settings, then try again.",
        timestamp: Date.now()
      })
    ),
    events: prependEvent(current.events, event),
    petState: "confused"
  });
}

function appendPendingChat(input: {
  message: string;
  pendingMessageId: string;
  setState: RuntimeStateSetter;
  settings: CompanionSettings;
  submittedAt: number;
  userMessageId: string;
}) {
  input.setState((current) => current && {
    ...current,
    conversationMessages: [
      ...current.conversationMessages,
      {
        id: input.userMessageId,
        role: "user",
        content: input.message,
        status: "sent",
        timestamp: input.submittedAt
      },
      assistantStatusMessage({
        id: input.pendingMessageId,
        settings: input.settings,
        status: "pending",
        text: "Thinking...",
        timestamp: input.submittedAt
      })
    ],
    grade: undefined,
    petState: "thinking",
    retry: undefined
  });
}

async function requestAnswerGrade(
  answer: string,
  chunk: ReadingChunk,
  state: RuntimeState,
  setState: React.Dispatch<React.SetStateAction<RuntimeState | undefined>>
): Promise<GradeResult | undefined> {
  try {
    return await requestBackground<GradeResult>({
      type: "answer:grade",
      payload: createAnswerGradePayload(answer, chunk, state)
    });
  } catch (error) {
    const event = createDebugEvent("MODEL_REQUEST_FAILED", `Grading provider failed: ${errorMessage(error)}`);
    await sendDebugEvent(event);
    setState((current) => current && {
      ...current,
      events: prependEvent(current.events, event),
      petState: "confused",
      retry: { message: "I could not grade that because the provider could not be reached. Check settings, then retry." }
    });
    return undefined;
  } finally {
    await refreshModelDebug(setState);
  }
}

function createAnswerGradePayload(
  answer: string,
  chunk: ReadingChunk,
  state: RuntimeState
): AnswerGradeInput {
  const session = state.session!;
  return {
    requestId: `grade-${Date.now()}-${session.id}`,
    sessionId: session.id,
    attemptNumber: session.attemptCount,
    chunkId: session.chunkId,
    question: session.question,
    expectedAnswer: session.expectedAnswer,
    questionStrategyId: session.questionStrategyId,
    questionDepth: session.questionDepth,
    targetIdea: session.targetIdea,
    reasoningNeeded: session.reasoningNeeded,
    userAnswer: answer,
    passage: {
      chunkId: chunk.id,
      heading: chunk.heading,
      order: chunk.order,
      preview: chunk.preview,
      text: chunk.text
    },
    companionPackId: state.settings.companionPackId,
    personaId: state.settings.personaId,
    strictness: state.settings.strictness
  };
}

async function savePosition(settings: CompanionSettings, position: PetPosition) {
  await saveSettings({ ...settings, placement: { ...settings.placement, ...position } });
}

async function savePanelSize(settings: CompanionSettings, size: PanelSize) {
  await saveSettings({ ...settings, placement: { ...settings.placement, panelHeight: size.height, panelWidth: size.width } });
}

async function hidePage(settings: CompanionSettings, url: string, setState: RuntimeStateSetter) { await saveRuntimeSettings({ ...settings, hiddenPages: [...new Set([...settings.hiddenPages, url])] }, setState); }

async function restorePage(settings: CompanionSettings, url: string, setState: RuntimeStateSetter) { await saveRuntimeSettings({ ...settings, hiddenPages: settings.hiddenPages.filter((hiddenUrl) => hiddenUrl !== url) }, setState); }

async function hideSite(settings: CompanionSettings, host: string, setState: RuntimeStateSetter) { await saveRuntimeSettings({ ...settings, hiddenSites: [...new Set([...settings.hiddenSites, host])] }, setState); }

async function disableGlobally(settings: CompanionSettings, setState: RuntimeStateSetter) { await saveRuntimeSettings({ ...settings, enabledGlobally: false }, setState); }

function openCompanionSettings() { void requestBackground({ type: "settings:open" }).catch((error) => runtimeLogger.warn("settings page open failed", { error: errorMessage(error) })); }

async function saveSettings(settings: CompanionSettings) {
  await requestBackground({ type: "settings:set", settings });
}

async function saveRuntimeSettings(settings: CompanionSettings, setState: RuntimeStateSetter) {
  const savedSettings = await requestBackground<CompanionSettings>({ type: "settings:set", settings });
  setState((current) => current && { ...current, settings: savedSettings });
}

async function sendDebugEvent(event: DebugEvent) {
  await requestBackground({ type: "debug:event", event }).catch(() => undefined);
}

async function sendRuntimeSnapshot(input: {
  activeChunkId: string | undefined;
  chunks: ReadingChunk[];
  now: number;
  page: InterventionPageContext;
  state: RuntimeState;
}) {
  await requestBackground({
    type: "runtime:snapshot",
    payload: createCurrentRuntimeSnapshot({
      activeChunkId: input.activeChunkId,
      chunks: input.chunks,
      conversationMessages: input.state.conversationMessages,
      now: input.now,
      page: input.page,
      petState: input.state.petState,
      session: input.state.session
    })
  }).catch((error) => runtimeLogger.warn("runtime snapshot failed", { error: errorMessage(error) }));
}

async function requestBackground<T = unknown>(message: RuntimeMessage): Promise<T> {
  const response: { ok: boolean; value?: T; error?: string } = await browser.runtime.sendMessage(message);
  if (!response.ok) throw new Error(response.error ?? "Background request failed.");
  return response.value as T;
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

function bindModelDebugLoop(debugMode: boolean, setState: RuntimeStateSetter) {
  if (!debugMode) return;
  void refreshModelDebug(setState);
  const intervalId = window.setInterval(() => void refreshModelDebug(setState), 2_000);
  return () => window.clearInterval(intervalId);
}

async function refreshModelDebug(setState: RuntimeStateSetter) {
  const modelDebug = await requestBackground<RuntimeDebugModelJobsResult>({ type: "runtime:debugModelJobs" })
    .catch((error) => {
      runtimeLogger.debug("model debug snapshot unavailable", { error: errorMessage(error) });
      return undefined;
    });
  if (!modelDebug) return;
  setState((current) => current && { ...current, modelDebug });
}

function petStateForIntervention(result: InterventionComposeResult): PetStateKey {
  switch (result.action) {
    case "offer_help":
      return "curious";
    case "offer_observation":
      return "reading_detected";
    case "offer_prediction":
    case "ask_question":
      return "about_to_ask";
    case "stay_quiet":
      return "idle";
  }
}
