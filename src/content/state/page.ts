export const ASKABLE_PAGE_KINDS = [
  "article",
  "docs",
  "academic_paper",
  "pdf_text"
] as const;

export const QUIET_PAGE_KINDS = [
  "release_notes",
  "changelog",
  "feed",
  "search",
  "app",
  "dashboard",
  "login",
  "video",
  "unsupported"
] as const;

export type AskablePageKind = typeof ASKABLE_PAGE_KINDS[number];
export type QuietPageKind = typeof QUIET_PAGE_KINDS[number];
export type PageKind = AskablePageKind | QuietPageKind;

export type PageStateValue =
  | "inactive"
  | "scanning"
  | "ready"
  | "quiet"
  | "unsupported";

export type PageState = {
  value: PageStateValue;
  kind: PageKind;
  updatedAt: number;
};

export type PageStateEvidence = {
  kind: PageKind;
  now: number;
  visible: boolean;
  focused: boolean;
  parserStatus: "scanning" | "ready" | "unsupported";
  readableChunkCount: number;
};

/** Returns true when a page kind can support proactive reading help. */
export function isAskablePageKind(kind: PageKind): kind is AskablePageKind {
  return ASKABLE_PAGE_KINDS.includes(kind as AskablePageKind);
}

/** Returns true when a page kind should keep the companion quiet by default. */
export function isQuietPageKind(kind: PageKind): kind is QuietPageKind {
  return QUIET_PAGE_KINDS.includes(kind as QuietPageKind);
}

/** Converts page parser and browser evidence into the coarse page machine state. */
export function transitionPageState(evidence: PageStateEvidence): PageState {
  if (!evidence.visible || !evidence.focused) {
    return createPageState("inactive", evidence);
  }

  if (evidence.parserStatus === "unsupported" || evidence.kind === "unsupported") {
    return createPageState("unsupported", evidence);
  }

  if (evidence.parserStatus !== "ready" || evidence.readableChunkCount === 0) {
    return createPageState("scanning", evidence);
  }

  if (isAskablePageKind(evidence.kind)) {
    return createPageState("ready", evidence);
  }

  return createPageState("quiet", evidence);
}

/** Builds a page state snapshot with the current classifier metadata. */
function createPageState(value: PageStateValue, evidence: PageStateEvidence): PageState {
  return {
    value,
    kind: evidence.kind,
    updatedAt: evidence.now
  };
}
