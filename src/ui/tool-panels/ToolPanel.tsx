import { AttentionToolsPanel } from "./panels/AttentionToolsPanel";
import { ExplanationDepthPanel } from "./panels/ExplanationDepthPanel";
import { FeedbackPanel } from "./panels/FeedbackPanel";
import { MemorySavePanel } from "./panels/MemorySavePanel";
import { PredictionChoicePanel, PredictionInputPanel } from "./panels/PredictionPanel";
import { QuestionResponsePanel } from "./panels/QuestionResponsePanel";
import type { ToolPanelProps } from "./types";

/** Dispatches semantic companion panel views to their themed React layout component. */
export function ToolPanel(panelProperties: ToolPanelProps) {
  switch (panelProperties.view) {
    case "question-response":
      return <QuestionResponsePanel data={panelProperties.panelData} themeId={panelProperties.themeId} />;
    case "prediction-choice":
      return <PredictionChoicePanel data={panelProperties.panelData} themeId={panelProperties.themeId} />;
    case "prediction-input":
      return <PredictionInputPanel data={panelProperties.panelData} themeId={panelProperties.themeId} />;
    case "feedback-actions":
      return <FeedbackPanel data={panelProperties.panelData} themeId={panelProperties.themeId} />;
    case "memory-save":
      return <MemorySavePanel data={panelProperties.panelData} themeId={panelProperties.themeId} />;
    case "attention-tools":
      return <AttentionToolsPanel data={panelProperties.panelData} themeId={panelProperties.themeId} />;
    case "explanation-depth":
      return <ExplanationDepthPanel data={panelProperties.panelData} themeId={panelProperties.themeId} />;
  }
}
