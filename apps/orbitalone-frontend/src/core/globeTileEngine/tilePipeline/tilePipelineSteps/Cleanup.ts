// src/globeTileEngine/tilePipeline/tilePipelineSteps/Cleanup.ts

import { type TilePipelineState } from "../../stores/TilePipelineStore";
import { computeScreenDistance } from "../../utils/camera/cameraUtils";

export class Cleanup {
  run(state: TilePipelineState) {
    const Z_UNLOAD_THRESHOLD = 10;
    const SCREEN_DIST_THRESHOLD = 2.5;
    const toRemove: string[] = [];

    for (const key of state.visibleTiles) {
      const mesh = state.tileCache.get(key);
      if (!mesh || !state.tileGroup.children.includes(mesh)) continue;
      const [zStr] = key.split("/");
      const z = parseInt(zStr, 10);
      if (z < Z_UNLOAD_THRESHOLD) continue;

      const screenDist = computeScreenDistance(mesh.position, state.camera);
      if (screenDist > SCREEN_DIST_THRESHOLD) {
        state.tileGroup.remove(mesh);
        mesh.visible = false;
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      state.visibleTiles.delete(key);
    }
    // if (toRemove.length > 0) {
    //   console.log(
    //     `🧹 [Cleanup] Unloaded ${toRemove.length} stale tiles at Z≥${Z_UNLOAD_THRESHOLD}`
    //   );
    // }
  }
}
