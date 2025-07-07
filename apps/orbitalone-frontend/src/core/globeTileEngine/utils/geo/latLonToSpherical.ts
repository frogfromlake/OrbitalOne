/**
 * @file src/globeTileEngine/utils/geo/latLonToSpherical.ts
 * @description Converts latitude and longitude into spherical coordinates for THREE.Spherical.
 *
 * @param lat Latitude in degrees
 * @param lon Longitude in degrees
 * @param radius Optional radius of the sphere (default 1.0)
 * @returns Object with phi, theta, radius
 */
export function latLonToSphericalCoords(
  lat: number,
  lon: number,
  radius = 1.0,
): { phi: number; theta: number; radius: number } {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 90) * (Math.PI / 180);
  return { phi, theta, radius };
}
