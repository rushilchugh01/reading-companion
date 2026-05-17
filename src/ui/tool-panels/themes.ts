import type { CSSProperties } from "react";
import type { CompanionPanelTheme, CompanionPanelThemeId } from "./types";

const baseVariables: CompanionPanelTheme["variables"] = {
  "--rc-tool-page-bg": "#fffdfa",
  "--rc-tool-panel-bg": "linear-gradient(145deg, #fffdf8, #f3fbf8)",
  "--rc-tool-panel-border": "#b5dfd2",
  "--rc-tool-surface": "rgb(255 255 255 / 0.86)",
  "--rc-tool-surface-strong": "#ffffff",
  "--rc-tool-bubble-bg": "linear-gradient(145deg, #ffffff, #fffaf2)",
  "--rc-tool-bubble-border": "#e5d8ca",
  "--rc-tool-primary": "#3f82e8",
  "--rc-tool-primary-soft": "#d9ebff",
  "--rc-tool-secondary": "#4fb8a7",
  "--rc-tool-secondary-soft": "#e5f6f1",
  "--rc-tool-accent": "#f3b628",
  "--rc-tool-text": "#251914",
  "--rc-tool-muted": "#7d7069",
  "--rc-tool-radius-panel": "34px",
  "--rc-tool-radius-bubble": "22px",
  "--rc-tool-radius-button": "18px",
  "--rc-tool-shadow-panel": "0 24px 58px rgb(46 35 28 / 0.14)",
  "--rc-tool-shadow-soft": "0 12px 24px rgb(46 35 28 / 0.10)",
  "--rc-tool-focus": "0 0 0 3px rgb(63 130 232 / 0.24)"
};

export const COMPANION_PANEL_THEMES: Record<CompanionPanelThemeId, CompanionPanelTheme> = {
  "corgi-classic": {
    id: "corgi-classic",
    name: "Corgi Classic",
    variables: baseVariables
  },
  sky: {
    id: "sky",
    name: "Sky",
    variables: {
      ...baseVariables,
      "--rc-tool-panel-bg": "linear-gradient(145deg, #f9fdff, #e1f1ff)",
      "--rc-tool-panel-border": "#c8e4ff",
      "--rc-tool-primary": "#3f7edc",
      "--rc-tool-primary-soft": "#dceeff",
      "--rc-tool-secondary": "#3fb8aa",
      "--rc-tool-secondary-soft": "#e0f7f3",
      "--rc-tool-bubble-border": "#d9e7f2",
      "--rc-tool-shadow-panel": "0 24px 58px rgb(48 111 208 / 0.17)"
    }
  },
  mint: {
    id: "mint",
    name: "Mint",
    variables: {
      ...baseVariables,
      "--rc-tool-panel-bg": "linear-gradient(145deg, #fffef9, #eaf8f2)",
      "--rc-tool-panel-border": "#98d6c6",
      "--rc-tool-primary": "#3f8f80",
      "--rc-tool-primary-soft": "#e2f5ef",
      "--rc-tool-secondary": "#5fb7d1",
      "--rc-tool-secondary-soft": "#e8f7fb",
      "--rc-tool-bubble-border": "#d8e5da",
      "--rc-tool-shadow-panel": "0 24px 58px rgb(63 143 128 / 0.15)"
    }
  },
  peach: {
    id: "peach",
    name: "Peach",
    variables: {
      ...baseVariables,
      "--rc-tool-panel-bg": "linear-gradient(145deg, #fffdf8, #fff2e2)",
      "--rc-tool-panel-border": "#efd2ae",
      "--rc-tool-primary": "#3fa99d",
      "--rc-tool-primary-soft": "#e2f4f0",
      "--rc-tool-secondary": "#e99872",
      "--rc-tool-secondary-soft": "#fff0e6",
      "--rc-tool-bubble-border": "#ecd8c3",
      "--rc-tool-shadow-panel": "0 24px 58px rgb(117 80 47 / 0.15)"
    }
  },
  lavender: {
    id: "lavender",
    name: "Lavender",
    variables: {
      ...baseVariables,
      "--rc-tool-panel-bg": "linear-gradient(145deg, #fffefa, #fbf6ff)",
      "--rc-tool-panel-border": "#d1b8eb",
      "--rc-tool-primary": "#8460c5",
      "--rc-tool-primary-soft": "#efe6fb",
      "--rc-tool-secondary": "#3f82c8",
      "--rc-tool-secondary-soft": "#e7f1fb",
      "--rc-tool-accent": "#b791df",
      "--rc-tool-bubble-border": "#ded0ef",
      "--rc-tool-shadow-panel": "0 24px 58px rgb(96 64 150 / 0.15)",
      "--rc-tool-focus": "0 0 0 3px rgb(132 96 197 / 0.24)"
    }
  }
};

/** Returns a registered companion panel theme, falling back to the classic corgi theme. */
export function getCompanionPanelTheme(themeId: CompanionPanelThemeId = "corgi-classic"): CompanionPanelTheme {
  return COMPANION_PANEL_THEMES[themeId] ?? COMPANION_PANEL_THEMES["corgi-classic"];
}

/** Converts a companion panel theme to inline CSS custom properties for a panel root. */
export function companionPanelThemeStyle(themeId?: CompanionPanelThemeId): CSSProperties {
  return getCompanionPanelTheme(themeId).variables;
}
