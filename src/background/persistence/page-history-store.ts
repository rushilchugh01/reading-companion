import { openDB, type DBSchema, type IDBPDatabase } from "idb";

const DATABASE_VERSION = 1;
const DEFAULT_MAX_ENTRIES = 20;

export type PageHistoryQuestion = {
  id: string;
  chunkId?: string;
  prompt: string;
  askedAt: number;
  outcome?: "answered" | "dismissed" | "ignored";
};

export type PageHistoryObservation = {
  id: string;
  chunkId?: string;
  kind: string;
  value: number | string | boolean;
  observedAt: number;
};

export type PageHistoryChunkInput = {
  id: string;
  hash: string;
  preview: string;
  sketch?: string;
  askedQuestions?: PageHistoryQuestion[];
  observations?: PageHistoryObservation[];
};

export type PageHistoryChunkMemory = PageHistoryChunkInput;

export type PageHistoryChunkBehaviorMemory = {
  lastAskedAt?: number;
  lastDismissedAt?: number;
  lastIgnoredAt?: number;
  askCount: number;
  dismissCount: number;
  ignoreCount: number;
};

export type PageHistoryBehaviorMemory = {
  byChunk: Record<string, PageHistoryChunkBehaviorMemory>;
  channelCooldowns: Record<string, number>;
  counts: Record<string, number>;
  lastAskedAt?: number;
  lastDismissedAt?: number;
  lastIgnoredAt?: number;
};

export type PageHistoryEntry = {
  normalizedUrl: string;
  url: string;
  title?: string;
  contentHash: string;
  contentPreview?: string;
  summary?: string;
  sketch?: string;
  askable: boolean;
  visitCount: number;
  firstSeenAt: number;
  lastSeenAt: number;
  chunks: PageHistoryChunkMemory[];
  askedQuestions: PageHistoryQuestion[];
  observations: PageHistoryObservation[];
  cooldownMemory: PageHistoryBehaviorMemory;
  interventionMemory: PageHistoryBehaviorMemory;
};

export type SavePageHistoryInput = {
  url: string;
  normalizedUrl?: string;
  title?: string;
  contentHash: string;
  contentPreview?: string;
  summary?: string;
  sketch?: string;
  askable?: boolean;
  seenAt?: number;
  chunks?: PageHistoryChunkInput[];
  askedQuestions?: PageHistoryQuestion[];
  observations?: PageHistoryObservation[];
  cooldownMemory?: PageHistoryBehaviorMemory;
  interventionMemory?: PageHistoryBehaviorMemory;
};

export type PageHistoryRestoreResult =
  | { status: "missing" }
  | { status: "restored"; entry: PageHistoryEntry }
  | { status: "stale"; staleEntry: PageHistoryEntry };

type PageHistoryStoreOptions = {
  databaseName?: string;
  maxEntries?: number;
};

type PageHistoryContentFields = Pick<
  PageHistoryEntry,
  "contentPreview" | "summary" | "sketch" | "askable" | "chunks" | "askedQuestions" | "observations"
>;

interface PageHistoryDatabase extends DBSchema {
  pageHistory: {
    key: string;
    value: PageHistoryEntry;
    indexes: {
      "by-lastSeenAt": number;
      "by-contentHash": string;
    };
  };
}

/** Opens the IndexedDB database used by page history. */
async function openPageHistoryDatabase(
  databaseName: string
): Promise<IDBPDatabase<PageHistoryDatabase>> {
  return openDB<PageHistoryDatabase>(databaseName, DATABASE_VERSION, {
    /** Creates the page-history object store and lookup indexes. */
    upgrade(database) {
      const pageHistory = database.createObjectStore("pageHistory", {
        keyPath: "normalizedUrl"
      });
      pageHistory.createIndex("by-lastSeenAt", "lastSeenAt");
      pageHistory.createIndex("by-contentHash", "contentHash");
    }
  });
}

/** Normalizes a page URL so hash-only navigation restores the same page memory. */
export function normalizePageHistoryUrl(url: string): string {
  const parsedUrl = new URL(url);
  parsedUrl.hash = "";
  parsedUrl.searchParams.sort();
  return parsedUrl.toString();
}

/** Stores bounded page history and behavior memory without raw page text. */
export class PageHistoryStore {
  private readonly databasePromise: Promise<IDBPDatabase<PageHistoryDatabase>>;
  private readonly maxEntries: number;

  /** Opens the page-history store, optionally with a test database name. */
  public constructor(options: PageHistoryStoreOptions = {}) {
    this.databasePromise = openPageHistoryDatabase(
      options.databaseName ?? "reading-companion-page-history"
    );
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  /** Saves a page snapshot and evicts older low-value entries beyond the limit. */
  public async savePage(input: SavePageHistoryInput): Promise<PageHistoryEntry> {
    const database = await this.databasePromise;
    const normalizedUrl = input.normalizedUrl ?? normalizePageHistoryUrl(input.url);
    const existing = await database.get("pageHistory", normalizedUrl);
    const entry = createEntry(input, normalizedUrl, existing);

    await database.put("pageHistory", entry);
    await this.evictOverflow(database);
    return entry;
  }

  /** Restores page memory only when the stored content hash still matches. */
  public async restorePage(url: string, contentHash: string): Promise<PageHistoryRestoreResult> {
    const database = await this.databasePromise;
    const entry = await database.get("pageHistory", normalizePageHistoryUrl(url));
    if (!entry) return { status: "missing" };
    if (entry.contentHash !== contentHash) {
      return { status: "stale", staleEntry: stripRestorableMemory(entry) };
    }
    return { status: "restored", entry };
  }

  /** Lists newest page-history entries first. */
  public async listPages(): Promise<PageHistoryEntry[]> {
    const database = await this.databasePromise;
    const entries = await database.getAllFromIndex("pageHistory", "by-lastSeenAt");
    return entries.reverse();
  }

  /** Closes the underlying IndexedDB connection for tests and shutdown hooks. */
  public async close(): Promise<void> {
    const database = await this.databasePromise;
    database.close();
  }

  /** Deletes overflow entries according to the retention ranking. */
  private async evictOverflow(database: IDBPDatabase<PageHistoryDatabase>): Promise<void> {
    const entries = await database.getAll("pageHistory");
    const evictions = entries.length - this.maxEntries;
    if (evictions <= 0) return;

    for (const entry of chooseEvictions(entries, evictions)) {
      await database.delete("pageHistory", entry.normalizedUrl);
    }
  }
}

/** Builds the persisted entry, reusing same-hash memory but not stale chunks. */
function createEntry(
  input: SavePageHistoryInput,
  normalizedUrl: string,
  existing?: PageHistoryEntry
): PageHistoryEntry {
  const now = pageSeenAt(input);
  const reusableExisting = matchingContentEntry(input, existing);
  return {
    ...createIdentityFields(input, normalizedUrl, existing, now),
    ...createContentFields(input, reusableExisting),
    ...createBehaviorFields(input, reusableExisting)
  };
}

/** Returns the supplied observation time or the current wall-clock time. */
function pageSeenAt(input: SavePageHistoryInput): number {
  return input.seenAt ?? Date.now();
}

/** Returns an existing entry only when its content hash can safely be reused. */
function matchingContentEntry(
  input: SavePageHistoryInput,
  existing?: PageHistoryEntry
): PageHistoryEntry | undefined {
  return existing?.contentHash === input.contentHash ? existing : undefined;
}

/** Builds stable identity and visit fields for a page-history entry. */
function createIdentityFields(
  input: SavePageHistoryInput,
  normalizedUrl: string,
  existing: PageHistoryEntry | undefined,
  now: number
): Pick<
  PageHistoryEntry,
  "normalizedUrl" | "url" | "title" | "contentHash" | "visitCount" | "firstSeenAt" | "lastSeenAt"
> {
  return {
    normalizedUrl,
    url: input.url,
    title: input.title ?? existing?.title,
    contentHash: input.contentHash,
    visitCount: (existing?.visitCount ?? 0) + 1,
    firstSeenAt: existing?.firstSeenAt ?? now,
    lastSeenAt: now
  };
}

/** Builds bounded content memory while avoiding stale-hash chunk reuse. */
function createContentFields(
  input: SavePageHistoryInput,
  reusableExisting?: PageHistoryEntry
): PageHistoryContentFields {
  const defaults = reusableContentFields(reusableExisting);
  return {
    contentPreview: definedValue(input.contentPreview, defaults.contentPreview),
    summary: definedValue(input.summary, defaults.summary),
    sketch: definedValue(input.sketch, defaults.sketch),
    askable: definedValue(input.askable, defaults.askable),
    chunks: sanitizeChunks(definedValue(input.chunks, defaults.chunks)),
    askedQuestions: definedValue(input.askedQuestions, defaults.askedQuestions),
    observations: definedValue(input.observations, defaults.observations)
  };
}

/** Returns same-hash content defaults or empty defaults for changed pages. */
function reusableContentFields(reusableExisting?: PageHistoryEntry): PageHistoryContentFields {
  if (!reusableExisting) return emptyContentFields();
  return {
    contentPreview: reusableExisting.contentPreview,
    summary: reusableExisting.summary,
    sketch: reusableExisting.sketch,
    askable: reusableExisting.askable,
    chunks: reusableExisting.chunks,
    askedQuestions: reusableExisting.askedQuestions,
    observations: reusableExisting.observations
  };
}

/** Returns empty content defaults for a new or stale-hash page. */
function emptyContentFields(): PageHistoryContentFields {
  return {
    askable: true,
    chunks: [],
    askedQuestions: [],
    observations: []
  };
}

/** Chooses an input value when present, otherwise falling back to a default. */
function definedValue<T>(inputValue: T | undefined, defaultValue: T): T {
  return inputValue === undefined ? defaultValue : inputValue;
}

/** Builds behavior memory fields, preserving same-hash dismiss and ignore outcomes. */
function createBehaviorFields(
  input: SavePageHistoryInput,
  reusableExisting?: PageHistoryEntry
): Pick<PageHistoryEntry, "cooldownMemory" | "interventionMemory"> {
  return {
    cooldownMemory: cloneBehaviorMemory(input.cooldownMemory ?? reusableExisting?.cooldownMemory),
    interventionMemory: cloneBehaviorMemory(
      input.interventionMemory ?? reusableExisting?.interventionMemory
    )
  };
}

/** Copies only bounded chunk metadata and never stores raw text. */
function sanitizeChunks(chunks: PageHistoryChunkInput[]): PageHistoryChunkMemory[] {
  return chunks.map((chunk) => ({
    id: chunk.id,
    hash: chunk.hash,
    preview: chunk.preview,
    sketch: chunk.sketch,
    askedQuestions: chunk.askedQuestions ?? [],
    observations: chunk.observations ?? []
  }));
}

/** Clones serializable behavior memory into a storage-safe object. */
function cloneBehaviorMemory(memory?: PageHistoryBehaviorMemory): PageHistoryBehaviorMemory {
  return {
    byChunk: { ...memory?.byChunk },
    channelCooldowns: { ...memory?.channelCooldowns },
    counts: { ...memory?.counts },
    lastAskedAt: memory?.lastAskedAt,
    lastDismissedAt: memory?.lastDismissedAt,
    lastIgnoredAt: memory?.lastIgnoredAt
  };
}

/** Removes content-hash-sensitive memory from a stale restore result. */
function stripRestorableMemory(entry: PageHistoryEntry): PageHistoryEntry {
  return {
    ...entry,
    chunks: [],
    askedQuestions: [],
    observations: [],
    cooldownMemory: cloneBehaviorMemory(),
    interventionMemory: cloneBehaviorMemory()
  };
}

/** Selects the entries to delete according to the page-history retention policy. */
function chooseEvictions(entries: PageHistoryEntry[], count: number): PageHistoryEntry[] {
  return [...entries].sort(compareEvictionPriority).slice(0, count);
}

/** Sorts entries from most disposable to most worth retaining. */
function compareEvictionPriority(left: PageHistoryEntry, right: PageHistoryEntry): number {
  return (
    compareBoolean(left.askable, right.askable) ||
    left.lastSeenAt - right.lastSeenAt ||
    left.visitCount - right.visitCount ||
    compareBoolean(hasSummaryOrSketch(left), hasSummaryOrSketch(right))
  );
}

/** Sorts false before true for eviction-ranking flags. */
function compareBoolean(left: boolean, right: boolean): number {
  if (left === right) return 0;
  return left ? 1 : -1;
}

/** Reports whether an entry has condensed model memory worth preserving. */
function hasSummaryOrSketch(entry: PageHistoryEntry): boolean {
  return Boolean(entry.summary ?? entry.sketch);
}
