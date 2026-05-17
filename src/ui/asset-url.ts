/** Resolve extension-packaged UI assets inside content scripts, with a browser-demo fallback. */
export function extensionAssetUrl(assetPath: string): string {
  if (/^(blob:|data:|https?:|chrome-extension:)/.test(assetPath)) return assetPath;

  const runtime = (globalThis as typeof globalThis & {
    chrome?: { runtime?: { getURL?: (path: string) => string } };
  }).chrome?.runtime;

  return runtime?.getURL?.(assetPath.replace(/^\//, "")) ?? assetPath;
}

/** Resolve an avatar asset from either extension paths or object/data URLs. */
export function companionAssetUrl(assetPath: string): string {
  return extensionAssetUrl(assetPath);
}
