/** Chunk state inferred from viewport and interaction signals. */
export type ChunkReadingState =
  | "unseen"
  | "seen"
  | "skimmed"
  | "probably_read"
  | "deep_read"
  | "stuck_or_confused"
  | "abandoned";

/** Supported parser modes for the current browser surface. */
export type ContentType = "html" | "pdf" | "local_file" | "unknown";

/** Stable unit of readable page content. */
export type ReadingChunk = {
  id: string;
  hash: string;
  heading: string;
  text: string;
  preview: string;
  kind: "heading" | "paragraph" | "list" | "code" | "table" | "math" | "pdf";
  order: number;
  selector: string;
  state: ChunkReadingState;
  scores: ChunkScores;
  metrics: ChunkMetrics;
};

/** Numeric scores used by intervention policy. */
export type ChunkScores = {
  readingConfidence: number;
  meaningfulness: number;
  interventionReadiness: number;
};

/** Per-chunk observations from browser signals. */
export type ChunkMetrics = {
  visibleRatio: number;
  visibleMilliseconds: number;
  revisitCount: number;
  lastSeenAt?: number;
  scrollVelocity: number;
  selectionCount: number;
};

/** Snapshot of volatile signals used by scoring and policy. */
export type ReadingSignals = {
  tabVisible: boolean;
  windowFocused: boolean;
  idleMilliseconds: number;
  scrollVelocity: number;
  isFastScrolling: boolean;
  now: number;
};

/** Parser result sent to the debug panel. */
export type ParserSnapshot = {
  contentType: ContentType;
  status: "ready" | "limited" | "unsupported";
  chunks: ReadingChunk[];
  message?: string;
};
