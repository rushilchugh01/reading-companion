/** Severity labels used by companion diagnostic logs. */
export type CompanionLogLevel = "debug" | "info" | "warn" | "error";

/** Payload accepted by companion diagnostic log calls. */
export type CompanionLogDetails = Record<string, unknown>;

/** One in-memory diagnostic log entry. */
export type CompanionLogEntry = {
  id: string;
  sequence: number;
  source: "reading-companion";
  level: CompanionLogLevel;
  scope: string;
  message: string;
  timestamp: number;
  details?: CompanionLogDetails;
};

/** Scoped logger facade for companion diagnostics. */
export type CompanionLogger = {
  debug(message: string, details?: CompanionLogDetails): void;
  info(message: string, details?: CompanionLogDetails): void;
  warn(message: string, details?: CompanionLogDetails): void;
  error(message: string, details?: CompanionLogDetails): void;
  log(level: CompanionLogLevel, message: string, details?: CompanionLogDetails): void;
};

declare global {
  var __READING_COMPANION_LOGS__: CompanionLogEntry[] | undefined;
  var __READING_COMPANION_LOG_SEQUENCE__: number | undefined;
  var __READING_COMPANION_LOG_WRITES__: Promise<void>[] | undefined;
  var __READING_COMPANION_LOG_FILE_WRITER__: ((entry: CompanionLogEntry) => void | Promise<void>) | undefined;
}

const MAX_LOG_ENTRIES = 200;
const LOG_SOURCE = "reading-companion" as const;
const REDACTED_VALUE = "[REDACTED]";
const SENSITIVE_KEYS = new Set([
  "apikey",
  "authorization",
  "bearertoken",
  "password",
  "secret",
  "token"
]);
const SENSITIVE_VALUE_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b(?:sk|sess|ghp|github_pat|xox[baprs]?)[-_][A-Za-z0-9._~+/=-]{8,}/gi
];

/** Creates a scoped logger that records structured entries and routes them to console. */
export function createCompanionLogger(scope: string): CompanionLogger {
  return {
    debug(message, details) {
      writeCompanionLog("debug", scope, message, details);
    },
    info(message, details) {
      writeCompanionLog("info", scope, message, details);
    },
    warn(message, details) {
      writeCompanionLog("warn", scope, message, details);
    },
    error(message, details) {
      writeCompanionLog("error", scope, message, details);
    },
    log(level, message, details) {
      writeCompanionLog(level, scope, message, details);
    }
  };
}

/** Writes namespaced logs to console and a small in-memory ring buffer. */
export function logCompanion(
  level: CompanionLogLevel,
  scope: string,
  message: string,
  details?: CompanionLogDetails
): void {
  createCompanionLogger(scope).log(level, message, details);
}

/** Returns recent diagnostic logs from the current extension execution world. */
export function companionLogs(): CompanionLogEntry[] {
  return globalThis.__READING_COMPANION_LOGS__ ?? [];
}

/** Waits for file sink writes to settle, mainly for tests. */
export async function flushCompanionLogWrites(): Promise<void> {
  const writes = globalThis.__READING_COMPANION_LOG_WRITES__ ?? [];
  globalThis.__READING_COMPANION_LOG_WRITES__ = [];
  await Promise.allSettled(writes);
}

function writeCompanionLog(
  level: CompanionLogLevel,
  scope: string,
  message: string,
  details?: CompanionLogDetails
): void {
  const entry = createCompanionLogEntry(level, scope, message, details);
  const logs = globalThis.__READING_COMPANION_LOGS__ ?? [];
  globalThis.__READING_COMPANION_LOGS__ = [entry, ...logs].slice(0, MAX_LOG_ENTRIES);
  writeConsole(entry);
  trackCompanionLogWrite(writeCompanionLogFile(entry));
}

function createCompanionLogEntry(
  level: CompanionLogLevel,
  scope: string,
  message: string,
  details?: CompanionLogDetails
): CompanionLogEntry {
  const sequence = nextCompanionLogSequence();
  return {
    id: `companion-log-${sequence}`,
    sequence,
    source: LOG_SOURCE,
    level,
    scope,
    message,
    timestamp: Date.now(),
    details: redactLogDetails(details)
  };
}

function nextCompanionLogSequence(): number {
  const nextSequence = (globalThis.__READING_COMPANION_LOG_SEQUENCE__ ?? 0) + 1;
  globalThis.__READING_COMPANION_LOG_SEQUENCE__ = nextSequence;
  return nextSequence;
}

function redactLogDetails(details?: CompanionLogDetails): CompanionLogDetails | undefined {
  if (details === undefined) return undefined;
  return redactValue(details) as CompanionLogDetails;
}

function redactValue(value: unknown, key?: string): unknown {
  if (key !== undefined && SENSITIVE_KEYS.has(key.toLowerCase())) {
    return REDACTED_VALUE;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }
  if (typeof value === "string") {
    return redactSensitiveText(value);
  }
  if (!isPlainRecord(value)) {
    return value;
  }

  const redacted: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    redacted[entryKey] = redactValue(entryValue, entryKey);
  }
  return redacted;
}

function redactSensitiveText(value: string): string {
  return SENSITIVE_VALUE_PATTERNS.reduce((text, pattern) => text.replace(pattern, REDACTED_VALUE), value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function writeConsole(entry: CompanionLogEntry): void {
  const payload = consolePayload(entry);
  const prefix = `[ReadingCompanion:${entry.scope}] ${entry.message}`;
  if (entry.level === "error") {
    console.error(prefix, payload);
    return;
  }
  if (entry.level === "warn") {
    console.warn(prefix, payload);
    return;
  }
  if (entry.level === "info") {
    console.info(prefix, payload);
    return;
  }
  console.debug(prefix, payload);
}

function consolePayload(entry: CompanionLogEntry): Record<string, unknown> {
  return {
    id: entry.id,
    sequence: entry.sequence,
    source: entry.source,
    level: entry.level,
    scope: entry.scope,
    message: entry.message,
    details: entry.details ?? {}
  };
}

function writeCompanionLogFile(entry: CompanionLogEntry): Promise<void> {
  const writer = globalThis.__READING_COMPANION_LOG_FILE_WRITER__;
  if (writer === undefined) return Promise.resolve();
  try {
    return Promise.resolve(writer(entry));
  } catch {
    return Promise.resolve();
  }
}

function trackCompanionLogWrite(write: Promise<void>): void {
  const pendingWrites = globalThis.__READING_COMPANION_LOG_WRITES__ ?? [];
  globalThis.__READING_COMPANION_LOG_WRITES__ = [...pendingWrites, write];
  void write.finally(() => {
    const currentWrites = globalThis.__READING_COMPANION_LOG_WRITES__ ?? [];
    globalThis.__READING_COMPANION_LOG_WRITES__ = currentWrites.filter((pendingWrite) => pendingWrite !== write);
  });
}
