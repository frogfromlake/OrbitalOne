/**
 * @file src/globeTileEngine/tilePipeline/GlobeTileEngine.ts
 * @description High-level orchestrator for managing zoom-level-aware tile loading on a 3D globe.
 */

import { Scene, PerspectiveCamera, WebGLRenderer, Group } from "three";
import { estimateZoomLevel } from "../utils/lod/lodFunctions";
import { TileMeshCache } from "./tilePipelineSteps/TileMeshCache";
import {
  type CreateTileMeshFn,
  type GlobeTileEngineOptions,
  type TileEngineConfig,
  type TileVisualPipelineLayer,
  type TileCandidate,
} from "../stores/TilePipelineStore";
import {
  getCameraState,
  cameraStateChanged,
} from "../utils/camera/cameraUtils";
import { TaskQueue } from "./tilePipelineSteps/TaskQueue";
import { TileVisualPipeline } from "./TileVisualPipeline";

/**
 * GlobeTileEngine manages tile loading across zoom levels and responds to camera movement.
 */
export class GlobeTileEngine {
  private readonly config: TileEngineConfig;
  private readonly camera: PerspectiveCamera;
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene | Group;
  private readonly urlTemplate: string;
  private readonly createTileMesh: CreateTileMeshFn;
  private readonly minZoom: number;
  private readonly maxZoom: number;
  private readonly tileLayers: Map<number, TileVisualPipeline>;
  private readonly visibleTiles: Set<string>;
  private currentZoom: number;
  private readonly getRadiusForZoom: (z: number) => number;
  private updateDebounceHandle: number | null = null;
  private lastCameraState: any = null;

  constructor(options: GlobeTileEngineOptions) {
    this.camera = options.camera;
    this.renderer = options.renderer;
    this.scene = options.scene;
    this.urlTemplate = options.urlTemplate;
    this.createTileMesh = options.createTileMesh;
    this.minZoom = options.minZoom;
    this.maxZoom = options.maxZoom;
    this.config = {
      enableFrustumCulling: true,
      enableDotProductFiltering: true,
      enableScreenSpacePrioritization: true,
      enableCaching: true,
      debugSpiralBounds: options.config?.debugSpiralBounds ?? false,
      enableTileFade: options.config?.enableTileFade ?? false,
    };
    this.currentZoom = this.minZoom;
    this.getRadiusForZoom = options.getRadiusForZoom ?? (() => 1);
    this.tileLayers = new Map();
    this.visibleTiles = new Set();
    this.initializeTileLayers();
  }

  private initializeTileLayers(): void {
    for (let z = this.minZoom; z <= this.maxZoom; z++) {
      const group = new Group();
      const cache = new TileMeshCache(512);

      const radius = this.getRadiusForZoom(z);
      const taskQueue = new TaskQueue();
      // Create the pipeline
      const pipeline = new TileVisualPipeline(
        this.renderer,
        this.camera,
        group,
        cache,
        this.createTileMesh,
        this.urlTemplate,
        radius,
        this.config,
        this.visibleTiles,
        taskQueue,
        z,
        this.minZoom
      );

      // Register after construction!
      this.tileLayers.set(z, pipeline);
    }
  }

  /**
   * Adds all tile groups to the scene graph, including fallback.
   */
  public attachToScene(): void {
    for (const layer of this.tileLayers.values()) {
      this.scene.add(layer.group);
    }
    // You may keep fallback for Z3, etc., if needed
    // this.scene.add(this.fallbackManager.group);
  }

  /**
   * Triggers a debounced tile update based on current camera position.
   * Automatically preloads the next zoom level.
   * Ensures all candidate lists are sorted by screenDist (center-priority).
   */
  public update(): void {
    const estimatedZoom = estimateZoomLevel(this.camera);
    const currState = getCameraState(this.camera);

    let shouldIncrementRevision = false;
    if (!this.lastCameraState) {
      shouldIncrementRevision = true;
    } else if (cameraStateChanged(currState, this.lastCameraState)) {
      shouldIncrementRevision = true;
    }
    this.lastCameraState = currState;

    const zoomChanged = estimatedZoom !== this.currentZoom;
    const activeLayer = this.tileLayers.get(estimatedZoom);
    if (!activeLayer) return;

    // --- KEY: Clear all queues and (optionally) caches on zoom change ---
    if (zoomChanged) {
      if (this.updateDebounceHandle !== null) {
        clearTimeout(this.updateDebounceHandle);
        this.updateDebounceHandle = null;
      }
      for (const [z, layer] of this.tileLayers.entries()) {
        (layer as any).state.taskQueue.clear();
        if (z !== estimatedZoom && z !== this.minZoom) {
          (layer as any).state.tileCache.clear?.();
          (layer as any).state.loadedTiles.clear?.();
        }
      }
    }

    if (shouldIncrementRevision || zoomChanged) {
      (activeLayer as any).state.revision++;
      if (zoomChanged && estimatedZoom < this.currentZoom) {
        this.unloadHigherZoomLevels();
      }
      this.currentZoom = estimatedZoom;
    }

    // 1. Clean stale queued tasks (active layer)
    (activeLayer as any).state.taskQueue.filterCurrentZoomAndRevision(
      this.currentZoom,
      (activeLayer as any).state.revision
    );

    // 2. Always sort candidate and prioritized lists by screenDist if present (center first)
    const st = (activeLayer as any).state;

    if (Array.isArray(st.candidates)) {
      st.candidates.sort(
        (a: TileCandidate, b: TileCandidate) => a.screenDist - b.screenDist
      );
    }
    if (Array.isArray(st.visibleCandidates)) {
      st.visibleCandidates.sort(
        (a: TileCandidate, b: TileCandidate) => a.screenDist - b.screenDist
      );
    }
    if (Array.isArray(st.prioritizedTiles)) {
      st.prioritizedTiles.sort(
        (a: TileCandidate, b: TileCandidate) => a.screenDist - b.screenDist
      );
    }

    // 3. Update main and preload next LOD
    activeLayer.updateTiles();

    const preloadLayer = this.tileLayers.get(this.currentZoom + 1);
    if (preloadLayer) {
      preloadLayer.updateTiles();
    }
  }

  /**
   * Preloads the current zoom level's tiles. Call once after scene init.
   */
  public async loadInitialTiles(): Promise<void> {
    this.currentZoom = estimateZoomLevel(this.camera);
    const layer = this.tileLayers.get(this.currentZoom);
    if (layer) {
      await layer.loadTiles();
    }
  }

  /**
   * Clears tile layers above currentZoom to reduce GPU and memory pressure.
   */
  public unloadHigherZoomLevels(): void {
    for (const [z, layer] of this.tileLayers.entries()) {
      if (z > this.currentZoom && z > 3) {
        // Don't hard clear! Instead mark for gentle fade-out
        layer.getTileRemover().setParams(48, 2);
        layer.getTileRemover().markAllForRemoval();
      }
    }
  }

  /**
   * Returns a map of all managed tile layers by zoom level.
   */
  public getTileLayers(): Map<number, TileVisualPipelineLayer> {
    return this.tileLayers;
  }

  public forEachTileGroup(cb: (group: Group, z: number) => void): void {
    for (const [z, layer] of this.tileLayers.entries()) {
      cb(layer.group, z);
    }
  }
}
