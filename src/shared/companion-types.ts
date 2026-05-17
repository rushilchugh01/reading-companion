/** Visual and behavioral state names understood by avatar packs. */
export type PetStateKey =
  | "idle"
  | "reading_detected"
  | "curious"
  | "thinking"
  | "about_to_ask"
  | "listening"
  | "grading"
  | "confused"
  | "celebratory"
  | "sleeping"
  | "debug_active";

/** Declarative animation descriptor for a companion avatar. */
export type AnimationSpec = {
  name: string;
  durationMilliseconds: number;
  intensity: 0 | 1 | 2 | 3;
};

/** Persona preference for generated question style. */
export type QuestionStyleBias = {
  recall: number;
  reasoning: number;
  prediction: number;
  skepticism: number;
  analogy: number;
  codeWalkthrough: number;
};

/** Copy templates used before model generation. */
export type InterruptionCopy = {
  greeting: string;
  nudge: string[];
  retry: string;
  dismissed: string;
};

/** Slottable visual/persona pack for the companion. */
export type AvatarPack = {
  id: string;
  name: string;
  version: string;
  mascotType: "dog" | "cat" | "owl" | "blob" | "custom";
  assets: {
    staticFallback: string;
    spritesheet?: string;
    lottie?: Record<string, string>;
    rive?: string;
  };
  animations: Record<string, AnimationSpec>;
  stateMapping: Partial<Record<PetStateKey, string>>;
  soul: {
    personaPrompt: string;
    gradingPromptModifier: string;
    questionStyleBias: QuestionStyleBias;
    interruptionCopy: InterruptionCopy;
    defaultStrictness: "chill" | "medium" | "strict";
    defaultInterruptionCadence: "low" | "medium" | "high";
  };
  constraints: {
    maxAnimationIntensity: 0 | 1 | 2 | 3;
    allowProactiveInterruptions: boolean;
    allowSarcasm: boolean;
    allowLookAheadInsights: boolean;
  };
};
