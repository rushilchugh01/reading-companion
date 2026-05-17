import type { PageKind } from "../../shared/page-types";
import { normalizeWhitespace } from "../../shared/page-types";

export type ChatContextInput = {
  readonly pageTitle: string;
  readonly pageKind: PageKind;
  readonly currentPassage: string;
  readonly headingPath: readonly string[];
  readonly previousContext?: string;
  readonly readerState: string;
  readonly whyThisMatters: string;
  readonly companionStyle: string;
  readonly allowedMoves: readonly string[];
};

export type CompiledChatContext = {
  readonly text: string;
  readonly sections: readonly string[];
};

const FORBIDDEN_CONTEXT_TERMS = [
  "targetChunkId",
  "policyId",
  "scrollVelocity",
  "dwellMilliseconds",
  "visibleRatio",
  "selector",
  "confidence",
  "stuck_or_confused",
  "probably_read",
  "deep_read",
  "interventionReadiness"
];

/** Compiles safe, evidence-based context for a companion chat turn. */
export function compileChatContext(input: ChatContextInput): CompiledChatContext {
  const sections = [
    formatLine("Page title", input.pageTitle),
    formatLine("Page kind", readablePageKind(input.pageKind)),
    formatLine("Current passage", input.currentPassage),
    formatLine("Heading path", input.headingPath.join(" > ")),
    formatOptionalLine("Previous context", input.previousContext),
    formatLine("Reader state", input.readerState),
    formatLine("Why this matters", input.whyThisMatters),
    formatLine("Companion style", input.companionStyle),
    formatLine("Allowed moves", input.allowedMoves.join(", ")),
    formatLine("Output contract", "Answer in plain language, ground claims in the passage, and avoid pretending to know more than the page shows.")
  ].filter((section): section is string => section !== undefined);

  const text = sanitizeContext(sections.join("\n"));
  return { sections: text.split("\n"), text };
}

/** Removes internal field names and state labels from compiled context. */
export function sanitizeContext(text: string): string {
  return FORBIDDEN_CONTEXT_TERMS.reduce(
    (current, term) => current.replaceAll(term, "[internal]"),
    normalizeWhitespacePreservingLines(text)
  );
}

/** Checks whether compiled context leaked forbidden implementation terms. */
export function hasForbiddenContextLeak(text: string): boolean {
  return FORBIDDEN_CONTEXT_TERMS.some((term) => text.includes(term));
}

/** Formats a required context section. */
function formatLine(label: string, value: string): string {
  return `${label}: ${sanitizeValue(value)}`;
}

/** Formats an optional context section when it has text. */
function formatOptionalLine(label: string, value: string | undefined): string | undefined {
  const normalized = sanitizeValue(value ?? "");
  return normalized.length > 0 ? `${label}: ${normalized}` : undefined;
}

/** Sanitizes one context value before it reaches the prompt. */
function sanitizeValue(value: string): string {
  return normalizeWhitespace(value).replace(/\b(html|body|main|article|section|div|p)(?:[#.:>\s][^\s,]*)+/gi, "[page location]");
}

/** Converts page-kind enum labels into reader-facing words. */
function readablePageKind(pageKind: PageKind): string {
  return pageKind.replace("_", " ");
}

/** Normalizes each context line without collapsing section boundaries. */
function normalizeWhitespacePreservingLines(text: string): string {
  return text
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter((line) => line.length > 0)
    .join("\n");
}
