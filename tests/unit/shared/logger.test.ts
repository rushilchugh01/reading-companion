import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { companionLogs, createCompanionLogger, flushCompanionLogWrites, logCompanion } from "../../../src/shared/logger";

beforeEach(() => {
  globalThis.__READING_COMPANION_LOGS__ = [];
  globalThis.__READING_COMPANION_LOG_SEQUENCE__ = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.READING_COMPANION_LOG_FILE;
});

describe("ring buffer", () => {
  it("keeps the most recent 200 entries", () => {
    const logger = createCompanionLogger("ring");

    for (let index = 1; index <= 201; index += 1) {
      logger.debug(`event-${index}`);
    }

    const entries = companionLogs();
    expect(entries).toHaveLength(200);
    expect(entries[0]).toMatchObject({
      id: "companion-log-201",
      sequence: 201,
      level: "debug",
      scope: "ring",
      message: "event-201",
      source: "reading-companion"
    });
    expect(entries.at(-1)).toMatchObject({ id: "companion-log-2", sequence: 2 });
  });
});

describe("redaction", () => {
  it("redacts sensitive fields recursively", () => {
    createCompanionLogger("redaction").info("payload", {
      Authorization: "Bearer secret-token",
      apiKey: "sk-test",
      nested: {
        bearerToken: "bearer-secret",
        keep: "visible",
        password: "p@ss",
        secret: "shh",
        token: "tok",
        items: [{ password: "inner-password" }]
      }
    });

    expect(companionLogs()[0]).toMatchObject({
      details: {
        Authorization: "[REDACTED]",
        apiKey: "[REDACTED]",
        nested: {
          bearerToken: "[REDACTED]",
          keep: "visible",
          password: "[REDACTED]",
          secret: "[REDACTED]",
          token: "[REDACTED]",
          items: [{ password: "[REDACTED]" }]
        }
      }
    });
  });

  it("redacts secret-shaped values in ordinary string fields", () => {
    createCompanionLogger("redaction").error("provider failed", {
      error: "Provider returned authorization Bearer sk-provider-secret_12345678"
    });

    expect(companionLogs()[0]?.details).toEqual({
      error: "Provider returned authorization [REDACTED]"
    });
  });
});

describe("scoped logger", () => {
  it("keeps scoped logger metadata stable", () => {
    createCompanionLogger("runtime").warn("scope check", { chunkCount: 3 });

    expect(companionLogs()[0]).toMatchObject({
      id: "companion-log-1",
      sequence: 1,
      level: "warn",
      scope: "runtime",
      message: "scope check",
      source: "reading-companion",
      details: { chunkCount: 3 }
    });
  });
});

describe("console routing", () => {
  it("routes legacy logCompanion calls to the matching console method", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    logCompanion("warn", "legacy", "legacy routing", { bearerToken: "secret-token" });

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledWith(
      "[ReadingCompanion:legacy] legacy routing",
      expect.objectContaining({
        details: { bearerToken: "[REDACTED]" },
        level: "warn",
        message: "legacy routing",
        scope: "legacy",
        source: "reading-companion"
      })
    );
  });
});

describe("file sink", () => {
  it("appends redacted entries to a log file in node runtimes", async () => {
    const logDirectory = await mkdtemp(path.join(tmpdir(), "reading-companion-logs-"));
    const logFile = path.join(logDirectory, "companion.log");
    process.env.READING_COMPANION_LOG_FILE = logFile;

    createCompanionLogger("file-sink").error("file write", {
      password: "secret-password",
      nested: { token: "secret-token" }
    });

    await flushCompanionLogWrites();
    const fileContents = await readFile(logFile, "utf8");
    await rm(logDirectory, { force: true, recursive: true });

    expect(fileContents).toContain("\"scope\":\"file-sink\"");
    expect(fileContents).toContain("\"message\":\"file write\"");
    expect(fileContents).toContain("\"password\":\"[REDACTED]\"");
    expect(fileContents).toContain("\"token\":\"[REDACTED]\"");
    expect(fileContents).not.toContain("secret-password");
    expect(fileContents).not.toContain("secret-token");
  });
});
