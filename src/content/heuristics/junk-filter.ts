import type { PageKind, ReadableChunk } from "../../shared/page-types";
import { normalizeWhitespace } from "../../shared/page-types";

export type JunkCategory =
  | "author"
  | "cookie"
  | "footer"
  | "nav"
  | "newsletter"
  | "related"
  | "release_fragment"
  | "share"
  | "sidebar"
  | "sign_in"
  | "sponsored"
  | "version_metadata";

export type ChunkValueKind =
  | "causal_reasoning"
  | "central_claim"
  | "contrast"
  | "definition"
  | "example"
  | "mechanism";

export type JunkFilterResult = {
  readonly isJunk: boolean;
  readonly category?: JunkCategory;
  readonly confidence: number;
  readonly reasons: readonly string[];
  readonly positiveSignals: readonly ChunkValueKind[];
};

export type ChunkValueScore = {
  readonly score: number;
  readonly signals: readonly ChunkValueKind[];
  readonly reasons: readonly string[];
};

/** Detects low-value page chrome and fragments while preserving substantive chunks. */
export function classifyChunkJunk(
  chunk: Pick<ReadableChunk, "text" | "headingPath" | "kind">,
  pageKind: PageKind = "unknown"
): JunkFilterResult {
  const evidence = createChunkEvidence(chunk);
  const positives = detectPositiveSignals(evidence);
  const junk = detectJunkCategory(evidence, pageKind);

  if (positives.length > 0 && !isHardJunk(junk)) {
    return {
      confidence: 0.18,
      isJunk: false,
      positiveSignals: positives,
      reasons: ["Substantive reading signal overrides chrome-like wording."]
    };
  }

  if (!junk) {
    return { confidence: 0, isJunk: false, positiveSignals: positives, reasons: [] };
  }

  return {
    category: junk.category,
    confidence: junk.confidence,
    isJunk: true,
    positiveSignals: positives,
    reasons: junk.reasons
  };
}

/** Scores how useful a chunk is for comprehension-focused assistance. */
export function scoreChunkValue(
  chunk: Pick<ReadableChunk, "text" | "headingPath" | "kind">,
  pageKind: PageKind = "unknown"
): ChunkValueScore {
  const evidence = createChunkEvidence(chunk);
  const junk = classifyChunkJunk(chunk, pageKind);
  if (junk.isJunk) {
    return { reasons: [`Suppressed as ${junk.category}.`], score: 0, signals: [] };
  }

  const signals = detectPositiveSignals(evidence);
  const lengthScore = clamp01(evidence.wordCount / 80);
  const signalScore = clamp01(signals.length / 3);
  const structureBoost = chunk.kind === "code" || chunk.kind === "table" ? 0.12 : 0;
  const score = clamp01((lengthScore * 0.45) + (signalScore * 0.43) + structureBoost);

  return {
    reasons: createValueReasons(signals, evidence.wordCount),
    score,
    signals
  };
}

type ChunkEvidence = {
  readonly bag: string;
  readonly heading: string;
  readonly text: string;
  readonly wordCount: number;
};

type JunkCandidate = {
  readonly category: JunkCategory;
  readonly confidence: number;
  readonly reasons: readonly string[];
};

/** Finds the first matching junk category for a chunk. */
function detectJunkCategory(evidence: ChunkEvidence, pageKind: PageKind): JunkCandidate | undefined {
  return findFirst([
    patternJunk(evidence, "cookie", /\b(cookie|consent|privacy choices|accept all|manage preferences)\b/, 0.92),
    patternJunk(evidence, "newsletter", /\b(newsletter|subscribe|sign up for updates|inbox)\b/, 0.86),
    patternJunk(evidence, "sign_in", /\b(sign in|log in|create account|continue with google)\b/, 0.88),
    patternJunk(evidence, "sponsored", /\b(sponsored|advertisement|promoted|affiliate)\b/, 0.84),
    patternJunk(evidence, "share", /\b(share this|tweet|copy link|share on)\b/, 0.82),
    patternJunk(evidence, "related", /\b(related articles|you may also like|recommended|more from)\b/, 0.78),
    patternJunk(evidence, "author", /\b(written by|author|bio|follow me|staff writer)\b/, 0.72),
    patternJunk(evidence, "footer", /\b(copyright|terms of service|privacy policy|all rights reserved)\b/, 0.84),
    patternJunk(evidence, "nav", /\b(home|pricing|contact|menu|breadcrumbs|skip to content)\b/, 0.65),
    releaseFragmentJunk(evidence, pageKind),
    versionMetadataJunk(evidence)
  ]);
}

/** Converts a short pattern match into a junk candidate. */
function patternJunk(
  evidence: ChunkEvidence,
  category: JunkCategory,
  pattern: RegExp,
  confidence: number
): JunkCandidate | undefined {
  if (!pattern.test(evidence.bag) || evidence.wordCount > 90) {
    return undefined;
  }
  return { category, confidence, reasons: [`Looks like ${category.replace("_", " ")} chrome.`] };
}

/** Detects terse release-note fragments that are poor reading targets. */
function releaseFragmentJunk(
  evidence: ChunkEvidence,
  pageKind: PageKind
): JunkCandidate | undefined {
  const fragment = /\b(fixed|changed|added|removed|deprecated)\b/.test(evidence.text)
    && evidence.wordCount < 18;
  if (pageKind !== "release_notes" && pageKind !== "changelog" && !fragment) {
    return undefined;
  }
  return fragment
    ? { category: "release_fragment", confidence: 0.7, reasons: ["Short release-note fragment."] }
    : undefined;
}

/** Detects standalone version metadata without explanatory content. */
function versionMetadataJunk(evidence: ChunkEvidence): JunkCandidate | undefined {
  const metadata = /\b(v?\d+\.\d+(?:\.\d+)?|released on|last updated|build)\b/.test(evidence.bag);
  if (!metadata || evidence.wordCount > 24) {
    return undefined;
  }
  return { category: "version_metadata", confidence: 0.76, reasons: ["Version metadata without explanation."] };
}

/** Detects positive comprehension signals in chunk prose. */
function detectPositiveSignals(evidence: ChunkEvidence): ChunkValueKind[] {
  const signals: ChunkValueKind[] = [];
  addSignal(signals, "definition", /\b(is defined as|refers to|means|is a|are a)\b/.test(evidence.text));
  addSignal(signals, "mechanism", /\b(works by|because it|the mechanism|process|pipeline|flow)\b/.test(evidence.text));
  addSignal(signals, "central_claim", /\b(the key point|we argue|therefore|in short|central claim)\b/.test(evidence.text));
  addSignal(signals, "contrast", /\b(however|whereas|unlike|in contrast|rather than)\b/.test(evidence.text));
  addSignal(signals, "causal_reasoning", /\b(because|therefore|as a result|leads to|causes)\b/.test(evidence.text));
  addSignal(signals, "example", /\b(for example|for instance|e\.g\.|such as)\b/.test(evidence.text));
  return signals;
}

/** Adds a positive signal only when its evidence is present. */
function addSignal(signals: ChunkValueKind[], signal: ChunkValueKind, present: boolean): void {
  if (present) {
    signals.push(signal);
  }
}

/** Explains why a chunk received comprehension value. */
function createValueReasons(signals: readonly ChunkValueKind[], wordCount: number): string[] {
  const reasons = signals.map((signal) => `Contains ${signal.replace("_", " ")} signal.`);
  if (wordCount >= 60) {
    reasons.push("Enough length for substantive context.");
  }
  return reasons;
}

/** Builds normalized chunk evidence for junk and value rules. */
function createChunkEvidence(chunk: Pick<ReadableChunk, "text" | "headingPath">): ChunkEvidence {
  const text = normalizeWhitespace(chunk.text).toLowerCase();
  const heading = chunk.headingPath.join(" ").toLowerCase();
  return {
    bag: `${heading} ${text}`,
    heading,
    text,
    wordCount: text.match(/[a-z0-9]+(?:'[a-z0-9]+)?/g)?.length ?? 0
  };
}

/** Returns the first defined item from a candidate list. */
function findFirst<T>(items: readonly (T | undefined)[]): T | undefined {
  return items.find((item): item is T => item !== undefined);
}

/** Returns whether a junk category should override positive reading signals. */
function isHardJunk(candidate: JunkCandidate | undefined): boolean {
  return candidate?.category === "cookie" || candidate?.category === "sign_in";
}

/** Clamps a score into the zero-to-one interval. */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
