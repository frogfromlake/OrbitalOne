// src/globeTileEngine/tilePipeline/tilePipelineSteps/VisibilityFilter.ts

import { Frustum, Matrix4, PerspectiveCamera, Scene, Vector3 } from "three";
import {
  getCameraCenterDirection,
  getCameraLongitude,
} from "../../utils/camera/cameraUtils";
import {
  getMinDotThreshold,
  getScreenDistanceCap,
} from "../../utils/lod/lodFunctions";
import { latLonToUnitVector } from "../../utils/geo/latLonToVector";
import { tileToLatLonBounds } from "../../utils/bounds/tileToBounds";
import { getTileBoundingSphere } from "../../utils/lod/tileBoundingSphere";
import {
  type TilePipelineState,
  type TileEngineConfig,
} from "../../stores/TilePipelineStore";

// --- Culling context & helpers ---

interface TileCullingContext {
  camera: PerspectiveCamera;
  zoom: number;
  radius: number;
  enableFrustumCulling: boolean;
  enableDotProductFiltering: boolean;
  enableScreenSpacePrioritization: boolean;
  frustum?: Frustum;
  scene?: Scene;
}

/** Compute a widened frustum for culling */
function computeFrustum(
  camera: PerspectiveCamera,
  fovMultiplier = 1.3,
): Frustum {
  const fov = camera.fov * fovMultiplier;
  const tempCamera = new PerspectiveCamera(
    fov,
    camera.aspect,
    camera.near,
    camera.far,
  );
  tempCamera.position.copy(camera.position);
  tempCamera.quaternion.copy(camera.quaternion);
  tempCamera.updateMatrixWorld(true);

  const projMatrix = new Matrix4().multiplyMatrices(
    tempCamera.projectionMatrix,
    tempCamera.matrixWorldInverse,
  );

  return new Frustum().setFromProjectionMatrix(projMatrix);
}

/** Test if a tile is visible in the current view (frustum, dot, etc) */
function isTileVisible(
  x: number,
  y: number,
  z: number,
  context: TileCullingContext,
  visibleTiles: Set<string>,
  frustum?: Frustum,
): { visible: boolean; key: string; screenDist: number } {
  const key = `${z}/${x}/${y}`;
  if (visibleTiles.has(key)) {
    return { visible: false, key, screenDist: Infinity };
  }

  // Skip tiles on far side of globe (>100° from camera center)
  const bounds = tileToLatLonBounds(x, y, z);
  const centerLat = (bounds.latMin + bounds.latMax) / 2;
  const centerLon = (bounds.lonMin + bounds.lonMax) / 2;
  const cameraLon = getCameraLongitude(context.camera);
  const lonDiff = Math.abs(centerLon - cameraLon);
  if (Math.min(lonDiff, 360 - lonDiff) > 100) {
    return { visible: false, key, screenDist: Infinity };
  }

  // Dot-product filter (FOV angle filtering)
  const tileDir = latLonToUnitVector(centerLat, centerLon);
  const viewDir = getCameraCenterDirection(context.camera);
  const dot = viewDir.dot(tileDir);
  const minDot = getMinDotThreshold(z, context.camera.fov);
  if (context.enableDotProductFiltering && dot < minDot) {
    return { visible: false, key, screenDist: Infinity };
  }

  // Frustum test (bounding sphere vs camera frustum)
  const cameraDistance = context.camera.position.length();
  const boundingSphere = getTileBoundingSphere(
    x,
    y,
    z,
    context.radius,
    cameraDistance,
  );

  if (
    context.enableFrustumCulling &&
    frustum &&
    !frustum.intersectsSphere(boundingSphere)
  ) {
    return { visible: false, key, screenDist: Infinity };
  }

  // Screen-space distance (prioritization + capping)
  const projected = boundingSphere.center.clone().project(context.camera);
  const screenDist = context.enableScreenSpacePrioritization
    ? projected.distanceTo(new Vector3(0, 0, -1))
    : 0;

  if (screenDist > getScreenDistanceCap(z)) {
    return { visible: false, key, screenDist };
  }

  return { visible: true, key, screenDist };
}

// --- VisibilityFilter class (now self-contained) ---
export class VisibilityFilter {
  run(state: TilePipelineState, config: TileEngineConfig, z: number) {
    const frustum = config.enableFrustumCulling
      ? computeFrustum(state.camera)
      : undefined;
    state.visibleCandidates.length = 0;

    for (const candidate of state.candidates) {
      const result = isTileVisible(
        candidate.x,
        candidate.y,
        z, // pass z explicitly
        {
          camera: state.camera,
          zoom: z,
          radius: state.radius,
          enableFrustumCulling: config.enableFrustumCulling,
          enableDotProductFiltering: config.enableDotProductFiltering,
          enableScreenSpacePrioritization:
            config.enableScreenSpacePrioritization,
          frustum,
        },
        state.visibleTiles,
        frustum,
      );
      if (result.visible) {
        state.visibleCandidates.push({
          x: candidate.x,
          y: candidate.y,
          z,
          key: result.key,
          screenDist: result.screenDist,
        });
      }
    }

    // console.log(
    //   `[VisibilityFilter] Z${z}: ${state.visibleCandidates.length}/${state.candidates.length} passed`
    // );
  }
}
