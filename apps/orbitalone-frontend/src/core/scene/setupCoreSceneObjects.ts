import {
  Mesh,
  MeshBasicMaterial,
  Scene,
  SphereGeometry,
  Group,
  Object3DEventMap,
  ShaderMaterial,
} from "three";

import { CONFIG } from "@/configs/config";
import {
  earthFragmentShader,
  earthVertexShader,
} from "@/core/earth/shaders/earthShaders";
import { countryLabelGroup } from "@/core/earth/interactivity/countryLabels3D";
import { oceanLabelGroup } from "@/core/earth/interactivity/oceanLabel3D";

/**
 * Sets up the core globe, raycast mesh, and tilt group (with borders and labels).
 */
export function setupCoreSceneObjects(
  scene: Scene,
  uniforms: { [key: string]: any }
): {
  globe: Mesh;
  globeRaycastMesh: Mesh;
  tiltGroup: Group<Object3DEventMap>;
} {
  const globeGeometry = new SphereGeometry(
    CONFIG.globe.radius,
    CONFIG.globe.widthSegments,
    CONFIG.globe.heightSegments
  );

  const globeMaterial = new ShaderMaterial({
    uniforms,
    vertexShader: earthVertexShader,
    fragmentShader: earthFragmentShader,
  });

  const globe = new Mesh(globeGeometry, globeMaterial);
  globe.renderOrder = 2;
  globe.visible = true;
  const raycastGeometry = new SphereGeometry(CONFIG.globe.radius, 32, 32);
  const globeRaycastMesh = new Mesh(
    raycastGeometry,
    new MeshBasicMaterial({ visible: false })
  );

  const tiltGroup = new Group();
  tiltGroup.add(globe, globeRaycastMesh, countryLabelGroup, oceanLabelGroup);

  // Ensure label groups render on top of everything
  countryLabelGroup.renderOrder = 5;
  oceanLabelGroup.renderOrder = 5;

  scene.add(tiltGroup);

  return { globe, globeRaycastMesh, tiltGroup };
}
