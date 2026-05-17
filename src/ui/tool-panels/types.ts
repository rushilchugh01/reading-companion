import type { CompanionToolName } from "../../background/companion-tools";
import type { CompanionConversationMessage } from "../types";

export type CompanionPanelThemeId = "corgi-classic" | "sky" | "mint" | "peach" | "lavender";

export type CompanionPanelTheme = {
  id: CompanionPanelThemeId;
  name: string;
  variables: Record<`--rc-tool-${string}`, string>;
};

export type CompanionToolPanelView =
  | "question-response"
  | "prediction-choice"
  | "prediction-input"
  | "feedback-actions"
  | "memory-save"
  | "attention-tools"
  | "explanation-depth";

export type ToolPanelAction = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
};

export type QuestionResponsePanelData = {
  title?: string;
  subtitle?: string;
  prompt: string;
  helper?: string;
  inputDisabled?: boolean;
  messages?: CompanionConversationMessage[];
  showInput?: boolean;
  placeholder?: string;
  quickChoices?: ToolPanelAction[];
  submitLabel?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
};

export type PredictionPanelData = {
  prompt: string;
  instruction?: string;
  choices?: ToolPanelAction[];
  placeholder?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
};

export type FeedbackPanelData = {
  title?: string;
  messages: string[];
  actions?: ToolPanelAction[];
  checksToday?: number;
};

export type MemorySavePanelData = {
  title?: string;
  messages: string[];
  saveAction?: ToolPanelAction;
  continueAction?: ToolPanelAction;
  privacyNote?: string;
};

export type AttentionPanelData = {
  title?: string;
  subtitle?: string;
  headline: string;
  body?: string;
  actions?: ToolPanelAction[];
  headerActions?: ToolPanelAction[];
  inputValue?: string;
  isStatus?: boolean;
  menuActions?: ToolPanelAction[];
  onInputChange?: (value: string) => void;
  onInputSubmit?: (value: string) => void;
  placeholder?: string;
};

export type ExplanationPanelData = {
  quote?: string;
  highlightedText?: string;
  explanation: string;
  prompt?: string;
  actions?: ToolPanelAction[];
};

export type ToolPanelDataMap = {
  "question-response": QuestionResponsePanelData;
  "prediction-choice": PredictionPanelData;
  "prediction-input": PredictionPanelData;
  "feedback-actions": FeedbackPanelData;
  "memory-save": MemorySavePanelData;
  "attention-tools": AttentionPanelData;
  "explanation-depth": ExplanationPanelData;
};

export type ToolPanelProps<TView extends CompanionToolPanelView = CompanionToolPanelView> = {
  view: TView;
  themeId?: CompanionPanelThemeId;
  panelData: ToolPanelDataMap[TView];
};

export const PANEL_VIEW_BY_TOOL: Partial<Record<CompanionToolName, CompanionToolPanelView>> = {
  ask_question: "question-response",
  offer_prediction: "prediction-choice",
  grade_answer: "feedback-actions",
  offer_hint: "feedback-actions",
  save_weak_concept: "memory-save",
  get_attention: "attention-tools"
};
