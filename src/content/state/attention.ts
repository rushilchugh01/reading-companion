export const ACTIVE_READING_ENTER_SCORE = 0.72;
export const ACTIVE_READING_EXIT_SCORE = 0.45;
export const ACTIVE_READING_ENTER_MS = 8_000;
export const ACTIVE_READING_EXIT_MS = 4_000;

export type AttentionStateValue =
  | "not_reading"
  | "skimming"
  | "reading_candidate"
  | "active_reading"
  | "stuck"
  | "note_taking"
  | "done"
  | "away";

export type AttentionState = {
  value: AttentionStateValue;
  candidateSince?: number;
  exitSince?: number;
  updatedAt: number;
};

export type AttentionEvidence = {
  now: number;
  readingScore: number;
  visible: boolean;
  focused: boolean;
  stuckScore?: number;
  noteTaking?: boolean;
  done?: boolean;
};

/** Creates an initial attention state snapshot. */
export function createAttentionState(
  value: AttentionStateValue = "not_reading",
  now = 0
): AttentionState {
  return { value, updatedAt: now };
}

/** Advances attention using enter and exit hysteresis around reading confidence. */
export function transitionAttentionState(
  state: AttentionState,
  evidence: AttentionEvidence
): AttentionState {
  const directState = getDirectAttentionState(evidence);
  if (directState) {
    return { value: directState, updatedAt: evidence.now };
  }

  if (shouldMarkStuck(state, evidence)) {
    return { value: "stuck", updatedAt: evidence.now };
  }

  if (isActivelyReading(state)) {
    return transitionFromActiveReading(state, evidence);
  }

  if (evidence.readingScore >= ACTIVE_READING_ENTER_SCORE) {
    const candidateSince = state.value === "reading_candidate" && state.candidateSince !== undefined
      ? state.candidateSince
      : evidence.now;
    const sustainedMs = evidence.now - candidateSince;

    if (sustainedMs >= ACTIVE_READING_ENTER_MS) {
      return { value: "active_reading", updatedAt: evidence.now };
    }

    return { value: "reading_candidate", candidateSince, updatedAt: evidence.now };
  }

  if (evidence.readingScore >= ACTIVE_READING_EXIT_SCORE) {
    return { value: "skimming", updatedAt: evidence.now };
  }

  return { value: "not_reading", updatedAt: evidence.now };
}

/** Returns an overriding attention state for direct browser or user evidence. */
function getDirectAttentionState(evidence: AttentionEvidence): AttentionStateValue | undefined {
  if (!evidence.visible || !evidence.focused) {
    return "away";
  }

  if (evidence.done) {
    return "done";
  }

  if (evidence.noteTaking) {
    return "note_taking";
  }

  return undefined;
}

/** Applies the lower exit threshold while preserving active reading briefly. */
function transitionFromActiveReading(
  state: AttentionState,
  evidence: AttentionEvidence
): AttentionState {
  if (evidence.readingScore >= ACTIVE_READING_EXIT_SCORE) {
    return { value: state.value, updatedAt: evidence.now };
  }

  const exitSince = state.exitSince ?? evidence.now;
  const sustainedMs = evidence.now - exitSince;

  if (sustainedMs >= ACTIVE_READING_EXIT_MS) {
    return {
      value: evidence.readingScore > 0.2 ? "skimming" : "not_reading",
      updatedAt: evidence.now
    };
  }

  return { value: state.value, exitSince, updatedAt: evidence.now };
}

/** Returns true when active readers show strong stuck/confused evidence. */
function shouldMarkStuck(state: AttentionState, evidence: AttentionEvidence): boolean {
  return isActivelyReading(state) && (evidence.stuckScore ?? 0) > 0.75;
}

/** Returns true when the current state is in the active-reading band. */
function isActivelyReading(state: AttentionState): boolean {
  return state.value === "active_reading" || state.value === "stuck";
}
