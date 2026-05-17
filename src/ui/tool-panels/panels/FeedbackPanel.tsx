import {
  ChecksToday,
  CompanionBubble,
  CompanionImage,
  ToolActionButton,
  ToolPanelFrame
} from "../primitives";
import type {
  CompanionPanelThemeId,
  CompanionToolPanelView,
  FeedbackPanelData,
  ToolPanelDataMap
} from "../types";

type FeedbackPanelChromeProps = {
  className?: string;
  closeLabel?: string;
  onClose?: () => void;
  themeId?: CompanionPanelThemeId;
};

export type FeedbackPanelProps = FeedbackPanelChromeProps &
  (FeedbackPanelData | Record<"data", ToolPanelDataMap[CompanionToolPanelView]>);

/** Renders positive grading and hint feedback with mascot, companion messages, and actions. */
export function FeedbackPanel(panelProps: FeedbackPanelProps) {
  const feedbackContent = ("data" in panelProps ? panelProps["data"] : panelProps) as FeedbackPanelData;
  const feedbackActions = feedbackContent.actions ?? [];
  const [firstMessage, ...supportingMessages] = feedbackContent.messages;

  return (
    <ToolPanelFrame
      className={`rc-feedback-panel ${panelProps.className ?? ""}`}
      closeLabel={panelProps.closeLabel}
      onClose={panelProps.onClose}
      themeId={panelProps.themeId}
    >
      <CompanionImage
        className="rc-tool-mascot rc-feedback-panel__mascot"
        slot="happy"
        alt={feedbackContent.title ?? "Reading companion"}
        style={{ justifySelf: "center", marginBottom: "-18px", marginTop: "-12px", width: "min(64%, 250px)" }}
      />

      <div className="rc-feedback-panel__messages">
        {firstMessage ? (
          <CompanionBubble leadAvatar tone="highlight" className="rc-feedback-panel__message">
            <h3>{firstMessage}</h3>
          </CompanionBubble>
        ) : null}

        {supportingMessages.map((message) => (
          <CompanionBubble key={message} leadAvatar tone="default" className="rc-feedback-panel__message">
            <p>{message}</p>
          </CompanionBubble>
        ))}
      </div>

      {feedbackActions.length > 0 ? (
        <div className={feedbackActions.length === 2 ? "rc-tool-actions-row rc-feedback-panel__actions" : "rc-tool-choice-list rc-feedback-panel__actions"}>
          {feedbackActions.map((action, index) => (
            <ToolActionButton
              key={action.id}
              {...action}
              variant={index === 0 ? "primary" : "secondary"}
              wide={feedbackActions.length !== 2}
            />
          ))}
        </div>
      ) : null}

      <ChecksToday count={feedbackContent.checksToday} />
    </ToolPanelFrame>
  );
}
