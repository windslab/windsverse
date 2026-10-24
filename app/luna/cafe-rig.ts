import * as THREE from 'three';
/** Fit the articulated PS1 Luna (scripts/luna-ps1/model.js) to café scale, standing on y = 0. */
export function lunaCafeRig(model: THREE.Group, height: number) {
  const root = new THREE.Group(),
    bounds = new THREE.Box3().setFromObject(model),
    size = bounds.getSize(new THREE.Vector3()),
    factor = height / size.y;
  model.scale.setScalar(factor);
  model.position.set(
    -bounds.getCenter(new THREE.Vector3()).x * factor,
    -bounds.min.y * factor,
    -bounds.getCenter(new THREE.Vector3()).z * factor,
  );
  root.add(model);
  const names = [
    'Luna_Leg_L',
    'Luna_Leg_R',
    'Luna_Arm_L',
    'Luna_Arm_R',
    'Luna_Elbow_L',
    'Luna_Elbow_R',
    'Luna_Head',
    'Luna_Body',
  ];
  const joints = names.map((name) => {
      const node = model.getObjectByName(name);
      return node ? { node, rest: node.quaternion.clone() } : null;
    }),
    rotation = new THREE.Quaternion(),
    angles = new THREE.Euler();
  const pose = (i: number, x = 0, y = 0, z = 0) => {
    const joint = joints[i];
    if (joint) {
      rotation.setFromEuler(angles.set(x, y, z));
      joint.node.quaternion.copy(joint.rest).multiply(rotation);
    }
  };
  const feet: THREE.Object3D[] = [];
  model.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.castShadow = false;
      node.receiveShadow = true;
      if (/Luna_Leg.*(sole|sneaker|suede)/i.test(node.name)) feet.push(node);
    }
  });
  return {
    root,
    feet,
    update(age: number, stride: number, task: string, reduced: boolean) {
      const working = task === 'preparing',
        carrying = task === 'carrying' || task === 'serving';
      pose(0, stride * 0.5);
      pose(1, -stride * 0.5);
      pose(2, carrying ? -0.65 : working ? -0.5 : -stride * 0.3, 0, 0.05);
      pose(3, carrying ? -0.65 : working ? -0.5 : stride * 0.3, 0, -0.05);
      pose(4, carrying ? -0.45 : working ? -0.45 + (reduced ? 0 : Math.sin(age * 5) * 0.1) : 0);
      pose(5, carrying ? -0.45 : working ? -0.45 + (reduced ? 0 : Math.sin(age * 5 + 1) * 0.1) : 0);
      pose(6, working ? 0.12 : 0, reduced ? 0 : Math.sin(age * 0.65) * 0.025, 0);
      pose(7, 0, 0, reduced ? 0 : Math.sin(age * 1.3) * 0.006);
    },
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>(),
        materials = new Set<THREE.Material>(),
        textures = new Set<THREE.Texture>();
      model.traverse((n) => {
        if (n instanceof THREE.Mesh) {
          geometries.add(n.geometry);
          for (const m of Array.isArray(n.material) ? n.material : [n.material]) {
            materials.add(m);
            for (const v of Object.values(m)) if (v instanceof THREE.Texture) textures.add(v);
          }
        }
      });
      textures.forEach((t) => t.dispose());
      materials.forEach((m) => m.dispose());
      geometries.forEach((g) => g.dispose());
    },
  };
}
