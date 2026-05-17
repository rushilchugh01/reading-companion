import { Activity, Ban, Bug, ChevronDown, EyeOff, RotateCcw, Settings, X } from "lucide-react";
import type { AttentionPanelData, ToolPanelAction } from "./tool-panels";
import type { CompanionViewProps } from "./CompanionPetApp";
import type { HomePanelActionId, HomePanelActionResult } from "./types";

type HomePanelDataOptions = {
  actionResult?: HomePanelActionResult;
  onAction: (actionId: HomePanelActionId) => void;
  onDebug: () => void;
  onProcessing: () => void;
  pendingAction?: HomePanelActionId;
};
type HomePanelData = AttentionPanelData & {
  inputValue?: string;
  onInputChange?: (answer: string) => void;
  onInputSubmit?: (answer: string) => void;
};

/** Creates the main clicked-pet panel data with actions, debug buttons, and input wiring. */
export function getHomePanelData(props: CompanionViewProps, options: HomePanelDataOptions): HomePanelData {
  if (props.appProps.retryDisplay && !props.appProps.questionSession) return retryHomePanelData(props, options);
  return {
    ...baseHomePanelData(props, options),
    actions: [
      { id: "summarize", label: "Summarize this bit", onClick: () => options.onAction("summarize") },
      { id: "why-important", label: "Why does this matter?", onClick: () => options.onAction("why-important") },
      { id: "predict", label: "Make a prediction", onClick: () => options.onAction("predict") }
    ],
    body: options.pendingAction ? "Give me a second to look at the bit you are reading." : options.actionResult?.body ?? props.appProps.greeting ?? "Pick a quick reading move or ask me anything.",
    headline: options.pendingAction ? "Thinking..." : options.actionResult?.headline ?? "What would help right now?"
  };
}

/** Returns local fallback copy for the three home-panel reading actions. */
export function defaultHomeActionResult(actionId: HomePanelActionId): HomePanelActionResult {
  switch (actionId) {
    case "predict":
      return {
        headline: "Make a prediction",
        body: "Pause for ten seconds and guess what the next paragraph will claim before you keep reading."
      };
    case "summarize":
      return {
        headline: "Quick summary",
        body: "Restate the main idea of the current section in one plain sentence."
      };
    case "why-important":
      return {
        headline: "Why it matters",
        body: "Look for what this bit changes: the argument, the evidence, the stakes, or what you expect next."
      };
  }
}

function retryHomePanelData(props: CompanionViewProps, options: HomePanelDataOptions): HomePanelData {
  return {
    ...baseHomePanelData(props, options),
    actions: [{
      id: "retry",
      icon: <RotateCcw size={23} />,
      label: "Retry",
      onClick: props.appProps.retryDisplay?.onRetry ?? props.onRetry
    }],
    body: props.appProps.retryDisplay?.message,
    headline: "I could not ask that yet",
    inputValue: undefined,
    isStatus: true,
    onInputChange: undefined,
    onInputSubmit: undefined
  };
}

function baseHomePanelData(props: CompanionViewProps, options: HomePanelDataOptions): HomePanelData {
  return {
    title: props.activePack.name,
    subtitle: "Your reading buddy",
    headline: "What would help right now?",
    headerActions: homeHeaderActions(props, options),
    inputValue: props.answer,
    menuActions: homeMenuActions(props),
    onInputChange: props.onAnswerChange,
    onInputSubmit: (answer) => submitHomeInput(props, answer),
    placeholder: "Ask something !!"
  };
}

function submitHomeInput(props: CompanionViewProps, answer: string) {
  props.onAnswerSubmit?.(answer);
  props.onAnswerChange("");
}

function homeHeaderActions(props: CompanionViewProps, options: HomePanelDataOptions): ToolPanelAction[] {
  return [
    ...(props.onOpenSettings ? [{ id: "settings", label: "Open companion settings", icon: <Settings size={22} />, onClick: props.onOpenSettings }] : []),
    ...(props.appProps.debugMode ? [
      { id: "debug", label: "Open debug panel", icon: <Bug size={22} />, onClick: options.onDebug },
      { id: "processing", label: "Open processing panel", icon: <Activity size={22} />, onClick: options.onProcessing }
    ] : [])
  ];
}

function homeMenuActions(props: CompanionViewProps): ToolPanelAction[] {
  return [
    { id: "minimize", label: "Minimize", icon: <ChevronDown size={18} />, onClick: props.onMinimize },
    ...(props.onHideSite ? [{ id: "hide-site", label: "Hide on this site", icon: <Ban size={18} />, onClick: props.onHideSite }] : []),
    { id: "hide", label: "Hide companion", icon: <EyeOff size={18} />, onClick: props.onHide },
    ...(props.onDisableGlobally ? [{ id: "disable", label: "Disable globally", icon: <X size={18} />, onClick: props.onDisableGlobally }] : [])
  ];
}
