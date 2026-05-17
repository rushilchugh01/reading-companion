import type { PageKind } from "../../shared/page-types";
import { normalizeWhitespace } from "../../shared/page-types";

export type PageKindClassification = {
  readonly pageKind: PageKind;
  readonly confidence: number;
  readonly hardSkipReason?: string;
  readonly reasons: readonly string[];
};

export type PageKindClassifierInput = {
  readonly url: string;
  readonly title?: string;
  readonly text?: string;
  readonly contentType?: "html" | "pdf" | "local_file" | "unknown";
  readonly hasReadableText?: boolean;
  readonly linkCount?: number;
  readonly formCount?: number;
  readonly inputCount?: number;
  readonly videoCount?: number;
  readonly codeBlockCount?: number;
  readonly tableCount?: number;
  readonly viewportTextDensity?: number;
};

type ScoreCandidate = {
  readonly pageKind: PageKind;
  readonly score: number;
  readonly reasons: readonly string[];
};

const QUIET_PAGE_KINDS = new Set<PageKind>([
  "app",
  "dashboard",
  "feed",
  "login",
  "search",
  "unsupported",
  "video"
]);

/** Classifies a browser page into a deterministic reading surface kind. */
export function classifyPageKind(input: PageKindClassifierInput): PageKindClassification {
  const evidence = createEvidence(input);
  const unsupported = classifyUnsupported(input, evidence);
  if (unsupported) {
    return unsupported;
  }

  const candidates = [
    classifyPdf(input, evidence),
    classifyLogin(input, evidence),
    classifyVideo(input, evidence),
    classifySearch(input, evidence),
    classifyFeed(input, evidence),
    classifyDashboard(input, evidence),
    classifyReleaseNotes(evidence),
    classifyChangelog(evidence),
    classifyAcademicPaper(input, evidence),
    classifyDocs(input, evidence),
    classifyArticle(input, evidence),
    classifyApp(input, evidence)
  ].filter((candidate): candidate is ScoreCandidate => candidate !== undefined);

  const winner = candidates.toSorted((left, right) => right.score - left.score)[0];
  if (!winner || winner.score < 0.35) {
    return { confidence: 0.25, pageKind: "unknown", reasons: ["No strong reading-surface evidence."] };
  }

  return {
    confidence: clamp01(winner.score),
    hardSkipReason: QUIET_PAGE_KINDS.has(winner.pageKind) ? winner.pageKind : undefined,
    pageKind: winner.pageKind,
    reasons: winner.reasons
  };
}

/** Returns whether a page kind should suppress reading heuristics by default. */
export function isQuietPageKind(pageKind: PageKind): boolean {
  return QUIET_PAGE_KINDS.has(pageKind);
}

/** Detects surfaces where reading evidence should not be produced. */
function classifyUnsupported(
  input: PageKindClassifierInput,
  evidence: Evidence
): PageKindClassification | undefined {
  if (input.contentType === "local_file" || input.contentType === "unknown") {
    return {
      confidence: 0.9,
      hardSkipReason: "unsupported_surface",
      pageKind: "unsupported",
      reasons: [`Content type is ${input.contentType}.`]
    };
  }

  if (!input.hasReadableText && evidence.wordCount < 20 && input.contentType !== "pdf") {
    return {
      confidence: 0.72,
      hardSkipReason: "no_readable_text",
      pageKind: "unsupported",
      reasons: ["No readable page text was observed."]
    };
  }

  return undefined;
}

/** Classifies PDF pages based on exposed text evidence. */
function classifyPdf(input: PageKindClassifierInput, evidence: Evidence): ScoreCandidate | undefined {
  if (input.contentType !== "pdf" && !evidence.path.endsWith(".pdf")) {
    return undefined;
  }

  if ((input.hasReadableText ?? true) && evidence.wordCount >= 40) {
    return {
      pageKind: "pdf_text",
      reasons: ["PDF surface exposes selectable text."],
      score: evidence.hasAcademicMarker ? 0.86 : 0.78
    };
  }

  return {
    pageKind: "pdf_scanned",
    reasons: ["PDF surface has little or no exposed text."],
    score: 0.82
  };
}

/** Classifies sign-in pages from form and password language. */
function classifyLogin(input: PageKindClassifierInput, evidence: Evidence): ScoreCandidate | undefined {
  const formSignal = (input.inputCount ?? 0) >= 2 || (input.formCount ?? 0) >= 1;
  if (!formSignal || !/\b(sign in|log in|password|authenticate|account)\b/i.test(evidence.bag)) {
    return undefined;
  }
  return { pageKind: "login", reasons: ["Sign-in form language and inputs detected."], score: 0.88 };
}

/** Classifies video pages from player routes and watch language. */
function classifyVideo(input: PageKindClassifierInput, evidence: Evidence): ScoreCandidate | undefined {
  const videoSignal = (input.videoCount ?? 0) > 0 || /\b(watch|episode|transcript|subscribe)\b/.test(evidence.bag);
  if (!videoSignal || !/\/(watch|video|videos|embed)\b/.test(evidence.path)) {
    return undefined;
  }
  return { pageKind: "video", reasons: ["Video route or player evidence detected."], score: 0.82 };
}

/** Classifies search result pages from result routes and link density. */
function classifySearch(input: PageKindClassifierInput, evidence: Evidence): ScoreCandidate | undefined {
  const manyLinks = (input.linkCount ?? 0) > 25;
  const searchRoute = /\/(search|results)\b/.test(evidence.path) || evidence.query.includes("q=");
  if (!searchRoute || !manyLinks) {
    return undefined;
  }
  return { pageKind: "search", reasons: ["Search results route with many links detected."], score: 0.86 };
}

/** Classifies feed pages from feed language and high link density. */
function classifyFeed(input: PageKindClassifierInput, evidence: Evidence): ScoreCandidate | undefined {
  const feedWords = /\b(feed|latest|top stories|for you|trending)\b/.test(evidence.bag);
  if ((input.linkCount ?? 0) < 35 || !feedWords) {
    return undefined;
  }
  return { pageKind: "feed", reasons: ["Feed-like page language and high link density detected."], score: 0.76 };
}

/** Classifies dashboards from metric language and dense controls. */
function classifyDashboard(input: PageKindClassifierInput, evidence: Evidence): ScoreCandidate | undefined {
  const metricWords = /\b(dashboard|analytics|workspace|projects|tasks|revenue|settings)\b/.test(evidence.bag);
  const controlHeavy = (input.inputCount ?? 0) >= 5 || (input.tableCount ?? 0) >= 3;
  if (!metricWords || !controlHeavy) {
    return undefined;
  }
  return { pageKind: "dashboard", reasons: ["Control-heavy dashboard evidence detected."], score: 0.82 };
}

/** Classifies release notes while guarding against articles about release notes. */
function classifyReleaseNotes(evidence: Evidence): ScoreCandidate | undefined {
  const explicitRoute = /release[-\s]?notes?/.test(evidence.bag) || /\/releases?\b/.test(evidence.path);
  const enoughEntries = evidence.versionEntryCount >= 2 || evidence.dateEntryCount >= 3;
  if (!explicitRoute || !enoughEntries || evidence.articleAboutReleaseNotes) {
    return undefined;
  }
  return { pageKind: "release_notes", reasons: ["Explicit release-notes route with versioned entries."], score: 0.84 };
}

/** Classifies changelogs only when labels and multiple versions agree. */
function classifyChangelog(evidence: Evidence): ScoreCandidate | undefined {
  const explicitChangelog = /\bchange\s*log\b|\bchangelog\b/.test(evidence.bag);
  if (!explicitChangelog || evidence.versionEntryCount < 2) {
    return undefined;
  }
  return { pageKind: "changelog", reasons: ["Changelog label with multiple version entries."], score: 0.83 };
}

/** Classifies academic papers from abstract, citation, and reference markers. */
function classifyAcademicPaper(
  input: PageKindClassifierInput,
  evidence: Evidence
): ScoreCandidate | undefined {
  if (!evidence.hasAcademicMarker) {
    return undefined;
  }
  const paperScore = input.contentType === "pdf" || evidence.hasReferences ? 0.88 : 0.78;
  return { pageKind: "academic_paper", reasons: ["Academic paper markers detected."], score: paperScore };
}

/** Classifies documentation pages while allowing them as askable reading surfaces. */
function classifyDocs(input: PageKindClassifierInput, evidence: Evidence): ScoreCandidate | undefined {
  const docsRoute = /\/(docs|guide|guides|reference|api|learn|manual)\b/.test(evidence.path);
  const docsHost = /\bdocs\.|developer|devdocs|readthedocs|github\.io\b/.test(evidence.host);
  const codeSignal = (input.codeBlockCount ?? 0) > 0 || /\b(api|sdk|install|configure|example)\b/.test(evidence.bag);
  if (!(docsRoute || docsHost) || !codeSignal) {
    return undefined;
  }
  return { pageKind: "docs", reasons: ["Documentation route with instructional/code evidence."], score: 0.82 };
}

/** Classifies long-form readable article pages. */
function classifyArticle(input: PageKindClassifierInput, evidence: Evidence): ScoreCandidate | undefined {
  const hasArticleShape = evidence.wordCount >= 180 && (input.viewportTextDensity ?? 0.5) >= 0.25;
  const titleSignal = evidence.title.length > 8 && (!evidence.versionTitleOnly || /\/blog\b/.test(evidence.path));
  if (!hasArticleShape || !titleSignal) {
    return undefined;
  }
  return { pageKind: "article", reasons: ["Long-form readable text with article-like title."], score: 0.72 };
}

/** Classifies control-heavy application pages with little readable prose. */
function classifyApp(input: PageKindClassifierInput, evidence: Evidence): ScoreCandidate | undefined {
  const controls = (input.inputCount ?? 0) + (input.formCount ?? 0);
  if (controls < 4 || evidence.wordCount > 250) {
    return undefined;
  }
  return { pageKind: "app", reasons: ["Interactive controls outweigh readable text."], score: 0.62 };
}

type Evidence = {
  readonly bag: string;
  readonly host: string;
  readonly path: string;
  readonly query: string;
  readonly title: string;
  readonly wordCount: number;
  readonly versionEntryCount: number;
  readonly dateEntryCount: number;
  readonly hasAcademicMarker: boolean;
  readonly hasReferences: boolean;
  readonly articleAboutReleaseNotes: boolean;
  readonly versionTitleOnly: boolean;
};

/** Builds reusable normalized evidence for page-kind rules. */
function createEvidence(input: PageKindClassifierInput): Evidence {
  const url = safeUrl(input.url);
  const title = normalizeWhitespace(input.title ?? "").toLowerCase();
  const text = normalizeWhitespace(input.text ?? "").toLowerCase();
  const bag = `${title} ${text}`;
  return {
    articleAboutReleaseNotes: /\b(article|post|essay)\b/.test(bag)
      && /\babout release notes|why release notes|writing release notes\b/.test(bag),
    bag,
    dateEntryCount: countMatches(bag, /\b20\d{2}[-/][01]\d[-/][0-3]\d\b/g),
    hasAcademicMarker: /\b(abstract|doi|arxiv|references|bibliography|et al\.)\b/.test(bag),
    hasReferences: /\b(references|bibliography)\b/.test(bag),
    host: url.hostname.toLowerCase(),
    path: url.pathname.toLowerCase(),
    query: url.search.slice(1).toLowerCase(),
    title,
    versionEntryCount: countMatches(bag, /\bv?\d+\.\d+(?:\.\d+)?\b/g),
    versionTitleOnly: /\bv?\d+\.\d+(?:\.\d+)?\b/.test(title) && !/\bchangelog|release notes\b/.test(title),
    wordCount: countWords(text)
  };
}

/** Parses URLs with a stable fallback for malformed inputs. */
function safeUrl(rawUrl: string): URL {
  try {
    return new URL(rawUrl);
  } catch {
    return new URL("https://unknown.invalid/");
  }
}

/** Counts simple word tokens in normalized page text. */
function countWords(text: string): number {
  return text.match(/[a-z0-9]+(?:'[a-z0-9]+)?/g)?.length ?? 0;
}

/** Counts regex matches without exposing match content. */
function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

/** Clamps a score into the zero-to-one interval. */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
