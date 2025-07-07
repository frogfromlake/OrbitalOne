// src/globeTileEngine/tilePipeline/tilePipelineSteps/Loader.ts
import type { Mesh } from "three";
import { fadeOutTileMesh, fadeInTileMesh } from "./TileFading";
import { type TilePipelineState } from "../../stores/TilePipelineStore";
import { getParentTileKey } from "../../utils/geo/tileIndexing";

export class Loader {
  run(state: TilePipelineState, z: number) {
    // 1. Sort queue by center-priority
    state.queue.sort((a, b) => a.screenDist - b.screenDist);

    // 2. Cap queue size per zoom
    const MAX_QUEUE_LENGTH = z >= 13 ? 10 : z >= 11 ? 18 : 64;

    // 3. If overloaded, prune the least important (farthest) from taskQueue
    while (state.taskQueue.length() > MAX_QUEUE_LENGTH) {
      // Remove one of the lowest-priority (farthest) tasks
      state.taskQueue.removeLowestPriority?.();
    }

    const fadeEnabled = (window as any).enableTileFade;
    let enqueued = 0;

    for (const candidate of state.queue) {
      if (state.loadedTiles.has(candidate.key)) continue;

      // Avoid duplicate enqueues (task already queued)
      if (state.taskQueue.has?.(candidate.key)) continue;

      // Only enqueue up to the max per frame
      if (enqueued >= MAX_QUEUE_LENGTH) break;

      state.taskQueue.enqueue({
        key: candidate.key,
        zoom: candidate.z,
        revision: state.revision,
        task: async () => {
          try {
            const mesh: Mesh = await state.createTileMesh({
              x: candidate.x,
              y: candidate.y,
              z: candidate.z,
              urlTemplate: state.urlTemplate,
              radius: state.radius,
              renderer: state.renderer,
            });

            (mesh as any).userData.key = candidate.key;
            mesh.visible = true;
            if (fadeEnabled) (mesh.material as any).opacity = 0;
            state.tileGroup.add(mesh);

            // Fade out parent/fallback when loading high-res tile
            const handleParentOrSticky = () => {
              const parentKey = getParentTileKey(
                candidate.z,
                candidate.x,
                candidate.y,
                state.fallbackLayer,
              );
              if (parentKey && state.tileCache.has(parentKey)) {
                const parentMesh = state.tileCache.get(parentKey);
                if (parentMesh) {
                  if (fadeEnabled) {
                    fadeOutTileMesh(parentMesh, 100, () => {
                      if (parentMesh.parent)
                        parentMesh.parent.remove(parentMesh);
                      state.visibleTiles.delete(parentKey);
                    });
                  } else {
                    if (parentMesh.parent) parentMesh.parent.remove(parentMesh);
                    state.visibleTiles.delete(parentKey);
                  }
                }
              }
            };

            if (fadeEnabled) {
              fadeInTileMesh(mesh, 500, handleParentOrSticky);
            } else {
              handleParentOrSticky();
            }

            state.tileCache.set(candidate.key, mesh);
            state.loadedTiles.set(candidate.key, mesh);
            state.visibleTiles.add(candidate.key);
          } catch (err) {
            state.loadedTiles.delete(candidate.key);
            console.warn(`❌ Failed to load tile ${candidate.key}`, err);
          }
        },
      });
      enqueued++;
    }

    state.taskQueue.process();
  }
}
