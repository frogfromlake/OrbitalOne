/**
 * @file src/globeTileEngine/utils/camera/cameraUtils.ts
 * @description Utility functions for extracting camera direction and longitude,
 * primarily used for tile visibility, prioritization, and frustum alignment.
 */

import { PerspectiveCamera, Vector3 } from "three";

/**
 * Returns a normalized vector pointing from the globe center to the camera.
 * This is the inverse of the camera view direction.
 */
export function getCameraCenterDirection(camera: PerspectiveCamera): Vector3 {
  const direction = new Vector3();
  camera.getWorldDirection(direction);
  return direction.negate().normalize(); // globe-center to camera
}

/**
 * Computes the camera's longitudinal angle in degrees,
 * assuming the camera position is relative to the globe center.
 */
export function getCameraLongitude(camera: PerspectiveCamera): number {
  const pos = camera.position.clone().normalize();
  return Math.atan2(pos.x, pos.z) * (180 / Math.PI);
}

/**
 * Computes the camera's latitude angle in degrees.
 */
export function getCameraLatitude(camera: PerspectiveCamera): number {
  const pos = camera.position.clone().normalize();
  return Math.asin(pos.y) * (180 / Math.PI);
}

export function computeScreenDistance(
  position: Vector3,
  camera: PerspectiveCamera,
): number {
  const projected = position.clone().project(camera);
  return projected.distanceTo(new Vector3(0, 0, -1));
}

export function getCameraState(camera: PerspectiveCamera) {
  return {
    pos: camera.position.clone(),
    quat: camera.quaternion.clone(),
    zoom: Math.round(camera.zoom ?? camera.userData.zoomLevel ?? 3),
  };
}
export function cameraStateChanged(a: any, b: any): boolean {
  // Compare position, orientation, zoom
  return !a.pos.equals(b.pos) || !a.quat.equals(b.quat) || a.zoom !== b.zoom;
}
