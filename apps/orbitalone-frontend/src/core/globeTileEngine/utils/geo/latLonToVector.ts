/**
 * @file src/globeTileEngine/utils/geo/latLonToVector.ts
 * @description
 */

import { Vector3 } from "three";

/**
 * Converts latitude and longitude to a 3D unit vector on a sphere.
 */
export function latLonToUnitVector(lat: number, lon: number): Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = lon * (Math.PI / 180);
  return new Vector3().setFromSphericalCoords(1, phi, theta).normalize();
}
// USED BEFORE:
// export function latLonToUnitVector(lat: number, lon: number): Vector3 {
//   const phi = (90 - lat) * CONFIG.geo.degToRad;
//   const theta = (lon + CONFIG.geo.lonOffset) * CONFIG.geo.degToRad;
//   return new Vector3().setFromSphericalCoords(1, phi, theta).normalize();
// }

/**
 * Converts lat/lon to a 3D unit vector with flipped Y-axis (for upside-down projections).
 */
export function latLonToUnitVectorFlipped(lat: number, lon: number): Vector3 {
  const phi = (90 + lat) * (Math.PI / 180);
  const theta = (lon + 90) * (Math.PI / 180);
  return new Vector3().setFromSphericalCoords(1, phi, theta).normalize();
}
