import type { InterventionPageContext } from "../intervention";

/** Creates a stable page context for visibility checks and intervention policy. */
export function createPageContext(pageLocation: Location = location): InterventionPageContext {
  return { host: createSiteKey(pageLocation), loadedAt: Date.now(), title: document.title, url: pageLocation.href };
}

function createSiteKey(pageLocation: Location): string {
  if (pageLocation.hostname) return pageLocation.hostname;
  if (pageLocation.protocol === "file:") return "file://";
  return pageLocation.origin;
}
