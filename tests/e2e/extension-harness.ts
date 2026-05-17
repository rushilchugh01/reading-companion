import { chromium, type BrowserContext, type Page, type TestInfo, type Video } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const EXTENSION_OUTPUTS = ["dist/latest", "dist/chrome-mv3", "dist/chrome-mv3-dev"];
const RECORDING_SIZE = { height: 1080, width: 1920 };

/** Browser context and extension id returned by the e2e launcher. */
export interface ExtensionContext {
  context: BrowserContext;
  extensionId: string | undefined;
  videoDirectory: string | undefined;
  videoPaths: string[];
  recordedPages: Page[];
}

interface ExtensionContextOptions {
  extensionPath: string;
  testInfo?: TestInfo;
}

/**
 * Finds a built WXT Chromium extension directory when one is present.
 */
export function findBuiltExtensionPath(rootDirectory = process.cwd()): string | undefined {
  return EXTENSION_OUTPUTS
    .map((candidate) => path.join(rootDirectory, candidate))
    .find((candidate) => existsSync(path.join(candidate, "manifest.json")));
}

/**
 * Returns a file URL for a synthetic e2e fixture.
 */
export function fixtureUrl(fixtureName: string): string {
  return pathToFileURL(path.join(process.cwd(), "tests", "fixtures", fixtureName)).href;
}

/** Opens the extension options page so tests can use extension-scoped APIs. */
export async function openOptionsPage(context: BrowserContext, extensionId: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  return page;
}

/** Sends a runtime message from a live extension page context. */
export async function sendRuntimeMessage<T>(page: Page, message: unknown): Promise<T> {
  return page.evaluate(async (runtimeMessage) => {
    const api = (globalThis as ExtensionGlobal).chrome;
    const response = await api.runtime.sendMessage(runtimeMessage);
    if (!response.ok) throw new Error(response.error ?? "Runtime message failed.");
    return response.value;
  }, message) as Promise<T>;
}

/** Writes extension settings through chrome.storage in a live extension page. */
export async function writeExtensionSettings(page: Page, settings: unknown): Promise<void> {
  await page.evaluate(async (nextSettings) => {
    const api = (globalThis as ExtensionGlobal).chrome;
    await api.storage.local.set({ companionSettings: nextSettings });
  }, settings);
}

type ExtensionGlobal = typeof globalThis & {
  chrome: {
    runtime: {
      sendMessage: (message: unknown) => Promise<{ ok: boolean; value?: unknown; error?: string }>;
    };
    storage: {
      local: {
        set: (values: Record<string, unknown>) => Promise<void>;
      };
    };
  };
};

/**
 * Launches Chromium with the built extension loaded.
 */
export async function launchExtensionContext(
  options: ExtensionContextOptions
): Promise<ExtensionContext> {
  const userDataDirectory = await mkdtemp(path.join(tmpdir(), "reading-companion-e2e-"));
  const videoDirectory = options.testInfo ? videoDirectoryForTest(options.testInfo) : undefined;
  if (videoDirectory !== undefined) await mkdir(videoDirectory, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDirectory, {
    args: [
      `--window-size=${RECORDING_SIZE.width},${RECORDING_SIZE.height}`,
      `--disable-extensions-except=${options.extensionPath}`,
      `--load-extension=${options.extensionPath}`
    ],
    channel: "chromium",
    headless: true,
    recordVideo: videoDirectory === undefined
      ? undefined
      : {
          dir: videoDirectory,
          size: RECORDING_SIZE
        },
    viewport: RECORDING_SIZE
  });
  const recordedPages: Page[] = [];
  context.on("page", (page) => recordedPages.push(page));

  context.on("close", () => {
    void rm(userDataDirectory, {
      force: true,
      maxRetries: 3,
      recursive: true,
      retryDelay: 100
    }).catch(() => undefined);
  });

  return {
    context,
    extensionId: await resolveExtensionId(context),
    recordedPages,
    videoDirectory,
    videoPaths: []
  };
}

/** Closes an extension context and waits for Playwright video artifacts to be written. */
export async function closeExtensionContext(extension: ExtensionContext): Promise<void> {
  const videos = extension.recordedPages
    .map((page) => page.video())
    .filter((video): video is Video => video !== null);

  await extension.context.close();

  extension.videoPaths = await Promise.all(videos.map((video) => video.path()));
}

/** Attaches recorded browser videos to the Playwright result when recording is active. */
export async function attachExtensionVideos(testInfo: TestInfo, extension: ExtensionContext): Promise<void> {
  await Promise.all(
    extension.videoPaths.map((videoPath, index) =>
      testInfo.attach(`browser-video-${index + 1}`, {
        contentType: "video/webm",
        path: videoPath
      })
    )
  );
}

async function resolveExtensionId(context: BrowserContext): Promise<string | undefined> {
  let serviceWorker = context.serviceWorkers()[0];
  if (serviceWorker === undefined) {
    serviceWorker = await context.waitForEvent("serviceworker", { timeout: 5_000 }).catch(() => undefined);
  }

  return serviceWorker?.url().split("/")[2];
}

function videoDirectoryForTest(testInfo: TestInfo): string {
  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const safeTitle = testInfo.title.replaceAll(/[^\dA-Za-z]+/g, "-").replaceAll(/^-|-$/g, "").toLowerCase();
  return path.join(process.cwd(), "temp", "e2e-videos", `${timestamp}-w${testInfo.workerIndex}-r${testInfo.retry}-${safeTitle}`);
}
