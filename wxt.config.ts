import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "wxt";

const packageJson = JSON.parse(readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8")) as { version: string };

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  outDir: "dist",
  zip: {
    excludeSources: [
      "temp/**",
      "test-results/**",
      "coverage/**"
    ]
  },
  vite: () => ({
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url))
      }
    }
  }),
  manifest: {
    name: "Active Reading Companion",
    description: "A local-first active reading pet that asks useful questions.",
    version: packageJson.version,
    manifest_version: 3,
    permissions: ["storage", "tabs"],
    host_permissions: ["http://*/*", "https://*/*", "file:///*"],
    action: {
      default_title: "Active Reading Companion"
    },
    options_ui: {
      page: "options.html",
      open_in_tab: true
    },
    web_accessible_resources: [
      {
        resources: [
          "assets/corgi-states-transparent/*.png",
          "assets/companion-packs/*/companion-pack.json"
        ],
        matches: ["http://*/*", "https://*/*", "file:///*"]
      }
    ]
  }
});
