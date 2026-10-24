import * as THREE from 'three';

const WAVE_DURATION = 4.2;
// Quintic easing gives both ends zero velocity and acceleration.
const ease = (time: number, start: number, end: number) => {
  const t = THREE.MathUtils.clamp((time - start) / (end - start), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/** Articulated greeting. All poses are relative to the imported rest pose. */
export function createLunaAnimation(model: THREE.Object3D) {
  const joint = (name: string) => {
    const node = model.getObjectByName(name);
    return node ? { node, rest: node.quaternion.clone() } : undefined;
  };
  const shoulder = joint('Luna_Arm_L'),
    elbow = joint('Luna_Elbow_L'),
    wrist = joint('Luna_Wrist_L');
  const head = joint('Luna_Head'),
    body = joint('Luna_Body');
  const bodyY = body?.node.position.y ?? 0;
  const rotation = new THREE.Quaternion(),
    angles = new THREE.Euler();
  let elapsed = 0,
    age = WAVE_DURATION;
  const pose = (part: ReturnType<typeof joint>, x = 0, y = 0, z = 0) => {
    if (!part) return;
    rotation.setFromEuler(angles.set(x, y, z, 'XYZ'));
    part.node.quaternion.copy(part.rest).premultiply(rotation);
  };
  return {
    greet() {
      // Repeated clicks never snap an already raised arm back to its starting pose.
      if (age >= WAVE_DURATION) age = 0;
    },
    update(delta: number, moving: boolean, reduced: boolean) {
      if (reduced) {
        age = WAVE_DURATION;
        elapsed = 0;
        for (const part of [shoulder, elbow, wrist, head, body]) pose(part);
        if (body) body.node.position.y = bodyY;
        return;
      }
      // Pausing freezes the entire pose, including the current greeting.
      if (!moving) return;
      elapsed += delta;
      age = Math.min(age + delta, WAVE_DURATION);
      const lift = ease(age, 0.12, 0.95) * (1 - ease(age, 3.05, 4.15));
      const bend = ease(age, 0, 0.8) * (1 - ease(age, 3.15, 4.2));
      const waveEnvelope = ease(age, 0.95, 1.2) * (1 - ease(age, 2.85, 3.15));
      const cycle = ((age - 0.95) * Math.PI * 2) / 0.66;
      const anticipation = ease(age, 0, 0.16) * (1 - ease(age, 0.16, 0.5));
      pose(
        shoulder,
        -0.2 * lift,
        -0.08 * lift,
        0.8 * lift - 0.045 * anticipation + 0.012 * waveEnvelope * Math.sin(cycle - 0.5),
      );
      pose(elbow, 0, 0, 2.03 * bend + 0.06 * waveEnvelope * Math.sin(cycle - 0.35));
      pose(
        wrist,
        0.1 * lift,
        0.06 * waveEnvelope * Math.sin(cycle + 0.4),
        0.26 * waveEnvelope * Math.sin(cycle),
      );
      pose(
        head,
        -0.025 * lift,
        Math.sin(elapsed * 0.65) * 0.035 + 0.055 * lift,
        Math.sin(elapsed * 0.9) * 0.018 - 0.055 * lift,
      );
      pose(body, 0, 0.02 * lift, -0.012 * lift);
      if (body) body.node.position.y = bodyY + Math.sin(elapsed * 1.8) * 0.006;
    },
  };
}
