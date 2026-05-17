export type PageId = string & { readonly __brand: "PageId" };
export type ChunkId = string & { readonly __brand: "ChunkId" };
export type ContentHash = string & { readonly __brand: "ContentHash" };

export type PageKind =
  | "article"
  | "docs"
  | "academic_paper"
  | "pdf_text"
  | "pdf_scanned"
  | "release_notes"
  | "changelog"
  | "feed"
  | "search"
  | "app"
  | "dashboard"
  | "login"
  | "video"
  | "unknown"
  | "unsupported";

export type DOMRectLike = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
};

export type ReadableChunkKind =
  | "heading"
  | "paragraph"
  | "list"
  | "code"
  | "table"
  | "math"
  | "pdf"
  | "caption"
  | "quote";

export type ReadableChunk = {
  readonly chunkId: ChunkId;
  readonly contentHash: ContentHash;
  readonly text: string;
  readonly normalizedText: string;
  readonly kind: ReadableChunkKind;
  readonly order: number;
  readonly headingPath: readonly string[];
  readonly rect?: DOMRectLike;
  readonly visibleRatio?: number;
};

export type PageSnapshot = {
  readonly pageId: PageId;
  readonly normalizedUrl: string;
  readonly contentHash: ContentHash;
  readonly pageKind: PageKind;
  readonly title: string;
  readonly chunks: readonly ReadableChunk[];
  readonly capturedAt: number;
};

/** Normalizes URLs so page identity ignores tracking noise and fragments. */
export function normalizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    normalizePort(url);
    removeTrackingParameters(url);
    normalizePath(url);
    return url.toString();
  } catch {
    return normalizeWhitespace(rawUrl).toLowerCase();
  }
}

/** Creates a stable content hash for a page or chunk text payload. */
export function createContentHash(input: string | readonly string[]): ContentHash {
  const text = typeof input === "string" ? input : input.join("\n\n");
  return hashString(normalizeWhitespace(text)) as ContentHash;
}

/** Derives the stable page id from normalized URL and page content hash. */
export function createPageId(normalizedUrl: string, contentHash: ContentHash): PageId {
  return `page_${hashString(`${normalizedUrl}\n${contentHash}`)}` as PageId;
}

/** Creates a stable chunk id from page identity, order, and chunk content. */
export function createChunkId(
  pageId: PageId,
  order: number,
  contentHash: ContentHash
): ChunkId {
  return `chunk_${hashString(`${pageId}\n${order}\n${contentHash}`)}` as ChunkId;
}

/** Creates a readable chunk with normalized text, content hash, and chunk id. */
export function createReadableChunk(input: {
  readonly pageId: PageId;
  readonly text: string;
  readonly kind: ReadableChunkKind;
  readonly order: number;
  readonly headingPath?: readonly string[];
  readonly rect?: DOMRectLike;
  readonly visibleRatio?: number;
}): ReadableChunk {
  const normalizedText = normalizeWhitespace(input.text);
  const contentHash = createContentHash(normalizedText);
  return {
    chunkId: createChunkId(input.pageId, input.order, contentHash),
    contentHash,
    headingPath: input.headingPath ?? [],
    kind: input.kind,
    normalizedText,
    order: input.order,
    rect: input.rect,
    text: input.text,
    visibleRatio: input.visibleRatio
  };
}

/** Creates a page snapshot with deterministic page and chunk identities. */
export function createPageSnapshot(input: {
  readonly url: string;
  readonly title: string;
  readonly pageKind: PageKind;
  readonly chunkInputs: readonly Omit<Parameters<typeof createReadableChunk>[0], "pageId">[];
  readonly capturedAt: number;
}): PageSnapshot {
  const normalizedUrl = normalizeUrl(input.url);
  const pageHash = createContentHash(input.chunkInputs.map((chunk) => chunk.text));
  const pageId = createPageId(normalizedUrl, pageHash);
  return {
    capturedAt: input.capturedAt,
    chunks: input.chunkInputs.map((chunk) => createReadableChunk({ ...chunk, pageId })),
    contentHash: pageHash,
    normalizedUrl,
    pageId,
    pageKind: input.pageKind,
    title: input.title
  };
}

/** Normalizes text for deterministic scoring and hashing. */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Clears default HTTP and HTTPS ports for canonical URL identity. */
function normalizePort(url: URL): void {
  const isDefaultHttp = url.protocol === "http:" && url.port === "80";
  const isDefaultHttps = url.protocol === "https:" && url.port === "443";
  if (isDefaultHttp || isDefaultHttps) {
    url.port = "";
  }
}

/** Removes duplicate and trailing slashes from URL paths. */
function normalizePath(url: URL): void {
  url.pathname = url.pathname.replace(/\/{2,}/g, "/");
  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/g, "");
  }
}

/** Removes common marketing and referrer parameters from a URL. */
function removeTrackingParameters(url: URL): void {
  const removable = [
    "fbclid",
    "gclid",
    "igshid",
    "mc_cid",
    "mc_eid",
    "ref",
    "spm"
  ];
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith("utm_") || removable.includes(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
}

/** Hashes normalized strings with a small deterministic FNV-1a variant. */
function hashString(input: string): string {
  let hash = 0x81_1c_9d_c5;
  for (const character of input.toLowerCase()) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01_00_01_93) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
