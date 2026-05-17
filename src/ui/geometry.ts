import type { PanelSize, PetPosition } from "./types";

const PET_WIDTH = 112;
const PET_HEIGHT = 132;
const MIN_PANEL_WIDTH = 280;
const MIN_PANEL_HEIGHT = 220;
const MAX_PANEL_WIDTH = 520;
const MAX_PANEL_HEIGHT = 640;
const ROOT_VISUAL_WIDTH = 112;
const PANEL_VIEWPORT_MARGIN = 12;
const HOME_PANEL_MIN_COMPACT_WIDTH = 260;
const HOME_PANEL_SIDE_OFFSET = 98;
const HOME_PANEL_SIDE_OFFSET_NARROW = 88;

type PanelSide = "left" | "right";

/** Clamp a pet position so its fixed anchor stays inside the viewport. */
export function clampPetPosition(position: PetPosition): PetPosition {
  const maxX = Math.max(0, window.innerWidth - PET_WIDTH);
  const maxY = Math.max(0, window.innerHeight - PET_HEIGHT);

  return {
    x: Math.min(Math.max(0, position.x), maxX),
    y: Math.min(Math.max(0, position.y), maxY)
  };
}

/** Clamp a compact panel size to useful viewport-aware bounds. */
export function clampPanelSize(size: PanelSize): PanelSize {
  const viewportWidth = Math.max(MIN_PANEL_WIDTH, window.innerWidth - 32);
  const viewportHeight = Math.max(MIN_PANEL_HEIGHT, window.innerHeight - 32);

  return {
    width: Math.min(Math.max(MIN_PANEL_WIDTH, size.width), Math.min(MAX_PANEL_WIDTH, viewportWidth)),
    height: Math.min(Math.max(MIN_PANEL_HEIGHT, size.height), Math.min(MAX_PANEL_HEIGHT, viewportHeight))
  };
}

/** Default starting point for the fixed pet near the lower left viewport. */
export function getDefaultPetPosition(): PetPosition {
  return clampPetPosition({
    x: 24,
    y: Math.max(0, window.innerHeight - 176)
  });
}

/** Return viewport-safe horizontal placement for the home tool panel. */
export function getHomePanelHorizontalStyle(
  size: PanelSize,
  position: PetPosition,
  panelSide: PanelSide
): { left: number; minWidth: number; right: "auto"; width: number } {
  const viewportWidth = window.innerWidth;
  const sideOffset = viewportWidth <= 420 ? HOME_PANEL_SIDE_OFFSET_NARROW : HOME_PANEL_SIDE_OFFSET;
  const maximumViewportWidth = Math.max(HOME_PANEL_MIN_COMPACT_WIDTH, viewportWidth - PANEL_VIEWPORT_MARGIN * 2);
  const sideAvailableWidth = panelSide === "right"
    ? viewportWidth - position.x - sideOffset - PANEL_VIEWPORT_MARGIN
    : position.x + ROOT_VISUAL_WIDTH - sideOffset - PANEL_VIEWPORT_MARGIN;
  const panelWidth = Math.min(
    size.width,
    maximumViewportWidth,
    Math.max(HOME_PANEL_MIN_COMPACT_WIDTH, sideAvailableWidth)
  );
  const desiredLeft = panelSide === "right"
    ? position.x + sideOffset
    : position.x + ROOT_VISUAL_WIDTH - sideOffset - panelWidth;
  const viewportLeft = clampNumber(
    desiredLeft,
    PANEL_VIEWPORT_MARGIN,
    Math.max(PANEL_VIEWPORT_MARGIN, viewportWidth - panelWidth - PANEL_VIEWPORT_MARGIN)
  );

  return {
    left: viewportLeft - position.x,
    minWidth: Math.min(320, panelWidth),
    right: "auto",
    width: panelWidth
  };
}

function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
