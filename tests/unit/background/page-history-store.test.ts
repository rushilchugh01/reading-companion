import { describe, expect, it } from "vitest";
import {
  PageHistoryStore,
  type PageHistoryBehaviorMemory,
  type SavePageHistoryInput
} from "../../../src/background/persistence/page-history-store";

describe("PageHistoryStore restore behavior", () => {
  it("restores stored page memory when the normalized URL and content hash match", async () => {
    const store = newStore();
    const behaviorMemory = memory({
      byChunk: { "chunk-1": chunkMemory({ dismissCount: 1, lastDismissedAt: 20 }) },
      channelCooldowns: { proactive: 200 },
      counts: { dismissed: 1 },
      lastDismissedAt: 20
    });

    await store.savePage(pageInput({ cooldownMemory: behaviorMemory, interventionMemory: behaviorMemory }));
    const restored = await store.restorePage("https://example.test/article#section", "hash-a");

    expect(restored).toMatchObject({ status: "restored" });
    if (restored.status !== "restored") throw new Error("Expected restored page history.");
    expect(restored.entry.chunks).toMatchObject([{ id: "chunk-1", hash: "chunk-hash" }]);
    expect(restored.entry.cooldownMemory.channelCooldowns.proactive).toBe(200);
    expect(restored.entry.interventionMemory.byChunk["chunk-1"]?.dismissCount).toBe(1);
    await store.close();
  });

  it("does not reuse chunk memory when the content hash has changed", async () => {
    const store = newStore();
    await store.savePage(pageInput());

    const stale = await store.restorePage("https://example.test/article", "hash-b");
    expect(stale).toMatchObject({ status: "stale" });
    if (stale.status !== "stale") throw new Error("Expected stale page history.");
    expect(stale.staleEntry.chunks).toEqual([]);
    expect(stale.staleEntry.interventionMemory.byChunk).toEqual({});

    await store.savePage(pageInput({ contentHash: "hash-b", chunks: undefined }));
    const restored = await store.restorePage("https://example.test/article", "hash-b");
    expect(restored).toMatchObject({ status: "restored" });
    if (restored.status !== "restored") throw new Error("Expected restored updated hash.");
    expect(restored.entry.chunks).toEqual([]);
    await store.close();
  });

  it("keeps behavior memory across same-hash visits even when the next save omits it", async () => {
    const store = newStore();
    await store.savePage(pageInput({
      interventionMemory: memory({
        byChunk: { "chunk-1": chunkMemory({ ignoreCount: 2, lastIgnoredAt: 30 }) },
        channelCooldowns: { bubble: 300 },
        counts: { ignored: 2 },
        lastIgnoredAt: 30
      })
    }));
    await store.savePage(pageInput({ seenAt: 2, chunks: undefined }));

    const restored = await store.restorePage("https://example.test/article", "hash-a");
    expect(restored).toMatchObject({ status: "restored" });
    if (restored.status !== "restored") throw new Error("Expected restored page history.");
    expect(restored.entry.visitCount).toBe(2);
    expect(restored.entry.interventionMemory.counts.ignored).toBe(2);
    expect(restored.entry.interventionMemory.byChunk["chunk-1"]?.ignoreCount).toBe(2);
    await store.close();
  });

});

describe("PageHistoryStore eviction behavior", () => {
  it("evicts non-askable, old, low-visit, and no-summary pages before richer entries", async () => {
    await expectEvicted(
      [pageInput({ url: "https://e.test/old", seenAt: 1 }), pageInput({ url: "https://e.test/nope", askable: false, seenAt: 2 }), pageInput({ url: "https://e.test/new", seenAt: 3 })],
      "https://e.test/nope"
    );
    await expectEvicted(
      [pageInput({ url: "https://e.test/old", seenAt: 1 }), pageInput({ url: "https://e.test/mid", seenAt: 2 }), pageInput({ url: "https://e.test/new", seenAt: 3 })],
      "https://e.test/old"
    );
    await expectEvicted(
      [pageInput({ url: "https://e.test/low", seenAt: 5 }), pageInput({ url: "https://e.test/high", seenAt: 5 }), pageInput({ url: "https://e.test/high", seenAt: 5 }), pageInput({ url: "https://e.test/next", seenAt: 5 })],
      "https://e.test/low"
    );
    await expectEvicted(
      [pageInput({ url: "https://e.test/plain", seenAt: 5 }), pageInput({ url: "https://e.test/summary", seenAt: 5, summary: "short" }), pageInput({ url: "https://e.test/sketch", seenAt: 5, sketch: "map" })],
      "https://e.test/plain"
    );
  });
});

/** Creates a page-history store with a unique fake IndexedDB name. */
function newStore(maxEntries = 20): PageHistoryStore {
  return new PageHistoryStore({ databaseName: `page-history-${crypto.randomUUID()}`, maxEntries });
}

/** Creates a compact page input fixture with no raw page text. */
function pageInput(overrides: Partial<SavePageHistoryInput> = {}): SavePageHistoryInput {
  return {
    url: "https://example.test/article",
    title: "Example",
    contentHash: "hash-a",
    contentPreview: "A short bounded preview.",
    askable: true,
    seenAt: 1,
    chunks: [{ id: "chunk-1", hash: "chunk-hash", preview: "Chunk preview." }],
    ...overrides
  };
}

/** Creates a behavior-memory fixture for cooldown and intervention stores. */
function memory(overrides: Partial<PageHistoryBehaviorMemory> = {}): PageHistoryBehaviorMemory {
  return {
    byChunk: {},
    channelCooldowns: {},
    counts: {},
    ...overrides
  };
}

/** Creates per-chunk behavior counts with neutral defaults. */
function chunkMemory(
  overrides: Partial<PageHistoryBehaviorMemory["byChunk"][string]> = {}
): PageHistoryBehaviorMemory["byChunk"][string] {
  return {
    askCount: 0,
    dismissCount: 0,
    ignoreCount: 0,
    ...overrides
  };
}

/** Saves entries into a tiny store and expects one URL to be missing after eviction. */
async function expectEvicted(entries: SavePageHistoryInput[], evictedUrl: string): Promise<void> {
  const store = newStore(2);
  for (const entry of entries) await store.savePage(entry);

  const restored = await store.restorePage(evictedUrl, "hash-a");
  expect(restored).toEqual({ status: "missing" });
  expect(await store.listPages()).toHaveLength(2);
  await store.close();
}
