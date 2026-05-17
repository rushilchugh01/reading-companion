import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";
import { defineContentScript } from "wxt/utils/define-content-script";
import { frameMountReason, shouldMountCompanionFrame } from "../src/content/frame-target";
import { ContentCompanionRuntime } from "../src/content/runtime";
import { createCompanionLogger } from "../src/shared/logger";
import "../src/ui/content.css";
import "../src/ui/tool-panels.css";

const contentLogger = createCompanionLogger("content");

export default defineContentScript({
  matches: ["http://*/*", "https://*/*", "file:///*"],
  allFrames: true,
  matchAboutBlank: true,
  matchOriginAsFallback: true,
  cssInjectionMode: "ui",
  async main(context) {
    try {
      contentLogger.info("content script boot", { frame: frameMountReason(), url: location.href });
      if (!shouldMountCompanionFrame()) {
        contentLogger.info("skipping frame mount", { frame: frameMountReason(), url: location.href });
        return;
      }
      contentLogger.info("creating shadow ui", { frame: frameMountReason(), url: location.href });
      const ui = await createShadowRootUi<Root>(context, {
        name: "reading-companion-ui",
        position: "inline",
        anchor: "body",
        onMount(container) {
          contentLogger.info("mounting shadow ui", { url: location.href });
          const app = document.createElement("div");
          container.append(app);
          const root = createRoot(app);
          root.render(<ContentCompanionRuntime />);
          return root;
        },
        onRemove(root) {
          root?.unmount();
        }
      });

      contentLogger.info("shadow ui created", { url: location.href });
      ui.mount();
      contentLogger.info("shadow ui mounted", { url: location.href });
    } catch (error) {
      contentLogger.error("content script failed", { error: error instanceof Error ? error.message : String(error), url: location.href });
      throw error;
    }
  }
});
