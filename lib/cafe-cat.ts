// A little white-and-orange chibi cat that lives around the café. It does what cats do: wanders
// to random spots, grooms, sits, naps, plays now and then, and hops up and down ledges.
// Built from a handful of simple shapes (toon-shaded by the scene like everything else).
import * as THREE from 'three';

type Ground = (x: number, z: number, fromY: number) => number | null;
type Mood = 'walk' | 'sit' | 'groom' | 'sleep' | 'play' | 'jump';

export function createCafeCat(options: {
  /** Height a cat could stand on at (x, z), reachable from `fromY`; null where it can't go. */
  ground: Ground;
  /** True if something solid stands between two points (walls, counters). */
  blocked: (from: THREE.Vector3, to: THREE.Vector3) => boolean;
  /** Random place to wander to. */
  pickSpot: () => THREE.Vector3;
  start: THREE.Vector3;
  /** Café scale (Luna is 1.22 × scale tall). */
  scale: number;
}) {
  const { ground, blocked, pickSpot, scale } = options;
  const root = new THREE.Group();
  root.name = 'Cafe_Cat';
  const body = new THREE.Group();
  body.scale.setScalar(scale);
  root.add(body);

  const geometries: THREE.BufferGeometry[] = [],
    materials: THREE.Material[] = [];
  const sphere = new THREE.SphereGeometry(1, 18, 12),
    cylinder = new THREE.CylinderGeometry(1, 1, 1, 10),
    cone = new THREE.ConeGeometry(1, 1, 8);
  geometries.push(sphere, cylinder, cone);
  const material = (color: string, roughness = 0.9) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness });
    materials.push(m);
    return m;
  };
  const white = material('#fbf7f0'),
    orange = material('#f0a24a'),
    pink = material('#f4a7b0'),
    dark = material('#2a2326', 0.4),
    shine = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  materials.push(shine);
  const part = (
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    mat: THREE.Material,
    position: number[],
    size: number[],
    rotation: number[] = [0, 0, 0],
  ) => {
    const m = new THREE.Mesh(geometry, mat);
    m.position.fromArray(position);
    m.scale.fromArray(size);
    m.rotation.fromArray(rotation as [number, number, number]);
    parent.add(m);
    return m;
  };

  // Torso (pivot near the hips so it can sit up) with an orange saddle patch.
  const torso = new THREE.Group();
  torso.position.set(0, 0.085, -0.06);
  body.add(torso);
  part(torso, sphere, white, [0, 0.03, 0.07], [0.085, 0.075, 0.12]);
  part(torso, sphere, orange, [0, 0.07, 0.04], [0.07, 0.045, 0.09]);
  part(torso, sphere, orange, [0.03, 0.045, 0.1], [0.04, 0.035, 0.04]);

  // The big chibi head.
  const head = new THREE.Group();
  head.position.set(0, 0.1, 0.17);
  head.scale.setScalar(1.15);
  torso.add(head);
  part(head, sphere, white, [0, 0.03, 0], [0.11, 0.095, 0.095]);
  part(head, sphere, orange, [0, 0.085, -0.015], [0.095, 0.05, 0.08]);
  part(head, sphere, orange, [-0.055, 0.05, 0.03], [0.04, 0.04, 0.05]);
  for (const side of [-1, 1]) {
    // Ears: orange outside, pink inside.
    part(
      head,
      cone,
      orange,
      [side * 0.06, 0.12, -0.005],
      [0.035, 0.07, 0.022],
      [0, 0, side * -0.35],
    );
    part(
      head,
      cone,
      pink,
      [side * 0.058, 0.115, 0.007],
      [0.02, 0.045, 0.008],
      [0, 0, side * -0.35],
    );
    // Cheeks and blush.
    part(head, sphere, white, [side * 0.045, -0.015, 0.055], [0.045, 0.035, 0.04]);
    part(head, sphere, pink, [side * 0.065, 0.0, 0.075], [0.016, 0.009, 0.006]);
    // Whiskers.
    for (const tilt of [-0.15, 0.12])
      part(
        head,
        cylinder,
        dark,
        [side * 0.1, -0.012, 0.07],
        [0.0015, 0.07, 0.0015],
        [0, 0, Math.PI / 2 + side * tilt],
      );
  }
  const eyes = [-1, 1].map((side) => {
    const eye = new THREE.Group();
    eye.position.set(side * 0.047, 0.022, 0.082);
    head.add(eye);
    // Big, round chibi eyes with a bright catchlight.
    part(eye, sphere, dark, [0, 0, 0], [0.023, 0.029, 0.012]);
    part(eye, sphere, shine, [side * -0.006, 0.01, 0.01], [0.008, 0.009, 0.004]);
    part(eye, sphere, shine, [side * 0.007, -0.009, 0.01], [0.0035, 0.0035, 0.002]);
    return eye;
  });
  // Orange blaze on the forehead, little pink nose and a ":3" mouth.
  part(head, sphere, orange, [0.012, 0.07, 0.045], [0.05, 0.03, 0.04]);
  part(head, sphere, white, [0, -0.018, 0.083], [0.028, 0.018, 0.014]);
  part(head, sphere, pink, [0, -0.004, 0.094], [0.009, 0.006, 0.005]);
  const smile = new THREE.TorusGeometry(0.0075, 0.0016, 4, 10, Math.PI);
  geometries.push(smile);
  for (const side of [-1, 1])
    part(head, smile, dark, [side * 0.0075, -0.012, 0.096], [1, 1, 1], [0, 0, Math.PI]);

  // Legs (front ones on the torso, back ones on the body so they stay put when it sits).
  const legs = [
    [-0.045, 0.21],
    [0.045, 0.21],
    [-0.05, -0.02],
    [0.05, -0.02],
  ].map(([x, z], i) => {
    const leg = new THREE.Group();
    leg.position.set(x, 0.06, z);
    body.add(leg);
    part(leg, cylinder, white, [0, -0.028, 0], [0.025, 0.056, 0.025]);
    part(leg, sphere, i === 2 ? orange : white, [0, -0.052, 0.01], [0.029, 0.018, 0.033]);
    return leg;
  });
  // Front legs hang from the torso's front so they follow it when it sits up.
  legs.slice(0, 2).forEach((leg) => {
    body.remove(leg);
    leg.position.set(leg.position.x, -0.025, 0.15);
    torso.add(leg);
  });

  // Tail: three segments, orange with a white tip, curling up.
  const tail: THREE.Group[] = [];
  {
    let parent: THREE.Object3D = torso;
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Group();
      seg.position.set(0, i ? 0.05 : 0.04, i ? 0 : -0.04);
      parent.add(seg);
      part(
        seg,
        cylinder,
        i === 3 ? white : orange,
        [0, 0.025, 0],
        [0.017 - i * 0.002, 0.055, 0.017 - i * 0.002],
      );
      part(seg, sphere, i === 3 ? white : orange, [0, 0.05, 0], [0.016 - i * 0.002, 0.016, 0.016]);
      tail.push(seg);
      parent = seg;
    }
  }
  root.traverse((n) => {
    if (n instanceof THREE.Mesh) n.castShadow = true;
  });

  // --- Behaviour ---------------------------------------------------------------------------
  const position = options.start.clone(),
    target = new THREE.Vector3(),
    next = new THREE.Vector3(),
    jumpFrom = new THREE.Vector3(),
    jumpTo = new THREE.Vector3();
  let mood: Mood = 'sit',
    moodUntil = 2,
    heading = Math.random() * Math.PI * 2,
    turn = heading,
    afterJump: Mood = 'walk',
    jumpAt = 0,
    jumpLength = 0.5,
    stuck = 0,
    blink = 0,
    playHop = 0,
    now = 0;
  const pose = { sit: 0, lie: 0, crouch: 0 };
  const choose = (time: number) => {
    const r = Math.random();
    if (r < 0.42) {
      mood = 'walk';
      target.copy(pickSpot());
      moodUntil = time + 25;
      stuck = 0;
    } else if (r < 0.6) {
      mood = 'groom';
      moodUntil = time + 5 + Math.random() * 6;
    } else if (r < 0.76) {
      mood = 'sit';
      moodUntil = time + 4 + Math.random() * 6;
    } else if (r < 0.9) {
      mood = 'sleep';
      moodUntil = time + 14 + Math.random() * 20;
    } else {
      mood = 'play';
      moodUntil = time + 4 + Math.random() * 3;
    }
  };
  const startJump = (to: THREE.Vector3, then: Mood, time: number) => {
    jumpFrom.copy(position);
    jumpTo.copy(to);
    jumpAt = time;
    jumpLength = 0.42 + Math.min(0.25, Math.abs(to.y - position.y) / scale);
    afterJump = then;
    mood = 'jump';
  };
  const ease = (value: number, goal: number, rate: number, dt: number) =>
    value + (goal - value) * (1 - Math.exp(-dt * rate));
  const speed = 0.55 * scale;

  return {
    root,
    position,
    /** Current activity, for tests and the dev handle. */
    mood: () => mood,
    /** Dev/test: start an activity now for a number of seconds. */
    act(next: Exclude<Mood, 'jump'>, seconds = 8) {
      mood = next;
      moodUntil = now + seconds;
      if (next === 'walk') target.copy(pickSpot());
    },
    /** `luna` (optional): the cat glances at Luna when she comes close. */
    update(time: number, dt: number, reduced: boolean, luna?: THREE.Vector3) {
      dt = Math.min(dt, 0.1);
      now = time;
      if (mood !== 'jump' && mood !== 'walk' && time > moodUntil) choose(time);
      let moving = false;
      if (mood === 'walk') {
        const dx = target.x - position.x,
          dz = target.z - position.z,
          distance = Math.hypot(dx, dz);
        if (distance < 0.08 * scale || time > moodUntil) choose(time);
        else {
          turn = Math.atan2(dx, dz);
          const step = Math.min(distance, speed * dt * (reduced ? 0.6 : 1));
          next.set(
            position.x + (dx / distance) * step,
            position.y,
            position.z + (dz / distance) * step,
          );
          // Look a little further ahead for ledges to hop.
          const ahead = new THREE.Vector3(
            position.x + (dx / distance) * 0.18 * scale,
            position.y,
            position.z + (dz / distance) * 0.18 * scale,
          );
          const there = ground(ahead.x, ahead.z, position.y);
          const rise = there === null ? 0 : there - position.y;
          if (there !== null && Math.abs(rise) > 0.12 * scale && !blocked(position, ahead)) {
            // A cat leaps up to 0.8 m and drops down a bit more.
            if (rise < 0.8 * scale && rise > -1.1 * scale)
              startJump(ahead.setY(there), 'walk', time);
            else target.copy(pickSpot());
          } else {
            const y = ground(next.x, next.z, position.y);
            if (y === null || Math.abs(y - position.y) > 0.12 * scale || blocked(position, next)) {
              stuck += dt;
              // Can't get through here: try somewhere else, or give up and sit a while.
              if (stuck > 0.4) {
                if (Math.random() < 0.7) target.copy(pickSpot());
                else {
                  mood = 'sit';
                  moodUntil = time + 3;
                }
                stuck = 0;
              }
            } else {
              position.set(next.x, y, next.z);
              moving = true;
              stuck = 0;
            }
          }
        }
      }
      let lift = 0;
      if (mood === 'jump') {
        const t = Math.min(1, (time - jumpAt) / jumpLength);
        position.lerpVectors(jumpFrom, jumpTo, t);
        // An arc high enough to clear the ledge on the way up.
        lift = Math.sin(t * Math.PI) * (0.12 * scale + Math.max(0, jumpTo.y - jumpFrom.y) * 0.6);
        if (t >= 1) {
          position.copy(jumpTo);
          mood = afterJump;
        }
      }
      // Play: crouch and wiggle, pounce forward, then bat at the air.
      if (mood === 'play') {
        const left = moodUntil - time;
        if (left < 1.4 && playHop === 0 && !reduced) {
          playHop = 1;
          const a = heading;
          const hop = new THREE.Vector3(
            position.x + Math.sin(a) * 0.35 * scale,
            position.y,
            position.z + Math.cos(a) * 0.35 * scale,
          );
          const y = ground(hop.x, hop.z, position.y);
          if (y !== null && Math.abs(y - position.y) < 0.12 * scale && !blocked(position, hop))
            startJump(hop.setY(y), 'play', time);
        }
      } else if (mood !== 'jump') playHop = 0;

      // Face where it's going (or glance at Luna when she's near and the cat is awake).
      let look = 0;
      if (luna && mood !== 'sleep' && mood !== 'walk' && mood !== 'jump') {
        const lx = luna.x - position.x,
          lz = luna.z - position.z;
        if (Math.hypot(lx, lz) < 2.2 * scale) {
          const toward = Math.atan2(lx, lz) - heading;
          look = THREE.MathUtils.clamp(Math.atan2(Math.sin(toward), Math.cos(toward)), -1, 1);
        }
      }
      if (mood === 'walk' || mood === 'jump')
        heading +=
          Math.atan2(Math.sin(turn - heading), Math.cos(turn - heading)) * (1 - Math.exp(-dt * 8));

      // Blend between standing, sitting, lying and crouching.
      const r = reduced ? 30 : 6;
      pose.sit = ease(pose.sit, mood === 'sit' || mood === 'groom' ? 1 : 0, r, dt);
      pose.lie = ease(pose.lie, mood === 'sleep' ? 1 : 0, r * 0.5, dt);
      pose.crouch = ease(pose.crouch, mood === 'play' && moodUntil - time > 1.4 ? 1 : 0, r, dt);
      const wave = (k: number, p = 0) => (reduced ? 0 : Math.sin(time * k + p));

      root.position.copy(position);
      root.position.y += lift;
      root.rotation.y = heading;
      const step = moving ? time * 11 : 0;
      // Walk: diagonal legs swing together, a small bob.
      const swing = moving ? Math.sin(step) * 0.55 : 0;
      legs[0].rotation.x = swing;
      legs[3].rotation.x = swing;
      legs[1].rotation.x = -swing;
      legs[2].rotation.x = -swing;
      body.position.y = moving ? Math.abs(Math.sin(step)) * 0.006 * scale : 0;
      // Mid-air: legs tucked forward and back.
      if (mood === 'jump') {
        legs[0].rotation.x = legs[1].rotation.x = -0.9;
        legs[2].rotation.x = legs[3].rotation.x = 0.9;
      }
      // Sit: the front rises, the hind legs fold under.
      torso.rotation.x = -0.75 * pose.sit + 0.25 * pose.crouch;
      torso.position.y = 0.085 - 0.025 * pose.sit - 0.035 * pose.lie - 0.025 * pose.crouch;
      for (const i of [0, 1]) legs[i].rotation.x += 0.75 * pose.sit;
      for (const i of [2, 3]) {
        legs[i].rotation.x += -1.2 * pose.sit;
        legs[i].position.y = 0.06 - 0.02 * pose.sit;
      }
      // Lie down to sleep: legs tucked under, head resting low, curled tail.
      // (Sitting, the front legs stretch down to the ground as the chest rises.)
      legs.forEach(
        (leg, i) => (leg.scale.y = (1 - 0.75 * pose.lie) * (i < 2 ? 1 + 1.05 * pose.sit : 1)),
      );
      // Crouched to pounce: the rear end wiggles.
      torso.rotation.z = pose.crouch * wave(16) * 0.12;
      // Grooming: one paw up to the mouth, head dipping to lick it (or licking a flank).
      const groom = mood === 'groom' ? pose.sit : 0,
        flank = groom * (Math.sin(time * 0.4) > 0.3 ? 1 : 0);
      legs[1].rotation.x -= groom * (1 - flank) * (1.9 + wave(7) * 0.15);
      head.rotation.set(
        0.35 * groom * (1 - flank) + wave(7) * 0.08 * groom + 0.5 * pose.lie,
        look * 0.8 + flank * 1.4,
        (1 - flank) * groom * 0.25 + pose.lie * 0.35,
      );
      // Sitting cats keep their head level even with the torso tilted up.
      head.rotation.x += 0.7 * pose.sit - 0.25 * pose.crouch;
      head.position.y = 0.1 - 0.04 * pose.lie;
      // Play: batting at the air with a front paw after the pounce.
      if (mood === 'play' && playHop && moodUntil - time < 1)
        legs[0].rotation.x = -1.6 + wave(14) * 0.5;
      // Tail: lazy sway; curled around the body while asleep; up while walking.
      tail.forEach((seg, i) => {
        seg.rotation.x =
          (moving ? -0.25 : 0.55) * (i === 0 ? 1 : 0.35) * (1 - pose.lie) -
          pose.sit * (i === 0 ? 0.9 : 0) +
          pose.lie * (i === 0 ? 1.4 : 0.1);
        seg.rotation.z = wave(moving ? 4 : 1.6, i * 0.6) * (0.2 + i * 0.08) * (1 - pose.lie * 0.8);
        seg.rotation.y = pose.lie * 0.5;
      });
      // Eyes: blink now and then; closed while asleep; a slow breath.
      blink -= dt;
      if (blink < -0.12) blink = 2 + Math.random() * 4;
      const closed = mood === 'sleep' ? 0.12 : blink < 0 ? 0.15 : 1;
      for (const eye of eyes) eye.scale.y = ease(eye.scale.y, closed, 25, dt);
      torso.scale.setScalar(1 + (mood === 'sleep' ? wave(1.8) * 0.025 : 0));
    },
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      root.removeFromParent();
    },
  };
}
