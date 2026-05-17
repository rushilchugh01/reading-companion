import {
  CompanionBubble,
  ToolActionButton,
  ToolInput,
  ToolPanelFrame,
  ToolPanelHeader
} from "../primitives";
import type {
  CompanionPanelThemeId,
  CompanionToolPanelView,
  QuestionResponsePanelData,
  ToolPanelDataMap
} from "../types";
import type { CompanionConversationMessage } from "../../types";

type ConversationContentBlock = Exclude<CompanionConversationMessage["content"], string>[number];

type QuestionResponsePanelChromeProps = {
  className?: string;
  closeLabel?: string;
  onClose?: () => void;
  themeId?: CompanionPanelThemeId;
};

export type QuestionResponsePanelProps = QuestionResponsePanelChromeProps &
  (QuestionResponsePanelData | Record<"data", ToolPanelDataMap[CompanionToolPanelView]>);

/** Renders the reusable ask-question panel with optional helper copy, chips, and answer input. */
export function QuestionResponsePanel(panelProps: QuestionResponsePanelProps) {
  const questionContent = ("data" in panelProps ? panelProps["data"] : panelProps) as QuestionResponsePanelData;
  const visibleMessages = questionContent.messages?.length ? questionContent.messages : undefined;

  return (
    <ToolPanelFrame
      className={`rc-question-response-panel ${panelProps.className ?? ""}`}
      closeLabel={panelProps.closeLabel}
      onClose={panelProps.onClose}
      themeId={panelProps.themeId}
    >
      <ToolPanelHeader
        title={questionContent.title ?? "Reading Companion"}
        subtitle={questionContent.subtitle ?? "Here to help"}
        avatarState="curious"
      />

      <QuestionContent messages={visibleMessages} prompt={questionContent.prompt} />
      <QuestionHelper helper={visibleMessages ? undefined : questionContent.helper} />
      <QuestionQuickChoices choices={questionContent.quickChoices} />

      {questionContent.showInput === false ? null : (
        <ToolInput
          buttonLabel={questionContent.submitLabel}
          className="rc-question-response-panel__input"
          disabled={questionContent.inputDisabled}
          onSubmit={questionContent.onSubmit}
          onValueChange={questionContent.onValueChange}
          placeholder={questionContent.placeholder ?? "Type your answer..."}
          value={questionContent.value}
        />
      )}
    </ToolPanelFrame>
  );
}

function QuestionContent(props: { messages?: CompanionConversationMessage[]; prompt: string }) {
  if (props.messages) return <ConversationTranscript messages={props.messages} />;
  return (
    <CompanionBubble leadAvatar tone="primary" className="rc-question-response-panel__prompt">
      <h3>{props.prompt}</h3>
    </CompanionBubble>
  );
}

function QuestionHelper(props: { helper?: string }) {
  if (!props.helper) return null;
  return (
    <CompanionBubble tone="soft" className="rc-question-response-panel__helper" role="status">
      <p>{props.helper}</p>
    </CompanionBubble>
  );
}

function QuestionQuickChoices(props: { choices?: QuestionResponsePanelData["quickChoices"] }) {
  if (!props.choices?.length) return null;
  return (
    <div className="rc-tool-chip-row rc-question-response-panel__choices" aria-label="Quick choices">
      {props.choices.map((choice) => (
        <ToolActionButton key={choice.id} {...choice} variant="ghost" />
      ))}
    </div>
  );
}

function ConversationTranscript(props: { messages: CompanionConversationMessage[] }) {
  return (
    <div className="rc-question-response-panel__conversation" role="log" aria-live="polite" aria-label="Question conversation">
      {props.messages.map((message) => (
        <ConversationMessage key={message.id} message={message} />
      ))}
    </div>
  );
}

function ConversationMessage(props: { message: CompanionConversationMessage }) {
  const text = messageText(props.message);
  if (!text) return null;
  if (props.message.role === "user") {
    return (
      <div className="rc-question-response-panel__turn rc-question-response-panel__turn--user">
        <div className="rc-tool-bubble rc-tool-bubble--user">
          <p>{text}</p>
          {props.message.status ? <small>{statusLabel(props.message.status)}</small> : null}
        </div>
      </div>
    );
  }

  return (
    <CompanionBubble
      leadAvatar
      tone={props.message.status === "error" ? "highlight" : "primary"}
      className="rc-question-response-panel__turn rc-question-response-panel__turn--assistant"
      role={props.message.status === "error" ? "status" : undefined}
    >
      <p>{text}</p>
      {props.message.status ? <small>{statusLabel(props.message.status)}</small> : null}
    </CompanionBubble>
  );
}

function messageText(message: CompanionConversationMessage): string {
  if (typeof message.content === "string") return message.content.trim();
  return message.content
    .map(contentBlockText)
    .filter((text): text is string => Boolean(text))
    .join("")
    .trim();
}

function contentBlockText(block: ConversationContentBlock): string | undefined {
  if (block.type === "text") return block.text;
  if (block.type !== "toolCall") return undefined;
  if (block.name === "ask_question") return stringArgument(block.arguments, "question");
  if (block.name === "offer_hint") return stringArgument(block.arguments, "retryPrompt") ?? stringArgument(block.arguments, "hint");
  if (block.name === "grade_answer") return stringArgument(block.arguments, "feedback");
  if (block.name === "get_attention") return stringArgument(block.arguments, "copy");
  return undefined;
}

function stringArgument(argumentsRecord: Record<string, unknown>, key: string): string | undefined {
  const value = argumentsRecord[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function statusLabel(status: NonNullable<CompanionConversationMessage["status"]>): string {
  if (status === "pending") return "Checking...";
  if (status === "error") return "Could not send";
  return "Sent";
}
