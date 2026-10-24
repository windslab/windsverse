import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { findCafeSeats, tableKey, type CafeSeat } from '@/lib/cafe-seats';
import { type CafeVisitor, type CafeActivity } from '@/lib/cafe-activity';

import { type CafePaths } from '@/lib/cafe-paths';
import { lunaCafeRig } from './luna/cafe-rig';

/** Lightweight stand-in people; coordinates match the existing cafe model. */
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
    const drink = mesh(elbows[1], cylinder, cup, [0, -0.13, 0.055], [0.04, 0.09, 0.04]);
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
      delivered: false,
      serveAge: 0,
    };
  }
  const seats = findCafeSeats(cafe);
  // Barista + MAX_SCENE_GUESTS (lib/cafe-visitors.ts) guests.
  const people = Array.from({ length: 9 }, (_, i) => person(i));
  type Person = (typeof people)[number];
  const retired = new Set<string>();
  const barista = people[0];
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
      target.y = paths.ground(new THREE.Vector3(target.x, seat.surface.y - 0.3 * scale, target.z));
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
        const index = people
            .slice(1)
            .filter((p) => p.key && p.status === 'diproses')
            .indexOf(actor),
          queue = anchors.waiting
            .clone()
            .add(new THREE.Vector3(0, 0, -Math.max(0, index) * 0.48 * scale));
        travel(actor, queue, 'queue');
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
  }
  people.slice(1).forEach((p) => {
    p.visual.visible = p.shadow.visible = false;
  });
  let rerouteAt = 0;
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
            (p === barista || p.key) &&
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
        blockers.some(
          (p) =>
            Math.hypot(p.x - next.x, p.z - next.z) < 0.29 * scale &&
            Math.hypot(p.x - next.x, p.z - next.z) <
              Math.hypot(p.x - actor.position.x, p.z - actor.position.z),
        )
      ) {
        actor.blockedFor += dt;
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
      actor.heading = Math.atan2(direction.x, direction.z);
      actor.position.addScaledVector(direction, amount / distance);
      budget -= amount;
      moved += amount;
      if (amount === distance) actor.waypoint++;
    }
    const arrived = actor.waypoint >= actor.waypoints.length,
      moving = moved > 0.0001 * scale;
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
    const heading = sitting
      ? actor.headingAtSeat
      : !moving && actor.phase === 'queue'
        ? Math.PI / 2
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
    actor.visual.position.y = ground;
    if (sitting && actor.seat) {
      const target = actor.seat.surface;
      actor.visual.position.set(target.x, target.y - 0.445 * scale, target.z);
    }
    const stride = reduced ? 0 : moving ? Math.sin(age * 7 + actor.phase.length) * 0.8 : 0;
    if (isBarista && detailed)
      detailed.update(age, stride, moving && task === 'serving' ? 'carrying' : task, reduced);
    else {
      actor.legs.forEach((leg, i) => {
        leg.rotation.x = sitting ? -Math.PI / 2 : stride * (i ? -1 : 1) * 0.5;
        actor.knees[i].rotation.x = sitting
          ? Math.PI / 2
          : Math.max(0, stride * (i ? 1 : -1)) * 0.55;
      });
      actor.arms.forEach((arm, i) => {
        arm.rotation.x = sitting ? -0.3 : -stride * (i ? -1 : 1) * 0.3;
        arm.rotation.z = (i ? -1 : 1) * 0.04;
        actor.elbows[i].rotation.x = sitting ? -0.65 : -0.12;
      });
      actor.torso.rotation.z = sitting || reduced ? 0 : Math.sin(age * 1.2) * 0.007;
    }
    // Measure articulated shoes after posing, then raise the avatar if a toe would enter the floor.
    if (!sitting) {
      actor.visual.updateWorldMatrix(true, true);
      let bottom = Infinity;
      for (const foot of actor.feet) {
        feetBox.setFromObject(foot);
        bottom = Math.min(bottom, feetBox.min.y);
      }
      if (Number.isFinite(bottom)) actor.visual.position.y += ground + 0.006 * scale - bottom;
    }
    actor.drink.visible = !isBarista && sitting && actor.delivered;
    if (actor.drink.visible) {
      const sip = reduced ? 0 : Math.pow(Math.max(0, Math.sin(age * 0.75)), 4);
      actor.arms[1].rotation.x = -0.45 - 0.55 * sip;
      actor.elbows[1].rotation.x = -0.8 - 0.6 * sip;
    }
    actor.serving.visible = isBarista && task === 'serving';
    actor.shadow.position.set(
      actor.visual.position.x,
      ground + 0.004 * scale,
      actor.visual.position.z,
    );
    return arrived;
  }
  function chooseTask() {
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
    updateActivity,
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
      const arrived = animate(barista, dt, reduced, true),
        // Friends at the same table can block the last step; standing beside any of them is enough.
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
      if ((arrived || atTable) && task === 'serving' && servingGuest) {
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
