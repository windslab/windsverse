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
  // A concrete step out of the back of the café (behind the reading corner) onto the grass.
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 1.3), material);
  back.name = 'floor_navigation_back_step';
  back.position.set(5.38, 0.03, 2.8);
  cafe.add(back);
  cafe.updateWorldMatrix(true, true);
  return () => {
    landing.removeFromParent();
    step.removeFromParent();
    back.removeFromParent();
    back.geometry.dispose();
    landing.geometry.dispose();
    step.geometry.dispose();
    material.dispose();
  };
}
