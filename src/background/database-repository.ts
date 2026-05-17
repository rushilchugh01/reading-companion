import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { DebugEvent } from "../shared/debug-types";
import type { WeakConcept } from "../shared/session-types";

const DATABASE_VERSION = 1;

/** Persisted prompt trace for debug and local audit views. */
export type PromptRecord = {
  id: string;
  kind: "question" | "grading";
  prompt: string;
  response: string;
  usedFallback: boolean;
  createdAt: number;
};

interface BackgroundDatabase extends DBSchema {
  weakConcepts: {
    key: string;
    value: WeakConcept;
    indexes: { "by-createdAt": number };
  };
  debugEvents: {
    key: string;
    value: DebugEvent;
    indexes: { "by-timestamp": number; "by-code": string };
  };
  promptRecords: {
    key: string;
    value: PromptRecord;
    indexes: { "by-createdAt": number; "by-kind": string };
  };
}

type RepositoryOptions = {
  databaseName?: string;
};

async function openBackgroundDatabase(
  databaseName: string
): Promise<IDBPDatabase<BackgroundDatabase>> {
  return openDB<BackgroundDatabase>(databaseName, DATABASE_VERSION, {
    upgrade(database) {
      const weakConcepts = database.createObjectStore("weakConcepts", {
        keyPath: "id"
      });
      weakConcepts.createIndex("by-createdAt", "createdAt");

      const debugEvents = database.createObjectStore("debugEvents", {
        keyPath: "id"
      });
      debugEvents.createIndex("by-timestamp", "timestamp");
      debugEvents.createIndex("by-code", "code");

      const promptRecords = database.createObjectStore("promptRecords", {
        keyPath: "id"
      });
      promptRecords.createIndex("by-createdAt", "createdAt");
      promptRecords.createIndex("by-kind", "kind");
    }
  });
}

/** Stores local IndexedDB records owned by the background worker. */
export class BackgroundDatabaseRepository {
  private readonly databasePromise: Promise<IDBPDatabase<BackgroundDatabase>>;

  /** Opens the background IndexedDB database, optionally using a test name. */
  public constructor(options: RepositoryOptions = {}) {
    this.databasePromise = openBackgroundDatabase(
      options.databaseName ?? "reading-companion-background"
    );
  }

  /** Saves or replaces a weak concept for future resurfacing. */
  public async saveWeakConcept(concept: WeakConcept): Promise<void> {
    const database = await this.databasePromise;
    await database.put("weakConcepts", concept);
  }

  /** Returns newest weak concepts first. */
  public async listWeakConcepts(limit = 50): Promise<WeakConcept[]> {
    const database = await this.databasePromise;
    const records = await database.getAllFromIndex("weakConcepts", "by-createdAt");
    return records.slice(-limit).reverse();
  }

  /** Saves a debug event emitted by content or background services. */
  public async saveDebugEvent(event: DebugEvent): Promise<void> {
    const database = await this.databasePromise;
    await database.put("debugEvents", event);
  }

  /** Returns newest debug events first. */
  public async listDebugEvents(limit = 100): Promise<DebugEvent[]> {
    const database = await this.databasePromise;
    const records = await database.getAllFromIndex("debugEvents", "by-timestamp");
    return records.slice(-limit).reverse();
  }

  /** Saves a prompt record for local debug inspection. */
  public async savePromptRecord(record: PromptRecord): Promise<void> {
    const database = await this.databasePromise;
    await database.put("promptRecords", record);
  }

  /** Returns newest prompt records first. */
  public async listPromptRecords(limit = 50): Promise<PromptRecord[]> {
    const database = await this.databasePromise;
    const records = await database.getAllFromIndex("promptRecords", "by-createdAt");
    return records.slice(-limit).reverse();
  }

  /** Closes the underlying IndexedDB connection for tests and shutdown hooks. */
  public async close(): Promise<void> {
    const database = await this.databasePromise;
    database.close();
  }
}
