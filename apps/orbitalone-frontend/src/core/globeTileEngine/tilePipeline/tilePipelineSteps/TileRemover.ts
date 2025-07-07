// src/globeTileEngine/tilePipeline/tilePipelineSteps/TileRemover.ts

import type { TilePipelineState } from "../../stores/TilePipelineStore";
import { fadeOutTileMesh } from "./TileFading";
import { TileMeshCache } from "./TileMeshCache";

export class TileRemover {
  private pendingRemoval = new Map<string, number>();
  private framesTillRemove: number;
  private removalsThisFrame: number;
  private fringeTiles: Set<string> = new Set();

  private state: TilePipelineState;

  constructor(
    state: TilePipelineState,
    framesTillRemove = 24,
    removalsPerFrame = 4,
  ) {
    this.state = state;
    this.framesTillRemove = framesTillRemove;
    this.removalsThisFrame = removalsPerFrame;
  }

  setParams(frames: number, removals: number) {
    this.framesTillRemove = frames;
    this.removalsThisFrame = removals;
  }

  setFringeTiles(tiles: Set<string>) {
    this.fringeTiles = tiles;
  }

  markPending(key: string) {
    if (this.fringeTiles.has(key)) return;
    if (!this.pendingRemoval.has(key)) {
      this.pendingRemoval.set(key, this.framesTillRemove);
    }
  }

  cancelPending(key: string) {
    this.pendingRemoval.delete(key);
  }

  isPending(key: string): boolean {
    return this.pendingRemoval.has(key);
  }

  markAllForRemoval() {
    for (const key of this.state.visibleTiles) {
      if (!this.fringeTiles.has(key)) this.markPending(key);
    }
  }

  process() {
    let removed = 0;
    const next = new Map<string, number>();

    for (const [key, framesLeft] of this.pendingRemoval.entries()) {
      if (isFallbackTile(key, this.state.fallbackLayer)) {
        // Use the robust coverage check!
        if (
          !isTileCoveredByOpaqueChildren(
            key,
            this.state.visibleTiles,
            this.state.tileCache,
          )
        ) {
          next.set(key, framesLeft);
          continue;
        }
      }

      if (framesLeft <= 1 && removed < this.removalsThisFrame) {
        const mesh = this.state.tileCache.get(key);
        if (mesh) {
          if ((window as any).enableTileFade) {
            fadeOutTileMesh(mesh, 350, () => {
              this.state.tileGroup.remove(mesh);
              this.state.visibleTiles.delete(key);
              this.state.tileCache.delete(key);
            });
          } else {
            this.state.tileGroup.remove(mesh);
            this.state.visibleTiles.delete(key);
            this.state.tileCache.delete(key);
          }
        } else {
          this.state.visibleTiles.delete(key);
          this.state.tileCache.delete(key);
        }
        removed++;
      } else {
        next.set(key, framesLeft - 1);
      }
      if (removed >= this.removalsThisFrame) break;
    }
    for (const [key, framesLeft] of this.pendingRemoval.entries()) {
      if (!next.has(key) && !this.state.visibleTiles.has(key)) {
        next.set(key, framesLeft - 1);
      }
    }
    this.pendingRemoval = next;
  }

  clear() {
    this.pendingRemoval.clear();
  }
}

// Only remove fallback if *all* 4 children are loaded, visible, and opaque.
function isTileCoveredByOpaqueChildren(
  key: string,
  visibleTiles: Set<string>,
  tileCache: TileMeshCache,
): boolean {
  const [zStr, xStr, yStr] = key.split("/");
  const z = Number(zStr);
  const x = Number(xStr);
  const y = Number(yStr);
  const childZ = z + 1;
  const children = [
    `${childZ}/${x * 2}/${y * 2}`,
    `${childZ}/${x * 2 + 1}/${y * 2}`,
    `${childZ}/${x * 2}/${y * 2 + 1}`,
    `${childZ}/${x * 2 + 1}/${y * 2 + 1}`,
  ];
  return children.every((childKey) => {
    if (!visibleTiles.has(childKey)) return false;
    const mesh = tileCache.get(childKey);
    if (!mesh) return false;
    // Require fully opaque (opacity == 1)
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    return mats.every(
      (m) => (m as any).opacity === undefined || (m as any).opacity >= 0.99,
    );
  });
}

function isFallbackTile(key: string, fallbackLayer: number): boolean {
  const [zStr] = key.split("/");
  const z = Number(zStr);
  return z <= fallbackLayer;
}
