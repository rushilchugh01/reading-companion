import type { Message } from "@earendil-works/pi-ai";
import type { PetStateKey } from "../shared/pet-state-types";
import type { CompanionPackRegistry } from "../shared/companion-pack-registry";
import type { DebugSnapshot } from "../shared/debug-types";
import type { GradeResult, QuestionSession } from "../shared/session-types";
import type { CompanionPanelThemeId } from "./tool-panels/types";

/** Built-in compact panel visual themes available to companion UI callers. */
export const COMPANION_CHAT_THEMES = ["prediction-lilac", "mint-explain", "note-card", "sky-celebrate", "peach-check"] as const;

/** Union of built-in chat theme identifiers. */
export type CompanionChatTheme = (typeof COMPANION_CHAT_THEMES)[number];

/** Fixed viewport coordinates for the companion anchor. */
export type PetPosition = {
  x: number;
  y: number;
};

/** Retry affordance supplied by engine or background adapters. */
export type RetryDisplay = {
  message: string;
  onRetry?: () => void;
};

/** Compact panel size persisted by the host adapter if desired. */
export type PanelSize = {
  width: number;
  height: number;
};

export type HomePanelActionId = "predict" | "summarize" | "why-important";

export type HomePanelActionResult = {
  body: string;
  headline: string;
};

/** UI metadata wrapped around PI's role/content/timestamp message shape. */
export type CompanionConversationMessage = Message & {
  id: string;
  status?: "pending" | "sent" | "error";
};

/** External state and callbacks for the companion UI. */
export type CompanionPetAppProps = {
  petState?: PetStateKey;
  companionPackId?: string;
  companionPackRegistry?: CompanionPackRegistry;
  avatarPackId?: string;
  greeting?: string;
  questionSession?: QuestionSession;
  gradeResult?: GradeResult;
  retryDisplay?: RetryDisplay;
  conversationMessages?: CompanionConversationMessage[];
  debugSnapshot?: DebugSnapshot;
  debugMode?: boolean;
  chatTheme?: CompanionChatTheme;
  panelTheme?: CompanionPanelThemeId;
  initialPosition?: PetPosition;
  initialPanelSize?: PanelSize;
  hidden?: boolean;
  onPositionChange?: (position: PetPosition) => void;
  onPanelSizeChange?: (size: PanelSize) => void;
  onAnswerSubmit?: (answer: string) => void;
  onDisableGlobally?: () => void;
  onRetry?: () => void;
  onHide?: () => void;
  onRestore?: () => void;
  onHideSite?: () => void;
  onHomeAction?: (actionId: HomePanelActionId) => HomePanelActionResult | Promise<HomePanelActionResult>;
  onMinimize?: (minimized: boolean) => void;
  onOpenSettings?: () => void;
};
