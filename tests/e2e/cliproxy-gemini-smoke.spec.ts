import { expect, test } from "@playwright/test";
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

test.describe("Cliproxy Gemini live smoke", () => {
  test.skip(extensionPath === undefined, "Run `npm run build` before extension e2e tests.");
  test.skip(cliproxy === undefined, "Start Cliproxy and configure CLIPROXY_CONFIG_PATH or the default local config path.");

  test("sends chat through the local Gemini proxy", async () => {
    test.setTimeout(90_000);
    if (extensionPath === undefined || cliproxy === undefined) return;

    const extension = await launchExtensionContext({ extensionPath, testInfo: test.info() });
    try {
      expect(extension.extensionId).toBeTruthy();
      const options = await openOptionsPage(extension.context, extension.extensionId!);
      const settings = await sendRuntimeMessage<Record<string, unknown>>(options, { type: "settings:get" });
      await writeExtensionSettings(options, {
        ...settings,
        provider: {
          ...(settings.provider as object),
          apiKey: cliproxy.apiKey,
          baseUrl: cliproxy.baseUrl,
          maxTokens: 80,
          model: "gemini-3.1-pro-preview",
          providerId: "custom",
          providerName: "Cliproxy Local",
          temperature: 0,
          timeout: 60_000
        }
      });

      const result = await sendRuntimeMessage<{ requestId: string; text: string }>(options, {
        type: "chat:send",
        payload: {
          requestId: "cliproxy-gemini-smoke",
          companionStyle: {
            companionPackId: "builtin-corgi",
            personaId: "brutal-tutor-dog",
            readGatingMode: "balanced",
            strictness: "medium"
          },
          history: [],
          message: "Reply with exactly these two words and no punctuation: cliproxy ok"
        }
      });

      expect(result.requestId).toBe("cliproxy-gemini-smoke");
      expect(result.text).toMatch(/cliproxy\s+ok/i);
      await options.close();
    } finally {
      await closeExtensionContext(extension);
      await attachExtensionVideos(test.info(), extension);
    }
  });
});

type CliproxySettings = {
  apiKey: string;
  baseUrl: string;
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
