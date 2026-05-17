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

test.describe("settings and debug UI", () => {
  test.skip(extensionPath === undefined, "Run `npm run build` before extension e2e tests.");

  test("persists options-page settings through runtime settings", testOptionsPersistence);
  test("opens options and debug details from the in-page companion", testInPageSettingsAndDebug);
});

async function testOptionsPersistence() {
  await withExtension(async ({ context, extensionId }) => {
    const options = await openOptionsPage(context, extensionId);

    await expectMajorSettings(options);
    await updateSettings(options);
    await expectPersistedSettings(options);
  }, test.info());
}

async function testInPageSettingsAndDebug() {
  await withExtension(async ({ context, extensionId }) => {
    const page = await openFixtureWithSettings(context, extensionId);

    await page.getByRole("button", { name: "Open reading companion" }).click();
    await expect(page.getByRole("region", { name: "Companion tool panel" })).toBeVisible();

    await page.getByRole("button", { name: "Open companion settings" }).click();
    await expectOptionsPageOpened(context, extensionId);
    await page.bringToFront();

    await page.getByRole("button", { name: "Open debug panel" }).click();
    await expect(page.getByRole("region", { name: "Companion tool panel" })).toContainText("Policy settings");
    await expect(page.getByRole("region", { name: "Companion tool panel" })).toContainText("Last policy decision");
  }, test.info());
}

async function expectMajorSettings(options: Page): Promise<void> {
  await expect(options.getByRole("heading", { name: "Active Reading Companion" })).toBeVisible();
  await expect(options.getByLabel("Enable on all sites")).toBeVisible();
  await expect(options.getByLabel("Show pet")).toBeVisible();
  await expect(options.getByLabel("Debug mode")).toBeVisible();
  await expect(options.getByLabel("Intervention frequency")).toBeVisible();
  await expect(options.getByLabel("Intervention policy")).toBeVisible();
  await expect(options.getByLabel("Pet size")).toBeVisible();
  await expect(options.getByRole("combobox", { name: "Provider" })).toBeVisible();
  await expect(options.getByLabel("Allowed sites")).toBeVisible();
}

async function updateSettings(options: Page): Promise<void> {
  await options.getByLabel("Enable on all sites").setChecked(false);
  await options.getByLabel("Show pet").setChecked(false);
  await options.getByLabel("Debug mode").setChecked(false);
  await options.getByRole("combobox", { name: "Provider" }).selectOption("custom");
  await options.getByLabel("Provider name").fill("E2E Provider");
  await options.getByLabel("Base URL").fill("https://models.example.test/v1");
  await options.getByRole("textbox", { name: "Model" }).fill("e2e/model");
  await options.getByRole("combobox", { name: "Reasoning" }).selectOption("high");
  await options.getByLabel("Timeout").fill("12345");
  await options.getByLabel("Pet size").selectOption("large");
  await options.getByLabel("Panel width").fill("456");
  await options.getByLabel("Panel height").fill("321");
  await options.getByLabel("Allowed sites").fill("example.com\n*.docs.test");
  await options.getByLabel("Blocked sites").fill("blocked.example");
  await options.getByLabel("Hidden sites").fill("hidden.example");
  await options.getByLabel("Hidden pages").fill("https://example.com/private");
}

async function expectPersistedSettings(options: Page): Promise<void> {
  await expect.poll(() => readSettings(options)).toMatchObject({
    allowedSites: ["example.com", "*.docs.test"],
    blockedSites: ["blocked.example"],
    debugMode: false,
    enabledGlobally: false,
    hiddenPages: ["https://example.com/private"],
    hiddenSites: ["hidden.example"],
    placement: {
      panelHeight: 321,
      panelWidth: 456,
      size: "large"
    },
    provider: {
      baseUrl: "https://models.example.test/v1",
      model: "e2e/model",
      providerId: "custom",
      providerName: "E2E Provider",
      reasoningLevel: "high",
      timeout: 12_345
    },
    showPet: false
  });
}

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

async function openFixtureWithSettings(context: BrowserContext, extensionId: string): Promise<Page> {
  const options = await openOptionsPage(context, extensionId);
  await writeExtensionSettings(options, baseFixtureSettings(await readSettings(options)));
  await options.close();

  const page = await context.newPage();
  await page.goto(fixtureUrl("deep-reading.html"), { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Open reading companion" })).toBeVisible();
  return page;
}

async function expectOptionsPageOpened(context: BrowserContext, extensionId: string): Promise<void> {
  await expect.poll(() => context.pages().some((page) => page.url().startsWith(`chrome-extension://${extensionId}/options.html`))).toBe(true);
}

async function readSettings(page: Page): Promise<Record<string, unknown>> {
  return sendRuntimeMessage<Record<string, unknown>>(page, { type: "settings:get" });
}

function baseFixtureSettings(settings: Record<string, unknown>): Record<string, unknown> {
  return {
    ...settings,
    allowedSites: [],
    blockedSites: [],
    debugMode: true,
    enabledGlobally: true,
    hiddenPages: [],
    hiddenSites: [],
    placement: { ...(settings.placement as object), x: 24, y: 360, panelHeight: 360, panelWidth: 420 },
    provider: { ...(settings.provider as object), apiKey: "" },
    showPet: true
  };
}
