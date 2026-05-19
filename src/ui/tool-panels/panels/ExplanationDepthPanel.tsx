import { BookOpen, FileText, Zap } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import {
  CompanionAvatar,
  CompanionBubble,
  ToolActionButton,
  ToolPanelFrame,
  ToolPanelHeader
} from "../primitives";
import type {
  CompanionPanelThemeId,
  CompanionToolPanelView,
  ExplanationPanelData,
  ToolPanelAction,
  ToolPanelDataMap
} from "../types";

const PANEL_PAYLOAD_PROPERTY = "data" as const;

type ExplanationDepthPanelProps = Partial<ExplanationPanelData> & {
  className?: string;
  closeLabel?: string;
  [PANEL_PAYLOAD_PROPERTY]?: ExplanationPanelData | ToolPanelDataMap[CompanionToolPanelView];
  onClose?: () => void;
  themeId?: CompanionPanelThemeId;
};

const DEFAULT_EXPLANATION = "This part matters because it changes the author's argument.";
const DEFAULT_EXPLANATION_PROMPT = "Want the 10-second version or the deeper explanation?";
const DEFAULT_EXPLANATION_DEPTH_OPTIONS: ToolPanelAction[] = [
  {
    id: "quick",
    label: "Quick",
    icon: <Zap size={24} />
  },
  {
    id: "deeper",
    label: "Deeper",
    icon: <BookOpen size={25} />
  }
];

const quoteLayoutStyle: CSSProperties = {
  alignItems: "center",
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 1fr) auto"
};

const quoteIconStyle: CSSProperties = {
  color: "var(--rc-tool-secondary)",
  opacity: 0.72
};

const messageStackStyle: CSSProperties = {
  display: "grid",
  gap: 12
};

/** Renders the themed deeper-explanation panel for attention/explanation tool states. */
export function ExplanationDepthPanel(panelProperties: ExplanationDepthPanelProps) {
  const explanationPayload = readExplanationPayload(panelProperties);
  const explanationDepthOptions = readExplanationDepthOptions(explanationPayload.actions);

  return (
    <ToolPanelFrame
      className={`rc-tool-panel--explanation-depth ${panelProperties.className ?? ""}`}
      closeLabel={panelProperties.closeLabel ?? "Close explanation panel"}
      onClose={panelProperties.onClose}
      themeId={panelProperties.themeId ?? "mint"}
    >
      <ToolPanelHeader title="Reading Companion" subtitle="Online" avatarSlot="peek" />

      {explanationPayload.quote ? (
        <ExplanationQuoteCard
          highlightedText={explanationPayload.highlightedText}
          quote={explanationPayload.quote}
        />
      ) : null}

      <ExplanationMessageStack
        explanation={explanationPayload.explanation ?? DEFAULT_EXPLANATION}
        prompt={explanationPayload.prompt ?? DEFAULT_EXPLANATION_PROMPT}
      />

      <ExplanationDepthActions depthOptions={explanationDepthOptions} />
    </ToolPanelFrame>
  );
}

function ExplanationQuoteCard(quoteProperties: {
  highlightedText?: string;
  quote: string;
}) {
  return (
    <CompanionBubble className="rc-tool-explanation-quote" tone="highlight">
      <div style={quoteLayoutStyle}>
        <p>{renderHighlightedQuote(quoteProperties.quote, quoteProperties.highlightedText)}</p>
        <FileText aria-hidden="true" size={46} strokeWidth={1.7} style={quoteIconStyle} />
      </div>
    </CompanionBubble>
  );
}

function ExplanationMessageStack(messageProperties: {
  explanation: string;
  prompt?: string;
}) {
  return (
    <div style={messageStackStyle}>
      <div className="rc-tool-message-row">
        <CompanionAvatar slot="peek" size="medium" />
        <CompanionBubble>
          <p>{messageProperties.explanation}</p>
        </CompanionBubble>
      </div>

      {messageProperties.prompt ? (
        <div className="rc-tool-message-row">
          <CompanionAvatar slot="peek" size="medium" />
          <CompanionBubble>
            <p>{messageProperties.prompt}</p>
          </CompanionBubble>
        </div>
      ) : null}
    </div>
  );
}

function ExplanationDepthActions(actionProperties: { depthOptions: ToolPanelAction[] }) {
  return (
    <div className="rc-tool-actions-row" aria-label="Explanation depth options">
      {actionProperties.depthOptions.slice(0, 2).map((depthOption, depthOptionPosition) => (
        <ToolActionButton
          key={depthOption.id}
          {...withDefaultDepthOptionIcon(depthOption, depthOptionPosition)}
          variant={depthOptionPosition === 0 ? "secondary" : "ghost"}
        />
      ))}
    </div>
  );
}

function readExplanationPayload(panelProperties: ExplanationDepthPanelProps): Partial<ExplanationPanelData> {
  const suppliedPanelPayload = panelProperties[PANEL_PAYLOAD_PROPERTY];
  if (!suppliedPanelPayload) return panelProperties;
  if (isExplanationPayload(suppliedPanelPayload)) {
    return suppliedPanelPayload;
  }
  return panelProperties;
}

function isExplanationPayload(
  suppliedPanelPayload: ToolPanelDataMap[CompanionToolPanelView]
): suppliedPanelPayload is ExplanationPanelData {
  return "explanation" in suppliedPanelPayload && typeof suppliedPanelPayload.explanation === "string";
}

function readExplanationDepthOptions(depthOptions?: ToolPanelAction[]): ToolPanelAction[] {
  const visibleDepthOptions = depthOptions?.length ? depthOptions : DEFAULT_EXPLANATION_DEPTH_OPTIONS;
  return visibleDepthOptions.map(withDefaultDepthOptionIcon);
}

function withDefaultDepthOptionIcon(
  depthOption: ToolPanelAction,
  depthOptionPosition: number
): ToolPanelAction {
  return {
    ...depthOption,
    icon: depthOption.icon ?? DEFAULT_EXPLANATION_DEPTH_OPTIONS[depthOptionPosition]?.icon
  };
}

function renderHighlightedQuote(quote: string, highlightedText?: string): ReactNode {
  if (!highlightedText) return quote;

  const highlightStart = quote.toLocaleLowerCase().indexOf(highlightedText.toLocaleLowerCase());
  if (highlightStart === -1) return quote;

  const highlightEnd = highlightStart + highlightedText.length;
  return (
    <>
      {quote.slice(0, highlightStart)}
      <span className="rc-tool-highlight-mark">{quote.slice(highlightStart, highlightEnd)}</span>
      {quote.slice(highlightEnd)}
    </>
  );
}
