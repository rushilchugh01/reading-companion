import { BookMarked, BookOpen } from "lucide-react";
import {
  CompanionBubble,
  CompanionImage,
  PrivacyNote,
  ToolActionButton,
  ToolPanelFrame
} from "../primitives";
import type {
  CompanionPanelThemeId,
  CompanionToolPanelView,
  MemorySavePanelData,
  ToolPanelDataMap,
  ToolPanelAction
} from "../types";

export type MemorySavePanelProps = Partial<MemorySavePanelData> & {
  closeLabel?: string;
  onClose?: () => void;
  themeId?: CompanionPanelThemeId;
} & Partial<Record<"data", MemorySavePanelData | ToolPanelDataMap[CompanionToolPanelView]>>;

const DEFAULT_MESSAGES = [
  "Nice catch.",
  "You spotted an important detail.",
  "Want to save it to memory?"
];

function withDefaultIcon(action: ToolPanelAction | undefined, fallback: ToolPanelAction): ToolPanelAction {
  return {
    ...fallback,
    ...action,
    icon: action?.icon ?? fallback.icon
  };
}

/** Renders the themed save-to-memory panel for noteworthy reading moments. */
export function MemorySavePanel(panelProps: MemorySavePanelProps) {
  const panelContent = readMemorySaveContent(panelProps);
  const {
    closeLabel,
    onClose,
    themeId
  } = panelProps;
  const {
    continueAction,
    messages = DEFAULT_MESSAGES,
    privacyNote = "Saved memories are private to you.",
    saveAction,
    title
  } = panelContent;
  const visibleMessages = messages.length > 0 ? messages : DEFAULT_MESSAGES;
  const primaryAction = withDefaultIcon(saveAction, {
    id: "save-memory",
    label: "Save it",
    icon: <BookMarked size={24} />
  });
  const secondaryAction = withDefaultIcon(continueAction, {
    id: "continue-reading",
    label: "Keep reading",
    icon: <BookOpen size={25} />
  });

  return (
    <ToolPanelFrame
      className="rc-tool-panel--memory-save"
      closeLabel={closeLabel}
      onClose={onClose}
      themeId={themeId}
    >
      {title ? <span className="rc-tool-panel-kicker">{title}</span> : null}
      <div className="rc-tool-memory-hero" aria-hidden="true">
        <CompanionImage className="rc-tool-mascot rc-tool-memory-hero__mascot" slot="happy" />
      </div>

      <div className="rc-tool-memory-stack">
        {visibleMessages.slice(0, 3).map((message, index) => (
          <CompanionBubble
            key={`${message}-${index}`}
            leadAvatar
            tone={index === 0 ? "primary" : "default"}
          >
            <p>{message}</p>
          </CompanionBubble>
        ))}
      </div>

      <div className="rc-tool-actions-row">
        <ToolActionButton {...primaryAction} variant="primary" />
        <ToolActionButton {...secondaryAction} variant="secondary" />
      </div>

      {privacyNote ? <PrivacyNote>{privacyNote}</PrivacyNote> : null}
    </ToolPanelFrame>
  );
}

function readMemorySaveContent(panelProps: MemorySavePanelProps): Partial<MemorySavePanelData> {
  const explicitPanelContent = panelProps["data"];
  if (!explicitPanelContent) return panelProps;
  if (isMemorySaveContent(explicitPanelContent)) {
    return explicitPanelContent;
  }
  return panelProps;
}

function isMemorySaveContent(panelContent: ToolPanelDataMap[CompanionToolPanelView]): panelContent is MemorySavePanelData {
  return "messages" in panelContent && Array.isArray(panelContent.messages);
}
