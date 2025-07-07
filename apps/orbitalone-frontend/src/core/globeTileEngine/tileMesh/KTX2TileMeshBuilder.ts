/**
 * @file src/globeTileEngine/tileMesh/KTX2TileMeshBuilder.ts
 * @description Tile mesh generator for .ktx2 GPU-compressed texture tiles.
 * Requires a WebGLRenderer instance for format decoding support.
 * Assumes flipped Y layout typical of some encoding pipelines.
 */

import {
  BufferGeometry,
  BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  LinearFilter,
  WebGLRenderer,
  FrontSide,
} from "three";
import { latLonToUnitVectorFlipped } from "../utils/geo/latLonToVector";
import { tileToLatLonBounds } from "../utils/bounds/tileToBounds";
import { type TileRenderOptions } from "../stores/TilePipelineStore";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";

let ktx2Loader: KTX2Loader | null = null;

/**
 * Initializes a singleton instance of KTX2Loader.
 * Detects support for GPU compression formats using the given WebGL renderer.
 */
function getKTX2Loader(renderer: WebGLRenderer): KTX2Loader {
  if (!ktx2Loader) {
    ktx2Loader = new KTX2Loader()
      .setTranscoderPath("/basis/")
      .detectSupport(renderer);
  }
  return ktx2Loader;
}

/**
 * Creates a mesh for a single KTX2 tile.
 * Requires `renderer` to decode compressed textures correctly.
 * @param options TileRenderOptions with renderer and KTX2 tile coordinates
 * @returns Promise resolving to a Three.js Mesh
 */
export async function createTileMeshKTX2(
  options: TileRenderOptions,
): Promise<Mesh> {
  const {
    x,
    y,
    z,
    urlTemplate,
    radius = 1,
    onTextureLoaded,
    renderer,
  } = options;

  if (!renderer) {
    throw new Error("WebGLRenderer is required for KTX2 tiles");
  }

  const bounds = tileToLatLonBounds(x, y, z);
  const { latMin, latMax, lonMin, lonMax } = bounds;

  const subdivisions = 12;
  const latStep = (latMax - latMin) / subdivisions;
  const lonStep = (lonMax - lonMin) / subdivisions;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= subdivisions; i++) {
    const lat = latMax - i * latStep;
    for (let j = 0; j <= subdivisions; j++) {
      const lon = lonMin + j * lonStep;
      const v = latLonToUnitVectorFlipped(lat, lon).multiplyScalar(radius);
      positions.push(v.x, v.y, v.z);
      uvs.push(j / subdivisions, 1 - i / subdivisions);
    }
  }

  for (let i = 0; i < subdivisions; i++) {
    for (let j = 0; j < subdivisions; j++) {
      const a = i * (subdivisions + 1) + j;
      const b = a + subdivisions + 1;
      indices.push(a, b, a + 1);
      indices.push(b, b + 1, a + 1);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(positions), 3),
  );
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const url = urlTemplate
    .replace("{z}", z.toString())
    .replace("{x}", x.toString())
    .replace("{y}", y.toString());

  const texture = await getKTX2Loader(renderer).loadAsync(url);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 4;

  if (onTextureLoaded) onTextureLoaded(texture);

  return new Mesh(
    geometry,
    new MeshBasicMaterial({ map: texture, side: FrontSide }),
  );
}
