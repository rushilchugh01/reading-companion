/** Canonical animation slots emitted by runtime state and consumed by avatar packs. */
export const ANIMATION_SLOTS = [
  "hidden",
  "idle",
  "sleep",
  "scan",
  "article_found",
  "focus",
  "deep_focus",
  "skim_watch",
  "concern",
  "raise_paw",
  "bubble_peek",
  "listen",
  "think",
  "explain",
  "happy",
  "dismissed_settle",
  "error_soft",
  "sit_back_down",
  "back_off",
  "quiet_idle",
  "low_energy_idle"
] as const;

export type AnimationSlot = (typeof ANIMATION_SLOTS)[number];

export type AssistantMode = "chat" | "explain" | "grade" | "none";

export type AnimationRuntimeState = {
  hidden?: boolean;
  chat?: {
    open?: boolean;
    pending?: boolean;
    lastAssistantMode?: AssistantMode;
  };
  petBehavior?: {
    dismissedSettle?: boolean;
    backOff?: boolean;
    sitBackDown?: boolean;
    lowEnergy?: boolean;
    errorSoft?: boolean;
  };
  intervention?: {
    prompting?: boolean;
    queued?: boolean;
  };
  page?: {
    scanning?: boolean;
    articleFound?: boolean;
    quiet?: boolean;
    unsupported?: boolean;
  };
  attention?: {
    stuck?: boolean;
    activeReading?: boolean;
    deepFocus?: boolean;
    skimming?: boolean;
    done?: boolean;
    away?: boolean;
  };
  cooldown?: {
    allProactive?: boolean;
  };
};

export type AvatarClip = {
  id: string;
  slot: AnimationSlot;
  src: string;
  type: "sprite" | "lottie" | "rive" | "video" | "css";
  durationMilliseconds: number;
  intensity: 0 | 1 | 2 | 3;
  loop: boolean;
};

export type AvatarPack = {
  id: string;
  name: string;
  version: string;
  species: string;
  supportedSlots: readonly AnimationSlot[];
  clips: Partial<Record<AnimationSlot, AvatarClip>>;
  fallback: Partial<Record<AnimationSlot, AnimationSlot>>;
  personality: {
    tone: "gentle" | "direct" | "strict";
    promptStyle: string;
    backoffCopy: string;
  };
  thresholds: {
    maxIntensity: 0 | 1 | 2 | 3;
    proactiveMotionMinimumMilliseconds: number;
    backoffQuietMilliseconds: number;
  };
  motionProfile: {
    energy: "low" | "medium" | "high";
    bounce: number;
    gazeTracking: boolean;
    reducedMotionSlot: AnimationSlot;
  };
};

const ATTENTION_SLOT_PRIORITIES: readonly [
  keyof NonNullable<AnimationRuntimeState["attention"]>,
  AnimationSlot
][] = [
  ["stuck", "concern"],
  ["deepFocus", "deep_focus"],
  ["activeReading", "focus"],
  ["skimming", "skim_watch"],
  ["done", "happy"],
  ["away", "sleep"]
];

/** Resolves volatile companion state into one declarative animation slot. */
export function resolveAnimationSlot(state: Readonly<AnimationRuntimeState>): AnimationSlot {
  if (state.hidden) return "hidden";
  if (state.chat?.open) return resolveChatSlot(state);
  return resolveNonChatSlot(state);
}

/** Resolves the narrowed chat-open branch of the animation state. */
function resolveChatSlot(state: Readonly<AnimationRuntimeState>): AnimationSlot {
  if (state.chat?.pending) return "think";
  if (state.chat?.lastAssistantMode === "explain") return "explain";
  return "listen";
}

/** Resolves all non-chat animation state by priority. */
function resolveNonChatSlot(state: Readonly<AnimationRuntimeState>): AnimationSlot {
  return (
    resolvePetConsequenceSlot(state) ??
    resolveProactiveSlot(state) ??
    resolvePageSlot(state) ??
    resolveAttentionSlot(state) ??
    "idle"
  );
}

/** Resolves user/pet behavior consequences that should quiet later animation. */
function resolvePetConsequenceSlot(
  state: Readonly<AnimationRuntimeState>
): AnimationSlot | undefined {
  if (state.petBehavior?.errorSoft) return "error_soft";
  if (state.petBehavior?.dismissedSettle) return "dismissed_settle";
  if (state.petBehavior?.sitBackDown) return "sit_back_down";
  if (state.petBehavior?.backOff) return "back_off";
  if (state.petBehavior?.lowEnergy) return "low_energy_idle";
  return undefined;
}

/** Resolves proactive intervention and cooldown slots. */
function resolveProactiveSlot(state: Readonly<AnimationRuntimeState>): AnimationSlot | undefined {
  if (state.cooldown?.allProactive) return "quiet_idle";
  if (state.intervention?.prompting) return "raise_paw";
  if (state.intervention?.queued) return "think";
  return undefined;
}

/** Resolves page-loading and page-capability slots. */
function resolvePageSlot(state: Readonly<AnimationRuntimeState>): AnimationSlot | undefined {
  if (state.page?.scanning) return "scan";
  if (state.page?.articleFound) return "article_found";
  if (state.page?.quiet) return "quiet_idle";
  if (state.page?.unsupported) return "idle";
  return undefined;
}

/** Resolves reader attention slots after higher-priority gates. */
function resolveAttentionSlot(state: Readonly<AnimationRuntimeState>): AnimationSlot | undefined {
  return ATTENTION_SLOT_PRIORITIES.find(([key]) => state.attention?.[key])?.[1];
}
