import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: [["list"]],
  timeout: 45_000,
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure"
  }
});
