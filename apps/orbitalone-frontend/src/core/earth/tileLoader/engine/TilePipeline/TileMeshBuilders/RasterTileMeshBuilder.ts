/**
 * @file builders/RasterTileMeshBuilder.ts
 * @description Builds a Three.js Mesh for a raster tile using image URLs (e.g. Sentinel-2).
 */

import {
  BufferGeometry,
  BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  CanvasTexture,
  LinearMipMapLinearFilter,
  LinearFilter,
  FrontSide,
} from "three";

import { tileToLatLonBounds } from "../../utils/bounds/tileToBounds";
import { latLonToUnitVector } from "../../utils/geo/latLonToVector";
import { TileRenderOptions } from "../TilePipelineStore";

/**
 * Entry point: builds a full mesh for a raster tile.
 */
export async function createRasterTileMesh(
  options: TileRenderOptions
): Promise<Mesh> {
  const geometry = buildTileGeometry(options);
  const texture = await loadTileTexture(options);
  const material = createTileMaterial(texture, options.z);
  return assembleMesh(geometry, material);
}

/**
 * Builds a BufferGeometry from the tile's spherical bounds.
 */
function buildTileGeometry(options: TileRenderOptions): BufferGeometry {
  const { x, y, z, radius = 1 } = options;
  const { latMin, latMax, lonMin, lonMax } = tileToLatLonBounds(x, y, z);

  const subdivisions = getSubdivisionCount(z);
  const latStep = (latMax - latMin) / subdivisions;
  const lonStep = (lonMax - lonMin) / subdivisions;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= subdivisions; i++) {
    const lat = latMax - i * latStep;
    for (let j = 0; j <= subdivisions; j++) {
      const lon = lonMin + j * lonStep;
      const vertex = latLonToUnitVector(lat, lon).multiplyScalar(radius);
      positions.push(vertex.x, vertex.y, vertex.z);
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
    new BufferAttribute(new Float32Array(positions), 3)
  );
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

/**
 * Loads the tile image and returns a CanvasTexture.
 */
async function loadTileTexture(
  options: TileRenderOptions
): Promise<CanvasTexture> {
  const { x, y, z, urlTemplate, onTextureLoaded } = options;
  const url = urlTemplate
    .replace("{z}", z.toString())
    .replace("{x}", x.toString())
    .replace("{y}", y.toString());

  const response = await fetch(url);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob, { imageOrientation: "flipY" });

  const texture = new CanvasTexture(bitmap);
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipMapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;

  if (onTextureLoaded) onTextureLoaded(texture);
  return texture;
}

/**
 * Creates a material with the loaded texture, configuring opacity for LOD blending.
 */
function createTileMaterial(
  texture: CanvasTexture,
  zoom: number
): MeshBasicMaterial {
  const isHighRes = zoom > 3;

  return new MeshBasicMaterial({
    map: texture,
    side: FrontSide,
    transparent: isHighRes,
    opacity: 0,
    depthWrite: false,
  });
}

/**
 * Combines geometry + material into a mesh with delayed visibility.
 */
function assembleMesh(
  geometry: BufferGeometry,
  material: MeshBasicMaterial
): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = 1;
  mesh.visible = false;

  setTimeout(() => {
    mesh.visible = true;
  }, 50); // ~1 frame delay

  return mesh;
}

/**
 * Determines how finely a tile mesh is subdivided.
 */
function getSubdivisionCount(zoom: number): number {
  if (zoom <= 8) return 12;
  if (zoom === 9) return 8;
  return 6;
}
