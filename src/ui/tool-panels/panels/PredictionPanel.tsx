import { Heart, Search, TriangleAlert } from "lucide-react";
import type { CSSProperties } from "react";
import {
  CompanionBubble,
  ToolActionButton,
  ToolChoiceList,
  ToolInput,
  ToolPanelFrame
} from "../primitives";
import type {
  CompanionPanelThemeId,
  PredictionPanelData,
  ToolPanelAction,
  ToolPanelDataMap
} from "../types";

type CompatiblePanelData = ToolPanelDataMap[keyof ToolPanelDataMap];

export type PredictionPanelProps = {
  className?: string;
  closeLabel?: string;
  ["data"]: CompatiblePanelData;
  onClose?: () => void;
  themeId?: CompanionPanelThemeId;
};

const DEFAULT_CHOICES: ToolPanelAction[] = [
  {
    id: "hero-apologizes",
    label: "The hero apologizes",
    icon: <Heart size={25} />
  },
  {
    id: "new-clue",
    label: "A new clue appears",
    icon: <Search size={25} />
  },
  {
    id: "something-goes-wrong",
    label: "Something goes wrong",
    icon: <TriangleAlert size={25} />
  }
];

const DEFAULT_SUGGESTIONS: ToolPanelAction[] = [
  {
    id: "gets-worse",
    label: "It gets worse"
  },
  {
    id: "solution-appears",
    label: "A solution appears"
  }
];

const panelStackStyle: CSSProperties = {
  alignContent: "start",
  gap: 18
};

const promptStackStyle: CSSProperties = {
  display: "grid",
  gap: 16
};

const paginationStyle: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  gap: 8,
  marginTop: 2
};

const activeDotStyle: CSSProperties = {
  background: "var(--rc-tool-primary)",
  opacity: 0.8
};

const mutedDotStyle: CSSProperties = {
  background: "var(--rc-tool-primary-soft)",
  opacity: 1
};

const dotStyle: CSSProperties = {
  borderRadius: 999,
  display: "block",
  height: 10,
  width: 10
};

function withDefaultChoiceIcon(action: ToolPanelAction, index: number): ToolPanelAction {
  return {
    ...action,
    icon: action.icon ?? DEFAULT_CHOICES[index]?.icon
  };
}

function getChoiceActions(predictionPayload: PredictionPanelData): ToolPanelAction[] {
  const choices = predictionPayload.choices?.length ? predictionPayload.choices : DEFAULT_CHOICES;
  return choices.map(withDefaultChoiceIcon);
}

function getSuggestionActions(predictionPayload: PredictionPanelData): ToolPanelAction[] {
  return predictionPayload.choices?.length ? predictionPayload.choices : DEFAULT_SUGGESTIONS;
}

function toPredictionPanelData(panelPayload: CompatiblePanelData): PredictionPanelData {
  if (isPromptCompatiblePanel(panelPayload)) {
    return {
      choices: promptCompatibleChoices(panelPayload),
      instruction: promptCompatibleInstruction(panelPayload),
      onSubmit: panelPayload.onSubmit,
      onValueChange: panelPayload.onValueChange,
      placeholder: panelPayload.placeholder,
      prompt: panelPayload.prompt,
      value: panelPayload.value
    };
  }

  if ("headline" in panelPayload) {
    return {
      choices: panelPayload.actions,
      instruction: panelPayload.body,
      placeholder: panelPayload.placeholder,
      prompt: panelPayload.headline
    };
  }

  if ("explanation" in panelPayload) {
    return {
      choices: panelPayload.actions,
      instruction: panelPayload.prompt,
      prompt: panelPayload.explanation
    };
  }

  if ("messages" in panelPayload && Array.isArray(panelPayload.messages)) {
    const [firstMessage, secondMessage] = panelPayload.messages.map(predictionMessageText);
    return {
      prompt: firstMessage || "What do you think happens next?",
      instruction: secondMessage
    };
  }

  return {
    prompt: "What do you think happens next?"
  };
}

function isPromptCompatiblePanel(panelPayload: CompatiblePanelData): panelPayload is PredictionPanelData | ToolPanelDataMap["question-response"] {
  return "prompt" in panelPayload && typeof panelPayload.prompt === "string" && !("explanation" in panelPayload);
}

function promptCompatibleChoices(panelPayload: PredictionPanelData | ToolPanelDataMap["question-response"]): ToolPanelAction[] | undefined {
  if ("choices" in panelPayload) return panelPayload.choices;
  if ("quickChoices" in panelPayload) return panelPayload.quickChoices;
  return undefined;
}

function promptCompatibleInstruction(panelPayload: PredictionPanelData | ToolPanelDataMap["question-response"]): string | undefined {
  if ("instruction" in panelPayload) return panelPayload.instruction;
  if ("helper" in panelPayload) return panelPayload.helper;
  return undefined;
}

function predictionMessageText(message: unknown): string | undefined {
  if (typeof message === "string") return message;
  if (!message || typeof message !== "object" || !("content" in message)) return undefined;
  const { content } = message;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return undefined;
  return content
    .filter(isTextContentBlock)
    .map((block) => block.text)
    .join("")
    .trim() || undefined;
}

function isTextContentBlock(block: unknown): block is { type: "text"; text: string } {
  return (
    typeof block === "object" &&
    block !== null &&
    "type" in block &&
    block.type === "text" &&
    "text" in block &&
    typeof block.text === "string"
  );
}

function PaginationDots() {
  return (
    <div className="rc-prediction-panel__pagination" aria-hidden="true" style={paginationStyle}>
      <span style={{ ...dotStyle, ...activeDotStyle }} />
      <span style={{ ...dotStyle, ...mutedDotStyle }} />
      <span style={{ ...dotStyle, ...mutedDotStyle }} />
    </div>
  );
}

/** Renders the multiple-choice prediction panel for look-ahead reading prompts. */
export function PredictionChoicePanel(predictionPanelProps: PredictionPanelProps) {
  const predictionData = toPredictionPanelData(predictionPanelProps["data"]);
  const choices = getChoiceActions(predictionData);

  return (
    <ToolPanelFrame
      className={`rc-prediction-panel rc-prediction-panel--choice ${predictionPanelProps.className ?? ""}`}
      closeLabel={predictionPanelProps.closeLabel ?? "Close prediction panel"}
      onClose={predictionPanelProps.onClose}
      themeId={predictionPanelProps.themeId}
    >
      <div className="rc-prediction-panel__content" style={panelStackStyle}>
        <div className="rc-prediction-panel__prompt-stack" style={promptStackStyle}>
          <CompanionBubble leadAvatar tone="primary" className="rc-prediction-panel__prompt">
            <h3>{predictionData.prompt}</h3>
          </CompanionBubble>

          {predictionData.instruction ? (
            <CompanionBubble leadAvatar tone="soft" className="rc-prediction-panel__instruction">
              <p>{predictionData.instruction}</p>
            </CompanionBubble>
          ) : null}
        </div>

        <ToolChoiceList actions={choices} />
        <PaginationDots />
      </div>
    </ToolPanelFrame>
  );
}

/** Renders the free-text prediction panel with quick suggestion chips. */
export function PredictionInputPanel(predictionPanelProps: PredictionPanelProps) {
  const predictionData = toPredictionPanelData(predictionPanelProps["data"]);
  const suggestions = getSuggestionActions(predictionData);

  return (
    <ToolPanelFrame
      className={`rc-prediction-panel rc-prediction-panel--input ${predictionPanelProps.className ?? ""}`}
      closeLabel={predictionPanelProps.closeLabel ?? "Close prediction panel"}
      onClose={predictionPanelProps.onClose}
      themeId={predictionPanelProps.themeId}
    >
      <div className="rc-prediction-panel__content" style={panelStackStyle}>
        <CompanionBubble leadAvatar tone="primary" className="rc-prediction-panel__prompt">
          <h3>{predictionData.prompt}</h3>
        </CompanionBubble>

        {predictionData.instruction ? (
          <CompanionBubble tone="soft" className="rc-prediction-panel__instruction">
            <p>{predictionData.instruction}</p>
          </CompanionBubble>
        ) : null}

        {suggestions.length > 0 ? (
          <div className="rc-tool-chip-row rc-prediction-panel__suggestions" aria-label="Prediction suggestions">
            {suggestions.slice(0, 3).map((suggestion) => (
              <ToolActionButton key={suggestion.id} {...suggestion} variant="ghost" />
            ))}
          </div>
        ) : null}

        <ToolInput
          buttonLabel="Submit prediction"
          className="rc-prediction-panel__input"
          minRows={4}
          onSubmit={predictionData.onSubmit}
          onValueChange={predictionData.onValueChange}
          placeholder={predictionData.placeholder ?? "Type your prediction..."}
          value={predictionData.value}
        />
      </div>
    </ToolPanelFrame>
  );
}
