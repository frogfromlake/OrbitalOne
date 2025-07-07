// src/globeTileEngine/tilePipeline/tilePipelineSteps/TileFading.ts

import { Material, Mesh, MeshBasicMaterial } from "three";

// Helper: applies callback to all materials (handles arrays)
function forEachMaterial(mesh: Mesh, fn: (mat: Material) => void) {
  if (Array.isArray(mesh.material)) {
    mesh.material.forEach(fn);
  } else if (mesh.material) {
    fn(mesh.material);
  }
}

export function fadeInTileMesh(
  mesh: Mesh,
  duration = 400,
  callback?: () => void,
) {
  mesh.visible = true;
  forEachMaterial(mesh, (mat) => {
    if ("opacity" in mat && "transparent" in mat) {
      (mat as MeshBasicMaterial).transparent = true;
      (mat as MeshBasicMaterial).opacity = 0;
    }
  });

  const start = performance.now();
  function animate(now: number) {
    const t = Math.min(1, (now - start) / duration);
    forEachMaterial(mesh, (mat) => {
      if ("opacity" in mat && "transparent" in mat) {
        (mat as MeshBasicMaterial).opacity = t;
      }
    });
    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      forEachMaterial(mesh, (mat) => {
        if ("opacity" in mat && "transparent" in mat) {
          (mat as MeshBasicMaterial).opacity = 1;
          (mat as MeshBasicMaterial).transparent = true;
        }
      });
      callback?.();
    }
  }
  requestAnimationFrame(animate);
}

export function fadeOutTileMesh(
  mesh: Mesh,
  duration = 400,
  callback?: () => void,
) {
  forEachMaterial(mesh, (mat) => {
    if ("opacity" in mat && "transparent" in mat) {
      (mat as MeshBasicMaterial).transparent = true;
      (mat as MeshBasicMaterial).opacity = 1;
    }
  });

  const start = performance.now();
  function animate(now: number) {
    const t = Math.min(1, (now - start) / duration);
    forEachMaterial(mesh, (mat) => {
      if ("opacity" in mat && "transparent" in mat) {
        (mat as MeshBasicMaterial).opacity = 1 - t;
      }
    });
    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      forEachMaterial(mesh, (mat) => {
        if ("opacity" in mat && "transparent" in mat) {
          (mat as MeshBasicMaterial).opacity = 0;
        }
      });
      if (mesh.parent) mesh.parent.remove(mesh);
      callback?.();
    }
  }
  requestAnimationFrame(animate);
}
