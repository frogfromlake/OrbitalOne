/**
 * @file src/globeTileEngine/utils/geo/tileIndexing.ts
 * @description
 */

/**
 * Converts longitude to tile X coordinate at zoom level `z`.
 */
export function lon2tileX(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, z));
}

/**
 * Converts latitude to tile Y coordinate at zoom level `z`.
 */
export function lat2tileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  const n = Math.PI - Math.log(Math.tan(Math.PI / 4 + rad / 2));
  return Math.floor((n / Math.PI / 2) * Math.pow(2, z));
}

/**
 * Generate tile indices in a spiral order from the camera's lat/lon tile index.
 */
export function* computeTileSpiral(
  cameraLon: number,
  cameraLat: number,
  zoom: number,
  maxRadius: number,
): Generator<{ x: number; y: number }> {
  const centerX = lon2tileX(cameraLon, zoom);
  const centerY = lat2tileY(cameraLat, zoom);

  let segmentLength = 1;
  let x = 0,
    y = 0,
    direction = 0;

  while (Math.abs(x) <= maxRadius && Math.abs(y) <= maxRadius) {
    for (let i = 0; i < segmentLength; i++) {
      const tileX = centerX + x;
      const tileY = centerY + y;
      if (tileX >= 0 && tileY >= 0 && tileX < 2 ** zoom && tileY < 2 ** zoom) {
        yield { x: tileX, y: tileY };
      }

      if (direction === 0) x++;
      else if (direction === 1) y++;
      else if (direction === 2) x--;
      else if (direction === 3) y--;
    }

    direction = (direction + 1) % 4;
    if (direction === 0 || direction === 2) segmentLength++;
  }
}

export function getParentTileKey(
  z: number,
  x: number,
  y: number,
  fallbackLayer: number,
): string | null {
  if (z <= fallbackLayer) return null;
  const parentZ = z - 1;
  const parentX = Math.floor(x / 2);
  const parentY = Math.floor(y / 2);
  return `${parentZ}/${parentX}/${parentY}`;
}
