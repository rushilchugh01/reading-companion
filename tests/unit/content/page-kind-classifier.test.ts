import { describe, expect, it } from "vitest";
import {
  classifyPageKind,
  isQuietPageKind
} from "../../../src/content/observe/page-kind-classifier";
import {
  createContentHash,
  createPageId,
  normalizeUrl
} from "../../../src/shared/page-types";

describe("page-kind classifier reading surfaces", () => {
  it("classifies long-form articles without mistaking discussion of release notes", () => {
    const result = classifyPageKind({
      hasReadableText: true,
      text: repeatWords("This article explains why release notes help teams communicate change clearly.", 24),
      title: "How to Write Better Release Notes",
      url: "https://example.test/blog/write-release-notes",
      viewportTextDensity: 0.7
    });

    expect(result.pageKind).toBe("article");
    expect(result.pageKind).not.toBe("release_notes");
    expect(result.hardSkipReason).toBeUndefined();
  });

  it("classifies docs as askable reading surfaces", () => {
    const result = classifyPageKind({
      codeBlockCount: 2,
      hasReadableText: true,
      text: "Install the SDK, configure the client, and call the API with this example.",
      title: "API Reference",
      url: "https://docs.example.test/reference/client"
    });

    expect(result.pageKind).toBe("docs");
    expect(result.hardSkipReason).toBeUndefined();
  });

  it("distinguishes release notes from version-numbered blog posts", () => {
    const release = classifyPageKind({
      hasReadableText: true,
      text: "v2.1.0 Added sync. v2.0.0 Fixed export. 2026-02-10 Changed auth.",
      title: "Release Notes",
      url: "https://example.test/releases"
    });
    const blog = classifyPageKind({
      hasReadableText: true,
      text: repeatWords("Version 2.1 is a useful metaphor in this product essay.", 24),
      title: "Why version 2.1 matters",
      url: "https://example.test/blog/version-2-1"
    });

    expect(release.pageKind).toBe("release_notes");
    expect(blog.pageKind).toBe("article");
  });

  it("classifies changelogs only with explicit labels and multiple versions", () => {
    const changelog = classifyPageKind({
      hasReadableText: true,
      text: "Changelog v1.2.0 Added export. v1.1.0 Fixed import.",
      title: "Changelog",
      url: "https://example.test/changelog"
    });

    expect(changelog.pageKind).toBe("changelog");
  });
});

describe("page-kind classifier quiet surfaces and identity", () => {
  it("classifies academic papers and PDF text/scans", () => {
    const paper = classifyPageKind({
      contentType: "html",
      hasReadableText: true,
      text: "Abstract We evaluate retrieval practice. References Smith et al. DOI 10.0000/test",
      title: "Retrieval Practice in Reading",
      url: "https://journal.example.test/paper"
    });
    const textPdf = classifyPageKind({
      contentType: "pdf",
      hasReadableText: true,
      text: repeatWords("Selectable PDF page text", 20),
      title: "Paper PDF",
      url: "https://example.test/paper.pdf"
    });
    const scannedPdf = classifyPageKind({
      contentType: "pdf",
      hasReadableText: false,
      text: "",
      title: "Scanned PDF",
      url: "https://example.test/scan.pdf"
    });

    expect(paper.pageKind).toBe("academic_paper");
    expect(textPdf.pageKind).toBe("pdf_text");
    expect(scannedPdf.pageKind).toBe("pdf_scanned");
  });

  it("classifies quiet surfaces with hard skip reasons", () => {
    const search = classifyPageKind({
      hasReadableText: true,
      linkCount: 40,
      text: "Search results for reading companion with many links.",
      title: "Search",
      url: "https://example.test/search?q=reading"
    });
    const login = classifyPageKind({
      formCount: 1,
      hasReadableText: true,
      inputCount: 3,
      text: "Sign in with email and password.",
      title: "Log in",
      url: "https://example.test/login"
    });

    expect(search.pageKind).toBe("search");
    expect(login.pageKind).toBe("login");
    expect(isQuietPageKind(search.pageKind)).toBe(true);
    expect(login.hardSkipReason).toBe("login");
  });

  it("derives stable page ids from normalized URL and content hash", () => {
    const firstUrl = normalizeUrl("https://Example.test:443/article/?utm_source=x&b=2&a=1#section");
    const secondUrl = normalizeUrl("https://example.test/article?a=1&b=2");
    const hash = createContentHash("Stable content.");

    expect(firstUrl).toBe(secondUrl);
    expect(createPageId(firstUrl, hash)).toBe(createPageId(secondUrl, hash));
  });
});

/** Repeats text to create article-length fixtures. */
function repeatWords(text: string, count: number): string {
  return Array.from({ length: count }, () => text).join(" ");
}
