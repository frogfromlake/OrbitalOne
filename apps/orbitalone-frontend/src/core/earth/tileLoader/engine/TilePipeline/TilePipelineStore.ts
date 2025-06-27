/**
 * @file engine/TileLayer/TilePipeline/TilePipelineTypes.ts
 * @description
 */

import type {
  PerspectiveCamera,
  Mesh,
  Group,
  WebGLRenderer,
  Texture,
  Scene,
} from "three";
import type { TileMeshCache } from "./TileMeshCache";
import { TaskQueue } from "./TaskQueue";
import { TileStickyManager } from "./TileStickyManager";

// Global Debug Flags (defined once globally, accessed directly from window)
declare global {
  interface Window {
    enableFrustumCulling: boolean;
    enableDotProductFiltering: boolean;
    enableScreenSpacePrioritization: boolean;
    enableCaching: boolean;
    debugSpiralBounds: boolean;
    enableTileFade: boolean;
    enableStickyTiles: boolean;
    // Extend with additional flags as needed
  }
}

export interface TileEngineConfig {
  enableFrustumCulling: boolean;
  enableDotProductFiltering: boolean;
  enableScreenSpacePrioritization: boolean;
  enableCaching: boolean;
  debugSpiralBounds: boolean;
  enableTileFade: boolean;
  enableStickyTiles: boolean;
  enableTilePrewarm?: boolean;
  prewarmCount?: number;
}

export interface GlobeTileEngineOptions {
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  scene: Scene;
  urlTemplate: string;
  createTileMesh: CreateTileMeshFn;
  minZoom: number;
  maxZoom: number;
  getRadiusForZoom?: (z: number) => number;
  config?: TileEngineConfig;
}

export interface TileVisualPipelineLayer {
  group: Group;
  updateTiles: () => void;
  clear: () => void;
  loadTiles: () => Promise<void>;
  loadAllTiles: (concurrencyLimit?: number) => Promise<void>;
  // add other lifecycle methods as needed
}

// Tile Candidate type shared across pipeline stages
export interface TileCandidate {
  x: number;
  y: number;
  z: number;
  key: string;
  screenDist: number;
}

// Options used to create/render tile meshes
export interface TileRenderOptions {
  x: number;
  y: number;
  z: number;
  urlTemplate: string;
  radius?: number;
  renderer?: WebGLRenderer;
  onTextureLoaded?: (texture: Texture) => void;
  fallbackLayer?: number;
}

// Function type for creating tile meshes (e.g., RasterTile, KTX2Tile)
export type CreateTileMeshFn = (options: TileRenderOptions) => Promise<Mesh>;

// Centralized Pipeline State
export interface TilePipelineState {
  renderer: WebGLRenderer;
  camera: PerspectiveCamera;
  candidates: TileCandidate[];
  visibleCandidates: TileCandidate[];
  prioritizedTiles: TileCandidate[];
  queue: TileCandidate[];
  loadedTiles: Map<string, Mesh>;
  stickyTiles: Set<string>;
  visibleTiles: Set<string>;
  tileGroup: Group;
  tileCache: TileMeshCache;
  taskQueue: TaskQueue;
  stickyManager: TileStickyManager;
  createTileMesh: CreateTileMeshFn;
  urlTemplate: string;
  radius: number;
  revision: number;
  fallbackLayer: number;
  parentChildrenLoaded: Map<string, Set<string>>;
}

// Initialization helper for Pipeline State
export function initializeTilePipelineState(
  renderer: WebGLRenderer,
  camera: PerspectiveCamera,
  tileGroup: Group,
  tileCache: TileMeshCache,
  stickyManager: TileStickyManager,
  createTileMesh: CreateTileMeshFn,
  urlTemplate: string,
  radius: number,
  fallbackLayer: number,
  taskQueue?: TaskQueue
): TilePipelineState {
  return {
    renderer,
    camera,
    candidates: [],
    visibleCandidates: [],
    prioritizedTiles: [],
    queue: [],
    loadedTiles: new Map(),
    stickyTiles: new Set(),
    visibleTiles: new Set(),
    tileGroup,
    tileCache,
    stickyManager,
    createTileMesh,
    urlTemplate,
    radius,
    revision: 0,
    taskQueue: taskQueue ?? new TaskQueue(),
    fallbackLayer,
    parentChildrenLoaded: new Map<string, Set<string>>(),
  };
}
