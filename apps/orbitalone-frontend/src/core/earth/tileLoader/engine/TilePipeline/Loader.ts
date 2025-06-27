// engine/TileLayer/TilePipeline/Loader.ts
import type { Mesh } from "three";
import { fadeOutTileMesh, fadeInTileMesh } from "./TileFading";
import { TilePipelineState } from "./TilePipelineStore";
import { getParentTileKey } from "../utils/geo/tileIndexing";

export class Loader {
  run(state: TilePipelineState, z: number) {
    // --- Cap the task queue ---
    // const MAX_QUEUE_LENGTH = z >= 13 ? 8 : z >= 11 ? 16 : 32;
    const MAX_QUEUE_LENGTH = z >= 13 ? 10 : z >= 11 ? 18 : 64;
    if (state.taskQueue.length() > MAX_QUEUE_LENGTH) {
      console.warn(`[Loader] Tile queue overloaded at Z${z}, skipping load`);
      return;
    }

    // console.log(`[Loader] Z${z}: queueing ${state.queue.length} tiles`);
    const fadeEnabled = (window as any).enableTileFade;
    const stickyEnabled = (window as any).enableStickyTiles;
    let enqueued = 0;

    for (const candidate of state.queue) {
      if (state.loadedTiles.has(candidate.key)) continue;

      // --- Do not over-enqueue: cap the amount to add this frame
      if (enqueued >= MAX_QUEUE_LENGTH) {
        break;
      }

      state.taskQueue.enqueue({
        key: candidate.key,
        zoom: candidate.z,
        revision: state.revision,
        task: async () => {
          try {
            // console.time?.(`createTileMesh:${candidate.key}`);
            const mesh: Mesh = await state.createTileMesh({
              x: candidate.x,
              y: candidate.y,
              z: candidate.z,
              urlTemplate: state.urlTemplate,
              radius: state.radius,
              renderer: state.renderer,
            });
            // console.timeEnd?.(`createTileMesh:${candidate.key}`);

            (mesh as any).userData.key = candidate.key;
            mesh.visible = true;
            if (fadeEnabled) (mesh.material as any).opacity = 0;
            state.tileGroup.add(mesh);

            // Fade/sticky logic
            const handleParentOrSticky = () => {
              if (stickyEnabled && state.stickyManager) {
                state.stickyManager.onTileLoaded(
                  candidate.key,
                  candidate.z,
                  candidate.x,
                  candidate.y
                );
              } else {
                const parentKey = getParentTileKey(
                  candidate.z,
                  candidate.x,
                  candidate.y,
                  state.fallbackLayer
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
                      if (parentMesh.parent)
                        parentMesh.parent.remove(parentMesh);
                      state.visibleTiles.delete(parentKey);
                    }
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
    // if (enqueued > 0) {
    //   console.log(`[Loader] Enqueued ${enqueued} tiles for loading`);
    // }

    state.taskQueue.process();
  }
}
