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

test.describe("home panel live interactions", () => {
  test.skip(extensionPath === undefined, "Run `npm run build` before extension e2e tests.");

  test("scrolls and runs visible home panel controls in the built extension", async () => {
    await withExtension(async ({ context, extensionId }) => {
      const page = await openHomeFixture(context, extensionId);

      await page.getByRole("button", { name: "Open reading companion" }).click();
      await expect(page.getByRole("region", { name: "Companion tool panel" })).toBeVisible();

      await expectPanelFitsOrWheelScrolls(page);

      await page.getByRole("button", { name: "Summarize this bit" }).click();
      await expect(page.getByRole("heading", { name: "Quick summary" })).toBeVisible();

      await page.getByRole("button", { name: "Why does this matter?" }).click();
      await expect(page.getByRole("heading", { name: "Why it matters" })).toBeVisible();

      await page.getByRole("button", { name: "Make a prediction" }).click();
      await expect(page.getByRole("heading", { name: "Make a prediction" })).toBeVisible();

      await page.getByRole("button", { name: "Open companion settings" }).click();
      await expectOptionsPageOpened(context, extensionId);
      await page.bringToFront();

      await expect(page.getByRole("button", { name: "Open debug panel" })).toBeHidden();
      await expect(page.getByRole("region", { name: "Reading companion panel" })).toBeHidden();
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
  await writeExtensionSettings(options, {
    ...settings,
    debugMode: false,
    enabledGlobally: true,
    showPet: true,
    hiddenPages: [],
    hiddenSites: [],
    blockedSites: [],
    allowedSites: [],
    placement: { ...(settings.placement as object), x: 24, y: 360, panelWidth: 340, panelHeight: 260 },
    provider: { ...(settings.provider as object), apiKey: "" }
  });
  await options.close();

  const page = await context.newPage();
  await page.goto(fixtureUrl("deep-reading.html"), { waitUntil: "domcontentloaded" });
  return page;
}

async function expectPanelFitsOrWheelScrolls(page: Page): Promise<void> {
  const panel = page.locator(".rc-home-panel > .rc-tool-panel");
  const before = await panel.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop
  }));
  if (before.scrollHeight <= before.clientHeight) {
    expect(before.scrollHeight).toBe(before.clientHeight);
    return;
  }
  await panel.evaluate((element) => {
    element.scrollTop = 0;
  });
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move((box?.x ?? 0) + Math.min(80, (box?.width ?? 0) / 2), (box?.y ?? 0) + Math.min(80, (box?.height ?? 0) / 2));
  await page.mouse.wheel(0, 500);
  await expect.poll(() => panel.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
}

async function expectOptionsPageOpened(context: BrowserContext, extensionId: string): Promise<void> {
  await expect.poll(() => context.pages().some((page) => page.url().startsWith(`chrome-extension://${extensionId}/options.html`))).toBe(true);
}
