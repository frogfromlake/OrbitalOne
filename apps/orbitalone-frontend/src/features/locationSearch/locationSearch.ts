/**
 * @file locationSearch.ts
 * @description Handles country and ocean name search functionality.
 * Highlights and centers the selected region on the globe and optionally shows related news.
 */

import { Vector3, MathUtils, Camera } from "three";
import gsap from "gsap";

import { countryMeta } from "@/core/data/countryMeta";
import { oceanCenters } from "@/core/data/oceanCenters";
import { CONFIG } from "@/configs/config";
import {
  hideAll3DLabelsExcept,
  update3DLabel,
} from "@/core/earth/interactivity/countryLabels3D";
import {
  hideAll3DOceanLabelsExcept,
  update3DOceanLabel,
} from "@/core/earth/interactivity/oceanLabel3D";
import { getSolarRotationY } from "@/core/earth/lighting/sunDirection";
import { latLonToSphericalCoordsGeographic } from "@/core/earth/geo/coordinates";
import Fuse from "fuse.js";

async function showNewsLazy(isoCode: string) {
  const { showNewsPanel } = await import("@/features/news/handleNewsPanel");
  await showNewsPanel(isoCode);
}

let cameraTween: gsap.core.Tween | null = null;
let targetTween: gsap.core.Tween | null = null;

/**
 * Initializes the location search input field.
 * Allows the user to search by country or ocean name and rotates the globe to center that region.
 *
 * @param inputLocation - The HTML input element for user location queries.
 * @param camera - The active Three.js camera used to orbit the globe.
 * @param controls - OrbitControls instance to handle camera interaction.
 * @param selectedCountryIds - Set to track currently selected country IDs.
 * @param selectedOceanIds - Set to track currently selected ocean IDs.
 * @param selectedFlags - Uint8Array to track selection states for countries.
 * @param selectedOceanFlags - Uint8Array to track selection states for oceans.
 */
export function setupLocationSearch(
  inputLocation: HTMLInputElement | null,
  camera: Camera,
  controls: any,
  selectedCountryIds: Set<number>,
  selectedOceanIds: Set<number>,
  selectedFlags: Uint8Array,
  selectedOceanFlags: Uint8Array,
  selectedFadeIn: Float32Array<ArrayBuffer>,
  selectedOceanFadeIn: Float32Array<ArrayBuffer>
) {
  const nameToIdMap = new Map<
    string,
    { id: number; type: "country" | "ocean" }
  >();
  const displayNames: string[] = [];

  for (const [id, data] of Object.entries(countryMeta)) {
    nameToIdMap.set(data.name, { id: Number(id), type: "country" });
    displayNames.push(data.name);
  }
  for (const [id, data] of Object.entries(oceanCenters)) {
    nameToIdMap.set(data.name, { id: Number(id), type: "ocean" });
    displayNames.push(data.name);
  }

  const lookupMap = new Map(
    Array.from(nameToIdMap.entries()).map(([name, data]) => [
      name.toLowerCase(),
      data,
    ])
  );

  const fuse = new Fuse(displayNames, {
    threshold: 0.35,
    distance: 100,
  });

  const suggestionsList = document.getElementById(
    "suggestions"
  ) as HTMLUListElement;

  inputLocation?.addEventListener("input", () => {
    const query = inputLocation.value.trim();
    suggestionsList.innerHTML = "";

    if (!query) {
      suggestionsList.classList.add("hidden");
      return;
    }

    const results = fuse.search(query, { limit: 5 });
    if (results.length === 0) {
      suggestionsList.classList.add("hidden");
      return;
    }

    activeIndex = -1;

    for (const { item } of results) {
      const li = document.createElement("li");
      li.textContent = item;
      li.addEventListener("mousedown", () => {
        inputLocation.value = item;
        suggestionsList.classList.add("hidden");
        inputLocation.dispatchEvent(new Event("change"));
      });
      suggestionsList.appendChild(li);
    }

    suggestionsList.classList.remove("hidden");
  });

  let activeIndex = -1;

  inputLocation?.addEventListener("keydown", (e) => {
    const items = suggestionsList.querySelectorAll("li");
    if (!items.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % items.length;
      updateActiveItem(items);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + items.length) % items.length;
      updateActiveItem(items);
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && activeIndex < items.length) {
        e.preventDefault();
        const selected = items[activeIndex] as HTMLElement;
        inputLocation.value = selected.textContent || "";
        suggestionsList.classList.add("hidden");
        inputLocation.dispatchEvent(new Event("change"));
      }
    }
  });

  function updateActiveItem(items: NodeListOf<HTMLLIElement>) {
    items.forEach((item, index) => {
      item.classList.toggle("active", index === activeIndex);
    });
  }

  // Hide on outside click
  document.addEventListener("click", (e) => {
    if (
      e.target !== inputLocation &&
      !suggestionsList.contains(e.target as Node)
    ) {
      suggestionsList.classList.add("hidden");
    }
  });

  const datalist = document.getElementById(
    "location-options"
  ) as HTMLDataListElement;
  if (datalist) {
    for (const name of displayNames.sort()) {
      const option = document.createElement("option");
      option.value = name;
      datalist.appendChild(option);
    }
  }

  const transitionDuration = 2;

  // Prevent camera fighting by canceling animation on user interaction
  controls.addEventListener("start", () => {
    cameraTween?.kill();
    targetTween?.kill();
    cameraTween = null;
    targetTween = null;
  });

  inputLocation?.addEventListener("change", async () => {
    const query = inputLocation.value.trim();
    if (!query) return;

    let result = lookupMap.get(query.toLowerCase());
    if (!result) {
      const fuseResult = fuse.search(query);
      if (fuseResult.length > 0) {
        const bestMatch = fuseResult[0].item;
        result = nameToIdMap.get(bestMatch);
      }
    }

    if (!result) {
      console.warn("Location not found:", query);
      return;
    }

    const { id, type } = result;
    const centerData = type === "country" ? countryMeta[id] : oceanCenters[id];

    // === Clear previous selections ===
    for (const cid of selectedCountryIds) selectedFlags[cid - 1] = 0;
    for (const oid of selectedOceanIds) selectedOceanFlags[oid - 1] = 0;
    selectedCountryIds.clear();
    selectedOceanIds.clear();

    // === Apply new selection ===
    if (id < selectedFlags.length + 1) {
      if (type === "country") {
        selectedCountryIds.add(id);
        selectedFlags[id - 1] = 1;
        selectedFadeIn[id - 1] = 1;

        hideAll3DLabelsExcept([id]);
        await update3DLabel(id, camera, 1);

        const isoCode = countryMeta[id]?.iso;
        if (isoCode) {
          showNewsLazy(isoCode);
        } else {
          console.warn(`Missing ISO code for selected country ID: ${id}`);
        }
      } else {
        selectedOceanIds.add(id);

        const oceanIndex = CONFIG.oceanHover.oceanIdToIndex?.[id];
        if (
          typeof oceanIndex === "number" &&
          oceanIndex < CONFIG.oceanHover.maxOceanCount
        ) {
          selectedOceanFlags[oceanIndex] = 1;
          selectedOceanFadeIn[oceanIndex] = 1;
        }

        hideAll3DOceanLabelsExcept([id]);
        const ocean = CONFIG.oceanHover.oceanCenters[id];
        if (ocean) {
          await update3DOceanLabel(
            id,
            ocean.name,
            ocean.lat,
            ocean.lon,
            camera,
            1
          );
        }
      }
    }

    // === Calculate target rotation ===
    const { lat, lon } = centerData;
    const { phi, theta, radius } = latLonToSphericalCoordsGeographic(
      lat,
      lon,
      CONFIG.labels3D.markerRadius
    );

    const targetRotation = getSolarRotationY();

    const targetDirection = new Vector3()
      .setFromSphericalCoords(radius, phi, theta)
      .applyAxisAngle(new Vector3(0, 1, 0), targetRotation)
      .normalize();

    const currentDirection = camera.position
      .clone()
      .sub(controls.target)
      .normalize();
    const originalDistance = camera.position.distanceTo(controls.target);
    const defaultDistance = CONFIG.camera.initialPosition.z ?? originalDistance;
    const shouldZoom = originalDistance < defaultDistance * 0.98;

    const tmp = { t: 0 };
    cameraTween = gsap.to(tmp, {
      t: 1,
      duration: transitionDuration,
      ease: "power2.inOut",
      onUpdate: () => {
        const zoomFactor = shouldZoom
          ? tmp.t < 0.5
            ? MathUtils.lerp(originalDistance, defaultDistance, tmp.t * 2)
            : MathUtils.lerp(
                defaultDistance,
                originalDistance,
                (tmp.t - 0.5) * 2
              )
          : originalDistance;

        const interpolatedDirection = currentDirection
          .clone()
          .lerp(targetDirection, tmp.t)
          .normalize();
        const newPos = interpolatedDirection.multiplyScalar(zoomFactor);
        camera.position.copy(newPos);
        controls.update();
      },
    });

    targetTween = gsap.to(controls.target, {
      x: 0,
      y: 0,
      z: 0,
      duration: transitionDuration,
      ease: "power2.inOut",
    });
  });
}
