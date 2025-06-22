/**
 * @file test/testTileEngineScene.ts
 * @description Entry point for testing the GlobeTileEngine in a standalone Three.js scene.
 */

import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  AmbientLight,
  DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Color,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

import { GlobeTileEngine } from "../engine/GlobeTileEngine";
import {
  CreateTileMeshFn,
  TileEngineConfig,
} from "../engine/TilePipeline/TilePipelineStore";
import { createTileMeshKTX2 } from "../engine/TilePipeline/TileMeshBuilders/KTX2TileMeshBuilder";
import { createRasterTileMesh } from "../engine/TilePipeline/TileMeshBuilders/RasterTileMeshBuilder";

// -------------------------------------------------------------
// Configuration
// -------------------------------------------------------------
const useKTX2 = false;

const tileUrlTemplate = useKTX2
  ? "https://orbitalone-tiles.b-cdn.net/day/{z}/{x}/{y}.ktx2"
  : `${
      import.meta.env.VITE_TILE_PROXY_URL || "http://localhost:8080"
    }/tile/{z}/{x}/{y}`;

const createTileMeshFn: CreateTileMeshFn = useKTX2
  ? createTileMeshKTX2
  : createRasterTileMesh;

const debugTileEngineConfig: TileEngineConfig = {
  get enableFrustumCulling() {
    return window.enableFrustumCulling;
  },
  get enableDotProductFiltering() {
    return window.enableDotProductFiltering;
  },
  get enableScreenSpacePrioritization() {
    return window.enableScreenSpacePrioritization;
  },
  get enableCaching() {
    return window.enableCaching;
  },
  get debugSpiralBounds() {
    return window.debugSpiralBounds;
  },
  get enableTileFade() {
    return window.enableTileFade;
  },
  get enableStickyTiles() {
    return window.enableStickyTiles;
  },
};

// -------------------------------------------------------------
// Scene Setup
// -------------------------------------------------------------
function setupScene(): Scene {
  const scene = new Scene();
  scene.background = new Color(0x000000);

  const ambient = new AmbientLight(0xffffff, 0.8);
  const directional = new DirectionalLight(0xffffff, 0.6);
  directional.position.set(3, 2, 1);

  scene.add(ambient, directional);

  const wireframe = new Mesh(
    new SphereGeometry(1, 128, 128),
    new MeshBasicMaterial({
      color: 0x444444,
      wireframe: true,
      opacity: 0.3,
      transparent: true,
    })
  );
  wireframe.visible = false;
  scene.add(wireframe);

  return scene;
}

function setupCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.0001,
    100
  );
  camera.position.set(0, 0, 3.0);
  return camera;
}

function setupRenderer(): WebGLRenderer {
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  return renderer;
}

function setupControls(
  camera: PerspectiveCamera,
  renderer: WebGLRenderer
): OrbitControlsWithEvents {
  const controls = new OrbitControls(
    camera,
    renderer.domElement
  ) as OrbitControlsWithEvents;
  controls.enableDamping = true;
  controls.minDistance = 1.00028;
  controls.maxDistance = 10;
  return controls;
}

type OrbitControlsWithEvents = OrbitControls & {
  addEventListener: (type: string, listener: () => void) => void;
  dispatchEvent: (event: { type: "change" }) => void;
};

// -------------------------------------------------------------
// Main Initialization
// -------------------------------------------------------------
const scene = setupScene();
const camera = setupCamera();
const renderer = setupRenderer();
const controls = setupControls(camera, renderer);

const fallbackLayer = undefined as any;
// Dynamic GlobeTileEngine (Z4–Z13)
const tileEngine = new GlobeTileEngine({
  camera,
  renderer,
  scene,
  urlTemplate: tileUrlTemplate,
  createTileMesh: createTileMeshFn,
  minZoom: 3, // Z3 is now handled by the new pipeline!
  maxZoom: 13,
  // fallbackTileManager: undefined as any, // Remove as soon as refactor complete
  config: debugTileEngineConfig,
});

// Debug access
Object.assign(window, {
  fallbackTileManager: fallbackLayer,
  dynamicTileManager: tileEngine,
});

// tileEngine.attachToScene();
// // After attaching to scene, load all Z3 tiles
// const z3Layer = tileEngine.getTileLayers().get(3);
// if (z3Layer && typeof z3Layer.loadAllTiles === "function") {
//   z3Layer.loadAllTiles();
//   z3Layer.group.renderOrder = 0; // Always below dynamic layers
// }

// // All higher LODs should be renderOrder 1
// for (const [z, layer] of tileEngine.getTileLayers()) {
//   if (z > 3) layer.group.renderOrder = 1;
// }

// -------------------------------------------------------------
// OrbitControls & Initial Tile Load
// -------------------------------------------------------------
// let firstUpdateDone = false;
// controls.addEventListener("change", () => {
//   if (!firstUpdateDone) {
//     firstUpdateDone = true;

//     // No fallbackLayer to load. Immediately set renderOrder and start tiles.
//     for (const layer of tileEngine.getTileLayers().values()) {
//       layer.group.renderOrder = 1;
//     }

//     tileEngine.loadInitialTiles();
//   } else {
//     tileEngine.update();
//   }
// });

// -------------------------------------------------------------
// Resize & Animation Loop
// -------------------------------------------------------------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate(): void {
  requestAnimationFrame(animate);

  const distance = Math.max(0.001, camera.position.length() - 1);
  const t = Math.min(distance / 1.5, 1);
  const eased = Math.pow(t, 1.2);

  let slowFactor = 1.0;
  if (distance < 0.005) slowFactor = 0.08;
  else if (distance < 0.01) slowFactor = 0.15;
  else if (distance < 0.02) slowFactor = 0.5;
  else if (distance < 0.03) slowFactor = 0.7;
  else if (distance < 0.05) slowFactor = 0.8;

  controls.zoomSpeed = (1.0 * eased + 0.01) * slowFactor;
  controls.rotateSpeed = (1.0 * eased + 0.01) * slowFactor;

  controls.update();
  renderer.render(scene, camera);
}

// -------------------------------------------------------------
// Main Async Initialization: Make sure fallback tiles are ready before rendering
// -------------------------------------------------------------
(async () => {
  tileEngine.attachToScene();

  // 1. Load Z3 fallback tiles BEFORE rendering/animation!
  const z3Layer = tileEngine.getTileLayers().get(3);
  if (z3Layer && typeof z3Layer.loadAllTiles === "function") {
    // High concurrency for quick load: 24 or more (if supported)
    await z3Layer.loadAllTiles(24); 
    z3Layer.group.renderOrder = 0; // Always below dynamic layers
  }

  // 2. Set renderOrder for all higher LODs
  for (const [z, layer] of tileEngine.getTileLayers()) {
    if (z > 3) layer.group.renderOrder = 1;
  }

  // 3. Now enable controls and animation
  let firstUpdateDone = false;
  controls.addEventListener("change", () => {
    if (!firstUpdateDone) {
      firstUpdateDone = true;
      tileEngine.loadInitialTiles(); // kicks off dynamic LOD loading
    } else {
      tileEngine.update();
    }
  });

  // Initial camera sync & first animation frame
  controls.update();
  controls.dispatchEvent({ type: "change" });
  animate();
})();

// controls.update();
// controls.dispatchEvent({ type: "change" });
// animate();
