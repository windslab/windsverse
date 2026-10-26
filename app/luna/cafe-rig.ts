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
  // Hip height above the soles (for sitting on a seat surface).
  model.updateWorldMatrix(true, true);
  const hipJoint = model.getObjectByName('Luna_Leg_L'),
    hip = hipJoint ? hipJoint.getWorldPosition(new THREE.Vector3()).y : height * 0.4;
  // Hands: the centre of each hand mesh, for props to sit in Luna's grip.
  const hands = (['R', 'L'] as const).map((side) => {
    const mesh = model.getObjectByName(`Luna_Wrist_${side}_hand`) as THREE.Mesh | undefined;
    if (!mesh) return null;
    mesh.geometry.computeBoundingBox();
    return { mesh, centre: mesh.geometry.boundingBox!.getCenter(new THREE.Vector3()) };
  });
  return {
    root,
    feet,
    hip,
    /** World position of Luna's right (0) or left (1) hand; false if the model has no hands. */
    hand(side: 0 | 1, target: THREE.Vector3) {
      const h = hands[side];
      if (!h) return false;
      target.copy(h.centre).applyMatrix4(h.mesh.matrixWorld);
      return true;
    },
    /**
     * `climb` is -1…1 (down/up stairs): higher leading step and a slight lean. Tasks: idle,
     * cashier, preparing, cleaning, carrying/serving, sitting, watering, sweeping, wiping, photo.
     */
    update(
      age: number,
      stride: number,
      task: string,
      reduced: boolean,
      climb = 0,
      /** Walk cycle phase (radians) and whether she is running, for the bouncy gait. */
      gait: { phase: number; run: boolean; air?: boolean; umbrella?: boolean } = {
        phase: 0,
        run: false,
      },
    ) {
      this.pose(age, stride, task, reduced, climb, gait);
      // Holding an umbrella: the right hand stays up in front of the chest, gripping the handle.
      if (gait.umbrella) {
        pose(3, -0.95, 0.15, -0.12);
        pose(5, -1.2);
      }
    },
    pose(
      age: number,
      stride: number,
      task: string,
      reduced: boolean,
      climb: number,
      gait: { phase: number; run: boolean; air?: boolean },
    ) {
      if (gait.air && task !== 'sitting') {
        // Mid-hop: knees up (legs forward), arms flung up and out — a happy little jump.
        pose(0, -0.7);
        pose(1, -0.35);
        pose(2, -2.3, 0, 0.5);
        pose(3, -2.3, 0, -0.5);
        pose(4, -0.3);
        pose(5, -0.3);
        pose(6, -0.1, 0, 0);
        pose(7, -0.05, 0, 0);
        return;
      }
      const working = task === 'preparing' || task === 'cleaning',
        carrying = task === 'carrying' || task === 'serving',
        up = Math.max(0, climb),
        down = Math.max(0, -climb),
        wave = (speed: number, phase = 0) => (reduced ? 0 : Math.sin(age * speed + phase)),
        leg = (swing: number) => swing * (1 + down * 0.25) - Math.max(0, -swing) * up * 1.1;
      if (task === 'sitting') {
        // Thighs forward along the seat; hands resting on the lap.
        pose(0, -1.45);
        pose(1, -1.45);
        pose(2, -0.55, 0, 0.12);
        pose(3, -0.55, 0, -0.12);
        pose(4, -0.5);
        pose(5, -0.5);
        pose(6, 0, wave(0.65) * 0.025, 0);
        pose(7, 0, 0, 0);
        return;
      }
      pose(0, leg(stride * 0.5));
      pose(1, leg(-stride * 0.5));
      if (task === 'watering') {
        // Right hand holds the can out and tips it over the plant.
        pose(2, -stride * 0.3, 0, 0.05);
        pose(3, -1.05 - wave(2.2) * 0.08, 0, -0.1);
        pose(4, 0);
        pose(5, -0.15);
        pose(6, 0.25, 0, 0);
        pose(7, 0.06, 0, 0);
        return;
      }
      if (task === 'sweeping') {
        // Both hands low on the broom, swinging it side to side.
        const swing = wave(4) * 0.45;
        pose(2, -0.75, swing, 0.15);
        pose(3, -0.55, swing, -0.15);
        pose(4, -0.35);
        pose(5, -0.25);
        pose(6, 0.2, -swing * 0.3, 0);
        pose(7, 0.12, swing * 0.35, 0);
        return;
      }
      if (task === 'wiping') {
        // Right hand flat on the table, wiping in circles.
        pose(2, -0.4, 0, 0.08);
        pose(3, -0.95 + wave(5) * 0.12, wave(5, Math.PI / 2) * 0.35, -0.08);
        pose(4, -0.2);
        pose(5, -0.25);
        pose(6, 0.3, 0, 0);
        pose(7, 0.14, 0, 0);
        return;
      }
      if (task === 'photo') {
        // Camera up at the eyes with both hands.
        pose(2, -1.3, -0.35, 0.2);
        pose(3, -1.3, 0.35, -0.2);
        pose(4, -1.15);
        pose(5, -1.15);
        pose(6, 0, 0, 0);
        pose(7, 0, 0, 0);
        return;
      }
      // Cute gait: arms swing wide and a little outward, body sways step to step with the head
      // tilting the other way; running pumps bent arms and leans in.
      const step = Math.abs(stride) > 0.001 ? 1 : 0,
        sway = reduced ? 0 : Math.cos(gait.phase) * 0.06 * step,
        run = gait.run && step > 0;
      if (carrying || working) {
        pose(2, carrying ? -0.65 : -0.5, 0, 0.05);
        const wipe = task === 'cleaning' ? wave(4) * 0.35 : 0;
        pose(3, carrying ? -0.65 : -0.5, wipe, -0.05);
        pose(4, carrying ? -0.45 : -0.45 + wave(5) * 0.1);
        pose(5, carrying ? -0.45 : -0.45 + wave(5, 1) * 0.1);
      } else if (run) {
        pose(2, -0.25 - stride * 0.85, 0, 0.18);
        pose(3, -0.25 + stride * 0.85, 0, -0.18);
        pose(4, -1.05);
        pose(5, -1.05);
      } else {
        pose(2, -stride * 0.6, 0, 0.1 + Math.abs(stride) * 0.08);
        pose(3, stride * 0.6, 0, -0.1 - Math.abs(stride) * 0.08);
        pose(4, -0.15 - Math.abs(stride) * 0.15);
        pose(5, -0.15 - Math.abs(stride) * 0.15);
      }
      pose(
        6,
        (working ? 0.12 : 0) + (run ? 0.08 : 0) + (reduced ? 0 : Math.abs(stride) * 0.04),
        wave(0.65) * 0.025,
        -sway * 0.8,
      );
      pose(
        7,
        (run ? 0.17 : 0.04 * step) + up * 0.12 - down * 0.05,
        sway * 0.5,
        sway + wave(1.3) * 0.006,
      );
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
