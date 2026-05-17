import type { InterventionPageContext } from "../intervention";
import type { CompanionSettings } from "../shared/settings-types";

/** Visibility result explaining whether the pet should render on a page. */
export type CompanionVisibility = {
  visible: boolean;
  reason: string;
};

/** Explains the current settings/page visibility gate for diagnostics. */
export function explainCompanionVisibility(
  settings: CompanionSettings,
  page: InterventionPageContext
): CompanionVisibility {
  if (!settings.enabledGlobally) return hidden("disabled_globally");
  if (!settings.showPet) return hidden("pet_hidden");
  if (!isAllowedSite(settings, page.host)) return hidden("not_allowed_site");
  if (settings.hiddenPages.includes(page.url)) return hidden("hidden_page");
  if (matchesSite(page.host, settings.hiddenSites)) return hidden("hidden_site");
  return { visible: true, reason: "visible" };
}

/** Returns true when settings allow the companion to render on the page. */
export function shouldShowCompanion(
  settings: CompanionSettings,
  page: InterventionPageContext
): boolean {
  return explainCompanionVisibility(settings, page).visible;
}

function hidden(reason: string): CompanionVisibility {
  return { visible: false, reason };
}

function isAllowedSite(settings: CompanionSettings, host: string): boolean {
  return settings.allowedSites.length === 0 || matchesSite(host, settings.allowedSites);
}

function matchesSite(host: string, sites: string[]): boolean {
  return sites.some((site) => host === site || host.endsWith(`.${site}`));
}
