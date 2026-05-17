import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

globalThis.__READING_COMPANION_LOG_FILE_WRITER__ = async (entry) => {
  const filePath = process.env.READING_COMPANION_LOG_FILE ?? path.join(process.cwd(), "logs", "companion.log");
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
};
