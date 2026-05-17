export type QuestionSessionStateValue =
  | "none"
  | "active"
  | "answer_pending"
  | "graded_correct"
  | "graded_partial"
  | "graded_wrong"
  | "retrying"
  | "closed"
  | "stale";

export type QuestionGrade = "correct" | "partial" | "wrong";

export type QuestionSessionState = {
  value: QuestionSessionStateValue;
  sessionId?: string;
  pageId?: string;
  chunkId?: string;
  attempt: number;
  pendingAttempt?: number;
  updatedAt: number;
};

export type QuestionSessionEvent =
  | { type: "start"; now: number; sessionId: string; pageId: string; chunkId: string }
  | { type: "submit_answer"; now: number; sessionId: string }
  | { type: "grade"; now: number; sessionId: string; attempt: number; grade: QuestionGrade }
  | { type: "retry"; now: number; sessionId: string }
  | { type: "page_changed"; now: number; pageId: string }
  | { type: "close"; now: number }
  | { type: "expire"; now: number };

/** Creates an empty question session machine state. */
export function createQuestionSessionState(now = 0): QuestionSessionState {
  return { value: "none", attempt: 0, updatedAt: now };
}

/** Advances a question session while ignoring stale grade and answer events. */
export function transitionQuestionSessionState(
  state: QuestionSessionState,
  event: QuestionSessionEvent
): QuestionSessionState {
  switch (event.type) {
    case "start":
      return startQuestionSession(event);
    case "submit_answer":
      return submitQuestionAnswer(state, event);
    case "grade":
      return gradeQuestionAnswer(state, event);
    case "retry":
      return retryQuestionSession(state, event);
    case "page_changed":
      return staleQuestionOnPageChange(state, event);
    case "close":
      return { ...state, value: "closed", updatedAt: event.now };
    case "expire":
      return { ...state, value: "stale", updatedAt: event.now };
  }
}

/** Starts a new active question session from a start event. */
function startQuestionSession(
  event: Extract<QuestionSessionEvent, { type: "start" }>
): QuestionSessionState {
  return {
    value: "active",
    sessionId: event.sessionId,
    pageId: event.pageId,
    chunkId: event.chunkId,
    attempt: 1,
    updatedAt: event.now
  };
}

/** Moves an answerable session into the answer-pending state. */
function submitQuestionAnswer(
  state: QuestionSessionState,
  event: Extract<QuestionSessionEvent, { type: "submit_answer" }>
): QuestionSessionState {
  if (!isAnswerableSession(state) || state.sessionId !== event.sessionId) {
    return state;
  }

  return { ...state, value: "answer_pending", pendingAttempt: state.attempt, updatedAt: event.now };
}

/** Applies a grade only when both session id and attempt match. */
function gradeQuestionAnswer(
  state: QuestionSessionState,
  event: Extract<QuestionSessionEvent, { type: "grade" }>
): QuestionSessionState {
  if (!isMatchingPendingGrade(state, event)) {
    return state;
  }

  return {
    ...state,
    value: gradeToState(event.grade),
    pendingAttempt: undefined,
    updatedAt: event.now
  };
}

/** Reopens a still-valid question session for another attempt. */
function retryQuestionSession(
  state: QuestionSessionState,
  event: Extract<QuestionSessionEvent, { type: "retry" }>
): QuestionSessionState {
  if (state.sessionId !== event.sessionId || state.value === "closed" || state.value === "stale") {
    return state;
  }

  return {
    ...state,
    value: "retrying",
    attempt: state.attempt + 1,
    pendingAttempt: undefined,
    updatedAt: event.now
  };
}

/** Marks a live question stale when navigation changes pages. */
function staleQuestionOnPageChange(
  state: QuestionSessionState,
  event: Extract<QuestionSessionEvent, { type: "page_changed" }>
): QuestionSessionState {
  if (state.value === "none" || state.value === "closed" || state.pageId === event.pageId) {
    return state;
  }

  return { ...state, value: "stale", updatedAt: event.now };
}

/** Returns true when a grade belongs to the pending answer attempt. */
function isMatchingPendingGrade(
  state: QuestionSessionState,
  event: Extract<QuestionSessionEvent, { type: "grade" }>
): boolean {
  return state.value === "answer_pending"
    && state.sessionId === event.sessionId
    && state.pendingAttempt === event.attempt;
}

/** Returns true when a question exists and still owns chat routing. */
export function hasActiveQuestionSession(state: QuestionSessionState): boolean {
  return isAnswerableSession(state) || state.value === "answer_pending";
}

/** Returns true when a user chat submit should be treated as an answer. */
export function isAnswerableSession(state: QuestionSessionState): boolean {
  return state.value === "active"
    || state.value === "retrying"
    || state.value === "graded_partial"
    || state.value === "graded_wrong";
}

/** Converts a grading label into its stable session state. */
function gradeToState(grade: QuestionGrade): QuestionSessionStateValue {
  switch (grade) {
    case "correct":
      return "graded_correct";
    case "partial":
      return "graded_partial";
    case "wrong":
      return "graded_wrong";
  }
}
