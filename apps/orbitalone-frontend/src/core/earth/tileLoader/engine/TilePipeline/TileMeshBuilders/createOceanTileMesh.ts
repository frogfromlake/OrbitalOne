import {
  BufferGeometry,
  BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  FrontSide,
} from "three";
import { tileToLatLonBounds } from "../../utils/bounds/tileToBounds";
import { latLonToUnitVector } from "../../utils/geo/latLonToVector";
import { TileRenderOptions } from "../TilePipelineStore";

// NOT IN USE: This function is not used in the current codebase. Stored for future reference or potential use in ocean tile rendering.

/**
 * Builds a solid blue mesh for an ocean tile.
 */
export function createOceanTileMesh(options: TileRenderOptions): Mesh {
  const { x, y, z, radius = 1 } = options;
  const { latMin, latMax, lonMin, lonMax } = tileToLatLonBounds(x, y, z);

  // Use the same geometry logic for perfect globe alignment!
  const subdivisions = z <= 8 ? 12 : z === 9 ? 8 : 6;
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

  const material = new MeshBasicMaterial({
    color: 0x1464a0, // Cesium/Google ocean blue
    side: FrontSide,
    transparent: false,
    depthWrite: true,
  });

  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = 0;
  mesh.visible = true;

  return mesh;
}
