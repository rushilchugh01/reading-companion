import { expect, test, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
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
const geminiModels = geminiModelsFromEnv();
const strategies = ["single_shot_v1", "candidate_ranked_v1", "sketch_then_rank_v1"] as const;
const liveSites = [
  "https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Structuring_content/Basic_HTML_syntax",
  "https://www.rfc-editor.org/rfc/rfc9110.html"
] as const;

test.describe.configure({ mode: "serial" });

test.describe("Cliproxy live-site question strategies", () => {
  test.skip(extensionPath === undefined, "Run `npm run build` before extension e2e tests.");
  test.skip(cliproxy === undefined, "Start Cliproxy and configure CLIPROXY_CONFIG_PATH or the default local config path.");

  test("generates questions for every strategy across Gemini models on live pages", async () => {
    test.setTimeout(720_000);
    if (extensionPath === undefined || cliproxy === undefined) return;

    const extension = await launchExtensionContext({ extensionPath, testInfo: test.info() });
    const passageCache = new Map<string, Passage[]>();
    const generated: StrategyResult[] = [];
    try {
      const options = await openOptionsPage(extension.context, extension.extensionId!);

      for (const [modelIndex, model] of geminiModels.entries()) {
        await configureCliproxy(options, cliproxy, model);
        for (const [strategyIndex, strategy] of strategies.entries()) {
          const siteUrl = liveSites[(modelIndex + strategyIndex) % liveSites.length] ?? liveSites[0];
          const passages = await passagesForSite(extension.context, passageCache, siteUrl);
          const result = await composeQuestion({ model, page: options, passages, siteUrl, strategy });
          generated.push({
            action: result.action,
            depth: result.questionDepth,
            model,
            question: result.userFacingText,
            siteUrl,
            strategy
          });
          expect(result.action).toBe("ask_question");
          expect(result.userFacingText?.trim().length).toBeGreaterThan(24);
          expect(result.expectedAnswer?.trim().length).toBeGreaterThan(8);
          if (strategy !== "single_shot_v1") expect(result.questionDepth).toBeTruthy();
        }
      }

      await test.info().attach("generated-live-strategy-questions", {
        body: JSON.stringify(generated, null, 2),
        contentType: "application/json"
      });
      console.log(`LIVE_STRATEGY_RESULTS ${JSON.stringify(generated)}`);
      await options.close();
    } finally {
      await closeExtensionContext(extension);
      await attachExtensionVideos(test.info(), extension);
    }
  });
});

type StrategyId = typeof strategies[number];

type CliproxySettings = {
  apiKey: string;
  baseUrl: string;
};

type Passage = {
  chunkId: string;
  heading: string;
  order: number;
  preview: string;
  text: string;
};

type InterventionResult = {
  action: string;
  expectedAnswer?: string;
  questionDepth?: string;
  userFacingText?: string;
};

type StrategyResult = {
  action: string;
  depth?: string;
  model: string;
  question?: string;
  siteUrl: string;
  strategy: StrategyId;
};

async function configureCliproxy(page: Page, provider: CliproxySettings, model: string): Promise<void> {
  const settings = await sendRuntimeMessage<Record<string, unknown>>(page, { type: "settings:get" });
  await writeExtensionSettings(page, {
    ...settings,
    enabledGlobally: true,
    provider: {
      ...(settings.provider as object),
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
      maxTokens: 900,
      model,
      providerId: "custom",
      providerName: "Cliproxy Local",
      temperature: 0.2,
      timeout: 90_000
    }
  });
}

async function passagesForSite(
  context: { newPage: () => Promise<Page> },
  cache: Map<string, Passage[]>,
  siteUrl: string
): Promise<Passage[]> {
  const cached = cache.get(siteUrl);
  if (cached) return cached;
  const page = await context.newPage();
  await page.goto(siteUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const passages = await extractPassages(page);
  await page.close();
  cache.set(siteUrl, passages);
  return passages;
}

async function extractPassages(page: Page): Promise<Passage[]> {
  let texts = await page.locator("main p, article p, p").evaluateAll((nodes) =>
    nodes
      .map((node) => node.textContent?.replaceAll(/\s+/g, " ").trim() ?? "")
      .filter((text) => text.length > 120)
      .slice(0, 4)
  );
  if (texts.length < 2) texts = await fallbackBodyPassages(page);
  expect(texts.length).toBeGreaterThanOrEqual(2);
  return texts.map((text, index) => ({
    chunkId: `live-${index + 1}`,
    heading: "Live page excerpt",
    order: index,
    preview: text.slice(0, 220),
    text
  }));
}

async function fallbackBodyPassages(page: Page): Promise<string[]> {
  const text = await page.locator("body").evaluate((body) => body.textContent?.replaceAll(/\s+/g, " ").trim() ?? "");
  const sentences = text.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.length > 40);
  const passages: string[] = [];
  for (let index = 0; index < sentences.length && passages.length < 4; index += 3) {
    const passage = sentences.slice(index, index + 3).join(" ").trim();
    if (passage.length > 120) passages.push(passage);
  }
  return passages;
}

async function composeQuestion(
  input: {
    model: string;
    page: Page;
    passages: Passage[];
    siteUrl: string;
    strategy: StrategyId;
  }
): Promise<InterventionResult> {
  const { model, page, passages, siteUrl, strategy } = input;
  const current = passages[Math.min(1, passages.length - 1)];
  expect(current).toBeDefined();
  return await sendRuntimeMessage<InterventionResult>(page, {
    type: "intervention:compose",
    payload: {
      requestId: `live-${smallHash(model)}-${strategy}-${Date.now()}`,
      tabId: 0,
      pageId: `live-${smallHash(siteUrl)}`,
      contentHash: smallHash(passages.map((passage) => passage.text).join("\n")),
      chunkId: current!.chunkId,
      page: {
        contentType: "html",
        excerpt: passages.map((passage) => passage.preview).join("\n\n"),
        title: "Live strategy smoke",
        url: siteUrl
      },
      currentPassage: current!,
      surroundingPassages: {
        previous: passages.filter((passage) => passage.order < current!.order).slice(-2),
        next: passages.filter((passage) => passage.order > current!.order).slice(0, 1),
        recent: passages.filter((passage) => passage.order !== current!.order).slice(0, 3)
      },
      readerState: {
        currentChunk: { id: current!.chunkId, order: current!.order },
        recentChunkIds: passages.map((passage) => passage.chunkId)
      },
      policy: {
        allowedActions: ["ask_question"],
        confidence: 0.9,
        policyId: "ambient_active_reading_v1",
        reason: "live_strategy_smoke_recall_allowed",
        suggestedMoves: ["ask_question"]
      },
      companionStyle: {
        companionPackId: "builtin-corgi",
        personaId: "brutal-tutor-dog",
        readGatingMode: "balanced",
        strictness: "medium"
      },
      questionGenerationStrategyId: strategy,
      history: [],
      expiresAt: Date.now() + 120_000
    }
  });
}

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

function geminiModelsFromEnv(): string[] {
  return (process.env.CLIPROXY_GEMINI_MODELS ?? "gemini-3-flash-preview,gemini-3.1-flash-lite-preview,gemini-3.1-pro-preview")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
}

function smallHash(value: string): string {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash.toString(16);
}
