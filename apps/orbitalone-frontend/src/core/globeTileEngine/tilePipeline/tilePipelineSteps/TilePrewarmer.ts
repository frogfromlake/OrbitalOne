/**
 * @file src/globeTileEngine/tilePipeline/tilePipelineSteps/TilePrewarmer.ts
 * @description Handles speculative tile loading for near-future visibility, caching only (not rendering).
 */

import type { Mesh } from "three";
import type {
  TilePipelineState,
  TileEngineConfig,
} from "../../stores/TilePipelineStore";

export class TilePrewarmer {
  /**
   * Run prewarming for additional screen-priority tile candidates not yet queued for load.
   * Caches meshes in memory, but does not add to scene.
   */
  run(state: TilePipelineState, config: TileEngineConfig) {
    if (!config.enableTilePrewarm) return;

    const preloadCount = config.prewarmCount ?? 8;

    // Prewarm only prioritized, not already queued/loaded/cached/visible
    const preloadList = state.prioritizedTiles
      .slice(state.queue.length, state.queue.length + preloadCount)
      .filter(
        (candidate) =>
          !state.loadedTiles.has(candidate.key) &&
          !state.visibleTiles.has(candidate.key) &&
          !state.tileCache.has(candidate.key),
      );

    for (const { x, y, z: tileZ, key } of preloadList) {
      state
        .createTileMesh({
          x,
          y,
          z: tileZ,
          urlTemplate: state.urlTemplate,
          radius: state.radius,
          renderer: state.renderer,
        })
        .then((mesh: Mesh) => {
          mesh.visible = false; // Do not show
          state.tileCache.set(key, mesh);
        })
        .catch((err: any) => {
          if (typeof window !== "undefined") {
            console.warn(`Failed to prewarm tile ${key}`, err);
          }
        });
    }
  }
}
