/**
 * @file src/globeTileEngine/utils/bounds/tileToBounds.ts
 * @description Converts XYZ tile coordinates into geographic latitude/longitude bounds.
 *              This is compliant with the Web Mercator projection and clamps to valid ranges.
 */

const WEB_MERCATOR_LAT_LIMIT = 85.0511;

/**
 * Clamps latitude to the valid range of the Web Mercator projection.
 * @param lat Latitude in degrees
 */
function clampLatitude(lat: number): number {
  return Math.max(
    Math.min(lat, WEB_MERCATOR_LAT_LIMIT),
    -WEB_MERCATOR_LAT_LIMIT,
  );
}

/**
 * Converts tile Y and zoom level to the northern latitude of the tile.
 * @param y Tile Y index
 * @param z Zoom level
 * @returns Latitude in degrees
 */
function tileYToLat(y: number, z: number): number {
  const n = Math.pow(2, z);
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  return (latRad * 180) / Math.PI;
}

/**
 * Converts tile X and zoom level to the western longitude of the tile.
 * @param x Tile X index
 * @param z Zoom level
 * @returns Longitude in degrees
 */
function tileXToLon(x: number, z: number): number {
  return (x / Math.pow(2, z)) * 360 - 180;
}

/**
 * Converts tile X/Y/Z coordinates to a geographic bounding box in degrees.
 * Latitude is clamped to valid Web Mercator range.
 *
 * @param x Tile X index
 * @param y Tile Y index
 * @param z Zoom level
 * @returns Object with latMin, latMax, lonMin, lonMax
 */
export function tileToLatLonBounds(
  x: number,
  y: number,
  z: number,
): {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
} {
  const latMin = clampLatitude(tileYToLat(y + 1, z)); // y first
  const latMax = clampLatitude(tileYToLat(y, z));
  const lonMin = tileXToLon(x, z); // x first
  const lonMax = tileXToLon(x + 1, z);
  return { latMin, latMax, lonMin, lonMax };
}
