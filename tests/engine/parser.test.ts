import { describe, expect, it } from "vitest";
import {
  createChunkHash,
  generateSelector,
  parseDocumentSurface,
  parseHtmlChunks
} from "../../src/engine";

describe("content parser", () => {
  it("extracts supported HTML nodes in reading order", () => {
    document.body.innerHTML = `
      <main>
        <h1 id="title">Active Reading</h1>
        <p>Readers build a model of the argument before judging it.</p>
        <ul><li>Trace claims</li><li>Notice evidence</li></ul>
        <pre><code>const claim = evidence.map(read);</code></pre>
        <table><tr><th>Term</th><th>Meaning</th></tr><tr><td>Recall</td><td>Memory</td></tr></table>
        <div class="math">x^2 + y^2 = z^2</div>
      </main>
    `;

    const chunks = parseHtmlChunks(document);

    expect(chunks.map((chunk) => chunk.kind)).toEqual([
      "heading",
      "paragraph",
      "list",
      "code",
      "table",
      "math"
    ]);
    expect(chunks[0]?.selector).toBe("#title");
    expect(chunks[1]?.heading).toBe("Active Reading");
    expect(chunks[2]?.text).toContain("- Trace claims");
    expect(chunks[4]?.text).toContain("Term | Meaning");
  });

  it("generates deterministic hashes and structural selectors", () => {
    document.body.innerHTML = "<main><section><p>Stable chunk text.</p></section></main>";
    const paragraph = document.querySelector("p");

    expect(createChunkHash("Stable chunk text.")).toBe(createChunkHash(" Stable chunk text. "));
    expect(createChunkHash("Stable chunk text.")).not.toBe(createChunkHash("Changed chunk text."));
    expect(paragraph ? generateSelector(paragraph) : "").toBe(
      "body:nth-of-type(1) > main:nth-of-type(1) > section:nth-of-type(1) > p:nth-of-type(1)"
    );
  });

  it("reports limited PDF fallback with recovered viewer text", () => {
    document.body.innerHTML = "<div>PDF page text exposed by the browser viewer.</div>";

    const snapshot = parseDocumentSurface({
      document,
      url: "https://example.test/paper.pdf"
    });

    expect(snapshot.contentType).toBe("pdf");
    expect(snapshot.status).toBe("limited");
    expect(snapshot.chunks).toHaveLength(1);
    expect(snapshot.chunks[0]?.kind).toBe("pdf");
  });

  it("reports unsupported local files when no DOM text is readable", () => {
    document.body.innerHTML = "";

    const snapshot = parseDocumentSurface({
      document,
      url: "file:///Users/me/book.epub"
    });

    expect(snapshot.contentType).toBe("local_file");
    expect(snapshot.status).toBe("unsupported");
    expect(snapshot.chunks).toEqual([]);
  });
});
