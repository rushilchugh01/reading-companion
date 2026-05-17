import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: [
    "entrypoints/**/*.{ts,tsx}",
    "scripts/**/*.mjs",
    "tests/**/*.test.{ts,tsx}",
    "tests/setup.ts"
  ],
  project: [
    "entrypoints/**/*.{ts,tsx}",
    "scripts/**/*.mjs",
    "src/**/*.{ts,tsx}",
    "tests/**/*.{ts,tsx}"
  ],
  ignoreFiles: [
    "src/content/signals/signal-store.ts",
    "src/shared/settings-diff.ts",
    "tests/intervention/vitest.config.ts"
  ]
};

export default config;
