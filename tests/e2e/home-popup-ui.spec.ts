import { expect, test, type BrowserContext, type Page, type TestInfo } from "@playwright/test";

import {
  attachExtensionVideos,
  closeExtensionContext,
  findBuiltExtensionPath,
  fixtureUrl,
  launchExtensionContext,
  openOptionsPage,
  sendRuntimeMessage,
  writeExtensionSettings
} from "./extension-harness";

const extensionPath = findBuiltExtensionPath();

test.describe("compact home popup UI", () => {
  test.skip(extensionPath === undefined, "Run `npm run build` before extension e2e tests.");

  test("opens, scrolls, runs home actions, uses the menu, and reopens", async () => {
    await withExtension(async ({ context, extensionId }) => {
      const page = await openHomeFixture(context, extensionId);
      const companionButton = page.getByRole("button", { name: "Open reading companion" });

      await expect(companionButton).toBeVisible();
      await companionButton.click();

      const popup = page.getByRole("region", { name: "Companion tool panel" });
      await expect(popup).toBeVisible();
      await expect(popup).toContainText("What would help right now?");
      await expect(page.getByRole("region", { name: "Reading companion panel" })).toBeHidden();

      await expectPopupFitsOrScrolls(page);

      await page.getByRole("button", { name: "Summarize this bit" }).click();
      await expect(page.getByRole("heading", { name: "Quick summary" })).toBeVisible();

      await page.getByRole("button", { name: "Why does this matter?" }).click();
      await expect(page.getByRole("heading", { name: "Why it matters" })).toBeVisible();

      await page.getByRole("button", { name: "Make a prediction" }).click();
      await expect(page.getByRole("heading", { name: "Make a prediction" })).toBeVisible();

      await page.getByRole("button", { name: "Open companion tools" }).click();
      await expect(page.getByRole("menu")).toBeVisible();
      await page.getByRole("menuitem", { name: "Minimize" }).click();
      await expect(popup).toBeHidden();

      await companionButton.click();
      await expect(popup).toBeVisible();
      await page.getByRole("button", { name: "Summarize this bit" }).click();
      await expect(page.getByRole("heading", { name: "Quick summary" })).toBeVisible();
    }, test.info());
  });
});

async function withExtension(
  run: (extension: { context: BrowserContext; extensionId: string }) => Promise<void>,
  testInfo: TestInfo
) {
  if (extensionPath === undefined) return;
  const extension = await launchExtensionContext({ extensionPath, testInfo });
  try {
    expect(extension.extensionId).toBeTruthy();
    await run({ context: extension.context, extensionId: extension.extensionId! });
  } finally {
    await closeExtensionContext(extension);
    await attachExtensionVideos(testInfo, extension);
  }
}

async function openHomeFixture(context: BrowserContext, extensionId: string): Promise<Page> {
  const options = await openOptionsPage(context, extensionId);
  const settings = await sendRuntimeMessage<Record<string, unknown>>(options, { type: "settings:get" });
  await writeExtensionSettings(options, homePopupSettings(settings));
  await options.close();

  const page = await context.newPage();
  await page.goto(fixtureUrl("deep-reading.html"), { waitUntil: "domcontentloaded" });
  return page;
}

function homePopupSettings(settings: Record<string, unknown>): Record<string, unknown> {
  return {
    ...settings,
    allowedSites: [],
    blockedSites: [],
    debugMode: false,
    enabledGlobally: true,
    hiddenPages: [],
    hiddenSites: [],
    placement: {
      ...(settings.placement as object),
      panelHeight: 260,
      panelWidth: 340,
      x: 24,
      y: 360
    },
    provider: { ...(settings.provider as object), apiKey: "" },
    showPet: true
  };
}

async function expectPopupFitsOrScrolls(page: Page): Promise<void> {
  const popupScrollFrame = page.locator(".rc-home-panel > .rc-tool-panel");
  const dimensions = await popupScrollFrame.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight
  }));
  if (dimensions.scrollHeight <= dimensions.clientHeight) {
    expect(dimensions.scrollHeight).toBe(dimensions.clientHeight);
    return;
  }

  await popupScrollFrame.evaluate((element) => {
    element.scrollTop = 0;
  });
  const box = await popupScrollFrame.boundingBox();
  expect(box).not.toBeNull();

  await page.mouse.move((box?.x ?? 0) + 80, (box?.y ?? 0) + 80);
  await page.mouse.wheel(0, 500);
  await expect.poll(() => popupScrollFrame.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
}
