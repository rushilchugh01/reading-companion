import { describe, expect, it } from "vitest";
import { compileAnswerGradeContext } from "../../../src/content/context/answer-grade-context";
import {
  compileChatContext,
  hasForbiddenContextLeak
} from "../../../src/content/context/chat-context";

describe("context compiler", () => {
  it("includes reader-facing context sections", () => {
    const context = compileChatContext({
      allowedMoves: ["ask a reflective question", "offer a short explanation"],
      companionStyle: "curious and concise",
      currentPassage: "A model is useful because it predicts what evidence should appear next.",
      headingPath: ["Models", "Prediction"],
      pageKind: "article",
      pageTitle: "Understanding Models",
      previousContext: "The reader just compared two examples.",
      readerState: "The reader appears to be pausing on a dense idea.",
      whyThisMatters: "This passage connects definition to causal reasoning."
    });

    expect(context.text).toContain("Page title: Understanding Models");
    expect(context.text).toContain("Page kind: article");
    expect(context.text).toContain("Current passage:");
    expect(context.text).toContain("Heading path: Models > Prediction");
    expect(context.text).toContain("Previous context:");
    expect(context.text).toContain("Reader state:");
    expect(context.text).toContain("Why this matters:");
    expect(context.text).toContain("Companion style:");
    expect(context.text).toContain("Allowed moves:");
    expect(context.text).toContain("Output contract:");
  });

  it("excludes runtime internals, selectors, and raw telemetry names", () => {
    const context = compileChatContext({
      allowedMoves: ["ask_question from policyId"],
      companionStyle: "avoid confidence jargon",
      currentPassage: "targetChunkId body > main > p selector scrollVelocity dwellMilliseconds visibleRatio probably_read",
      headingPath: ["body > main > section"],
      pageKind: "docs",
      pageTitle: "API Guide",
      readerState: "deep_read stuck_or_confused",
      whyThisMatters: "interventionReadiness confidence"
    });

    expect(hasForbiddenContextLeak(context.text)).toBe(false);
    expect(context.text).not.toContain("body > main");
    expect(context.text).toContain("[internal]");
  });

  it("compiles answer-grade context with question and answer", () => {
    const context = compileAnswerGradeContext({
      allowedMoves: ["grade briefly"],
      answer: "It means a model helps predict the next evidence.",
      companionStyle: "direct but kind",
      currentPassage: "A model is useful because it predicts what evidence should appear next.",
      headingPath: ["Models"],
      pageKind: "article",
      pageTitle: "Understanding Models",
      question: "Why is the model useful?",
      readerState: "The reader has just answered.",
      whyThisMatters: "The answer should connect usefulness to prediction."
    });

    expect(context.text).toContain("Question: Why is the model useful?");
    expect(context.text).toContain("Reader answer:");
    expect(context.text).toContain("Grade the answer against the passage");
    expect(hasForbiddenContextLeak(context.text)).toBe(false);
  });
});
