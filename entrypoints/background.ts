import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { BackgroundDatabaseRepository } from "../src/background/database-repository";
import { ModelClient } from "../src/background/model-client";
import { RuntimeMessageRouter } from "../src/background/runtime-router";
import { SettingsRepository } from "../src/background/settings-repository";
import { createCompanionLogger } from "../src/shared/logger";

const backgroundLogger = createCompanionLogger("background");

export default defineBackground(() => {
  backgroundLogger.info("background worker boot");
  const router = new RuntimeMessageRouter({
    settings: new SettingsRepository(browser.storage.local),
    database: new BackgroundDatabaseRepository(),
    model: new ModelClient()
  });

  browser.runtime.onMessage.addListener(router.listener());
});
