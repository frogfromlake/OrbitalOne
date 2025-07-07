/**
 * @file src/globeTileEngine/utils/lod/tileBoundingSphere.ts
 * @description
 */

import { Sphere } from "three";
import { tileToLatLonBounds } from "../bounds/tileToBounds";
import { latLonToUnitVector } from "../geo/latLonToVector";
import {
  getBoundingSphereMultiplier,
  getTileInflation,
  getMinTileRadius,
} from "./lodFunctions";

/**
 * Computes an inflated bounding sphere for a tile, used for frustum culling.
 *
 * @param x - Tile X coordinate
 * @param y - Tile Y coordinate
 * @param z - Zoom level
 * @param globeRadius - Radius of the globe mesh
 * @param cameraDistance - Current distance of the camera from the globe
 * @returns A bounding Sphere object centered on the tile
 */
export function getTileBoundingSphere(
  x: number,
  y: number,
  z: number,
  globeRadius: number,
  cameraDistance: number,
): Sphere {
  // Compute lat/lon bounds and the geographic center of the tile
  const bounds = tileToLatLonBounds(x, y, z);
  const centerLat = (bounds.latMin + bounds.latMax) / 2;
  const centerLon = (bounds.lonMin + bounds.lonMax) / 2;

  // Convert geographic center to 3D position on the globe
  const centerDir = latLonToUnitVector(centerLat, centerLon);
  const center = centerDir.multiplyScalar(globeRadius * 1.02); // slight outward push

  // Estimate angular size of the tile in degrees/radians
  const angleDeg = Math.max(
    bounds.latMax - bounds.latMin,
    bounds.lonMax - bounds.lonMin,
  );
  const angleRad = (angleDeg * Math.PI) / 180;

  // Base radius from angular size
  const rawRadius = Math.sin(angleRad / 2) * globeRadius;

  // Apply LOD-based inflation, dynamic zoom adaptation, and a minimum floor
  const baseMultiplier = getBoundingSphereMultiplier(z); // zoom-dependent inflation
  const inflation = getTileInflation(z, cameraDistance); // perspective-based adjustment
  const minRadius = getMinTileRadius(z); // zoom-dependent lower bound

  // Final radius with safeguards against vanishingly small spheres
  const inflated = rawRadius * baseMultiplier * inflation;
  const radius = Math.max(inflated, minRadius * inflation);

  return new Sphere(center, radius);
}
