import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const INCLUDED = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const IGNORED = new Set([
  "node_modules",
  ".wxt",
  "coverage",
  "dist",
  "playwright-report",
  "test-results"
]);
const MAX_LINES = 400;

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.toSorted((left, right) => left.name.localeCompare(right.name))) {
    if (IGNORED.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(fullPath));
    if (entry.isFile() && INCLUDED.has(path.extname(entry.name))) files.push(fullPath);
  }
  return files;
}

async function countLines(filePath) {
  const content = await readFile(filePath, "utf8");
  return content.split(/\r?\n/).length;
}

const files = await collectFiles(ROOT);
const oversized = [];
for (const filePath of files) {
  const lineCount = await countLines(filePath);
  if (lineCount > MAX_LINES) {
    oversized.push(`${path.relative(ROOT, filePath)} has ${lineCount} lines`);
  }
}

if (oversized.length > 0) {
  console.error(oversized.join("\n"));
  process.exitCode = 1;
}
