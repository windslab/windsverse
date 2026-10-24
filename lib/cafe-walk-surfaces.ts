import * as THREE from 'three';
/** Fill the small open joint between the exported stair flight and its landing. */
export function addCafeWalkSurfaces(cafe: THREE.Object3D) {
  const material = new THREE.MeshStandardMaterial({ color: '#b6b0a0', roughness: 0.9 });
  const landing = new THREE.Mesh(new THREE.BoxGeometry(0.57, 0.045, 1.43), material);
  landing.name = 'floor_navigation_stair_landing';
  landing.position.set(2.275, 0.971, 1.77);
  cafe.add(landing);
  const step = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.19, 0.6), material);
  step.name = 'floor_navigation_outdoor_step';
  step.position.set(-0.98, 2.16, 2.58);
  cafe.add(step);
  cafe.updateWorldMatrix(true, true);
  return () => {
    landing.removeFromParent();
    step.removeFromParent();
    landing.geometry.dispose();
    step.geometry.dispose();
    material.dispose();
  };
}
