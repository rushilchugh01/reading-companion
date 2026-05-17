import { expect, test, type BrowserContext, type Page } from "@playwright/test";

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
const openRouterKey = process.env.OPENROUTER_API_KEY;

test.describe("OpenRouter live intervention smoke", () => {
  test.skip(extensionPath === undefined, "Run `npm run build` before extension e2e tests.");
  test.skip(!openRouterKey, "Set OPENROUTER_API_KEY to run the live OpenRouter smoke.");

  test("waits on a dense reading page until a model intervention appears", async () => {
    test.setTimeout(150_000);
    if (extensionPath === undefined || !openRouterKey) return;
    const extension = await launchExtensionContext({ extensionPath, testInfo: test.info() });
    try {
      expect(extension.extensionId).toBeTruthy();
      const page = await openDensePage(extension.context, extension.extensionId!, openRouterKey);

      await simulateReading(page);
      const result = await waitForVisibleInterventionOrAudit(page, extension.context, extension.extensionId!);
      expect(result.visible, result.summary).toBe(true);
    } finally {
      await closeExtensionContext(extension);
      await attachExtensionVideos(test.info(), extension);
    }
  });
});

async function openDensePage(context: BrowserContext, extensionId: string, apiKey: string): Promise<Page> {
  const options = await openOptionsPage(context, extensionId);
  const settings = await sendRuntimeMessage<Record<string, unknown>>(options, { type: "settings:get" });
  await writeExtensionSettings(options, {
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
    placement: { ...(settings.placement as object), x: 24, y: 360, panelWidth: 440, panelHeight: 620 },
    provider: {
      ...(settings.provider as object),
      apiKey,
      baseUrl: "https://openrouter.ai/api/v1",
      model: "poolside/laguna-m.1:free",
      providerId: "custom",
      providerName: "OpenRouter Direct",
      timeout: 45_000
    },
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
  });
  await options.close();

  const page = await context.newPage();
  await page.goto(fixtureUrl("deep-reading.html"), { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Open reading companion" })).toBeVisible();
  return page;
}

async function simulateReading(page: Page): Promise<void> {
  await page.mouse.move(360, 360);
  await page.waitForTimeout(2_500);
  await page.mouse.wheel(0, 180);
  await page.waitForTimeout(3_000);
  await page.mouse.wheel(0, 140);
  await page.waitForTimeout(8_000);
}

async function waitForVisibleInterventionOrAudit(
  page: Page,
  context: BrowserContext,
  extensionId: string
): Promise<{ summary: string; visible: boolean }> {
  const deadline = Date.now() + 90_000;
  let lastSummary = "no audit yet";
  while (Date.now() < deadline) {
    const visible = await hasVisibleIntervention(page);
    const audit = await readModelAuditWithTimeout(context, extensionId, 2_500);
    lastSummary = summarizeAudit(audit);
    console.log(`[openrouter-smoke] visible=${visible} ${lastSummary}`);
    if (visible && audit.recentModelCalls.some((call) => call.kind === "intervention_compose" && call.status === "completed" && !call.error)) {
      return { summary: lastSummary, visible: true };
    }
    await page.waitForTimeout(5_000);
  }
  return { summary: lastSummary, visible: false };
}

async function hasVisibleIntervention(page: Page): Promise<boolean> {
  const panelButton = page.getByRole("button", { name: "Open reading companion" });
  if (await panelButton.isVisible().catch(() => false)) {
    await panelButton.click();
  }
  const panel = page.getByRole("region", { name: "Companion tool panel" });
  if (!await panel.isVisible().catch(() => false)) return false;
  const assistantTurn = page.locator(".rc-question-response-panel__turn--assistant, [role='status']").last();
  const text = await assistantTurn.textContent().catch(() => "");
  return /retrieval|practice|paragraph|question|predict|explain|unpack|because/i.test(text ?? "");
}

async function readModelAudit(context: BrowserContext, extensionId: string): Promise<{
  recentModelCalls: Array<{ error?: string; kind: string; providerAction?: string; status: string }>;
}> {
  const options = await openOptionsPage(context, extensionId);
  try {
    return await sendRuntimeMessage<{
      recentModelCalls: Array<{ kind: string; status: string; providerAction?: string; error?: string }>;
    }>(options, { type: "runtime:debugModelJobs" });
  } finally {
    await options.close();
  }
}

async function readModelAuditWithTimeout(
  context: BrowserContext,
  extensionId: string,
  timeoutMs: number
): Promise<{ recentModelCalls: Array<{ error?: string; kind: string; providerAction?: string; status: string }> }> {
  return await Promise.race([
    readModelAudit(context, extensionId),
    new Promise<{ recentModelCalls: Array<{ error?: string; kind: string; providerAction?: string; status: string }> }>((resolve) => {
      setTimeout(() => resolve({ recentModelCalls: [{ kind: "debug_query", status: "timeout", error: "debug query timeout" }] }), timeoutMs);
    })
  ]);
}

function summarizeAudit(audit: {
  recentModelCalls: Array<{ error?: string; kind: string; providerAction?: string; status: string }>;
}): string {
  return audit.recentModelCalls
    .slice(0, 4)
    .map((call) => `${call.kind}:${call.status}:${call.providerAction ?? "no_action"}:${call.error ? "error" : "ok"}`)
    .join(" | ") || "no model calls";
}
