import type { AvatarPack } from "../shared/companion-types";

const animations = {
  idle_breathe: { name: "idle_breathe", durationMilliseconds: 1800, intensity: 1 },
  blink: { name: "blink", durationMilliseconds: 220, intensity: 1 },
  watching_look: { name: "watching_look", durationMilliseconds: 900, intensity: 1 },
  curious_tilt: { name: "curious_tilt", durationMilliseconds: 700, intensity: 2 },
  prompt_nudge: { name: "prompt_nudge", durationMilliseconds: 850, intensity: 2 },
  listening_idle: { name: "listening_idle", durationMilliseconds: 1400, intensity: 1 },
  thinking_grade: { name: "thinking_grade", durationMilliseconds: 1000, intensity: 2 },
  correct_nod: { name: "correct_nod", durationMilliseconds: 780, intensity: 2 },
  wrong_deadpan: { name: "wrong_deadpan", durationMilliseconds: 900, intensity: 1 },
  hint_lightbulb: { name: "hint_lightbulb", durationMilliseconds: 900, intensity: 2 },
  sleep_minimized: { name: "sleep_minimized", durationMilliseconds: 1600, intensity: 0 },
  debug_mode: { name: "debug_mode", durationMilliseconds: 1000, intensity: 1 },
  memory_save: { name: "memory_save", durationMilliseconds: 800, intensity: 1 }
} as const;

/** Built-in v0 dog companion with direct Brutal Tutor persona. */
export const brutalTutorDogPack: AvatarPack = {
  id: "brutal-tutor-dog",
  name: "Brutal Tutor Dog",
  version: "0.0.1",
  mascotType: "dog",
  assets: {
    staticFallback: "/assets/corgi-states-transparent/idle.png"
  },
  animations,
  stateMapping: {
    idle: "idle_breathe",
    reading_detected: "watching_look",
    curious: "curious_tilt",
    thinking: "thinking_grade",
    about_to_ask: "prompt_nudge",
    listening: "listening_idle",
    grading: "thinking_grade",
    confused: "wrong_deadpan",
    celebratory: "correct_nod",
    sleeping: "sleep_minimized",
    debug_active: "debug_mode"
  },
  soul: {
    personaPrompt:
      "You are a cute dog-shaped reading tutor with a Brutal Tutor soul. Be direct, brief, and medium-strict. Do not flatter. Make the reader reconstruct the idea.",
    gradingPromptModifier:
      "Grade medium-strictly. Reward causal understanding and penalize handwaving. If weak, give one hint before explaining.",
    questionStyleBias: {
      recall: 0.2,
      reasoning: 0.35,
      prediction: 0.15,
      skepticism: 0.15,
      analogy: 0.05,
      codeWalkthrough: 0.1
    },
    interruptionCopy: {
      greeting: "hieee — I’ll stay quiet unless something worth checking shows up.",
      nudge: [
        "Tiny check. What is the actual claim here?",
        "Before you keep going, predict what this sets up.",
        "This part is doing work. Why does it matter?"
      ],
      retry: "Not enough. Try again with the causal link.",
      dismissed: "Got it. I’ll back off for a bit."
    },
    defaultStrictness: "medium",
    defaultInterruptionCadence: "medium"
  },
  constraints: {
    maxAnimationIntensity: 2,
    allowProactiveInterruptions: true,
    allowSarcasm: false,
    allowLookAheadInsights: true
  }
};
