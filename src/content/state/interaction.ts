export type InteractionStateValue =
  | "pet_visible"
  | "peek"
  | "chat_open"
  | "snoozed"
  | "hidden"
  | "sleeping";

export type InteractionState = {
  value: InteractionStateValue;
  updatedAt: number;
  snoozedUntil?: number;
};

export type InteractionEvent =
  | { type: "show_pet"; now: number }
  | { type: "peek_bubble"; now: number }
  | { type: "open_chat"; now: number }
  | { type: "close_chat"; now: number }
  | { type: "snooze"; now: number; until: number }
  | { type: "hide"; now: number }
  | { type: "sleep"; now: number }
  | { type: "wake"; now: number };

/** Creates the default user interaction state for a visible companion. */
export function createInteractionState(now = 0): InteractionState {
  return { value: "pet_visible", updatedAt: now };
}

/** Applies explicit user or pet visibility events to the interaction machine. */
export function transitionInteractionState(
  state: InteractionState,
  event: InteractionEvent
): InteractionState {
  switch (event.type) {
    case "show_pet":
    case "wake":
    case "close_chat":
      return { value: "pet_visible", updatedAt: event.now };
    case "peek_bubble":
      return { value: "peek", updatedAt: event.now };
    case "open_chat":
      if (state.value === "hidden") {
        return { ...state, updatedAt: event.now };
      }

      return { value: "chat_open", updatedAt: event.now };
    case "snooze":
      return { value: "snoozed", updatedAt: event.now, snoozedUntil: event.until };
    case "hide":
      return { value: "hidden", updatedAt: event.now };
    case "sleep":
      return { value: "sleeping", updatedAt: event.now };
  }
}

/** Returns true when proactive prompts should stay silent. */
export function suppressesProactivePrompts(state: InteractionState): boolean {
  return state.value === "chat_open" || state.value === "snoozed" || state.value === "hidden";
}

/** Returns true when even user-initiated interaction should be blocked. */
export function suppressesAllInteraction(state: InteractionState): boolean {
  return state.value === "hidden";
}

/** Returns true when the user may open chat from the current interaction state. */
export function canOpenUserChat(state: InteractionState): boolean {
  return state.value !== "hidden";
}
