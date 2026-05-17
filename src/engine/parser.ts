import type {
  ContentType,
  ParserSnapshot,
  ReadingChunk
} from "../shared/reading-types";

const EXTRACTOR_SELECTOR = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "ul",
  "ol",
  "pre",
  "code",
  "table",
  "math",
  "[role='math']",
  ".math",
  ".mathjax",
  ".katex",
  "script[type^='math/tex']"
].join(",");

const BLOCK_ANCESTORS = "p,ul,ol,pre,code,table,math,[role='math'],.math,.mathjax,.katex";

type ParseSurfaceOptions = {
  readonly document: Document;
  readonly url?: string;
  readonly contentType?: ContentType;
};

type ExtractedNode = {
  readonly element: Element;
  readonly kind: ReadingChunk["kind"];
  readonly text: string;
};

/** Parses the current browser surface into a deterministic parser snapshot. */
export function parseDocumentSurface(options: ParseSurfaceOptions): ParserSnapshot {
  const contentType = options.contentType ?? inferContentType(options.url);

  if (contentType === "pdf") {
    return parseLimitedTextSurface(options.document, "pdf");
  }

  if (contentType === "local_file") {
    const chunks = parseHtmlChunks(options.document);
    return {
      contentType,
      status: chunks.length > 0 ? "limited" : "unsupported",
      chunks,
      message: chunks.length > 0
        ? "Parsed local file HTML with browser-provided DOM access."
        : "Local file content is not readable from the current DOM."
    };
  }

  if (contentType === "unknown") {
    return {
      contentType,
      status: "unsupported",
      chunks: [],
      message: "Content type could not be inferred."
    };
  }

  const chunks = parseHtmlChunks(options.document);
  if (chunks.length === 0 && hasLargeReadableIframe(options.document)) {
    return {
      contentType,
      status: "limited",
      chunks,
      message: "Detected a large embedded reading frame; Chrome may block direct text access from the wrapper page."
    };
  }
  return { contentType, status: "ready", chunks };
}

/** Extracts readable HTML chunks from headings, text blocks, lists, code, tables, and math nodes. */
export function parseHtmlChunks(document: Document): ReadingChunk[] {
  const root = document.querySelector("main,article,[role='main']") ?? document.body;
  if (!root) {
    return [];
  }

  let currentHeading = "";
  return Array.from(root.querySelectorAll(EXTRACTOR_SELECTOR))
    .filter(isTopLevelReadableNode)
    .map((element) => extractNode(element))
    .filter((node): node is ExtractedNode => node !== undefined)
    .map((node, order) => {
      if (node.kind === "heading") {
        currentHeading = node.text;
      }

      return createReadingChunk(node, currentHeading, order);
    });
}

/** Creates a stable content hash for chunk identity and deduplication. */
export function createChunkHash(input: string): string {
  let hash = 0x81_1c_9d_c5;
  for (const character of normalizeText(input)) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01_00_01_93) >>> 0;
  }

  return hash.toString(16).padStart(8, "0");
}

/** Generates a stable selector path for an extracted chunk element. */
export function generateSelector(element: Element): string {
  if (element.id) {
    return `#${cssEscape(element.id)}`;
  }

  const segments: string[] = [];
  let current: Element | null = element;
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const tagName = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;
    const index = parent ? siblingIndex(current) : 1;
    segments.unshift(`${tagName}:nth-of-type(${index})`);
    current = parent;

    if (tagName === "body") {
      break;
    }
  }

  return segments.join(" > ");
}

function parseLimitedTextSurface(document: Document, contentType: ContentType): ParserSnapshot {
  const text = normalizeText(document.body?.textContent ?? "");
  const chunks = text.length > 0
    ? [createReadingChunk({
      element: document.body,
      kind: "pdf",
      text: text.slice(0, 5_000)
    }, "", 0)]
    : [];

  return {
    contentType,
    status: "limited",
    chunks,
    message: chunks.length > 0
      ? "PDF text was recovered from the browser viewer DOM."
      : "PDF parsing is limited without viewer text access."
  };
}

function hasLargeReadableIframe(document: Document): boolean {
  return [...document.querySelectorAll("iframe")]
    .some((iframe) => {
      const rect = iframe.getBoundingClientRect();
      return rect.width >= window.innerWidth * 0.6
        && rect.height >= window.innerHeight * 0.4
        && iframe.src.startsWith("https://");
    });
}

function inferContentType(url?: string): ContentType {
  if (!url) {
    return "html";
  }

  const normalizedUrl = url.toLowerCase();
  if (normalizedUrl.startsWith("file:")) {
    return "local_file";
  }

  if (normalizedUrl.endsWith(".pdf") || normalizedUrl.includes(".pdf?")) {
    return "pdf";
  }

  if (normalizedUrl.startsWith("http:") || normalizedUrl.startsWith("https:")) {
    return "html";
  }

  return "unknown";
}

function isTopLevelReadableNode(element: Element): boolean {
  if (element.matches("code") && element.closest("pre")) {
    return false;
  }

  const ancestor = element.parentElement?.closest(BLOCK_ANCESTORS);
  return ancestor === null || ancestor === element;
}

function extractNode(element: Element): ExtractedNode | undefined {
  const kind = getChunkKind(element);
  const text = normalizeText(readElementText(element, kind));

  if (text.length === 0) {
    return undefined;
  }

  return { element, kind, text };
}

function getChunkKind(element: Element): ReadingChunk["kind"] {
  const tagName = element.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tagName)) {
    return "heading";
  }

  if (tagName === "ul" || tagName === "ol") {
    return "list";
  }

  if (tagName === "pre" || tagName === "code") {
    return "code";
  }

  if (tagName === "table") {
    return "table";
  }

  if (isMathNode(element)) {
    return "math";
  }

  return "paragraph";
}

function readElementText(element: Element, kind: ReadingChunk["kind"]): string {
  if (kind === "list") {
    return Array.from(element.querySelectorAll("li"))
      .map((item) => `- ${item.textContent ?? ""}`)
      .join(" ");
  }

  if (kind === "table") {
    return Array.from(element.querySelectorAll("tr"))
      .map((row) => Array.from(row.querySelectorAll("th,td"))
        .map((cell) => cell.textContent ?? "")
        .join(" | "))
      .join(" ");
  }

  return element.textContent ?? "";
}

function createReadingChunk(
  node: ExtractedNode,
  heading: string,
  order: number
): ReadingChunk {
  const hashSource = [node.kind, heading, node.text].join("\n");
  return {
    id: `${order}-${createChunkHash(hashSource)}`,
    hash: createChunkHash(hashSource),
    heading,
    text: node.text,
    preview: node.text.slice(0, 160),
    kind: node.kind,
    order,
    selector: generateSelector(node.element),
    state: "unseen",
    scores: {
      readingConfidence: 0,
      meaningfulness: 0,
      interventionReadiness: 0
    },
    metrics: {
      visibleRatio: 0,
      visibleMilliseconds: 0,
      revisitCount: 0,
      scrollVelocity: 0,
      selectionCount: 0
    }
  };
}

function isMathNode(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();
  return tagName === "math"
    || element.getAttribute("role") === "math"
    || element.matches(".math,.mathjax,.katex,script[type^='math/tex']");
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function siblingIndex(element: Element): number {
  const siblings = Array.from(element.parentElement?.children ?? [])
    .filter((sibling) => sibling.tagName === element.tagName);
  return siblings.indexOf(element) + 1;
}

function cssEscape(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
}
