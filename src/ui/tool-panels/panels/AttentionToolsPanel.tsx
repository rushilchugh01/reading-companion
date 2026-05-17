import { Bookmark, FileText, Lightbulb, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import {
  CompanionBubble,
  ToolActionButton,
  ToolInput,
  ToolPanelFrame,
  ToolPanelHeader
} from "../primitives";
import type {
  AttentionPanelData,
  CompanionPanelThemeId,
  CompanionToolPanelView,
  ToolPanelDataMap,
  ToolPanelAction
} from "../types";

export type AttentionToolsPanelProps = Partial<AttentionPanelData> & {
  closeLabel?: string;
  inputValue?: string;
  onClose?: () => void;
  onInputChange?: (value: string) => void;
  onInputSubmit?: (value: string) => void;
  themeId?: CompanionPanelThemeId;
} & Partial<Record<"data", AttentionPanelData | ToolPanelDataMap[CompanionToolPanelView]>>;

const DEFAULT_ACTIONS: ToolPanelAction[] = [
  {
    id: "summarize",
    label: "Summarize",
    icon: <FileText size={23} />
  },
  {
    id: "why-important",
    label: "Why important?",
    icon: <Lightbulb size={23} />
  },
  {
    id: "save-note",
    label: "Save note",
    icon: <Bookmark size={23} />
  }
];

function actionWithFallbackIcon(action: ToolPanelAction, index: number): ToolPanelAction {
  return {
    ...action,
    icon: action.icon ?? DEFAULT_ACTIONS[index]?.icon
  };
}

/** Renders the themed attention panel with contextual reading tools. */
export function AttentionToolsPanel(panelProps: AttentionToolsPanelProps) {
  const panelContent = readAttentionPanelContent(panelProps);
  const {
    actions = DEFAULT_ACTIONS,
    body = "I think this paragraph signals a key idea.",
    headerActions = [],
    headline = "This bit matters.",
    inputValue,
    isStatus = false,
    menuActions = [],
    onInputChange,
    onInputSubmit,
    placeholder = "Ask Companion anything...",
    subtitle = "Your reading buddy",
    title = "Companion"
  } = panelContent;
  const { closeLabel, onClose, themeId } = panelProps;

  return (
    <ToolPanelFrame
      className="rc-tool-panel--attention-tools"
      closeLabel={closeLabel}
      onClose={onClose}
      themeId={themeId}
    >
      <ToolPanelHeader
        avatarSlot="happy"
        title={title}
        subtitle={subtitle}
        menu={<AttentionHeaderActions actions={headerActions} menuActions={menuActions} />}
      />

      <CompanionBubble className="rc-tool-attention-highlight" tone="highlight">
        <h3>{headline}</h3>
      </CompanionBubble>

      <AttentionBody body={body} isStatus={isStatus} />

      <AttentionActionRows actions={visibleAttentionActions(actions)} />

      <AttentionInput
        inputValue={inputValue}
        onInputChange={onInputChange}
        onInputSubmit={onInputSubmit}
        placeholder={placeholder}
      />
    </ToolPanelFrame>
  );
}

function visibleAttentionActions(actions: ToolPanelAction[]): ToolPanelAction[] {
  return actions.length > 0 ? actions : DEFAULT_ACTIONS;
}

function AttentionBody({ body, isStatus }: { body?: string; isStatus: boolean }) {
  if (!body) return null;
  return (
    <CompanionBubble className="rc-tool-attention-body" tone="soft" role={isStatus ? "status" : undefined}>
      <p>{body}</p>
    </CompanionBubble>
  );
}

function AttentionHeaderActions({ actions, menuActions }: { actions: ToolPanelAction[]; menuActions: ToolPanelAction[] }) {
  if (actions.length === 0 && menuActions.length === 0) return null;
  return (
    <div className="rc-tool-header-actions">
      {actions.map((action) => (
        <button key={action.id} className="rc-tool-icon-button" type="button" aria-label={action.label} title={action.label} onClick={action.onClick}>
          {action.icon}
        </button>
      ))}
      {menuActions.length > 0 ? <AttentionMenuButton actions={menuActions} /> : null}
    </div>
  );
}

function AttentionMenuButton({ actions }: { actions: ToolPanelAction[] }) {
  const [open, setOpen] = useState(false);

  function runAction(action: ToolPanelAction) {
    setOpen(false);
    action.onClick?.();
  }

  return (
    <div className="rc-tool-menu">
      <button
        className="rc-tool-icon-button"
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Open companion tools"
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal size={24} />
      </button>
      {open ? (
        <div className="rc-tool-menu__popover" role="menu">
          {actions.map((action) => (
            <button key={action.id} type="button" role="menuitem" onClick={() => runAction(action)}>
              {action.icon ? <span className="rc-tool-menu__icon">{action.icon}</span> : null}
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AttentionActionRows({ actions }: { actions: ToolPanelAction[] }) {
  return (
    <div className="rc-tool-choice-list rc-tool-attention-actions">
      {actions.map((action, index) => (
        <ToolActionButton
          key={action.id}
          {...actionWithFallbackIcon(action, index)}
          variant="ghost"
          wide
        />
      ))}
    </div>
  );
}

function AttentionInput({
  inputValue,
  onInputChange,
  onInputSubmit,
  placeholder
}: Pick<AttentionToolsPanelProps, "inputValue" | "onInputChange" | "onInputSubmit" | "placeholder">) {
  if (!onInputSubmit && !onInputChange && inputValue === undefined) return null;

  return (
    <ToolInput
      buttonLabel="Send message"
      placeholder={placeholder}
      value={inputValue}
      onSubmit={onInputSubmit}
      onValueChange={onInputChange}
    />
  );
}

function readAttentionPanelContent(panelProps: AttentionToolsPanelProps): Partial<AttentionPanelData> {
  const explicitPanelContent = panelProps["data"];
  if (!explicitPanelContent) return panelProps;
  if (isAttentionPanelContent(explicitPanelContent)) {
    return explicitPanelContent;
  }
  return panelProps;
}

function isAttentionPanelContent(panelContent: ToolPanelDataMap[CompanionToolPanelView]): panelContent is AttentionPanelData {
  return "headline" in panelContent && typeof panelContent.headline === "string";
}
