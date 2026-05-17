/** Resolve extension-packaged UI assets inside content scripts, with a browser-demo fallback. */
export function extensionAssetUrl(assetPath: string): string {
  const runtime = (globalThis as typeof globalThis & {
    chrome?: { runtime?: { getURL?: (path: string) => string } };
  }).chrome?.runtime;

  return runtime?.getURL?.(assetPath.replace(/^\//, "")) ?? assetPath;
}

/** Resolve a transparent corgi sprite from the shared extension asset pack. */
export function corgiSpriteUrl(spriteName: string): string {
  return extensionAssetUrl(`/assets/corgi-states-transparent/${spriteName}.png`);
}
