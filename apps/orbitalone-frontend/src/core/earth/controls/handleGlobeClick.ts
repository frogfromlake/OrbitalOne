/**
 * @file handleGlobeClick.ts
 * @description Handles click interactions on the globe, determining whether a country or ocean was clicked
 * and updating selection states and the news panel accordingly.
 */

import { Intersection } from "three";
import { appState } from "@/state/appState";
import { getCountryIdAtUV } from "@/core/earth/interactivity/countryHover";
import { getOceanIdAtUV } from "@/core/earth/interactivity/oceanHover";
import { oceanIdToIndex } from "@/utils/oceanIdToIndex";
import { countryMeta } from "@/core/data/countryMeta";
import { CONFIG } from "@/configs/config";

/**
 * Dynamically loads and shows news for a country by ISO code.
 */
async function showNewsForCountry(isoCode: string) {
  (await import("../../../features/news/handleNewsPanel")).showNewsPanel(
    isoCode
  );
}

/**
 * Dynamically loads and hides the news panel.
 */
async function hideNews() {
  (await import("../../../features/news/handleNewsPanel")).hideNewsPanel();
}

/**
 * Handles a click event on the globe, determining whether a country or ocean was selected.
 * Toggles selection state and updates the news panel accordingly.
 *
 * @param hit - The intersection result from a globe click raycast.
 * @param selectedCountryIds - A set of currently selected country IDs.
 * @param selectedFlags - Selection flag array for countries (used by shader).
 * @param selectedOceanIds - A set of currently selected ocean IDs.
 * @param selectedOceanFlags - Selection flag array for oceans (used by shader).
 */
export function handleGlobeClick(
  hit: Intersection,
  selectedCountryIds: Set<number>,
  selectedFlags: Uint8Array,
  selectedOceanIds: Set<number>,
  selectedOceanFlags: Uint8Array
): void {
  if (!hit.uv) return;

  // Determine clicked country and ocean IDs (if interactivity is enabled)
  const clickedCountryId = appState.countryInteractivity
    ? getCountryIdAtUV(hit.uv)
    : -1;

  const clickedOceanId = appState.oceanInteractivity
    ? getOceanIdAtUV(hit.uv)
    : -1;

  // === Country selection logic ===
  if (
    clickedCountryId > 0 &&
    clickedCountryId <= CONFIG.countryHover.maxCountryCount
  ) {
    const isAlreadySelected = selectedCountryIds.has(clickedCountryId);

    if (isAlreadySelected) {
      selectedCountryIds.delete(clickedCountryId);
      selectedFlags[clickedCountryId - 1] = 0;
      hideNews();
      return;
    }

    selectedCountryIds.add(clickedCountryId);
    selectedFlags[clickedCountryId - 1] = 1;
    appState.lastOpenedCountryId = clickedCountryId;

    const isoCode = countryMeta[clickedCountryId]?.iso;
    if (isoCode) {
      showNewsForCountry(isoCode);
    } else {
      console.warn(`No ISO code found for country ID: ${clickedCountryId}`);
    }
  }

  // === Ocean selection logic ===
  const oceanIndex = oceanIdToIndex[clickedOceanId];
  if (oceanIndex === undefined) return;

  if (selectedOceanIds.has(clickedOceanId)) {
    selectedOceanIds.delete(clickedOceanId);
    selectedOceanFlags[oceanIndex] = 0;
  } else {
    selectedOceanIds.add(clickedOceanId);
    selectedOceanFlags[oceanIndex] = 1;
  }
}
