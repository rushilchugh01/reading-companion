export type InterventionStateValue =
  | "silent"
  | "candidate"
  | "waiting_for_pause"
  | "queued"
  | "prompting"
  | "cooldown";

export type InterventionState = {
  value: InterventionStateValue;
  updatedAt: number;
  candidateId?: string;
  cooldownUntil?: number;
};

export type InterventionEvent =
  | { type: "candidate_found"; now: number; candidateId: string }
  | { type: "wait_for_pause"; now: number }
  | { type: "queue"; now: number }
  | { type: "prompt"; now: number }
  | { type: "cooldown"; now: number; until: number }
  | { type: "clear"; now: number };

/** Creates the default silent intervention state. */
export function createInterventionState(now = 0): InterventionState {
  return { value: "silent", updatedAt: now };
}

/** Advances the intervention lifecycle from candidate discovery through cooldown. */
export function transitionInterventionState(
  state: InterventionState,
  event: InterventionEvent
): InterventionState {
  switch (event.type) {
    case "candidate_found":
      if (state.value === "cooldown" && (state.cooldownUntil ?? 0) > event.now) {
        return state;
      }

      return {
        value: "candidate",
        candidateId: event.candidateId,
        updatedAt: event.now
      };
    case "wait_for_pause":
      return {
        value: "waiting_for_pause",
        candidateId: state.candidateId,
        updatedAt: event.now
      };
    case "queue":
      return { value: "queued", candidateId: state.candidateId, updatedAt: event.now };
    case "prompt":
      return { value: "prompting", candidateId: state.candidateId, updatedAt: event.now };
    case "cooldown":
      return { value: "cooldown", cooldownUntil: event.until, updatedAt: event.now };
    case "clear":
      return { value: "silent", updatedAt: event.now };
  }
}
