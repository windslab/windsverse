import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { findCafeSeats, tableKey, type CafeSeat } from '@/lib/cafe-seats';
import { type CafeVisitor, type CafeActivity } from '@/lib/cafe-activity';

import { type CafePaths } from '@/lib/cafe-paths';
import { lunaCafeRig } from './luna/cafe-rig';

// Free-walk steering tries straight first, then gradually sideways.
const STEER = [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2];
// Cross-legged (lesehan) pose for the stand-in people: thighs out and forward, shins crossed.
const DOWN = new THREE.Vector3(0, -1, 0);
const CROSS_THIGH = [-1, 1].map((side) =>
  new THREE.Quaternion().setFromUnitVectors(
    DOWN,
    new THREE.Vector3(side * 0.75, -0.05, 0.66).normalize(),
  ),
);
const CROSS_SHIN = [-1, 1].map((side, i) =>
  CROSS_THIGH[i]
    .clone()
    .invert()
    .multiply(
      new THREE.Quaternion().setFromUnitVectors(
        DOWN,
        new THREE.Vector3(-side * 0.9, -0.12, 0.3).normalize(),
      ),
    ),
);

/** Lightweight stand-in people; coordinates match the existing cafe model. */
/** Seconds for one rest–sip–rest cycle of a seated guest's drink. */
const DRINK_CYCLE = 11;

export function placeCafePeople(cafe: THREE.Object3D, paths: CafePaths, luna?: THREE.Group) {
  const root = new THREE.Group();
  root.name = 'Cafe_People';
  const scale = cafe.getWorldScale(new THREE.Vector3()).x,
    point = (x: number, y: number, z: number) => cafe.localToWorld(new THREE.Vector3(x, y, z));
  const at = (x: number, y: number, z: number) => paths.snap(point(x, y, z)) ?? point(x, y, z);
  const anchors = {
    idle: at(-1.1, 0.585, 2.6),
    cashier: at(-4.0, 0.605, 3.93),
    working: at(-3.0, 0.605, 3.93),
    waiting: at(-5.5, 0.505, 3.35),
    entrance: at(-6.05, 0.505, 4.4),
  };
  // Queue: first guest right at the cashier window (the box's street side), the next one behind
  // them, then the line turns along the sidewalk so people can still walk past on the road side.
  const queueSpots = [
    [-5.2, 3.93],
    [-5.62, 3.93],
    [-5.62, 3.5],
    [-5.62, 3.07],
    [-5.62, 2.64],
    [-5.62, 2.21],
    [-5.62, 1.78],
    [-5.62, 1.35],
  ].map(([x, z]) => at(x, 0.505, z));
  const queueFacing = queueSpots.map((spot, i) => {
    const ahead = i ? queueSpots[i - 1] : anchors.cashier;
    return Math.atan2(ahead.x - spot.x, ahead.z - spot.z);
  });
  const sphere = new THREE.SphereGeometry(1, 12, 8),
    box = new THREE.BoxGeometry(1, 1, 1),
    cylinder = new THREE.CylinderGeometry(1, 1, 1, 10),
    hairCap = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.54),
    circle = new THREE.CircleGeometry(1, 20);
  const geometries: THREE.BufferGeometry[] = [sphere, box, cylinder, hairCap, circle],
    materials: THREE.Material[] = [];
  const material = (color: string) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
    materials.push(m);
    return m;
  };
  const skin = [
    material('#e3b995'),
    material('#bf8c68'),
    material('#edc7a7'),
    material('#d6aa82'),
    material('#bd8b69'),
    material('#e6b18c'),
  ];
  const tops = [
      material('#cd849a'),
      material('#6b9ba9'),
      material('#c59b56'),
      material('#82a38b'),
      material('#bd8b80'),
      material('#9b8caf'),
    ],
    hair = [material('#5b3b2c'), material('#302f2c'), material('#694934')];
  const pants = material('#35404c'),
    apron = material('#454644'),
    shoe = material('#e4d4bc'),
    eyes = material('#29252a'),
    cup = material('#f9f0dd'),
    trayMat = material('#8d6950');
  let age = 0,
    signature = '',
    posActive = false;
  const servedAt = (key: string) => {
    try {
      return Number(sessionStorage.getItem('cafe-served:' + key)) || 0;
    } catch {
      return 0;
    }
  };
  const rememberServed = (key: string) => {
    try {
      sessionStorage.setItem('cafe-served:' + key, String(Date.now()));
    } catch {
      /* Storage is optional; movement continues. */
    }
  };
  const detailed = luna ? lunaCafeRig(luna, 1.22 * scale) : null;
  function mesh(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    mat: THREE.Material,
    position: number[],
    size: number[],
  ) {
    const m = new THREE.Mesh(geometry, mat);
    m.position.fromArray(position);
    m.scale.fromArray(size);
    parent.add(m);
    return m;
  }
  function person(index: number) {
    const visual = new THREE.Group();
    visual.name = index === 0 ? 'Cafe_Barista' : 'Cafe_Customer_' + index;
    visual.scale.setScalar(scale * (index === 0 ? 1 : 1.0));
    const torso = new THREE.Group();
    visual.add(torso);
    mesh(torso, cylinder, tops[index], [0, 0.76, 0], [0.125, 0.35, 0.115]);
    mesh(torso, box, pants, [0, 0.51, 0], [0.22, 0.13, 0.17]);
    mesh(torso, sphere, skin[index], [0, 1.1, 0], [0.17, 0.19, 0.155]);
    mesh(torso, cylinder, skin[index], [0, 0.94, 0], [0.05, 0.1, 0.05]);
    mesh(torso, hairCap, hair[index % hair.length], [0, 1.13, -0.005], [0.18, 0.18, 0.165]);
    if (index === 0) mesh(torso, box, hair[0], [0, 1.07, -0.11], [0.27, 0.2, 0.075]);
    for (const side of [-1, 1]) {
      mesh(torso, sphere, skin[index], [side * 0.14, 1.09, 0], [0.03, 0.045, 0.03]);
      mesh(torso, sphere, cup, [side * 0.057, 1.105, 0.149], [0.03, 0.039, 0.012]);
      mesh(torso, sphere, eyes, [side * 0.057, 1.105, 0.159], [0.018, 0.03, 0.009]);
      mesh(torso, sphere, cup, [side * 0.057 - 0.005, 1.117, 0.167], [0.006, 0.009, 0.004]);
    }
    mesh(torso, sphere, skin[index], [0, 1.065, 0.142], [0.022, 0.024, 0.023]);
    mesh(torso, box, eyes, [0, 1.022, 0.134], [0.034, 0.006, 0.006]);
    if (index === 0) {
      mesh(torso, box, apron, [0, 0.73, 0.13], [0.23, 0.3, 0.025]);
      for (const side of [-1, 1])
        mesh(torso, box, apron, [side * 0.075, 0.91, 0.12], [0.025, 0.1, 0.02]);
      mesh(torso, box, shoe, [0.06, 0.83, 0.148], [0.055, 0.025, 0.008]);
    }
    const arms: THREE.Group[] = [],
      elbows: THREE.Group[] = [],
      legs: THREE.Group[] = [],
      knees: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(side * 0.18, 0.9, 0);
      torso.add(arm);
      arms.push(arm);
      mesh(arm, cylinder, tops[index], [0, -0.07, 0], [0.065, 0.16, 0.065]);
      const elbow = new THREE.Group();
      elbow.position.y = -0.16;
      arm.add(elbow);
      elbows.push(elbow);
      mesh(elbow, cylinder, skin[index], [0, -0.08, 0], [0.038, 0.17, 0.038]);
      mesh(elbow, sphere, skin[index], [0, -0.17, 0], [0.045, 0.048, 0.043]);
      const leg = new THREE.Group();
      leg.position.set(side * 0.075, 0.5, 0);
      visual.add(leg);
      legs.push(leg);
      mesh(leg, cylinder, pants, [0, -0.1, 0], [0.058, 0.21, 0.058]);
      const knee = new THREE.Group();
      knee.position.y = -0.2;
      leg.add(knee);
      knees.push(knee);
      mesh(knee, cylinder, pants, [0, -0.105, 0], [0.047, 0.21, 0.047]);
      mesh(knee, box, shoe, [0, -0.24, 0.035], [0.12, 0.07, 0.2]);
    }
    // Merge static head/clothing parts by material; limb joints remain movable.
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of [...torso.children]) {
      if (!(child instanceof THREE.Mesh)) continue;
      const mat = child.material as THREE.Material;
      const batch = batches.get(mat) || [];
      batch.push(child);
      batches.set(mat, batch);
    }
    for (const [mat, parts] of batches) {
      if (parts.length < 2) continue;
      const sources = parts.map((part) => {
        part.updateMatrix();
        return part.geometry.clone().applyMatrix4(part.matrix);
      });
      const geometry = mergeGeometries(sources);
      sources.forEach((g) => g.dispose());
      if (geometry) {
        geometries.push(geometry);
        parts.forEach((part) => torso.remove(part));
        torso.add(new THREE.Mesh(geometry, mat));
      }
    }
    // The guest's drink: it rests on the table and is picked up now and then for a sip.
    const drink = mesh(torso, cylinder, cup, [0.13, 0.79, 0.3], [0.04, 0.09, 0.04]);
    drink.visible = false;
    const serving = new THREE.Group();
    serving.position.set(0, 0.71, 0.3);
    visual.add(serving);
    serving.visible = false;
    mesh(serving, cylinder, trayMat, [0, 0, 0], [0.18, 0.015, 0.13]);
    mesh(serving, cylinder, cup, [0, 0.055, 0], [0.045, 0.1, 0.045]);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: '#493c33',
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
    });
    materials.push(shadowMat);
    const shadow = mesh(root, circle, shadowMat, [0, 0, 0], [0.22 * scale, 0.16 * scale, 1]);
    shadow.rotation.x = -Math.PI / 2;
    if (index === 0 && detailed) {
      visual.clear();
      visual.scale.setScalar(1);
      visual.add(detailed.root);
      serving.position.set(0, 0.68 * scale, 0.3 * scale);
      serving.scale.setScalar(scale);
      visual.add(serving);
    }
    const feet: THREE.Object3D[] = [];
    if (index === 0 && detailed) feet.push(...detailed.feet);
    else
      visual.traverse((n) => {
        if (n instanceof THREE.Mesh && n.material === shoe) feet.push(n);
      });
    const position = (index === 0 ? anchors.idle : anchors.entrance).clone();
    visual.position.copy(position);
    root.add(visual);
    return {
      visual,
      torso,
      arms,
      elbows,
      legs,
      knees,
      serving,
      drink,
      shadow,
      position,
      blockedFor: 0,
      stuckFor: 0,
      slipUntil: 0,
      yieldTo: null as THREE.Vector3 | null,
      yieldWait: 0,
      velocity: new THREE.Vector3(),
      destination: position.clone(),
      waypoints: [] as THREE.Vector3[],
      waypoint: 0,
      heading: 0,
      floorY: anchors.idle.y,
      seated: false,
      headingAtSeat: 0,
      seat: null as CafeSeat | null,
      feet,
      key: '',
      group: '',
      status: '',
      phase: 'hidden',
      drinkUntil: 0,
      drinkUntilWall: 0,
      /** Floor height eased when stepping down, and -1…1 climbing down/up (for the gait). */
      smoothY: NaN,
      lastGround: NaN,
      climb: 0,
      queueHeading: Math.PI / 2,
      delivered: false,
      serveAge: 0,
      drinkPhase: Math.random() * DRINK_CYCLE,
    };
  }
  const seats = findCafeSeats(cafe);
  // Barista + MAX_SCENE_GUESTS (lib/cafe-visitors.ts) guests.
  const people = Array.from({ length: 9 }, (_, i) => person(i));
  type Person = (typeof people)[number];
  const retired = new Set<string>();
  const barista = people[0];
  // Explore mode: the player drives Luna; the game decides her pose and serves guests itself.
  let manual = false,
    manualTask = 'idle';
  const manualMove = new THREE.Vector3(),
    manualNext = new THREE.Vector3(),
    manualSlide = new THREE.Vector3();
  let manualNode: number | undefined;
  /** Explore-mode chores (watering, sweeping, wiping) run for a few seconds, facing the target. */
  const chore = { kind: '', until: 0 };
  // Props in Luna's hands, in her own space (she faces +Z, her right hand is at −X).
  const props = new THREE.Group(),
    propMat = (color: string) => material(color);
  props.name = 'Luna_Props';
  const can = new THREE.Group(),
    broom = new THREE.Group(),
    cloth = new THREE.Group(),
    camera = new THREE.Group(),
    bristles = new THREE.Group(),
    book = new THREE.Group(),
    bow = new THREE.Group(),
    instrumentHolder = new THREE.Group(),
    held: { instrument: THREE.Object3D | null } = { instrument: null },
    umbrella = new THREE.Group(),
    canopy = new THREE.Group(),
    propUpAxis = new THREE.Vector3(0, 1, 0);
  /** Rain outdoors: Luna opens her umbrella (set by the scene, which knows where roofs are). */
  let umbrellaWanted = false;
  const umbrellaOpen = () =>
    umbrellaWanted &&
    !['sitting', 'watering', 'sweeping', 'wiping', 'photo', 'serving'].includes(task);
  {
    const green = propMat('#5f8f6b'),
      wood = propMat('#a8784a'),
      straw = propMat('#d8b466'),
      rag = propMat('#e9e2d0'),
      black = propMat('#2b2a2c'),
      silver = propMat('#c9c6c0');
    const part = (
      parent: THREE.Object3D,
      geometry: THREE.BufferGeometry,
      mat: THREE.Material,
      position: number[],
      size: number[],
      rotation: number[] = [0, 0, 0],
    ) => {
      const m = mesh(parent, geometry, mat, position, size);
      m.rotation.set(rotation[0], rotation[1], rotation[2]);
      return m;
    };
    // Watering can: body, spout reaching forward and down, handle on top.
    part(can, cylinder, green, [0, 0, 0], [0.06, 0.1, 0.06]);
    part(can, cylinder, green, [0, 0.0, 0.1], [0.012, 0.16, 0.012], [Math.PI / 2.6, 0, 0]);
    part(can, box, green, [0, 0.07, -0.01], [0.015, 0.03, 0.08]);
    can.position.set(-0.17, 0.6, 0.27);
    // Broom: stick from the hands down to bristles on the floor ahead.
    // The stick runs from Luna's hands (its top, at the group's origin) one unit down; each frame
    // it is aimed at the bristles on the floor ahead and stretched to reach them.
    part(broom, cylinder, wood, [0, -0.5, 0], [0.012, 1, 0.012]);
    part(bristles, cylinder, wood, [0, 0.06, 0], [0.03, 0.04, 0.03]);
    part(bristles, box, straw, [0, 0.03, 0], [0.2, 0.06, 0.07]);
    broom.position.set(0, 0.6, 0.15);
    broom.scale.y = 0.55;
    // Cloth under the right hand.
    part(cloth, box, rag, [0, 0, 0], [0.12, 0.012, 0.09]);
    cloth.position.set(-0.13, 0.5, 0.34);
    // Pocket camera at the eyes.
    part(camera, box, black, [0, 0, 0], [0.13, 0.08, 0.05]);
    part(camera, cylinder, silver, [0, 0, 0.035], [0.025, 0.03, 0.025], [Math.PI / 2, 0, 0]);
    camera.position.set(0, 0.97, 0.17);
    // Umbrella for rainy walks: white shaft and hook handle, clear canopy over Luna's head.
    const white = propMat('#f4f2ee');
    part(umbrella, cylinder, white, [0, 0.5, 0], [0.012, 1, 0.012]);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 6, 12, Math.PI), white);
    hook.position.set(0.035, -0.02, 0);
    hook.rotation.z = Math.PI;
    geometries.push(hook.geometry);
    umbrella.add(hook);
    const clear = new THREE.MeshBasicMaterial({
      color: '#e6f3fa',
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const rim = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55 });
    materials.push(clear, rim);
    const dome = new THREE.SphereGeometry(0.58, 20, 6, 0, Math.PI * 2, 0, 1.0),
      edge = new THREE.TorusGeometry(0.58 * Math.sin(1.0), 0.006, 4, 32);
    geometries.push(dome, edge);
    const shell = new THREE.Mesh(dome, clear);
    shell.scale.y = 0.5;
    // The dome's tip sits on the shaft's top.
    shell.position.y = -0.29;
    shell.renderOrder = 2;
    const ring = new THREE.Mesh(edge, rim);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = shell.position.y + 0.58 * Math.cos(1.0) * 0.5;
    canopy.add(shell, ring);
    // Ribs from the tip down to the rim.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      for (let k = 0; k < 4; k++) {
        const t0 = (k / 4) * 1.0,
          t1 = ((k + 1) / 4) * 1.0,
          p0 = new THREE.Vector3(
            Math.sin(t0) * Math.cos(a) * 0.58,
            shell.position.y + Math.cos(t0) * 0.29,
            Math.sin(t0) * Math.sin(a) * 0.58,
          ),
          p1 = new THREE.Vector3(
            Math.sin(t1) * Math.cos(a) * 0.58,
            shell.position.y + Math.cos(t1) * 0.29,
            Math.sin(t1) * Math.sin(a) * 0.58,
          );
        const rib = mesh(canopy, cylinder, rim, [0, 0, 0], [0.005, p0.distanceTo(p1), 0.005]);
        rib.position.copy(p0).lerp(p1, 0.5);
        rib.quaternion.setFromUnitVectors(propUpAxis, p1.clone().sub(p0).normalize());
      }
    }
    // Resting place until it is first opened (kept above the floor).
    umbrella.position.set(-0.12, 0.72, 0.18);
    canopy.position.set(-0.03, 1.56, 0);
    // An open book (two pages on a cover) for reading.
    const cover = propMat('#7a4a3a'),
      paper = propMat('#f4efe2');
    for (const side of [-1, 1]) {
      part(book, box, cover, [side * 0.07, 0, 0], [0.14, 0.006, 0.19], [0, 0, side * -0.18]);
      part(book, box, paper, [side * 0.066, 0.006, 0], [0.13, 0.008, 0.18], [0, 0, side * -0.18]);
    }
    // The cello bow: a dark stick with pale hair under it.
    part(
      bow,
      cylinder,
      propMat('#3a2418'),
      [0.33, 0, 0],
      [0.008, 0.66, 0.008],
      [0, 0, Math.PI / 2],
    );
    part(bow, box, propMat('#efe9dc'), [0.33, -0.018, 0], [0.62, 0.004, 0.006]);
    // Resting places until they're first used (kept above the floor).
    book.position.set(0, 0.62, 0.25);
    bow.position.set(-0.17, 0.6, 0.3);
    instrumentHolder.position.set(0, 0.3, 0.3);
    props.add(can, broom, bristles, cloth, camera, umbrella, canopy, book, bow, instrumentHolder);
    // Luna's own group is unscaled; the stand-in barista is already at café scale.
    props.scale.setScalar(scale / barista.visual.scale.x);
    props.children.forEach((p) => (p.visible = false));
  }
  // Water from the can and dust from the broom: a few points, recycled.
  const DROPS = 24,
    dropGeometry = new THREE.BufferGeometry(),
    dropPositions = new Float32Array(DROPS * 3),
    dropLife = new Float32Array(DROPS).map((_, i) => (i / DROPS) * 0.7);
  dropGeometry.setAttribute('position', new THREE.BufferAttribute(dropPositions, 3));
  geometries.push(dropGeometry);
  const dropMaterial = new THREE.PointsMaterial({
    color: '#9fd3ff',
    size: 0.035,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  materials.push(dropMaterial);
  const drops = new THREE.Points(dropGeometry, dropMaterial);
  drops.frustumCulled = false;
  drops.visible = false;
  props.add(drops);
  function updateProps(dt: number, reduced: boolean) {
    const kind = task;
    can.visible = kind === 'watering';
    broom.visible = bristles.visible = kind === 'sweeping';
    cloth.visible = kind === 'wiping';
    camera.visible = kind === 'photo';
    umbrella.visible = canopy.visible = umbrellaOpen();
    book.visible = kind === 'reading';
    bow.visible = kind === 'cello' && !!held.instrument;
    // The instrument Luna holds (guitar across her lap, cello upright between her knees).
    if (instrumentHolder.children[0] !== held.instrument) {
      instrumentHolder.clear();
      if (held.instrument) instrumentHolder.add(held.instrument);
    }
    instrumentHolder.visible = !!held.instrument && (kind === 'guitar' || kind === 'cello');
    if (instrumentHolder.visible) {
      const lap = (detailed ? detailed.hip / scale : 0.5) + 0.05;
      if (kind === 'guitar') {
        instrumentHolder.position.set(-0.3, lap - 0.06, 0.24);
        instrumentHolder.rotation.set(0, 0, -1.15);
      } else {
        // Upright between her knees, neck leaning past her left cheek.
        instrumentHolder.position.set(0.08, 0.02, 0.4);
        instrumentHolder.rotation.set(-0.22, 0, -0.14);
      }
      instrumentHolder.scale.setScalar(0.72 / scale);
    }
    const pour = kind === 'watering' && !reduced,
      dust = kind === 'sweeping' && !reduced;
    drops.visible = pour || dust;
    // Props sit in Luna's hands (her rig reports where they are each frame).
    const handR = propHand[0],
      handL = propHand[1];
    const gripped =
      !!detailed &&
      (barista.visual.updateWorldMatrix(true, true),
      detailed.hand(0, handR) && detailed.hand(1, handL));
    if (gripped) {
      props.worldToLocal(handR);
      props.worldToLocal(handL);
    }
    if (broom.visible) {
      const swing = reduced ? 0 : Math.sin(age * 4) * 0.45;
      // Bristles brush the floor ahead, swinging side to side.
      bristles.position.set(Math.sin(swing) * 0.32, 0, 0.5 + Math.cos(swing) * 0.05);
      bristles.rotation.y = swing;
      const top = gripped ? propTop.copy(handR).lerp(handL, 0.5) : propTop.set(0, 0.6, 0.15);
      propDir.copy(bristles.position).add(propUp).sub(top);
      broom.position.copy(top);
      broom.quaternion.setFromUnitVectors(propDown, propDir.clone().normalize());
      broom.scale.set(1, propDir.length(), 1);
    }
    if (can.visible && gripped) can.position.copy(handR).add(propCanOffset);
    if (cloth.visible) {
      if (gripped) cloth.position.copy(handR).add(propClothOffset);
      else if (!reduced) {
        cloth.position.x = -0.13 + Math.sin(age * 5) * 0.05;
        cloth.position.z = 0.34 + Math.cos(age * 5) * 0.04;
      }
    }
    if (camera.visible && gripped)
      camera.position.copy(handR).lerp(handL, 0.5).add(propCameraOffset);
    if (book.visible) {
      // Held open in both hands, tipped towards her face.
      if (gripped) book.position.copy(handR).lerp(handL, 0.5).add(propBookOffset);
      else book.position.set(0, 0.62, 0.25);
      book.rotation.set(-0.9, 0, 0);
    }
    if (bow.visible && gripped) {
      bow.position.copy(handR);
      bow.rotation.set(0, 0, 0.18);
    }
    if (umbrella.visible) {
      // Shaft from the right hand up to the canopy just above her head, leaning a touch back.
      const grip = gripped ? propTop.copy(handR) : propTop.set(-0.12, 0.72, 0.18);
      propDir.set(-0.03, 1.56, 0.0).sub(grip);
      umbrella.position.copy(grip);
      umbrella.quaternion.setFromUnitVectors(propUpAxis, propDir.clone().normalize());
      umbrella.scale.set(1, 1, 1);
      umbrella.children[0].scale.y = propDir.length();
      umbrella.children[0].position.y = propDir.length() / 2;
      canopy.position.copy(grip).add(propDir);
      canopy.quaternion.copy(umbrella.quaternion);
      if (!reduced) canopy.rotation.y += Math.sin(age * 1.3) * 0.04;
    }
    if (!drops.visible) return;
    dropMaterial.color.set(pour ? '#9fd3ff' : '#cbbfa8');
    dropMaterial.size = (pour ? 0.035 : 0.05) * scale;
    for (let i = 0; i < DROPS; i++) {
      dropLife[i] += dt;
      const life = pour ? 0.7 : 0.9;
      if (dropLife[i] > life) dropLife[i] -= life;
      const t = dropLife[i],
        k = i * 3;
      if (pour) {
        // Out of the spout tip, arcing down to the plant.
        dropPositions[k] = can.position.x + Math.sin(i * 7.3) * 0.015;
        dropPositions[k + 1] = can.position.y - 0.05 - 2.2 * t * t - 0.2 * t;
        dropPositions[k + 2] = can.position.z + 0.17 + 0.25 * t;
      } else {
        // Little puffs rising behind the bristles.
        const a = i * 2.4 + bristles.rotation.y;
        dropPositions[k] = Math.sin(a) * 0.12 + bristles.position.x;
        dropPositions[k + 1] = 0.03 + t * 0.18;
        dropPositions[k + 2] = bristles.position.z - 0.05 + Math.cos(a) * 0.06 + t * 0.05;
      }
    }
    dropGeometry.attributes.position.needsUpdate = true;
  }
  barista.visual.add(props);
  // Explore mode: a bobbing arrow over the guest whose drink Luna is carrying (seen through walls).
  const markerMaterial = new THREE.MeshBasicMaterial({
    color: '#ff9a1f',
    depthTest: false,
    transparent: true,
    opacity: 1,
  });
  materials.push(markerMaterial);
  const marker = new THREE.Group();
  {
    const cone = new THREE.ConeGeometry(0.17, 0.32, 4);
    cone.rotateX(Math.PI);
    geometries.push(cone);
    const tip = new THREE.Mesh(cone, markerMaterial);
    const stem = new THREE.Mesh(box, markerMaterial);
    stem.scale.set(0.09, 0.24, 0.09);
    stem.position.y = 0.28;
    marker.add(tip, stem);
    marker.children.forEach((m) => (m.renderOrder = 10));
    marker.scale.setScalar(scale);
    marker.visible = false;
    root.add(marker);
  }
  let markerKey = '';
  const propHand = [new THREE.Vector3(), new THREE.Vector3()],
    propTop = new THREE.Vector3(),
    propDir = new THREE.Vector3(),
    propUp = new THREE.Vector3(0, 0.06, 0),
    propDown = new THREE.Vector3(0, -1, 0),
    propCanOffset = new THREE.Vector3(0, -0.03, 0.05),
    propClothOffset = new THREE.Vector3(0, -0.04, 0),
    propCameraOffset = new THREE.Vector3(0, 0.03, 0.04),
    propBookOffset = new THREE.Vector3(0, 0.02, 0.05);
  const drinkHand = new THREE.Vector3(),
    drinkRest = new THREE.Vector3(0.13, 0.79, 0.3);
  function standUp() {
    barista.phase = 'working';
    barista.seat = null;
    activity = '';
    held.instrument = null;
  }
  /**
   * What Luna does while settled somewhere (explore mode): play the piano, guitar or cello, read,
   * lie down, or sit with her legs over the water at the end of the pier.
   */
  let activity = '';
  /** The world around the café (explore mode): walkable height outside, and the café's site. */
  let running = false,
    jumpY = 0,
    jumpV = 0;
  /** Sounds: called on each of Luna's footfalls, and when she lands from a hop. */
  let onStep: ((run: boolean) => void) | null = null,
    onLand: (() => void) | null = null,
    stepSide = 0;
  let outdoors: {
      walk: (x: number, z: number, fromY?: number) => number | null;
      site: THREE.Box3;
    } | null = null,
    outside = false;
  /** Leaving the site is only possible over the sidewalk's outer (road-side) edge. */
  const curbSide = (p: THREE.Vector3) => {
    const l = paths.local(p);
    return l.x < -6.12 && l.z > -5.75 && l.z < 5.7;
  };
  function outdoorStep(to: THREE.Vector3, inSite = false) {
    if (!outdoors) return null;
    const from = barista.position.y,
      curb = paths.groundHit(new THREE.Vector3(to.x, from, to.z));
    // On the site only the café's own surfaces count (and never the pond bottom).
    if (inSite) {
      // Where the café has no surface here (gaps at the sidewalk's ends), the ground beneath.
      const y = curb ?? outdoors.walk(to.x, to.z, from);
      if (y === null || paths.local(new THREE.Vector3(to.x, y, to.z)).y < -0.1) return null;
      if (Math.abs(y - from) > 0.4 * scale) return null;
      return { point: new THREE.Vector3(to.x, y, to.z) };
    }
    const land = outdoors.walk(to.x, to.z, from);
    const y = Math.max(land ?? -Infinity, curb ?? -Infinity);
    if (!Number.isFinite(y) || Math.abs(y - from) > 0.4 * scale) return null;
    return { point: new THREE.Vector3(to.x, y, to.z) };
  }
  /** One free-walking step: café floors (walk graph) inside, the land outside. */
  /** Inside the café's site (top view), and how far from its edge. */
  const edgeOf = (p: THREE.Vector3) => {
    const b = outdoors!.site;
    return Math.min(p.x - b.min.x, b.max.x - p.x, p.z - b.min.z, b.max.z - p.z);
  };
  function freeStep(to: THREE.Vector3): { point: THREE.Vector3; node?: number } | null {
    const inSite = !!outdoors && edgeOf(to) > 0;
    if (!outside || inSite) {
      const step = paths.step(barista.position, to, outside ? undefined : manualNode);
      if (step) return step;
    }
    if (!outdoors) return null;
    // Stepping on or off anywhere along the site's edge (sidewalk, its ends, the back step)
    // where nothing solid is in the way; deeper inside, only the walk graph.
    const nearEdge = (p: THREE.Vector3) => edgeOf(p) < 1.1;
    if (inSite && !nearEdge(to) && !curbSide(to)) return null;
    if (!outside && !nearEdge(barista.position) && !curbSide(barista.position)) return null;
    if (paths.blocked(barista.position, to)) return null;
    return outdoorStep(to, inSite);
  }
  /** Auto-walk route (e.g. "go to the cashier"); the stick always takes over. */
  let manualRoute: THREE.Vector3[] = [];
  let task = 'idle',
    taskKey = '',
    cleanUntil = 0,
    servingGuest: Person | null = null;
  function travel(actor: Person, destination: THREE.Vector3, phase: string) {
    const route = paths.path(actor.position, destination, actor === barista ? 'staff' : 'visitor');
    if (!route) return false;
    actor.yieldTo = null;
    actor.waypoints = route;
    actor.waypoint = 0;
    actor.destination.copy(route.at(-1)!);
    actor.phase = phase;
    actor.seated = false;
    return true;
  }
  /** Stable pseudo-random number in [0, 1) for a visitor group. */
  const groupRandom = (group: string) =>
    ([...group].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 1000) / 1000;
  function findSeat(actor: Person, visitor: CafeVisitor, occupied: Set<string>) {
    // Sit next to a friend from the same order; otherwise at the chosen table; otherwise anywhere.
    const friend = people
      .slice(1)
      .find((p) => p !== actor && visitor.group && p.group === visitor.group && p.seat);
    const open = seats.filter((s) => (visitor.type === 'takeaway' ? s.takeaway : !s.takeaway));
    const reference =
      friend?.seat?.surface ??
      seats.find((s) => s.table === tableKey(visitor.tableNumber) && !s.takeaway)?.surface ??
      (open.length
        ? open[Math.floor(groupRandom(visitor.group || visitor.key) * open.length)].surface
        : actor.position);
    const candidates = seats.filter(
      (s) => !occupied.has(s.id) && (visitor.type === 'takeaway' ? s.takeaway : !s.takeaway),
    );
    candidates.sort(
      (a, b) =>
        (a.id === actor.seat?.id ? -100 : 0) +
        (a.table === tableKey(visitor.tableNumber) ? -20 : 0) +
        a.surface.distanceTo(reference) -
        (b.id === actor.seat?.id ? -100 : 0) -
        (b.table === tableKey(visitor.tableNumber) ? -20 : 0) -
        b.surface.distanceTo(reference),
    );
    for (const seat of candidates) {
      const target = seat.surface.clone();
      target.y = seat.floor
        ? // Lesehan: the table legs sink a little into the floor; sit on the floor itself.
          (seat.surface.y = paths.ground(
            new THREE.Vector3(target.x, seat.surface.y + 0.1 * scale, target.z),
          ))
        : paths.ground(new THREE.Vector3(target.x, seat.surface.y - 0.3 * scale, target.z));
      const approach = paths.snap(target, 0.85);
      if (!approach || Math.abs(approach.y - seat.surface.y) > 0.95 * scale) continue;
      const route = paths.path(actor.position, approach, 'visitor');
      if (!route) continue;
      occupied.add(seat.id);
      actor.seat = seat;
      actor.headingAtSeat = seat.heading;
      actor.floorY = approach.y;
      actor.yieldTo = null;
      actor.waypoints = route;
      actor.waypoint = 0;
      actor.destination.copy(approach);
      actor.phase = 'to-seat';
      actor.seated = true;
      return true;
    }
    return false;
  }
  function exit(actor: Person) {
    actor.seated = false;
    actor.seat = null;
    if (!travel(actor, anchors.entrance, 'leaving')) actor.phase = 'leaving';
  }
  function updateActivity(activity: CafeActivity) {
    posActive = activity.posActive;
    const visitors = activity.visitors ?? [],
      key = JSON.stringify(visitors);
    if (key === signature) return;
    signature = key;
    const present = new Set(visitors.map((v) => v.key)),
      occupied = new Set(
        people
          .slice(1)
          .filter((p) => p.key && present.has(p.key) && p.seat)
          .map((p) => p.seat!.id),
      );
    // Luna may be sitting somewhere in explore mode.
    if (barista.seat) occupied.add(barista.seat.id);
    for (const actor of people.slice(1))
      if (actor.key && !present.has(actor.key) && actor.phase !== 'leaving') exit(actor);
    for (const visitor of visitors) {
      if (retired.has(visitor.key)) continue;
      let actor = people.slice(1).find((p) => p.key === visitor.key);
      if (!actor) {
        actor = people.slice(1).find((p) => !p.key);
        if (!actor) continue;
        actor.key = visitor.key;
        actor.group = visitor.group ?? visitor.key;
        actor.position.copy(
          paths.snap(
            anchors.entrance
              .clone()
              .add(new THREE.Vector3(0, 0, -(people.indexOf(actor) % 4) * 0.5 * scale)),
          ) ?? anchors.entrance,
        );
        actor.visual.visible = actor.shadow.visible = true;
        actor.delivered = false;
        actor.drinkUntil = 0;
        actor.status = '';
      }
      if (actor.status === visitor.status) continue;
      actor.status = visitor.status;
      if (visitor.status === 'diproses') {
        // Placed by arrangeQueue below.
        actor.phase = 'queue';
        actor.waypoints = [];
      } else if (!actor.seat) {
        findSeat(actor, visitor, occupied);
      }
      if (visitor.status === 'selesai') {
        const old = servedAt(visitor.key);
        if (old && Date.now() - old < 150_000) {
          actor.delivered = true;
          actor.drinkUntil = age + Math.max(0, 90 - (Date.now() - old) / 1000);
          actor.drinkUntilWall = old + 90_000;
        }
      }
    }
    arrangeQueue(visitors);
  }
  /** Everyone still ordering stands in line, in arrival order; the line moves up as it shrinks. */
  function arrangeQueue(visitors: CafeVisitor[]) {
    const line = visitors
      .filter((v) => v.status === 'diproses' && !retired.has(v.key))
      .map((v) => people.slice(1).find((p) => p.key === v.key))
      .filter((p): p is Person => !!p && p.phase === 'queue');
    line.forEach((actor, i) => {
      const spot = queueSpots[Math.min(i, queueSpots.length - 1)];
      actor.queueHeading = queueFacing[Math.min(i, queueFacing.length - 1)];
      if (actor.destination.distanceTo(spot) < 0.05 * scale) return;
      if (!travel(actor, spot, 'queue')) actor.destination.copy(spot);
    });
  }
  people.slice(1).forEach((p) => {
    p.visual.visible = p.shadow.visible = false;
  });
  let rerouteAt = 0,
    runPhase = 0;
  const direction = new THREE.Vector3(),
    feetBox = new THREE.Box3();
  function animate(actor: Person, dt: number, reduced: boolean, isBarista: boolean) {
    let moved = 0,
      budget = 0.56 * scale * dt;
    while (actor.waypoint < actor.waypoints.length && budget > 0) {
      const goal = actor.waypoints[actor.waypoint];
      direction.copy(goal).sub(actor.position);
      const distance = direction.length();
      if (distance < 0.004 * scale) {
        actor.position.copy(goal);
        actor.waypoint++;
        continue;
      }
      const amount = Math.min(distance, budget),
        next = actor.position.clone().addScaledVector(direction, amount / distance);
      const blockers = people
        .filter(
          (p) =>
            p !== actor &&
            p.visual.visible &&
            // In explore mode the player may park Luna anywhere; guests walk around her.
            ((p === barista && !manual) || p.key) &&
            Math.abs(p.floorY - next.y) < 0.65 * scale,
        )
        .map(
          (p) =>
            new THREE.Vector3(
              p.phase === 'sitting' ? p.visual.position.x : p.position.x,
              p.floorY,
              p.phase === 'sitting' ? p.visual.position.z : p.position.z,
            ),
        );
      if (
        age >= actor.slipUntil &&
        blockers.some(
          (p) =>
            Math.hypot(p.x - next.x, p.z - next.z) < 0.29 * scale &&
            Math.hypot(p.x - next.x, p.z - next.z) <
              Math.hypot(p.x - actor.position.x, p.z - actor.position.z),
        )
      ) {
        actor.blockedFor += dt;
        // Stuck for a while (a narrow passage, or a player who parked Luna in the way):
        // squeeze past for a moment rather than waiting forever.
        actor.stuckFor += dt;
        if (actor.stuckFor > 3) {
          actor.stuckFor = 0;
          actor.slipUntil = age + 1.2;
        }
        if (actor.blockedFor > 1.2 && age > rerouteAt) {
          rerouteAt = age + 0.4;
          const replacement = paths.path(
            actor.position,
            actor.destination,
            isBarista ? 'staff' : 'visitor',
            blockers,
          );
          if (replacement) {
            actor.waypoints = replacement;
            actor.waypoint = 0;
          } else if (!actor.yieldTo) {
            const index = people.indexOf(actor),
              higher = people
                .slice(0, index)
                .some(
                  (p) =>
                    p.visual.visible &&
                    !(p === barista && manual) &&
                    Math.abs(p.floorY - next.y) < 0.65 * scale &&
                    p.position.distanceTo(next) < 0.65 * scale,
                );
            if (higher) {
              const local = paths.local(actor.position),
                near = paths.nodes
                  .filter(
                    (n) =>
                      n.p.distanceTo(local) > 0.55 &&
                      n.p.distanceTo(local) < 2.5 &&
                      Math.abs(n.p.y - local.y) < 0.4,
                  )
                  .sort((a, b) => a.p.distanceTo(local) - b.p.distanceTo(local));
              for (const node of near) {
                const aside = paths.world(node.p);
                if (blockers.some((p) => p.distanceTo(aside) < 0.6 * scale)) continue;
                const escape = paths.path(
                  actor.position,
                  aside,
                  isBarista ? 'staff' : 'visitor',
                  blockers,
                );
                if (escape) {
                  actor.yieldTo = actor.destination.clone();
                  actor.waypoints = escape;
                  actor.waypoint = 0;
                  actor.yieldWait = 0;
                  break;
                }
              }
            }
          }
          actor.blockedFor = 0;
        }
        break;
      }
      actor.blockedFor = 0;
      actor.stuckFor = Math.max(0, actor.stuckFor - dt);
      actor.heading = Math.atan2(direction.x, direction.z);
      actor.position.addScaledVector(direction, amount / distance);
      budget -= amount;
      moved += amount;
      if (amount === distance) actor.waypoint++;
    }
    const arrived = actor.waypoint >= actor.waypoints.length,
      moving =
        moved > 0.0001 * scale ||
        (isBarista && manual && (manualMove.lengthSq() > 0.0001 || manualRoute.length > 0));
    if (arrived && actor.yieldTo) {
      actor.yieldWait += dt;
      if (actor.yieldWait > 1) {
        const resume = paths.path(actor.position, actor.yieldTo, isBarista ? 'staff' : 'visitor');
        if (resume) {
          actor.waypoints = resume;
          actor.waypoint = 0;
          actor.yieldTo = null;
        }
      }
    } else if (arrived && actor.phase === 'to-seat' && actor.seat) actor.phase = 'sitting';
    const sitting = actor.phase === 'sitting' && !!actor.seat;
    const ground = paths.ground(actor.position);
    actor.floorY = ground;
    if (!Number.isFinite(actor.smoothY) || Math.abs(ground - actor.smoothY) > 0.6 * scale)
      actor.smoothY = actor.lastGround = ground;
    const lift = (ground - actor.lastGround) / Math.max(dt, 1e-3);
    actor.lastGround = ground;
    actor.climb +=
      ((moving ? THREE.MathUtils.clamp(lift / (0.45 * scale), -1, 1) : 0) - actor.climb) *
      (1 - Math.exp(-dt * 5));
    // Stepping down eases onto the lower tread; stepping up lands at once (feet never sink).
    actor.smoothY = Math.max(
      ground,
      actor.smoothY + (ground - actor.smoothY) * (reduced ? 1 : 1 - Math.exp(-dt * 14)),
    );
    const floorY = actor.smoothY;
    const heading = sitting
      ? actor.headingAtSeat
      : !moving && actor.phase === 'queue'
        ? actor.queueHeading
        : isBarista && !moving && task === 'cashier'
          ? -Math.PI / 2
          : isBarista && !moving && (task === 'preparing' || task === 'cleaning')
            ? Math.PI
            : actor.heading;
    actor.visual.rotation.y +=
      Math.atan2(
        Math.sin(heading - actor.visual.rotation.y),
        Math.cos(heading - actor.visual.rotation.y),
      ) *
      (1 - Math.exp(-dt * 9));
    actor.visual.position.copy(actor.position);
    actor.visual.position.y = floorY;
    const crossLegged = sitting && !!actor.seat?.floor;
    if (sitting && actor.seat) {
      const target = actor.seat.surface;
      actor.visual.position.set(
        target.x,
        target.y -
          (isBarista && detailed
            ? activity === 'lying'
              ? 0
              : detailed.hip - 0.05 * scale
            : (crossLegged ? 0.43 : 0.445) * scale),
        target.z,
      );
    }
    // Running (explore mode): quicker, longer strides.
    const run = isBarista && manual && running && manualMove.lengthSq() > 0.0001;
    if (run) runPhase += dt * 12;
    const stride = reduced
      ? 0
      : run
        ? Math.sin(runPhase) * 1.25
        : moving
          ? Math.sin(age * 7 + actor.phase.length) * 0.8
          : 0;
    // A footfall each time the stride swings through (both feet), for footstep sounds.
    if (isBarista && moving && !reduced && jumpY <= 0.005) {
      const side = Math.sign(Math.sin(run ? runPhase : age * 7 + actor.phase.length));
      if (side !== 0 && side !== stepSide) {
        if (stepSide !== 0) onStep?.(run);
        stepSide = side;
      }
    } else if (isBarista) stepSide = 0;
    if (isBarista && detailed)
      detailed.update(
        age,
        stride,
        moving && task === 'serving' ? 'carrying' : task,
        reduced,
        actor.climb,
        {
          phase: run ? runPhase : age * 7 + actor.phase.length,
          run,
          air: jumpY > 0.005,
          umbrella: umbrellaOpen(),
        },
      );
    else {
      actor.legs.forEach((leg, i) => {
        if (crossLegged) {
          leg.quaternion.copy(CROSS_THIGH[i]);
          actor.knees[i].quaternion.copy(CROSS_SHIN[i]);
          return;
        }
        // On stairs the leading leg lifts higher and the knee bends more.
        const swing = stride * (i ? -1 : 1) * 0.5,
          up = Math.max(0, actor.climb),
          lead = Math.max(0, -swing);
        leg.rotation.set(sitting ? -Math.PI / 2 : swing - lead * up * 1.1, 0, 0);
        actor.knees[i].rotation.set(
          sitting
            ? Math.PI / 2
            : Math.max(0, stride * (i ? 1 : -1)) * 0.55 +
                lead * Math.abs(actor.climb) * 1.6 +
                Math.abs(actor.climb) * 0.15,
          0,
          0,
        );
      });
      actor.arms.forEach((arm, i) => {
        arm.rotation.x = sitting ? -0.3 : -stride * (i ? -1 : 1) * 0.3;
        arm.rotation.z = (i ? -1 : 1) * 0.04;
        actor.elbows[i].rotation.x = sitting ? -0.65 : -0.12;
      });
      actor.torso.rotation.z = sitting || reduced ? 0 : Math.sin(age * 1.2) * 0.007;
      actor.torso.rotation.x = sitting ? 0 : actor.climb * (actor.climb > 0 ? 0.12 : 0.05);
    }
    // Measure articulated shoes after posing, then raise the avatar if a toe would enter the floor.
    if (!sitting) {
      actor.visual.updateWorldMatrix(true, true);
      let bottom = Infinity;
      for (const foot of actor.feet) {
        feetBox.setFromObject(foot);
        bottom = Math.min(bottom, feetBox.min.y);
      }
      if (Number.isFinite(bottom)) actor.visual.position.y += floorY + 0.006 * scale - bottom;
      // Jumping (explore mode): a little hop on top of everything else.
      if (isBarista) actor.visual.position.y += jumpY;
      // A little bounce with every step (a hop when running).
      if (isBarista && moving && !reduced)
        actor.visual.position.y +=
          Math.abs(Math.sin(run ? runPhase : age * 7 + actor.phase.length)) *
          (run ? 0.06 : 0.022) *
          scale;
    }
    actor.drink.visible = !isBarista && sitting && actor.delivered;
    if (actor.drink.visible) {
      // Rest, reach for the cup, lift it, tip it for a few sips, then set it back on the table.
      const t = reduced ? 0 : (age + actor.drinkPhase) % DRINK_CYCLE,
        step = THREE.MathUtils.smoothstep;
      const reach = step(t, 3, 4) - step(t, 9, 9.8),
        lift = step(t, 4.2, 5.4) - step(t, 7.8, 8.9),
        sip = step(t, 5.4, 5.9) - step(t, 7.3, 7.8),
        lerp = THREE.MathUtils.lerp;
      const arm = actor.arms[1],
        elbow = actor.elbows[1];
      arm.rotation.x = lerp(lerp(-0.3, -0.9, reach), -0.62, lift);
      arm.rotation.z = -0.04 - 0.38 * lift;
      elbow.rotation.x = lerp(lerp(-0.65, -0.5, reach), -2.25, lift);
      // Head tips back a little while sipping, with a tiny swallow bob.
      actor.torso.rotation.x = -0.05 * sip + (reduced ? 0 : Math.sin(age * 9) * 0.006 * sip);
      actor.visual.updateWorldMatrix(true, true);
      const hand = actor.torso.worldToLocal(elbow.localToWorld(drinkHand.set(0, -0.15, 0.05)));
      actor.drink.position.copy(drinkRest).lerp(hand, step(lift, 0, 0.12));
      actor.drink.rotation.set(-0.85 * sip, 0, 0);
    }
    actor.serving.visible = isBarista && task === 'serving';
    actor.shadow.position.set(
      actor.visual.position.x,
      floorY + 0.004 * scale,
      actor.visual.position.z,
    );
    return arrived;
  }
  function chooseTask() {
    if (manual) {
      task =
        barista.phase === 'sitting' && barista.seat
          ? activity || 'sitting'
          : chore.kind && age < chore.until
            ? chore.kind
            : manualTask;
      return;
    }
    const guest = people
      .slice(1)
      .find((p) => p.key && p.status === 'selesai' && !p.delivered && p.phase === 'sitting');
    const next = guest
      ? 'serving'
      : people.some((p) => p.status === 'diproses' && p.key)
        ? 'cashier'
        : people.some((p) => ['sedang_dibuat', 'siap_disajikan'].includes(p.status) && p.key)
          ? 'preparing'
          : posActive
            ? 'cashier'
            : age < cleanUntil
              ? 'cleaning'
              : 'idle';
    const key = next + ':' + (guest?.key ?? '');
    if (key === taskKey) return;
    taskKey = key;
    task = next;
    servingGuest = guest ?? null;
    const approach = guest?.destination.clone();
    if (guest?.seat && approach) {
      const away = approach.clone().sub(guest.seat.surface);
      away.y = 0;
      if (away.lengthSq() > 0) approach.addScaledVector(away.normalize(), 0.32 * scale);
    }
    const goal = guest
      ? (paths.snap(approach!) ?? guest.destination)
      : anchors[
          next === 'preparing' || next === 'cleaning'
            ? 'working'
            : next === 'cashier'
              ? 'cashier'
              : 'idle'
        ];
    travel(barista, goal, 'working');
    barista.serveAge = 0;
  }
  return {
    root,
    paths,
    updateActivity,
    /** Explore mode on/off. Off hands Luna back to the automatic barista. */
    setManual(on: boolean) {
      manual = on;
      manualMove.set(0, 0, 0);
      manualRoute = [];
      manualNode = undefined;
      taskKey = '';
      if (!on) manualTask = 'idle';
    },
    /** World-space direction to walk (length 0–1 = speed). */
    drive(x: number, z: number) {
      manualMove.set(x, 0, z);
    },
    /** Walk Luna to a point along the café's paths; returns false if there is no way. */
    setOutdoors(world: {
      walk: (x: number, z: number, fromY?: number) => number | null;
      site: THREE.Box3;
    }) {
      outdoors = world;
    },
    /** True while Luna is out on the land around the café. */
    outdoorsNow: () => outside,
    /** A free seat (any chair, bench or lesehan spot) within reach of Luna, if any. */
    seatNear() {
      const taken = new Set(people.slice(1).flatMap((p) => (p.seat ? [p.seat.id] : [])));
      let best: CafeSeat | null = null,
        d = 0.75 * scale;
      for (const seat of seats) {
        if (taken.has(seat.id) || seat.takeaway) continue;
        const distance = Math.hypot(
          seat.surface.x - barista.position.x,
          seat.surface.z - barista.position.z,
        );
        if (distance < d && Math.abs(seat.surface.y - barista.position.y) < 0.75 * scale) {
          d = distance;
          best = seat;
        }
      }
      return best ? { id: best.id, position: best.surface } : null;
    },
    sit(id: string) {
      const seat = seats.find((s) => s.id === id);
      if (!seat) return false;
      if (seat.floor)
        seat.surface.y = paths.ground(
          new THREE.Vector3(seat.surface.x, seat.surface.y + 0.1 * scale, seat.surface.z),
        );
      manualRoute = [];
      chore.until = 0;
      barista.seat = seat;
      barista.headingAtSeat = seat.heading;
      barista.phase = 'sitting';
      return true;
    },
    stand: () => standUp(),
    /**
     * Settle at a spot (explore mode): `activity` is piano, guitar, cello, reading, lying, dangling
     * or resting. `position` is the seat (or, lying, where her body rests); `instrument` is the
     * guitar or cello she holds.
     */
    settle(spot: {
      position: THREE.Vector3;
      heading: number;
      activity: string;
      instrument?: THREE.Object3D | null;
    }) {
      manualRoute = [];
      chore.until = 0;
      barista.seat = {
        id: 'spot:' + spot.activity,
        surface: spot.position.clone(),
        floorY: spot.position.y,
        table: '',
        heading: spot.heading,
        takeaway: false,
      };
      barista.headingAtSeat = spot.heading;
      barista.phase = 'sitting';
      activity = spot.activity;
      held.instrument = spot.instrument ?? null;
    },
    /** What Luna is settled doing ('' when not). */
    activity: () => (barista.phase === 'sitting' ? activity : ''),
    /** Hop (explore mode): Space, or a double tap on a phone. */
    jump() {
      if (jumpY > 0.001 || barista.phase === 'sitting') return;
      jumpV = 3.1 * scale;
    },
    /** Run (explore mode): Shift, or a second finger held on the screen. */
    setRunning(on: boolean) {
      running = on;
    },
    /** Arrow over a guest (key), or none. */
    setMarker(key: string | null) {
      markerKey = key ?? '';
    },
    sitting: () => barista.phase === 'sitting' && !!barista.seat,
    /** Water a plant, sweep or wipe a table for a few seconds, facing `target`. */
    chore(kind: 'watering' | 'sweeping' | 'wiping', seconds: number, target?: THREE.Vector3) {
      if (barista.phase === 'sitting') standUp();
      manualRoute = [];
      chore.kind = kind;
      chore.until = age + seconds;
      if (target)
        barista.heading = Math.atan2(target.x - barista.position.x, target.z - barista.position.z);
    },
    /** Sound hooks: Luna's footfalls (with whether she runs) and landing from a hop. */
    setSoundHooks(step: ((run: boolean) => void) | null, land: (() => void) | null) {
      onStep = step;
      onLand = land;
    },
    /** What Luna is doing (idle, cashier, preparing, sweeping, …) and whether her umbrella is up. */
    task: () => task,
    umbrellaUp: () => umbrella.visible,
    /** Rain over Luna's head (no roof): she carries her umbrella. */
    setUmbrella(on: boolean) {
      umbrellaWanted = on;
    },
    choreActive: () => !!chore.kind && age < chore.until,
    walkTo(point: THREE.Vector3) {
      if (barista.phase === 'sitting') standUp();
      const route = paths.path(barista.position, point, 'staff');
      manualRoute = route ?? [];
      return !!route;
    },
    walking: () => manualRoute.length > 0,
    /** Pose while standing: 'idle', 'cashier', 'preparing', 'serving' (carrying a tray). */
    setManualTask(next: string) {
      manualTask = next;
    },
    baristaPosition: () => barista.position,
    /** Which way Luna faces (radians about Y; 0 = +Z). */
    baristaHeading: () => barista.visual.rotation.y,
    stations: { cashier: anchors.cashier, bar: anchors.working, entrance: anchors.entrance },
    /** Guests currently in the scene (for proximity checks). */
    guests: () =>
      people
        .slice(1)
        .filter((p) => p.key && p.visual.visible)
        .map((p) => ({
          key: p.key,
          phase: p.phase,
          status: p.status,
          // Seated guests: the floor spot beside their seat, where Luna can stand.
          position: p.phase === 'sitting' ? p.destination : p.position,
        })),
    /** Hands the drink to a guest: they sip for a while, then leave. */
    deliver(key: string) {
      const guest = people.slice(1).find((p) => p.key === key);
      if (!guest) return;
      guest.delivered = true;
      guest.drinkUntil = age + 45;
      guest.drinkUntilWall = Date.now() + 45_000;
    },
    inspect: () => ({
      task,
      people: people.map((p) => ({
        key: p.key,
        status: p.status,
        phase: p.phase,
        position: p.position.clone(),
        visual: p.visual.position.clone(),
        seat: p.seat?.surface.clone(),
        visible: p.visual.visible,
        delivered: p.delivered,
        waypoints: p.waypoints.map((v) => v.clone()),
      })),
    }),
    update(delta: number, reduced: boolean) {
      const dt = Math.min(delta, 0.05);
      age += dt;
      chooseTask();
      if (manual) {
        // Walk where the stick points, staying on the café's walkable floors (no walls, no void).
        if (manualMove.lengthSq() > 0.0001) {
          manualRoute = [];
          chore.until = 0;
          if (barista.phase === 'sitting') standUp();
        } else if (manualRoute.length) {
          // Follow the route at walking pace.
          let budget = 1.15 * scale * dt;
          while (budget > 0 && manualRoute.length) {
            const goal = manualRoute[0],
              step = goal.clone().sub(barista.position),
              distance = step.length();
            if (distance <= budget) {
              barista.position.copy(goal);
              manualRoute.shift();
              budget -= distance;
            } else {
              barista.position.addScaledVector(step, budget / distance);
              budget = 0;
            }
            if (distance > 0.001) barista.heading = Math.atan2(step.x, step.z);
          }
        }
        if (manualMove.lengthSq() > 0.0001) {
          const speed = (running ? 2.3 : 1.15) * scale * Math.min(1, manualMove.length());
          manualNext
            .copy(barista.position)
            .addScaledVector(manualMove.clone().normalize(), speed * dt);
          // Straight ahead, else veer up to ~70° to slide along a wall or rail (narrow stairs).
          let free: { point: THREE.Vector3; node?: number } | null = null;
          for (const turn of STEER) {
            const c = Math.cos(turn),
              sn = Math.sin(turn),
              dx = manualNext.x - barista.position.x,
              dz = manualNext.z - barista.position.z;
            manualSlide.set(
              barista.position.x + (dx * c - dz * sn) * c,
              barista.position.y,
              barista.position.z + (dx * sn + dz * c) * c,
            );
            free = freeStep(manualSlide);
            if (free) break;
          }
          if (free) {
            barista.position.copy(free.point);
            manualNode = free.node;
            outside = free.node === undefined;
          }
          barista.heading = Math.atan2(manualMove.x, manualMove.z);
        }
        barista.waypoints = [];
        barista.waypoint = 0;
        barista.yieldTo = null;
      }
      if (jumpV !== 0 || jumpY > 0) {
        jumpY += jumpV * dt;
        jumpV -= 11 * scale * dt;
        if (jumpY <= 0) {
          jumpY = jumpV = 0;
          onLand?.();
        }
      }
      const arrived = animate(barista, dt, reduced, true);
      updateProps(dt, reduced);
      const marked = markerKey ? people.slice(1).find((p) => p.key === markerKey) : null;
      marker.visible = !!marked && marked.visual.visible;
      if (marked) {
        marker.position.copy(marked.visual.position);
        marker.position.y += (1.6 + (reduced ? 0 : Math.sin(age * 4) * 0.08)) * scale;
        marker.rotation.y += reduced ? 0 : dt * 2;
      }
      const // Friends at the same table can block the last step; standing beside any of them is enough.
        atTable =
          task === 'serving' &&
          !!servingGuest &&
          people
            .slice(1)
            .some(
              (p) =>
                p.key &&
                p.group === servingGuest!.group &&
                p.seat &&
                Math.hypot(
                  p.seat.surface.x - barista.position.x,
                  p.seat.surface.z - barista.position.z,
                ) <
                  0.6 * scale,
            );
      if (!manual && (arrived || atTable) && task === 'serving' && servingGuest) {
        barista.serveAge += dt;
        if (barista.serveAge > 2) {
          // One tray for the whole group at the table, then wipe down the bar.
          for (const guest of people.slice(1))
            if (
              guest === servingGuest ||
              (guest.key &&
                guest.group === servingGuest.group &&
                guest.status === 'selesai' &&
                guest.phase === 'sitting' &&
                !guest.delivered)
            ) {
              guest.delivered = true;
              guest.drinkUntil = age + 90;
              guest.drinkUntilWall = Date.now() + 90_000;
              rememberServed(guest.key);
            }
          cleanUntil = age + 6;
          taskKey = '';
        }
      }
      for (const guest of people.slice(1)) {
        if (!guest.key) continue;
        const arrived = animate(guest, dt, reduced, false);
        if (
          guest.status === 'selesai' &&
          guest.delivered &&
          guest.drinkUntil &&
          (age >= guest.drinkUntil || Date.now() >= guest.drinkUntilWall) &&
          guest.phase !== 'leaving'
        )
          exit(guest);
        if (guest.phase === 'leaving' && arrived) {
          guest.visual.visible = guest.shadow.visible = false;
          retired.add(guest.key);
          guest.key = '';
          guest.group = '';
          guest.status = '';
          guest.seat = null;
          guest.waypoints = [];
        }
      }
    },
    dispose() {
      root.removeFromParent();
      detailed?.dispose();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
