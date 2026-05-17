import type { DebugEvent } from "@/shared/debug-types";
import type { WeakConcept } from "@/shared/session-types";
import { BackgroundDatabaseRepository, type PromptRecord } from "@/background/database-repository";

function databaseName(): string {
  return `reading-companion-test-${crypto.randomUUID()}`;
}

function weakConcept(overrides: Partial<WeakConcept> = {}): WeakConcept {
  return {
    id: "weak-1",
    concept: "energy conversion",
    sourceUrl: "https://example.test",
    sourceTitle: "Example",
    chunkReference: "chunk-1",
    chunkPreview: "Photosynthesis converts light energy.",
    userAnswer: "plants make food",
    gradingResult: "missed_key_point",
    missedPoint: "Light energy becomes chemical energy.",
    personaId: "brutal-tutor-dog",
    reviewed: false,
    createdAt: 10,
    ...overrides
  };
}

describe("BackgroundDatabaseRepository", () => {
  it("persists weak concepts newest first", async () => {
    const repository = new BackgroundDatabaseRepository({ databaseName: databaseName() });

    await repository.saveWeakConcept(weakConcept({ id: "old", createdAt: 1 }));
    await repository.saveWeakConcept(weakConcept({ id: "new", createdAt: 2 }));

    await expect(repository.listWeakConcepts()).resolves.toMatchObject([
      { id: "new" },
      { id: "old" }
    ]);
    await repository.close();
  });

  it("persists debug events newest first", async () => {
    const repository = new BackgroundDatabaseRepository({ databaseName: databaseName() });
    const oldEvent: DebugEvent = {
      id: "old",
      code: "PAGE_PARSED",
      message: "old",
      timestamp: 1
    };
    const newEvent: DebugEvent = { ...oldEvent, id: "new", timestamp: 2 };

    await repository.saveDebugEvent(oldEvent);
    await repository.saveDebugEvent(newEvent);

    await expect(repository.listDebugEvents()).resolves.toMatchObject([
      { id: "new" },
      { id: "old" }
    ]);
    await repository.close();
  });

  it("persists prompt records newest first", async () => {
    const repository = new BackgroundDatabaseRepository({ databaseName: databaseName() });
    const oldRecord: PromptRecord = {
      id: "old",
      kind: "question",
      prompt: "prompt",
      response: "response",
      usedFallback: false,
      createdAt: 1
    };
    const newRecord: PromptRecord = { ...oldRecord, id: "new", createdAt: 2 };

    await repository.savePromptRecord(oldRecord);
    await repository.savePromptRecord(newRecord);

    await expect(repository.listPromptRecords()).resolves.toMatchObject([
      { id: "new" },
      { id: "old" }
    ]);
    await repository.close();
  });
});
