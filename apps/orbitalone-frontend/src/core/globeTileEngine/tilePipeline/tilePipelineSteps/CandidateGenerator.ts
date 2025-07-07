// src/globeTileEngine/tilePipeline/tilePipelineSteps/CandidateGenerator.ts

import { type TilePipelineState } from "../../stores/TilePipelineStore";
import {
  getCameraLongitude,
  getCameraLatitude,
} from "../../utils/camera/cameraUtils";
import { computeTileSpiral } from "../../utils/geo/tileIndexing";
import {
  getTileSearchRadius,
  getMaxTilesToLoad,
} from "../../utils/lod/lodFunctions";

export class CandidateGenerator {
  public run(state: TilePipelineState, z: number): void {
    const cameraLon = getCameraLongitude(state.camera);
    const cameraLat = getCameraLatitude(state.camera);

    // --- Dynamically control spiral radius ---
    const userRadius = (window as any).tileCandidateRadius;
    let maxRadius = getTileSearchRadius(z);

    if (typeof userRadius === "number" && userRadius >= 2 && userRadius <= 32) {
      maxRadius = userRadius;
    } else if (z >= 10) {
      maxRadius = 6; // default tighter for Z>=11
    }

    state.candidates.length = 0;
    let count = 0;
    const MAX_CANDIDATES = getMaxTilesToLoad(z);

    for (const { x, y } of computeTileSpiral(
      cameraLon,
      cameraLat,
      z,
      maxRadius,
    )) {
      state.candidates.push({ x, y, z, key: `${z}/${x}/${y}`, screenDist: 0 });
      if (++count >= MAX_CANDIDATES) break;
    }
  }
}

// export class CandidateGenerator {
//   public run(
//     state: TilePipelineState,
//     config: TileEngineConfig,
//     z: number
//   ): void {
//     // console.log(`[CandidateGenerator] Z${z}: running...`);
//     const cameraLon = getCameraLongitude(state.camera);
//     const cameraLat = getCameraLatitude(state.camera);
//     const maxRadius = getTileSearchRadius(z);
//     state.candidates.length = 0;
//     let count = 0;
//     const MAX_CANDIDATES = getMaxTilesToLoad(z);

//     for (const { x, y } of computeTileSpiral(
//       cameraLon,
//       cameraLat,
//       z,
//       maxRadius
//     )) {
//       state.candidates.push({ x, y, z, key: `${z}/${x}/${y}`, screenDist: 0 });
//       if (++count >= MAX_CANDIDATES) break;
//     }
//   }
// }
