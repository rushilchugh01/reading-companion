import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "wxt";

const packageJson = JSON.parse(readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8")) as { version: string };
const env = loadLocalEnv();
const defaultProviderApiKey = env.COMPANION_PROVIDER_API_KEY ?? env.VITE_COMPANION_PROVIDER_API_KEY ?? "";

function loadLocalEnv(): Record<string, string> {
  return [
    new URL("./.env", import.meta.url),
    new URL("./.env.local", import.meta.url)
  ].reduce<Record<string, string>>((values, url) => {
    try {
      return { ...values, ...parseEnv(readFileSync(fileURLToPath(url), "utf8")) };
    } catch {
      return values;
    }
  }, {});
}

function parseEnv(source: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    if (!key) continue;
    values[key] = unquoteEnvValue(line.slice(separatorIndex + 1).trim());
  }
  return values;
}

function unquoteEnvValue(value: string): string {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

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
    define: {
      __DEFAULT_PROVIDER_API_KEY__: JSON.stringify(defaultProviderApiKey)
    },
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
          "assets/corgi-states-transparent/*.png"
        ],
        matches: ["http://*/*", "https://*/*", "file:///*"]
      }
    ]
  }
});
