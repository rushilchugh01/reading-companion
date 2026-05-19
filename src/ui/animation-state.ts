import type { AnimationRuntimeState, AnimationSlot } from "../shared/animation-types";
import { resolveAnimationSlot } from "../shared/animation-types";
import type { PetStateKey } from "../shared/pet-state-types";

const PET_STATE_ANIMATION_FACTS: Record<PetStateKey, AnimationRuntimeState> = {
  about_to_ask: { intervention: { prompting: true } },
  celebratory: { attention: { done: true } },
  confused: { attention: { stuck: true } },
  curious: { page: { scanning: true } },
  debug_active: { page: { scanning: true } },
  grading: { chat: { open: true, pending: true } },
  idle: {},
  listening: { chat: { open: true } },
  reading_detected: { attention: { activeReading: true } },
  sleeping: { attention: { away: true } },
  thinking: { intervention: { queued: true } }
};

/** Resolves legacy pet state into the richer animation slot system. */
export function animationSlotForPetState(petState: PetStateKey): AnimationSlot {
  return resolveAnimationSlot(PET_STATE_ANIMATION_FACTS[petState]);
}
