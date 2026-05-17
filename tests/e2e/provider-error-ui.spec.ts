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

test.describe("provider error UI", () => {
  test.skip(extensionPath === undefined, "Run `npm run build` before extension e2e tests.");

  test("shows a visible chat error and debug event when provider is unreachable", async () => {
    await withExtension(async ({ context, extensionId }) => {
      const options = await openOptionsPage(context, extensionId);
      await writeExtensionSettings(options, invalidProviderInterventionSettings(await readSettings(options)));
      await options.close();

      const page = await context.newPage();
      await page.goto(fixtureUrl("deep-reading.html"), { waitUntil: "domcontentloaded" });

      await triggerChatProviderError(page);
      await expectDebugProviderEvent(context, extensionId, /MODEL_REQUEST_FAILED|Chat provider failed|Provider request failed|fetch/i);
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

async function readSettings(page: Page): Promise<Record<string, unknown>> {
  return sendRuntimeMessage<Record<string, unknown>>(page, { type: "settings:get" });
}

async function expectDebugProviderEvent(context: BrowserContext, extensionId: string, eventText: RegExp): Promise<void> {
  const options = await openOptionsPage(context, extensionId);
  try {
    await expect.poll(async () => (await readDebugEvents(options)).join("\n"), { timeout: 10_000 }).toMatch(eventText);
  } finally {
    await options.close();
  }
}

async function openCompanionPanel(page: Page): Promise<void> {
  const panel = page.getByRole("region", { name: "Companion tool panel" });
  if (!await panel.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "Open reading companion" }).click();
  }
  await expect(panel).toBeVisible();
}

async function triggerChatProviderError(page: Page): Promise<void> {
  await openCompanionPanel(page);
  await page.getByLabel("Ask something !!").fill("Explain this paragraph.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("status")).toContainText(/could not answer/i, { timeout: 10_000 });
}

async function readDebugEvents(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const request = indexedDB.open("reading-companion-background");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onerror = () => reject(new Error(request.error?.message ?? "IndexedDB open failed."));
      request.onsuccess = () => resolve(request.result);
    });
    const transaction = database.transaction("debugEvents", "readonly");
    const storeRequest = transaction.objectStore("debugEvents").getAll();
    const records = await new Promise<Array<{ code?: string; message?: string }>>((resolve, reject) => {
      storeRequest.onerror = () => reject(new Error(storeRequest.error?.message ?? "IndexedDB read failed."));
      storeRequest.onsuccess = () => resolve(storeRequest.result as Array<{ code?: string; message?: string }>);
    });
    database.close();
    return records.map((record) => `${record.code ?? ""} ${record.message ?? ""}`);
  });
}

function invalidProviderInterventionSettings(settings: Record<string, unknown>): Record<string, unknown> {
  return invalidProviderSettings(interventionSettings(settings));
}

function interventionSettings(settings: Record<string, unknown>): Record<string, unknown> {
  return {
    ...settings,
    debugMode: true,
    enabledGlobally: true,
    showPet: true,
    hiddenPages: [],
    hiddenSites: [],
    blockedSites: [],
    allowedSites: [],
    interventionFrequency: "high",
    readGatingMode: "look_ahead",
    placement: { ...(settings.placement as object), x: 24, y: 360, panelWidth: 360, panelHeight: 420 },
    interventionPolicy: {
      policyId: "brutal_tutor_dense",
      overrides: {
        cooldownMilliseconds: { high: 0 },
        maxQuestionsPerPage: { high: 5 },
        minimumMeaningfulness: 0,
        minimumReadingConfidence: 0,
        pageLoadQuietMilliseconds: 0,
        readinessThreshold: { balanced: 0, look_ahead: 0, strict: 0 }
      }
    }
  };
}

function invalidProviderSettings(settings: Record<string, unknown>): Record<string, unknown> {
  return {
    ...settings,
    provider: {
      ...(settings.provider as object),
      apiKey: "configured-but-unreachable",
      baseUrl: "http://127.0.0.1:65535/v1",
      model: "unreachable-test-model",
      providerName: "Unreachable OpenAI Compatible",
      timeout: 100
    }
  };
}
