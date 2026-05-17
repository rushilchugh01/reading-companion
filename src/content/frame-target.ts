const MIN_FRAME_WIDTH = 520;
const MIN_FRAME_HEIGHT = 360;
const MIN_TEXT_LENGTH = 500;
const MIN_READING_ELEMENTS = 4;

/** Decides whether the content script should mount UI in the current frame. */
export function shouldMountCompanionFrame(): boolean {
  if (isTopFrame()) {
    return true;
  }
  return isLargeFrame() && hasReadableSurface();
}

/** Returns a small reason string for frame-mount diagnostics. */
export function frameMountReason(): string {
  if (isTopFrame()) return isMostlyIframeShell() ? "top_iframe_shell" : "top_page";
  if (!isLargeFrame()) return "small_child_frame";
  return hasReadableSurface() ? "readable_child_frame" : "non_readable_child_frame";
}

function isTopFrame(): boolean {
  return window.self === window.top;
}

function isLargeFrame(): boolean {
  return window.innerWidth >= MIN_FRAME_WIDTH && window.innerHeight >= MIN_FRAME_HEIGHT;
}

function isMostlyIframeShell(): boolean {
  return hasLargeIframe() && !hasReadableSurface();
}

function hasLargeIframe(): boolean {
  return [...document.querySelectorAll("iframe")]
    .some((iframe) => {
      const rect = iframe.getBoundingClientRect();
      return rect.width >= window.innerWidth * 0.6 && rect.height >= window.innerHeight * 0.45;
    });
}

function hasReadableSurface(): boolean {
  const textLength = document.body?.innerText.trim().length ?? 0;
  const readingElements = document.querySelectorAll("article, main p, p, li, pre, code").length;
  return textLength >= MIN_TEXT_LENGTH && readingElements >= MIN_READING_ELEMENTS;
}
