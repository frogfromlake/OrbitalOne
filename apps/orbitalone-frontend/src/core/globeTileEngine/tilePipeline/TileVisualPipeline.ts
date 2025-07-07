/**
 * @file src/globeTileEngine/tilePipeline/TileVisualPipeline.ts
 * @description Tile pipeline orchestrator: runs all tile pipeline stages for a single zoom layer.
 */
import { CandidateGenerator } from "./tilePipelineSteps/CandidateGenerator";
import type { Group, WebGLRenderer, PerspectiveCamera } from "three";
import { Prioritizer } from "./tilePipelineSteps/Prioritizer";
import { VisibilityFilter } from "./tilePipelineSteps/VisibilityFilter";
import { Cleanup } from "./tilePipelineSteps/Cleanup";
import { Loader } from "./tilePipelineSteps/Loader";
import { TaskQueue } from "./tilePipelineSteps/TaskQueue";
import { latLonToUnitVector } from "../utils/geo/latLonToVector";
import { TileMeshCache } from "./tilePipelineSteps/TileMeshCache";
import {
  type TileVisualPipelineLayer,
  type TilePipelineState,
  type TileEngineConfig,
  type CreateTileMeshFn,
  initializeTilePipelineState,
} from "../stores/TilePipelineStore";
import { tileToLatLonBounds } from "../utils/bounds/tileToBounds";
import { getCameraCenterDirection } from "../utils/camera/cameraUtils";
import { runConcurrent } from "../utils/concurrency/runConcurrent";
import { TilePrewarmer } from "./tilePipelineSteps/TilePrewarmer";
import { TileRemover } from "./tilePipelineSteps/TileRemover";

export class TileVisualPipeline implements TileVisualPipelineLayer {
  private state: TilePipelineState;
  private config: TileEngineConfig;

  private candidateGen = new CandidateGenerator();
  private visibilityFilter = new VisibilityFilter();
  private prioritizer = new Prioritizer();
  private loader = new Loader();
  private cleanup = new Cleanup();
  private prewarmer = new TilePrewarmer();
  private tileRemover: TileRemover;

  private readonly z: number = 0;

  constructor(
    renderer: WebGLRenderer,
    camera: PerspectiveCamera,
    tileGroup: Group,
    tileCache: TileMeshCache,
    createTileMesh: CreateTileMeshFn,
    urlTemplate: string,
    radius: number,
    config: TileEngineConfig,
    visibleTiles: Set<string>,
    taskQueue: TaskQueue,
    z: number,
    fallbackLayer: number,
  ) {
    this.config = config;
    this.z = z;
    this.state = initializeTilePipelineState(
      renderer,
      camera,
      tileGroup,
      tileCache,
      createTileMesh,
      urlTemplate,
      radius,
      fallbackLayer,
      taskQueue,
    );
    this.state.visibleTiles = visibleTiles; // Share global visible set
    this.state.revision = 0;
    this.tileRemover = new TileRemover(this.state);
  }

  /**
   * Main pipeline execution for this zoom level.
   */
  public update(): void {
    // Always sort all candidates by screenDist!
    this.state.taskQueue.filterCurrentZoomAndRevision(
      this.z,
      this.state.revision,
    );
    this.state.taskQueue.filterCurrentZoomAndRevision(
      this.z,
      this.state.revision,
    );

    this.candidateGen.run(this.state, this.z);

    // Sort candidates by screenDist (closest-to-center first)
    if (Array.isArray(this.state.candidates)) {
      this.state.candidates.sort((a, b) => a.screenDist - b.screenDist);
    }
    if (Array.isArray(this.state.visibleCandidates)) {
      this.state.visibleCandidates.sort((a, b) => a.screenDist - b.screenDist);
    }
    if (Array.isArray(this.state.prioritizedTiles)) {
      this.state.prioritizedTiles.sort((a, b) => a.screenDist - b.screenDist);
    }

    this.visibilityFilter.run(this.state, this.config, this.z);
    this.prioritizer.run(this.state, this.z);
    this.prewarmer.run(this.state, this.config);

    if (this.tileRemover) {
      const visibleThisFrame = new Set(
        this.state.visibleCandidates.map((c) => c.key),
      );

      for (const key of this.state.visibleTiles) {
        const isVisible = visibleThisFrame.has(key);
        const isPending = this.tileRemover.isPending(key);
        const isQueued = this.state.prioritizedTiles?.some(
          (c) => c.key === key,
        );

        if (!isVisible && !isPending && !isQueued) {
          this.tileRemover.markPending(key);
        }
      }
      for (const key of visibleThisFrame) {
        this.tileRemover.cancelPending(key);
      }
      this.tileRemover.process();
    }

    this.loader.run(this.state, this.z);
    this.cleanup.run(this.state);
  }

  public async loadTiles(): Promise<void> {
    this.update();
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }

  public clear(): void {
    this.state.tileGroup.clear();
    this.state.loadedTiles.clear();
    // Clean up global visibleTiles only for this layer's tiles
    for (const key of this.state.loadedTiles.keys()) {
      this.state.visibleTiles.delete(key);
    }
  }

  public get group(): Group {
    return this.state.tileGroup;
  }

  public updateTiles(): void {
    this.update();
  }

  public async loadAllTiles(concurrencyLimit = 24): Promise<void> {
    const z = this.z;
    const tileCount = 2 ** z;

    const cameraDirection = getCameraCenterDirection(this.state.camera);

    const tileTasks: {
      x: number;
      y: number;
      key: string;
      screenDist: number;
    }[] = [];

    for (let x = 0; x < tileCount; x++) {
      for (let y = 0; y < tileCount; y++) {
        const key = `${z}/${x}/${y}`;
        if (this.state.tileCache.has(key)) {
          const cached = this.state.tileCache.get(key);
          if (cached && !this.state.tileGroup.children.includes(cached)) {
            this.state.tileGroup.add(cached);
            this.state.visibleTiles.add(key);
          }
          continue;
        }
        // Estimate center for screenDist prioritization
        const bounds = tileToLatLonBounds(x, y, z);
        const lat = (bounds.latMin + bounds.latMax) / 2;
        const lon = (bounds.lonMin + bounds.lonMax) / 2;
        const tileDir = latLonToUnitVector(lat, lon);
        const screenDist = 1 - cameraDirection.dot(tileDir);

        tileTasks.push({ x, y, key, screenDist });
      }
    }

    // Closest to camera center loads first
    tileTasks.sort((a, b) => a.screenDist - b.screenDist);

    const taskFns = tileTasks.map(({ x, y, key }) => async () => {
      try {
        const mesh = await this.state.createTileMesh({
          x,
          y,
          z,
          urlTemplate: this.state.urlTemplate,
          radius: this.state.radius,
          renderer: this.state.renderer,
          fallbackLayer: this.state.fallbackLayer,
        });
        mesh.visible = true;
        this.state.tileGroup.add(mesh);
        this.state.tileCache.set(key, mesh);
        this.state.visibleTiles.add(key);
      } catch (err) {
        console.warn(`❌ Failed to load fallback tile ${key}`, err);
      }
    });

    await runConcurrent(taskFns, concurrencyLimit);
  }

  public getTileRemover(): TileRemover {
    return this.tileRemover;
  }
}
