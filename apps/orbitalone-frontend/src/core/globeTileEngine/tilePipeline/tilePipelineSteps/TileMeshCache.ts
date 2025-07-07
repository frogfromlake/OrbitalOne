/**
 * @file src/globeTileEngine/tilePipeline/tilePipelineSteps/TileMeshCache.ts
 * @description LRU cache for managing and recycling Three.js Meshes used for raster or KTX2 tile rendering.
 */

import type { Mesh } from "three";

/**
 * A fixed-size in-memory cache for tile meshes.
 * Automatically evicts the least-recently-used mesh when full.
 * Removes meshes from their parent scene upon eviction.
 */
export class TileMeshCache {
  private readonly maxSize: number;
  private cache: Map<string, Mesh> = new Map();

  constructor(maxSize = 256) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  /**
   * Checks if a tile mesh exists in the cache.
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Retrieves a cached tile mesh by key and refreshes its LRU position.
   */
  get(key: string): Mesh | undefined {
    const mesh = this.cache.get(key);
    if (!mesh) return undefined;

    // Refresh LRU order
    this.cache.delete(key);
    this.cache.set(key, mesh);
    return mesh;
  }

  /**
   * Stores a tile mesh in the cache and evicts the least-used if over capacity.
   */
  set(key: string, mesh: Mesh): void {
    if (this.cache.has(key)) {
      this.cache.delete(key); // Refresh order
    }
    this.cache.set(key, mesh);

    if (this.cache.size > this.maxSize) {
      this.evictOldest();
    }
  }

  /**
   * Deletes a tile mesh and removes it from the scene graph.
   */
  delete(key: string): void {
    const mesh = this.cache.get(key);
    if (mesh?.parent) {
      mesh.parent.remove(mesh);
    }
    this.cache.delete(key);
  }

  /**
   * Clears the entire cache and removes all meshes from the scene.
   */
  clear(): void {
    for (const mesh of this.cache.values()) {
      if (mesh.parent) {
        mesh.parent.remove(mesh);
      }
    }
    this.cache.clear();
  }

  /**
   * Returns the current number of cached tile meshes.
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Returns the keys of all currently cached meshes.
   */
  keys(): IterableIterator<string> {
    return this.cache.keys();
  }

  /**
   * Evicts the least recently used mesh from the cache and from the scene.
   */
  private evictOldest(): void {
    const oldestKey = this.cache.keys().next().value;
    if (!oldestKey) return;

    const oldestMesh = this.cache.get(oldestKey);
    if (oldestMesh?.parent) {
      oldestMesh.parent.remove(oldestMesh);
    }
    this.cache.delete(oldestKey);
  }

  public getInternalMap(): Map<string, Mesh> {
    return this.cache;
  }
}
