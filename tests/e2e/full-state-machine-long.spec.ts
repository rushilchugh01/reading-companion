import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { homedir } from "node:os";
import path from "node:path";

import {
  attachExtensionVideos,
  closeExtensionContext,
  findBuiltExtensionPath,
  launchExtensionContext,
  openOptionsPage,
  sendRuntimeMessage,
  writeExtensionSettings
} from "./extension-harness";

const extensionPath = findBuiltExtensionPath();
const cliproxy = readCliproxySettings();
const runLongStateMachine = process.env.LONG_STATE_MACHINE_E2E === "1";

test.describe.configure({ mode: "parallel" });

test.describe("long runtime state-machine behavior", () => {
  test.skip(!runLongStateMachine, "Set LONG_STATE_MACHINE_E2E=1 to run the long behavior suite.");
  test.skip(extensionPath === undefined, "Run `npm run build` before extension e2e tests.");
  test.skip(cliproxy === undefined, "Start Cliproxy and configure CLIPROXY_CONFIG_PATH or the default local config path.");

  test("suppresses the first reading interrupt during the quiet window", suppressesFirstReadingInterrupt);
  test("walks manual chat, close-while-thinking, proactive interrupt, and grading", walksRuntimeMachineJourney);
});

async function suppressesFirstReadingInterrupt(): Promise<void> {
  test.setTimeout(120_000);
  if (extensionPath === undefined || cliproxy === undefined) return;
  const anomalies: string[] = [];
  const extension = await launchExtensionContext({ extensionPath, testInfo: test.info() });
  try {
    const options = await openOptionsPage(extension.context, extension.extensionId!);
    await writeBehaviorSettings(options, cliproxy, { suppressFirstInterrupt: true });
    const page = await openReadingFixture(extension.context);
    await assertQuietWindowSuppression(page, options, anomalies);
    expectNoAnomalies(anomalies);
    await options.close();
  } finally {
    await closeExtensionContext(extension);
    await attachExtensionVideos(test.info(), extension);
  }
}

async function walksRuntimeMachineJourney(): Promise<void> {
  test.setTimeout(240_000);
  if (extensionPath === undefined || cliproxy === undefined) return;
  const anomalies: string[] = [];
  const extension = await launchExtensionContext({ extensionPath, testInfo: test.info() });
  try {
    const options = await openOptionsPage(extension.context, extension.extensionId!);
    await writeBehaviorSettings(options, cliproxy, { suppressFirstInterrupt: true });
    const page = await openReadingFixture(extension.context);
    await runManualChatWhileClosingPanel(page, options, anomalies);
    await runProactiveQuestionAndGrading(page, options, anomalies);
    expectNoAnomalies(anomalies);
    await options.close();
  } finally {
    await closeExtensionContext(extension);
    await attachExtensionVideos(test.info(), extension);
  }
}

async function assertQuietWindowSuppression(page: Page, options: Page, anomalies: string[]): Promise<void> {
  await simulateReading(page, { passes: 2, settleMs: 2_500 });
  await openProcessingPanel(page);
  const debugText = await waitForProcessingText(page, /page_load|inactive_tab|no_candidate/i, 20_000);
  if (!/suppressed\s+page_load|page_load/i.test(debugText ?? "")) {
    anomalies.push(`Expected policy to report page_load suppression, saw: ${summarize(debugText)}`);
  }
  const queue = await readModelQueue(options);
  if (queue.counts.total !== 0) {
    anomalies.push(`Expected no model jobs during first-interrupt suppression, saw ${summarizeQueue(queue)}.`);
  }
}

async function runManualChatWhileClosingPanel(
  page: Page,
  options: Page,
  anomalies: string[]
): Promise<void> {
  await ensurePanelOpen(page);
  await page.getByLabel("Ask something !!").fill("In exactly two short words, say this connection is working.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Thinking...")).toBeVisible();
  await expectPetState(page, ["thinking"]);
  await closePanelIfOpen(page);

  const chatCall = await waitForModelCall(options, (call) => (
    call.kind === "user_chat" && call.status === "completed"
  ), 90_000);
  if (!chatCall) {
    anomalies.push("Expected manual chat call to complete while panel was closed.");
    return;
  }

  await ensurePanelOpen(page);
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
  await expectPetState(page, ["listening"]);
  const panelText = await page.getByRole("region", { name: "Companion tool panel" }).textContent();
  if (/Thinking\.\.\./i.test(panelText ?? "")) {
    anomalies.push("Manual chat stayed stuck on Thinking after the provider call completed.");
  }
}

async function submitWrongAnswer(
  page: Page,
  options: Page,
  anomalies: string[]
): Promise<void> {
  await page.getByLabel("Type a quick answer...").fill("I skimmed it and I am not sure.");
  await page.getByRole("button", { name: "Submit answer" }).click();
  await expect(page.getByText("Checking your answer...")).toBeVisible();
  await expectPetState(page, ["grading"]);

  const gradeCall = await waitForModelCall(options, (call) => (
    call.kind === "answer_grade" && call.status === "completed"
  ), 90_000);
  if (!gradeCall) {
    anomalies.push("Expected answer_grade model job to complete.");
    return;
  }

  await expect(page.getByRole("region", { name: "Companion tool panel" })).toContainText(/not sure|feedback|answer|because|point|miss/i);
  const finalState = await petState(page);
  if (finalState === "celebratory") {
    anomalies.push("Vague wrong answer was treated as celebratory; that will feel jarring to users.");
  }
  if (!["confused", "celebratory"].includes(finalState ?? "")) {
    anomalies.push(`Expected post-grade pet state to settle to confused or celebratory, saw ${finalState ?? "missing"}.`);
  }
}

async function runProactiveQuestionAndGrading(page: Page, options: Page, anomalies: string[]): Promise<void> {
  if (cliproxy === undefined) return;
  await writeBehaviorSettings(options, cliproxy, { suppressFirstInterrupt: false });
  await page.bringToFront();
  await closePanelIfOpen(page);
  await simulateReading(page, { passes: 5, settleMs: 4_000 });

  const intervention = await waitForModelCall(options, (call) => (
    call.kind === "intervention_compose" && call.status === "completed"
  ), 120_000);
  if (intervention?.providerAction !== "ask_question") {
    anomalies.push(`Expected proactive interrupt to become ask_question, saw ${intervention?.providerAction ?? "no action"}.`);
  }

  await ensurePanelOpen(page);
  const submitAnswerButton = page.getByRole("button", { name: "Submit answer" });
  if (!await submitAnswerButton.isVisible().catch(() => false)) {
    const panelText = await page.getByRole("region", { name: "Companion tool panel" }).textContent().catch(() => "panel missing");
    const queue = await readModelQueue(options);
    anomalies.push(`Expected answerable question panel after proactive interrupt, but Submit answer was not visible. Panel=${summarize(panelText)} Queue=${summarizeQueue(queue)}.`);
    return;
  }
  await submitWrongAnswer(page, options, anomalies);

  const finalQueue = await readModelQueue(options);
  const failedCalls = finalQueue.recentModelCalls.filter((call) => call.status === "failed" || call.error);
  if (failedCalls.length > 0) {
    anomalies.push(`Expected no failed model calls, saw ${summarizeQueue(finalQueue)}.`);
  }
}

async function writeBehaviorSettings(
  options: Page,
  provider: CliproxySettings,
  behavior: { suppressFirstInterrupt: boolean }
): Promise<void> {
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
    readGatingMode: "balanced",
    placement: { ...(settings.placement as object), x: 24, y: 360, panelWidth: 460, panelHeight: 620 },
    provider: {
      ...(settings.provider as object),
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
      maxTokens: 240,
      model: "gemini-3-flash-preview",
      providerId: "custom",
      providerName: "Cliproxy Local",
      temperature: 0,
      timeout: 75_000
    },
    interventionPolicy: {
      policyId: "brutal_tutor_dense",
      overrides: {
        cooldownMilliseconds: { high: 0, low: 0, medium: 0 },
        maxQuestionsPerPage: { high: 5, low: 5, medium: 5 },
        minimumMeaningfulness: 0,
        minimumReadingConfidence: 0,
        pageLoadQuietMilliseconds: behavior.suppressFirstInterrupt ? 60_000 : 0,
        readinessThreshold: { balanced: 0, look_ahead: 0, strict: 0 }
      }
    }
  });
}

async function openReadingFixture(context: BrowserContext): Promise<Page> {
  const server = await startReadingFixtureServer();
  const page = await context.newPage();
  page.on("close", () => server.close());
  await page.goto(server.url, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Open reading companion" })).toBeVisible();
  return page;
}

async function startReadingFixtureServer(): Promise<{ close: () => void; url: string }> {
  const html = readFileSync(path.join(process.cwd(), "tests/fixtures/state-machine-reading.html"), "utf8");
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    close: () => server.close(),
    url: `http://127.0.0.1:${address.port}/state-machine-reading.html`
  };
}

async function simulateReading(page: Page, options: { passes: number; settleMs: number }): Promise<void> {
  await page.bringToFront();
  for (let index = 0; index < options.passes; index += 1) {
    await page.mouse.move(360 + index * 12, 320 + index * 18);
    await page.waitForTimeout(options.settleMs);
    await page.mouse.wheel(0, index % 2 === 0 ? 180 : -80);
  }
  await page.waitForTimeout(2_200);
}

async function ensurePanelOpen(page: Page): Promise<void> {
  const panel = page.getByRole("region", { name: "Companion tool panel" });
  if (await panel.isVisible().catch(() => false)) return;
  await page.getByRole("button", { name: "Open reading companion" }).click();
  await expect(panel).toBeVisible();
}

async function closePanelIfOpen(page: Page): Promise<void> {
  const close = page.getByRole("button", { name: "Close reading companion" });
  if (!await close.isVisible().catch(() => false)) return;
  await close.click();
  await expect(page.getByRole("button", { name: "Open reading companion" })).toBeVisible();
}

async function openProcessingPanel(page: Page): Promise<void> {
  await ensurePanelOpen(page);
  const processingPanel = page.getByLabel("Processing debug details");
  if (await processingPanel.isVisible().catch(() => false)) return;
  await page.getByRole("button", { name: "Open processing panel" }).click();
  await expect(processingPanel).toBeVisible();
}

async function waitForProcessingText(page: Page, pattern: RegExp, timeoutMs: number): Promise<string | null> {
  const processingPanel = page.getByLabel("Processing debug details");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const text = await processingPanel.textContent();
    if (pattern.test(text ?? "")) return text;
    await page.waitForTimeout(1_000);
  }
  return await processingPanel.textContent();
}

async function expectPetState(page: Page, states: string[]): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const value = await petState(page);
    if (value !== null && states.includes(value)) return;
    await page.waitForTimeout(200);
  }
  expect(await petState(page)).toEqual(states[0]);
}

async function petState(page: Page): Promise<string | null> {
  return await page.locator(".rc-root").first().getAttribute("data-state");
}

async function readModelQueue(options: Page): Promise<ModelQueueSnapshot> {
  return await sendRuntimeMessage<ModelQueueSnapshot>(options, { type: "runtime:debugModelJobs" });
}

async function waitForModelCall(
  options: Page,
  predicate: (call: ModelCallSnapshot) => boolean,
  timeoutMs: number
): Promise<ModelCallSnapshot | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const queue = await readModelQueue(options);
    const call = queue.recentModelCalls.find(predicate);
    if (call) return call;
    await options.waitForTimeout(2_000);
  }
  return undefined;
}

function expectNoAnomalies(anomalies: string[]): void {
  expect(anomalies, anomalies.join("\n")).toEqual([]);
}

function summarize(value: string | null | undefined): string {
  return (value ?? "empty").replaceAll(/\s+/g, " ").trim().slice(0, 260);
}

function summarizeQueue(queue: ModelQueueSnapshot): string {
  return queue.recentModelCalls
    .slice(0, 6)
    .map((call) => `${call.kind}:${call.status}:${call.providerAction ?? call.toolAction ?? "no_action"}:${call.error ? "error" : "ok"}`)
    .join(" | ") || `total=${queue.counts.total}`;
}

type CliproxySettings = {
  apiKey: string;
  baseUrl: string;
};

type ModelCallSnapshot = {
  error?: string;
  kind: string;
  providerAction?: string;
  status: string;
  toolAction?: string;
};

type ModelQueueSnapshot = {
  counts: {
    total: number;
  };
  recentModelCalls: ModelCallSnapshot[];
};

function readCliproxySettings(): CliproxySettings | undefined {
  const configPath = process.env.CLIPROXY_CONFIG_PATH ?? path.join(homedir(), ".local/share/cliproxyapi-local/config.yaml");
  if (!existsSync(configPath)) return undefined;

  const text = readFileSync(configPath, "utf8");
  const apiKey = matchConfigValue(text, /^api-keys:\s*\n\s*-\s*["']?([^"'\s]+)["']?/m);
  const host = matchConfigValue(text, /^host:\s*["']?([^"'\n]+)["']?/m) ?? "127.0.0.1";
  const port = matchConfigValue(text, /^port:\s*(\d+)/m) ?? "8318";
  if (!apiKey) return undefined;

  return {
    apiKey,
    baseUrl: `http://${host}:${port}/v1`
  };
}

function matchConfigValue(text: string, pattern: RegExp): string | undefined {
  return pattern.exec(text)?.[1]?.trim();
}
