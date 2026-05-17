import type { ReadingChunk } from "../shared/reading-types";
import type { QuestionSession } from "../shared/session-types";
import type { HomePanelActionId, HomePanelActionResult } from "../ui/types";

type HomeActionState = {
  chunks: ReadingChunk[];
  session?: QuestionSession;
};

/** Builds the visible response for manual home-panel reading actions. */
export function handleHomeAction(actionId: HomePanelActionId, state: HomeActionState): HomePanelActionResult {
  const chunk = findCurrentChunk(state);
  if (!chunk) {
    return {
      headline: actionId === "summarize" ? "Nothing readable yet" : "I need a bit more text",
      body: "Scroll into the article or select a passage, then try that again."
    };
  }

  switch (actionId) {
    case "predict":
      return {
        headline: "Make a prediction",
        body: `Before you keep going, predict what this sets up: ${trimToSentence(chunk.text, 150)}`
      };
    case "summarize":
      return {
        headline: "Quick summary",
        body: summarizeChunk(chunk)
      };
    case "why-important":
      return {
        headline: "Why it matters",
        body: explainChunkImportance(chunk)
      };
  }
}

function findCurrentChunk(state: HomeActionState): ReadingChunk | undefined {
  const sessionChunk = state.session ? state.chunks.find((chunk) => chunk.id === state.session?.chunkId) : undefined;
  if (sessionChunk) return sessionChunk;
  return [...state.chunks].sort((first, second) => {
    const stateScore = readingStateRank(second.state) - readingStateRank(first.state);
    if (stateScore !== 0) return stateScore;
    return second.metrics.visibleRatio - first.metrics.visibleRatio;
  })[0];
}

function readingStateRank(state: ReadingChunk["state"]): number {
  switch (state) {
    case "deep_read":
      return 4;
    case "probably_read":
      return 3;
    case "skimmed":
      return 2;
    case "seen":
      return 1;
    default:
      return 0;
  }
}

function summarizeChunk(chunk: ReadingChunk): string {
  const heading = chunk.heading ? `${chunk.heading}: ` : "";
  return `${heading}${trimToSentence(chunk.text, 220)}`;
}

function explainChunkImportance(chunk: ReadingChunk): string {
  const topic = chunk.heading ? `the "${chunk.heading}" section` : "this section";
  return `This matters because ${topic} is likely carrying a key step in the argument. Watch for the claim it supports, the evidence it adds, or the question it sets up next.`;
}

function trimToSentence(text: string, maxLength: number): string {
  const normalizedText = text.replaceAll(/\s+/g, " ").trim();
  const firstSentence = normalizedText.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? normalizedText;
  if (firstSentence.length <= maxLength) return firstSentence;
  return `${firstSentence.slice(0, maxLength - 1).trimEnd()}...`;
}
