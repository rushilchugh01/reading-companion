import type { Dispatch, SetStateAction } from "react";
import { browser } from "wxt/browser";
import { mergeSettingsWithDefaults } from "../shared/settings-normalization";
import type { CompanionSettings } from "../shared/settings-types";
import { SETTINGS_KEY } from "../shared/storage-keys";
import type { PanelSize, PetPosition } from "../ui/types";

type SettingsState = { settings: CompanionSettings };

/** Keeps mounted content runtime state aligned with extension storage updates. */
export function bindSettingsSync<TState extends SettingsState>(setState: Dispatch<SetStateAction<TState | undefined>>) {
  const listener = (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
    if (areaName !== "local" || !(SETTINGS_KEY in changes)) return;
    const settings = mergeSettingsWithDefaults(changes[SETTINGS_KEY]?.newValue);
    setState((current) => current && { ...current, settings });
  };

  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

/** Reads the saved pet position from settings. */
export function settingsPosition(settings: CompanionSettings): PetPosition { return { x: settings.placement.x, y: settings.placement.y }; }

/** Reads the saved panel size from settings. */
export function settingsPanelSize(settings: CompanionSettings): PanelSize { return { width: settings.placement.panelWidth, height: settings.placement.panelHeight }; }
