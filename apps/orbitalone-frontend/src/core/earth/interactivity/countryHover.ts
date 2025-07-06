import {
  Vector2,
  ShaderMaterial,
  Vector3,
  DataTexture,
  RedFormat,
  UnsignedByteType,
  Camera,
  MathUtils,
} from "three";
import { CONFIG } from "@/configs/config";
import { countryMeta } from "@/core/data/countryMeta";
import { showNewsPanel } from "@/features/news/handleNewsPanel";
import { hideAll3DLabelsExcept, update3DLabel } from "./countryLabels3D";

// Internal state
let countryIdMapCanvas: HTMLCanvasElement | null = null;
let countryIdCtx: CanvasRenderingContext2D | null = null;
let countryIdPixelData: Uint8ClampedArray | null = null;
let imageLoaded = false;

/**
 * Reads a country ID from the UV coordinates on the loaded country ID map.
 */
export function getCountryIdAtUV(uv: Vector2): number {
  if (!imageLoaded || !countryIdMapCanvas || !countryIdPixelData) return -1;

  const x = Math.floor(MathUtils.clamp(uv.x, 0, 1) * countryIdMapCanvas.width);
  const y = Math.floor(
    MathUtils.clamp(1.0 - uv.y, 0, 1) * countryIdMapCanvas.height
  );

  const index = (y * countryIdMapCanvas.width + x) * 4;
  return countryIdPixelData[index]; // Red channel only
}

/**
 * Loads the country ID map image and prepares it for pixel access via offscreen canvas.
 */
export async function loadCountryIdMapTexture(): Promise<void> {
  await new Promise<void>((resolve) => {
    const image = new Image();
    image.src = CONFIG.textures.countryIdMapPath;
    image.onload = () => {
      countryIdMapCanvas = document.createElement("canvas");
      countryIdMapCanvas.width = image.width;
      countryIdMapCanvas.height = image.height;

      countryIdCtx = countryIdMapCanvas.getContext("2d", {
        willReadFrequently: true,
      });
      countryIdCtx?.drawImage(image, 0, 0);

      const imageData = countryIdCtx?.getImageData(
        0,
        0,
        image.width,
        image.height
      );
      if (imageData) {
        countryIdPixelData = imageData.data;
      }

      imageLoaded = true;
      resolve();
    };
  });
}

/**
 * Determines the currently hovered country based on UV coordinates.
 */
export function updateHoveredCountry(
  uv: Vector2,
  globeMaterial: ShaderMaterial
): { id: number; position: Vector3 | null } {
  const id = getCountryIdAtUV(uv);
  globeMaterial.uniforms.hoveredCountryId.value = id;
  return { id, position: null };
}

/**
 * Creates a DataTexture used for per-country selection highlighting.
 */
export function createSelectionTexture(): DataTexture {
  const data = new Uint8Array(CONFIG.countryHover.maxCountryCount);
  const texture = new DataTexture(
    data,
    CONFIG.countryHover.maxCountryCount,
    1,
    RedFormat,
    UnsignedByteType
  );

  texture.minFilter = CONFIG.countryHover.selectionTexture.minFilter;
  texture.magFilter = CONFIG.countryHover.selectionTexture.magFilter;
  texture.wrapS = CONFIG.countryHover.selectionTexture.wrapS;
  texture.wrapT = CONFIG.countryHover.selectionTexture.wrapT;
  texture.needsUpdate = true;

  return texture;
}

/**
 * Selects a country by ID, updates selection texture and UI.
 */
export async function selectCountryById(
  countryId: number,
  selectedCountryIds: Set<number>,
  selectedFlags: Uint8Array,
  selectedFadeIn: Float32Array,
  camera: Camera
) {
  if (
    countryId < 1 ||
    !(countryId in countryMeta) ||
    selectedCountryIds.has(countryId)
  ) {
    console.warn("Invalid country ID:", countryId);
    return;
  }

  for (const cid of selectedCountryIds) selectedFlags[cid - 1] = 0;
  selectedCountryIds.clear();

  selectedCountryIds.add(countryId);
  selectedFlags[countryId - 1] = 1;
  selectedFadeIn[countryId - 1] = 1;

  hideAll3DLabelsExcept([countryId]);
  await update3DLabel(countryId, camera, 1);

  const isoCode = countryMeta[countryId]?.iso;
  if (isoCode) showNewsPanel(isoCode);
  else console.warn("Missing ISO code for country:", countryId);
}
