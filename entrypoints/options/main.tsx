import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { browser } from "wxt/browser";
import { createDefaultSettings } from "../../src/shared/defaults";
import { mergeSettingsWithDefaults } from "../../src/shared/settings-normalization";
import type { CompanionSettings, InterventionPolicyId } from "../../src/shared/settings-types";
import { SETTINGS_KEY } from "../../src/shared/storage-keys";
import { ProviderSettings } from "./provider-settings";
import "./styles.css";

const POLICY_IDS: InterventionPolicyId[] = [
  "ambient_active_reading_v1",
  "gentle_checkpoints",
  "brutal_tutor_dense"
];

function SettingsApp() {
  const [settings, setSettings] = useState<CompanionSettings>(createDefaultSettings());

  useEffect(() => {
    void browser.storage.local.get(SETTINGS_KEY).then((stored) => {
      setSettings(mergeSettingsWithDefaults(stored[SETTINGS_KEY]));
    });
  }, []);

  const saveSettings = (nextSettings: CompanionSettings) => {
    setSettings(nextSettings);
    void browser.storage.local.set({ [SETTINGS_KEY]: nextSettings });
  };

  return (
    <main className="settings-shell">
      <h1>Active Reading Companion</h1>
      <GeneralSettings settings={settings} saveSettings={saveSettings} />
      <ReadingSettings settings={settings} saveSettings={saveSettings} />
      <PolicySettings settings={settings} saveSettings={saveSettings} />
      <PlacementSettings settings={settings} saveSettings={saveSettings} />
      <ProviderSettings settings={settings} saveSettings={saveSettings} />
      <SiteSettings settings={settings} saveSettings={saveSettings} />
    </main>
  );
}

function GeneralSettings(props: SettingsSectionProps) {
  const { settings, saveSettings } = props;
  return (
    <section>
      <label>
        <input
          checked={settings.enabledGlobally}
          type="checkbox"
          onChange={(event) => saveSettings({
            ...settings,
            enabledGlobally: event.currentTarget.checked
          })}
        />
        Enable on all sites
      </label>
      <label>
        <input
          checked={settings.showPet}
          type="checkbox"
          onChange={(event) => saveSettings({ ...settings, showPet: event.currentTarget.checked })}
        />
        Show pet
      </label>
      <label>
        <input
          checked={settings.debugMode}
          type="checkbox"
          onChange={(event) => saveSettings({ ...settings, debugMode: event.currentTarget.checked })}
        />
        Debug mode
      </label>
    </section>
  );
}

function ReadingSettings(props: SettingsSectionProps) {
  return (
    <section>
      <SelectSetting field="interventionFrequency" label="Intervention frequency" options={["low", "medium", "high"]} {...props} />
      <SelectSetting field="readGatingMode" label="Read-gating mode" options={["strict", "balanced", "look_ahead"]} {...props} />
      <SelectSetting field="personaId" label="Persona" options={["brutal-tutor-dog"]} {...props} />
      <SelectSetting field="strictness" label="Strictness" options={["chill", "medium", "strict"]} {...props} />
      <SelectSetting field="storageMode" label="Storage mode" options={["local_only", "local_plus_cloud", "cloud_only"]} {...props} />
    </section>
  );
}

function PolicySettings(props: SettingsSectionProps) {
  const { settings, saveSettings } = props;
  return (
    <section>
      <label>
        Intervention policy
        <select
          value={settings.interventionPolicy.policyId}
          onChange={(event) => savePolicyId(settings, saveSettings, event.currentTarget.value)}
        >
          {POLICY_IDS.map((policyId) => <option key={policyId} value={policyId}>{policyId}</option>)}
        </select>
      </label>
      <PolicyNumber field="minimumMeaningfulness" label="Minimum meaningfulness" max={1} step={0.05} {...props} />
      <PolicyNumber field="minimumReadingConfidence" label="Minimum reading confidence" max={1} step={0.05} {...props} />
      <PolicyNumber field="pageLoadQuietMilliseconds" label="Page-load quiet ms" step={1000} {...props} />
    </section>
  );
}

function PlacementSettings(props: SettingsSectionProps) {
  const resetPlacement = () => props.saveSettings({
    ...props.settings,
    placement: createDefaultSettings().placement
  });
  return (
    <section>
      <SelectPlacement field="size" label="Pet size" options={["medium", "large"]} {...props} />
      <NumberPlacement field="panelWidth" label="Panel width" {...props} />
      <NumberPlacement field="panelHeight" label="Panel height" {...props} />
      <button type="button" onClick={resetPlacement}>Restore default position</button>
    </section>
  );
}

function PolicyNumber(props: PolicyNumberProps) {
  const value = props.settings.interventionPolicy.overrides[props.field] ?? "";
  return (
    <label>
      {props.label}
      <input
        max={props.max}
        min={0}
        placeholder="policy default"
        step={props.step ?? 1}
        type="number"
        value={value}
        onChange={(event) => savePolicyNumber(props, event.currentTarget.value)}
      />
    </label>
  );
}

function savePolicyId(
  settings: CompanionSettings,
  saveSettings: SettingsSectionProps["saveSettings"],
  value: string
) {
  saveSettings({
    ...settings,
    interventionPolicy: {
      ...settings.interventionPolicy,
      policyId: readPolicyId(value)
    }
  });
}

function savePolicyNumber(props: PolicyNumberProps, value: string) {
  const nextOverrides = { ...props.settings.interventionPolicy.overrides };
  if (value === "") {
    delete nextOverrides[props.field];
  } else {
    nextOverrides[props.field] = Number(value);
  }
  props.saveSettings({
    ...props.settings,
    interventionPolicy: {
      ...props.settings.interventionPolicy,
      overrides: nextOverrides
    }
  });
}

function readPolicyId(value: string): InterventionPolicyId {
  return POLICY_IDS.includes(value as InterventionPolicyId)
    ? (value as InterventionPolicyId)
    : "ambient_active_reading_v1";
}

function SiteSettings(props: SettingsSectionProps) {
  return (
    <section>
      <ListSetting field="allowedSites" label="Allowed sites" {...props} />
      <ListSetting field="blockedSites" label="Blocked sites" {...props} />
      <ListSetting field="hiddenSites" label="Hidden sites" {...props} />
      <ListSetting field="hiddenPages" label="Hidden pages" {...props} />
    </section>
  );
}

function SelectSetting<K extends SelectSettingKey>(props: SelectSettingProps<K>) {
  return (
    <label>
      {props.label}
      <select
        value={props.settings[props.field]}
        onChange={(event) => props.saveSettings({ ...props.settings, [props.field]: event.currentTarget.value })}
      >
        {props.options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function SelectPlacement(props: SelectPlacementProps) {
  return (
    <label>
      {props.label}
      <select
        value={props.settings.placement[props.field]}
        onChange={(event) => props.saveSettings({
          ...props.settings,
          placement: {
            ...props.settings.placement,
            size: readPlacementSize(event.currentTarget.value)
          }
        })}
      >
        {props.options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function readPlacementSize(value: string): CompanionSettings["placement"]["size"] {
  return value === "large" ? "large" : "medium";
}

function NumberPlacement(props: NumberPlacementProps) {
  return (
    <label>
      {props.label}
      <input
        min={180}
        type="number"
        value={props.settings.placement[props.field]}
        onChange={(event) => props.saveSettings({
          ...props.settings,
          placement: { ...props.settings.placement, [props.field]: Number(event.currentTarget.value) }
        })}
      />
    </label>
  );
}

function ListSetting(props: ListSettingProps) {
  return (
    <label>
      {props.label}
      <textarea
        value={props.settings[props.field].join("\n")}
        onChange={(event) => props.saveSettings({
          ...props.settings,
          [props.field]: event.currentTarget.value.split(/\n+/).map((line) => line.trim()).filter(Boolean)
        })}
      />
    </label>
  );
}

type SettingsSectionProps = {
  settings: CompanionSettings;
  saveSettings: (settings: CompanionSettings) => void;
};

type PolicyNumberProps = SettingsSectionProps & {
  field: "minimumMeaningfulness" | "minimumReadingConfidence" | "pageLoadQuietMilliseconds";
  label: string;
  max?: number;
  step?: number;
};

type SelectSettingKey = "interventionFrequency" | "readGatingMode" | "personaId" | "strictness" | "storageMode";

type SelectSettingProps<K extends SelectSettingKey> = SettingsSectionProps & {
  field: K;
  label: string;
  options: Array<CompanionSettings[K]>;
};

type SelectPlacementProps = SettingsSectionProps & {
  field: "size";
  label: string;
  options: Array<CompanionSettings["placement"]["size"]>;
};

type NumberPlacementProps = SettingsSectionProps & {
  field: "panelWidth" | "panelHeight";
  label: string;
};

type ListSettingProps = SettingsSectionProps & {
  field: "allowedSites" | "blockedSites" | "hiddenSites" | "hiddenPages";
  label: string;
};

createRoot(document.querySelector("#root")!).render(<SettingsApp />);
