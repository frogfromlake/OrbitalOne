/**
 * @file setupSidebar.ts
 * @description Sets up the interactive UI controls panel, enabling toggles for features
 * such as flashlight mode, country/ocean interactivity, label clearing, and star background modes.
 */

import { Group, Mesh, Object3DEventMap, PerspectiveCamera } from "three";
import { appState } from "@/state/appState";
import { clearAllSelections } from "@/sidebar/features/clearSelections";
import {
  toggleCountryInteractivity,
  toggleOceanInteractivity,
} from "@/sidebar/features/toggleSelections";
import { setupUserLocation } from "@/sidebar/features/showUserLocation";
import { setupLocationSearch } from "@/features/locationSearch/locationSearch";
import { hideAll3DLabelsExcept } from "@/core/earth/interactivity/countryLabels3D";
import { hideAll3DOceanLabels } from "@/core/earth/interactivity/oceanLabel3D";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { toggleAtmosphere } from "@/sidebar/features/toggleAtmosphere";

let OrbitControlsClass: typeof import("three/examples/jsm/controls/OrbitControls").OrbitControls;

/**
 * Initializes all interactive settings buttons and handlers for the user settings panel.
 *
 * @param uniforms - Shared shader uniforms (e.g. uFlashlightEnabled).
 * @param selectedFlags - Byte array for currently selected countries.
 * @param selectedOceanFlags - Byte array for currently selected oceans.
 * @param selectedCountryIds - Set of selected country IDs.
 * @param selectedOceanIds - Set of selected ocean IDs.
 * @param scene - The main Three.js scene.
 * @param globe - The globe mesh object.
 * @param locationSearchInput - Input element for search field.
 * @param camera - Main camera instance.
 * @param controls - OrbitControls instance.
 * @returns An object with a `getBackgroundMode()` function to query background state.
 */
export async function setupSettingsPanel(
  uniforms: { [key: string]: any },
  selectedFlags: Uint8Array,
  selectedOceanFlags: Uint8Array,
  selectedCountryIds: Set<number>,
  selectedOceanIds: Set<number>,
  tiltGroup: Group<Object3DEventMap>,
  cloudSphere: Mesh,
  auroraMesh: Mesh,
  locationSearchInput: HTMLInputElement | null,
  camera: PerspectiveCamera,
  controls: OrbitControls,
  selectedFadeIn: Float32Array<ArrayBuffer>,
  selectedOceanFadeIn: Float32Array<ArrayBuffer>
) {
  if (!OrbitControlsClass) {
    const module = await import("three/examples/jsm/controls/OrbitControls");
    OrbitControlsClass = module.OrbitControls;
  }

  let useFixedBackground = false;

  // Initial scene setup
  setupUserLocation(tiltGroup, camera, controls);
  hideAll3DLabelsExcept();
  hideAll3DOceanLabels();
  setupLocationSearch(
    locationSearchInput,
    camera,
    controls,
    selectedCountryIds,
    selectedOceanIds,
    selectedFlags,
    selectedOceanFlags,
    selectedFadeIn,
    selectedOceanFadeIn
  );

  /**
   * Updates the visual state of a toggle button based on enabled/disabled status.
   */
  function updateButtonState(button: HTMLButtonElement, enabled: boolean) {
    button.classList.toggle("enabled", enabled);
    button.classList.toggle("disabled", !enabled);
  }

  const countryBtn = document.getElementById(
    "toggle-country"
  ) as HTMLButtonElement;
  const oceanBtn = document.getElementById("toggle-ocean") as HTMLButtonElement;
  const flashlightBtn = document.getElementById(
    "toggle-flashlight"
  ) as HTMLButtonElement;
  const clearBtn = document.getElementById(
    "clear-selection"
  ) as HTMLButtonElement;
  const starBtn = document.getElementById(
    "toggle-star-mode"
  ) as HTMLButtonElement;
  const cloudBtn = document.getElementById(
    "toggle-atmosphere"
  ) as HTMLButtonElement;

  // === Bind actions ===

  clearBtn?.addEventListener("click", () => {
    clearAllSelections(
      selectedFlags,
      selectedOceanFlags,
      selectedCountryIds,
      selectedOceanIds
    );
  });

  countryBtn?.addEventListener("click", () => {
    toggleCountryInteractivity(countryBtn);
    countryBtn.textContent = appState.countryInteractivity
      ? "Disable Country Interactivity"
      : "Enable Country Interactivity";
    updateButtonState(countryBtn, appState.countryInteractivity);
  });

  oceanBtn?.addEventListener("click", () => {
    toggleOceanInteractivity(oceanBtn);
    oceanBtn.textContent = appState.oceanInteractivity
      ? "Disable Ocean Interactivity"
      : "Enable Ocean Interactivity";
    updateButtonState(oceanBtn, appState.oceanInteractivity);
  });

  flashlightBtn?.addEventListener("click", () => {
    appState.flashlightEnabled = !appState.flashlightEnabled;
    uniforms.uFlashlightEnabled.value = appState.flashlightEnabled;
    flashlightBtn.textContent = appState.flashlightEnabled
      ? "Disable Flashlight"
      : "Enable Flashlight";
    updateButtonState(flashlightBtn, appState.flashlightEnabled);
  });

  starBtn?.addEventListener("click", () => {
    useFixedBackground = !useFixedBackground;
    starBtn.textContent = useFixedBackground
      ? "Background: Infinite"
      : "Background: Realistic";
    updateButtonState(starBtn, useFixedBackground);
  });

  cloudBtn?.addEventListener("click", () => {
    toggleAtmosphere(cloudSphere, auroraMesh, cloudBtn);
  });

  // === Initial states ===
  updateButtonState(countryBtn, appState.countryInteractivity);
  updateButtonState(oceanBtn, appState.oceanInteractivity);
  updateButtonState(flashlightBtn, appState.flashlightEnabled);
  updateButtonState(starBtn, useFixedBackground);

  // Sidebar toggle
  const sidebar = document.getElementById("sidebar")!;
  const toggle = document.getElementById("sidebar-toggle")!;
  toggle.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });

  return {
    getBackgroundMode: () => useFixedBackground,
  };
}
