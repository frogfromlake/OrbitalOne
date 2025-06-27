/**
 * @file engine/TileLayer/TilePipeline/TileStickyManager.ts
 * @description Handles "sticky parent" tile logic: parent tiles are only removed (with fade) after all 4 children loaded.
 */
import { Mesh } from "three";
import { getParentTileKey } from "../utils/geo/tileIndexing";
import { fadeOutTileMesh } from "./TileFading";

type StickyCallbacks = {
  onParentRemoval?: (parentKey: string, mesh: Mesh) => void;
};

export class TileStickyManager {
  private parentToChildren = new Map<string, Set<string>>();
  private childToParent = new Map<string, string>();
  private fallbackLayer: number;

  constructor(
    private cache: Map<string, Mesh>,
    private visibleTiles: Set<string>,
    private opts: StickyCallbacks = {},
    fallbackLayer: number
  ) {
    this.fallbackLayer = fallbackLayer;
  }

  /** Called whenever a child tile finishes loading/fading in. */
  onTileLoaded(childKey: string, z: number, x: number, y: number) {
    const parentKey = getParentTileKey(z, x, y, this.fallbackLayer);
    if (!parentKey) return;

    // Register relationship
    this.childToParent.set(childKey, parentKey);

    let loadedChildren = this.parentToChildren.get(parentKey);
    if (!loadedChildren) {
      loadedChildren = new Set();
      this.parentToChildren.set(parentKey, loadedChildren);
    }
    loadedChildren.add(childKey);

    // Compute the 4 canonical children keys of this parent
    const [pz, px, py] = parentKey.split("/").map(Number);
    const cz = pz + 1;
    const childKeys = [
      `${cz}/${px * 2}/${py * 2}`,
      `${cz}/${px * 2 + 1}/${py * 2}`,
      `${cz}/${px * 2}/${py * 2 + 1}`,
      `${cz}/${px * 2 + 1}/${py * 2 + 1}`,
    ];

    // Only fade out/remove parent if ALL 4 children are loaded
    const allLoaded = childKeys.every((k) => loadedChildren.has(k));
    if (allLoaded) {
      const parentMesh = this.cache.get(parentKey);
      if (parentMesh) {
        const fadeMs =
          typeof window !== "undefined" && (window as any).tileFadeDuration
            ? (window as any).tileFadeDuration
            : 400; // default 400ms

        if ((window as any).enableTileFade) {
          fadeOutTileMesh(parentMesh, fadeMs, () => {
            if (parentMesh.parent) parentMesh.parent.remove(parentMesh);
            this.visibleTiles.delete(parentKey);
            this.opts.onParentRemoval?.(parentKey, parentMesh);
          });
        } else {
          if (parentMesh.parent) parentMesh.parent.remove(parentMesh);
          this.visibleTiles.delete(parentKey);
          this.opts.onParentRemoval?.(parentKey, parentMesh);
        }
      }
      // Clean up
      this.parentToChildren.delete(parentKey);
      childKeys.forEach((k) => this.childToParent.delete(k));
    }
  }

  clear() {
    this.parentToChildren.clear();
    this.childToParent.clear();
  }
}
