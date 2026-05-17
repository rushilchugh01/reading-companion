import { expect, test, type TestInfo } from "@playwright/test";

import {
  attachExtensionVideos,
  closeExtensionContext,
  findBuiltExtensionPath,
  fixtureUrl,
  launchExtensionContext
} from "./extension-harness";

const extensionPath = findBuiltExtensionPath();

test.describe("built extension harness", () => {
  test.skip(extensionPath === undefined, "Run `npm run build` before extension e2e tests.");

  test("loads the extension in Chromium and opens reading fixtures", async () => {
    if (extensionPath === undefined) {
      test.skip();
      return;
    }

    const testInfo = test.info();
    const extension = await launchOrSkip(extensionPath, testInfo);

    try {
      const page = await extension.context.newPage();

      await page.goto(fixtureUrl("article.html"));
      await expect(page).toHaveTitle(/Synthetic Article/);
      await expect(page.locator("article")).toContainText("progressive overload");
      await expect(page.getByRole("button", { name: "Open reading companion" })).toBeVisible();
      await expect(page.locator(".rc-pet__sprite")).toHaveAttribute(
        "src",
        /assets\/corgi-states-transparent\/idle\.png/
      );

      await page.goto(fixtureUrl("code.html"));
      await expect(page.locator("pre code")).toContainText("summarizeSelection");
    } finally {
      await closeExtensionContext(extension);
      await attachExtensionVideos(testInfo, extension);
    }
  });
});

async function launchOrSkip(extensionPath: string, testInfo: TestInfo) {
  try {
    return await launchExtensionContext({ extensionPath, testInfo });
  } catch (error) {
    if (isMissingPlaywrightBrowser(error)) {
      test.skip(true, "Install Playwright Chromium to run extension e2e tests.");
    }
    throw error;
  }
}

function isMissingPlaywrightBrowser(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Executable doesn't exist");
}
