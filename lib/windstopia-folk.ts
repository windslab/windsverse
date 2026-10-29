// The people (and cows) of Windstopia. These are placeholders so the island has life: each one has
// a rough job, a place to do it, and a short routine (work, walk to the next spot, rest). Their
// real identities will come later with the lore; `FOLK` below is the one list to fill in then.
import * as THREE from 'three';
import { toonGradient } from './toon';
import type { HouseKind, VillagePlan } from './windstopia-village';

type Task = 'plant' | 'hoe' | 'pick' | 'fish' | 'sit' | 'herd' | 'play' | 'sweep' | 'idle';

/** Placeholder residents. Names and stories are to be replaced with the real characters. */
export const FOLK: {
  id: string;
  name: string;
  role: string;
  home: HouseKind;
  look: { skin: string; hair: string; shirt: string; pants: string; hat?: string; scale?: number };
}[] = [
  {
    id: 'warga-1',
    name: 'Warga 1',
    role: 'Petani sawah',
    home: 'sawah',
    look: { skin: '#c98d62', hair: '#2b2220', shirt: '#6f8f5a', pants: '#4a4a52', hat: '#d9b96a' },
  },
  {
    id: 'warga-2',
    name: 'Warga 2',
    role: 'Petani sawah',
    home: 'sawah',
    look: { skin: '#b9794f', hair: '#3a2a20', shirt: '#b8574a', pants: '#44464f', hat: '#d9b96a' },
  },
  {
    id: 'warga-3',
    name: 'Warga 3',
    role: 'Petani sawah',
    home: 'sawah',
    look: { skin: '#d9a273', hair: '#8a6a4a', shirt: '#4a6fa5', pants: '#5a5242', hat: '#d9b96a' },
  },
  {
    id: 'warga-4',
    name: 'Warga 4',
    role: 'Petani kebun',
    home: 'kebun',
    look: { skin: '#c98d62', hair: '#2b2220', shirt: '#e0b34a', pants: '#5a5242' },
  },
  {
    id: 'warga-5',
    name: 'Warga 5',
    role: 'Petani kebun',
    home: 'kebun',
    look: { skin: '#a8714a', hair: '#1f1a18', shirt: '#7aa38a', pants: '#3f4a5a', hat: '#c9a45a' },
  },
  {
    id: 'warga-6',
    name: 'Warga 6',
    role: 'Nelayan',
    home: 'pantai',
    look: { skin: '#b9794f', hair: '#5a5a5a', shirt: '#3f6f8f', pants: '#4a4a52', hat: '#e8dcc0' },
  },
  {
    id: 'warga-7',
    name: 'Warga 7',
    role: 'Nelayan',
    home: 'pantai',
    look: { skin: '#c98d62', hair: '#2b2220', shirt: '#e8e2d0', pants: '#6a5a46', hat: '#3f6f8f' },
  },
  {
    id: 'warga-8',
    name: 'Warga 8',
    role: 'Penjaga danau',
    home: 'danau',
    look: { skin: '#e0b48a', hair: '#6a3a28', shirt: '#c97a8a', pants: '#4f5a6a' },
  },
  {
    id: 'warga-9',
    name: 'Warga 9',
    role: 'Penggembala',
    home: 'lereng',
    look: { skin: '#d9a273', hair: '#4a3a30', shirt: '#9a4a3a', pants: '#4a5a4a', hat: '#6a6a50' },
  },
  {
    id: 'warga-10',
    name: 'Warga 10',
    role: 'Anak warga',
    home: 'sungai',
    look: { skin: '#d9a273', hair: '#2b2220', shirt: '#f2c14e', pants: '#4a6fa5', scale: 0.62 },
  },
  {
    id: 'warga-11',
    name: 'Warga 11',
    role: 'Anak warga',
    home: 'sungai',
    look: { skin: '#c98d62', hair: '#3a2a20', shirt: '#e0453b', pants: '#5a6a4a', scale: 0.58 },
  },
  {
    id: 'warga-12',
    name: 'Warga 12',
    role: 'Warga rumah',
    home: 'sungai',
    look: { skin: '#e0b48a', hair: '#8a6a4a', shirt: '#7aa3c8', pants: '#5a5242' },
  },
];

type Stop = { at: THREE.Vector3; task: Task; seconds: [number, number]; face?: THREE.Vector3 };
type Person = {
  id: string;
  root: THREE.Group;
  body: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  tools: Partial<Record<'hoe' | 'rod' | 'staff' | 'broom', THREE.Object3D>>;
  stops: Stop[];
  stop: number;
  phase: 'walk' | 'work';
  timer: number;
  speed: number;
  heading: number;
  seed: number;
  /** Walking with a swing (0 = standing still). */
  gait: number;
  scale: number;
};

export function createFolk(ctx: {
  plan: VillagePlan;
  height: (x: number, z: number) => number;
  pier: { base: THREE.Vector3; dir: THREE.Vector3; length: number; deckY: number };
  seaOut: (x: number, z: number) => number;
  SEA: number;
  away: THREE.Vector3;
}) {
  const { plan, height } = ctx;
  const V = THREE.Vector3;
  const group = new THREE.Group();
  group.name = 'World_Folk';
  const geometries: THREE.BufferGeometry[] = [],
    materials: THREE.Material[] = [];
  const toon = (color: string) => {
    const m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() });
    materials.push(m);
    return m;
  };
  const cache = new Map<string, THREE.MeshToonMaterial>();
  const shade = (color: string) => {
    let m = cache.get(color);
    if (!m) cache.set(color, (m = toon(color)));
    return m;
  };
  const sphere = new THREE.SphereGeometry(1, 12, 9),
    cyl = new THREE.CylinderGeometry(1, 1, 1, 10),
    cone = new THREE.ConeGeometry(1, 1, 12),
    block = new THREE.BoxGeometry(1, 1, 1);
  geometries.push(sphere, cyl, cone, block);
  const mesh = (
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    color: string,
    position: number[],
    size: number[],
    rotation: number[] = [0, 0, 0],
  ) => {
    const m = new THREE.Mesh(geometry, shade(color));
    m.position.fromArray(position);
    m.scale.fromArray(size);
    m.rotation.set(rotation[0], rotation[1], rotation[2]);
    parent.add(m);
    return m;
  };
  const groundAt = (x: number, z: number) => height(x, z);
  const rand = (n: number) => {
    const v = Math.sin(n * 91.7 + 17.3) * 43758.5453;
    return v - Math.floor(v);
  };

  // ---- A person, built from simple parts (the same chunky style as the café's guests). -------
  const build = (look: (typeof FOLK)[number]['look']): Omit<Person, 'stops' | 'id' | 'seed'> => {
    const root = new THREE.Group(),
      body = new THREE.Group(),
      torso = new THREE.Group(),
      head = new THREE.Group();
    const scale = (look.scale ?? 1) * 0.9;
    body.scale.setScalar(scale);
    root.add(body);
    // Torso pivots at the hip, so people can bend forward.
    torso.position.y = 0.5;
    body.add(torso);
    mesh(torso, cyl, look.shirt, [0, 0.26, 0], [0.125, 0.35, 0.115]);
    mesh(torso, cyl, look.skin, [0, 0.44, 0], [0.05, 0.1, 0.05]);
    head.position.y = 0.6;
    torso.add(head);
    mesh(head, sphere, look.skin, [0, 0, 0], [0.17, 0.19, 0.155]);
    mesh(head, sphere, look.hair, [0, 0.03, -0.01], [0.18, 0.17, 0.165]);
    mesh(head, sphere, '#2a2326', [-0.057, -0.005, 0.15], [0.016, 0.026, 0.01]);
    mesh(head, sphere, '#2a2326', [0.057, -0.005, 0.15], [0.016, 0.026, 0.01]);
    if (look.hat) {
      // A wide straw/cloth hat.
      mesh(head, cyl, look.hat, [0, 0.13, 0], [0.34, 0.02, 0.34]);
      mesh(head, cone, look.hat, [0, 0.21, 0], [0.16, 0.14, 0.16]);
    }
    const arm = (side: number) => {
      const g = new THREE.Group();
      g.position.set(side * 0.18, 0.38, 0);
      torso.add(g);
      mesh(g, cyl, look.shirt, [0, -0.07, 0], [0.065, 0.16, 0.065]);
      mesh(g, cyl, look.skin, [0, -0.2, 0], [0.04, 0.17, 0.04]);
      mesh(g, sphere, look.skin, [0, -0.3, 0], [0.047, 0.05, 0.045]);
      return g;
    };
    const armL = arm(-1),
      armR = arm(1);
    const leg = (side: number) => {
      const g = new THREE.Group();
      g.position.set(side * 0.075, 0.5, 0);
      body.add(g);
      mesh(g, cyl, look.pants, [0, -0.22, 0], [0.058, 0.44, 0.058]);
      mesh(g, block, '#3a2e28', [0, -0.46, 0.03], [0.1, 0.06, 0.18]);
      return g;
    };
    const legL = leg(-1),
      legR = leg(1);
    // Tools, each held in the right hand (put away when not in use).
    const tools: Person['tools'] = {};
    const hold = (name: keyof Person['tools'], make: (g: THREE.Group) => void) => {
      const g = new THREE.Group();
      g.position.set(0, -0.3, 0.02);
      g.visible = false;
      armR.add(g);
      make(g);
      tools[name] = g;
    };
    hold('hoe', (g) => {
      mesh(g, cyl, '#8a6a4a', [0, 0.05, 0.25], [0.014, 0.9, 0.014], [Math.PI / 2.6, 0, 0]);
      mesh(g, block, '#7a7a7a', [0, -0.18, 0.62], [0.12, 0.012, 0.08]);
    });
    hold('rod', (g) => {
      mesh(g, cyl, '#7a5a3a', [0, 0.2, 0.55], [0.01, 1.5, 0.01], [Math.PI / 2.5, 0, 0]);
      // The line hangs from the tip to a bobber.
      mesh(g, cyl, '#f2f2f2', [0, -0.55, 1.2], [0.003, 1.2, 0.003]);
      mesh(g, sphere, '#e0453b', [0, -1.15, 1.2], [0.03, 0.03, 0.03]);
    });
    hold('staff', (g) => {
      mesh(g, cyl, '#8a6a4a', [0, 0.1, 0.02], [0.016, 1.25, 0.016]);
    });
    hold('broom', (g) => {
      mesh(g, cyl, '#8a6a4a', [0, -0.05, 0.1], [0.012, 0.9, 0.012], [Math.PI / 5, 0, 0]);
      mesh(g, block, '#d8b466', [0, -0.45, 0.32], [0.15, 0.06, 0.06]);
    });
    root.visible = true;
    return {
      root,
      body,
      torso,
      head,
      armL,
      armR,
      legL,
      legR,
      tools,
      stop: 0,
      phase: 'work',
      timer: 0,
      speed: 0.55,
      heading: 0,
      gait: 0,
      scale,
    };
  };

  // ---- Routines ----------------------------------------------------------------------------------
  const house = (id: HouseKind) => plan.houses.find((h) => h.id === id)!;
  const flatP = (p: THREE.Vector3) => new V(p.x, 0, p.z);
  const plotPoint = (i: number) => new V(plan.plots[i].x, 0, plan.plots[i].z);
  const along = (base: THREE.Vector3, du: number, dw: number) => {
    const u = plan.uOf(base) + du,
      w = plan.wOf(base) + dw;
    return plan.at(u, w);
  };
  const stopsFor = (id: string): Stop[] => {
    const rect = plan.kebun.rect;
    const kebunAt = (u: number, w: number) => plan.at(u, w);
    switch (id) {
      case 'warga-1':
        return [
          { at: along(plotPoint(0), -2, 0), task: 'plant', seconds: [26, 40] },
          { at: along(plotPoint(1), 1, 1), task: 'plant', seconds: [26, 40] },
          { at: along(plotPoint(5), 0, 0), task: 'plant', seconds: [24, 38] },
          { at: house('sawah').approach, task: 'idle', seconds: [8, 14] },
        ];
      case 'warga-2':
        return [
          { at: along(plotPoint(6), -1, 0), task: 'plant', seconds: [30, 44] },
          { at: along(plotPoint(7), 2, 0), task: 'plant', seconds: [26, 40] },
          { at: along(plotPoint(10), 0, 0), task: 'plant', seconds: [26, 40] },
        ];
      case 'warga-3':
        return [
          { at: along(plotPoint(3), 3, 3.6), task: 'hoe', seconds: [20, 30] },
          { at: along(plotPoint(2), -3, 3.6), task: 'hoe', seconds: [20, 30] },
          { at: along(plotPoint(11), 0, 3.6), task: 'hoe', seconds: [20, 30] },
        ];
      case 'warga-4':
        return [
          { at: kebunAt(rect.u[0] + 14, rect.w[0] + 12), task: 'pick', seconds: [22, 34] },
          { at: kebunAt(rect.u[0] + 22, rect.w[0] + 12), task: 'pick', seconds: [22, 34] },
          { at: kebunAt(rect.u[0] + 30, rect.w[0] + 22), task: 'pick', seconds: [22, 34] },
          { at: house('kebun').approach, task: 'idle', seconds: [8, 14] },
        ];
      case 'warga-5':
        return [
          { at: kebunAt(rect.u[1] - 14, rect.w[0] + 10), task: 'hoe', seconds: [20, 32] },
          { at: kebunAt(rect.u[1] - 22, rect.w[0] + 20), task: 'hoe', seconds: [20, 32] },
          { at: kebunAt(rect.u[1] - 14, rect.w[0] + 30), task: 'hoe', seconds: [20, 32] },
        ];
      case 'warga-6': {
        // Sitting on the pier with a rod, looking out to sea.
        const p = ctx.pier.base.clone().addScaledVector(ctx.pier.dir, ctx.pier.length * 0.62);
        p.addScaledVector(new V(-ctx.pier.dir.z, 0, ctx.pier.dir.x), 0.45);
        return [
          {
            at: p,
            task: 'fish',
            seconds: [999, 999],
            face: p.clone().addScaledVector(ctx.pier.dir, 5),
          },
        ];
      }
      case 'warga-7': {
        // Standing at the water's edge, in front of the beach house.
        const hp = house('pantai');
        const p = new V(hp.x, 0, hp.z);
        for (let k = 0; k < 40; k++) {
          p.addScaledVector(ctx.away, 0.5);
          if (ctx.seaOut(p.x, p.z) > ctx.SEA - 5) break;
        }
        return [
          {
            at: p.clone(),
            task: 'fish',
            seconds: [40, 60],
            face: p.clone().addScaledVector(ctx.away, 6),
          },
          { at: house('pantai').approach, task: 'idle', seconds: [10, 18] },
        ];
      }
      case 'warga-8': {
        const hd = house('danau');
        const p = new V(hd.x, 0, hd.z)
          .addScaledVector(new V(-ctx.away.z, 0, ctx.away.x), -7)
          .addScaledVector(ctx.away, 4);
        return [
          { at: p, task: 'sit', seconds: [40, 70], face: p.clone().addScaledVector(ctx.away, 5) },
          { at: hd.approach, task: 'idle', seconds: [10, 16] },
        ];
      }
      case 'warga-9': {
        const hl = house('lereng');
        const dir = new V(Math.sin(hl.yaw), 0, Math.cos(hl.yaw));
        const spots = [10, 18, 14].map((d, k) =>
          hl.approach
            .clone()
            .addScaledVector(dir, d)
            .addScaledVector(new V(-dir.z, 0, dir.x), (k - 1) * 7),
        );
        return [
          { at: spots[0], task: 'herd', seconds: [14, 24] },
          { at: spots[1], task: 'herd', seconds: [14, 24] },
          { at: spots[2], task: 'herd', seconds: [14, 24] },
          { at: hl.approach, task: 'idle', seconds: [8, 14] },
        ];
      }
      case 'warga-10':
      case 'warga-11': {
        const hs = house('sungai');
        const c = hs.approach
          .clone()
          .addScaledVector(new V(Math.sin(hs.yaw), 0, Math.cos(hs.yaw)), 5);
        const phase = id === 'warga-11' ? Math.PI : 0;
        return Array.from({ length: 8 }, (_, k) => ({
          at: c
            .clone()
            .add(new V(Math.cos(k * 0.785 + phase) * 4.5, 0, Math.sin(k * 0.785 + phase) * 4.5)),
          task: 'play' as Task,
          seconds: [0.1, 0.1] as [number, number],
        }));
      }
      default: {
        const hs = house('sungai');
        return [
          {
            at: hs.approach
              .clone()
              .addScaledVector(new V(Math.cos(hs.yaw), 0, -Math.sin(hs.yaw)), 2),
            task: 'sweep',
            seconds: [20, 30],
          },
          {
            at: hs.approach
              .clone()
              .addScaledVector(new V(Math.cos(hs.yaw), 0, -Math.sin(hs.yaw)), -2),
            task: 'idle',
            seconds: [10, 16],
          },
        ];
      }
    }
  };

  const people: Person[] = FOLK.map((f, i) => {
    const p = build(f.look) as Person;
    p.id = f.id;
    p.seed = i * 3.7 + 1;
    p.stops = stopsFor(f.id).map((s) => ({ ...s, at: flatP(s.at) }));
    const first = p.stops[0].at;
    p.root.position.set(
      first.x,
      p.id === 'warga-6' ? ctx.pier.deckY : groundAt(first.x, first.z),
      first.z,
    );
    p.stop = 0;
    p.phase = 'work';
    p.timer = p.stops[0].seconds[0] * 0.3 + rand(i) * 6;
    p.speed = f.id === 'warga-10' || f.id === 'warga-11' ? 1.9 : 0.55;
    group.add(p.root);
    return p;
  });

  // ---- Cows ----------------------------------------------------------------------------------------
  type Cow = {
    root: THREE.Group;
    head: THREE.Group;
    legs: THREE.Group[];
    tail: THREE.Group;
    home: THREE.Vector3;
    target: THREE.Vector3;
    heading: number;
    state: 'graze' | 'walk';
    timer: number;
    seed: number;
  };
  const cows: Cow[] = [];
  {
    const hl = house('lereng'),
      dir = new V(Math.sin(hl.yaw), 0, Math.cos(hl.yaw)),
      side = new V(-dir.z, 0, dir.x);
    const centre = hl.approach.clone().addScaledVector(dir, 14);
    for (let k = 0; k < 4; k++) {
      const root = new THREE.Group();
      const body = new THREE.Group();
      root.add(body);
      mesh(body, block, '#f4f1ea', [0, 0.95, 0], [0.9, 0.8, 1.9]);
      mesh(body, block, '#6a4a35', [0.1, 1.0, -0.1], [0.92, 0.5, 0.6]);
      if (k % 2) mesh(body, block, '#2f2a28', [-0.1, 1.0, 0.55], [0.92, 0.45, 0.45]);
      mesh(body, block, '#e8b7a6', [0, 0.6, 0.98], [0.5, 0.18, 0.04]);
      const head = new THREE.Group();
      head.position.set(0, 1.15, 1.0);
      body.add(head);
      mesh(head, block, '#f4f1ea', [0, 0, 0.3], [0.5, 0.5, 0.6]);
      mesh(head, block, '#e8b7a6', [0, -0.12, 0.62], [0.4, 0.28, 0.12]);
      mesh(head, block, '#6a4a35', [-0.32, 0.2, 0.15], [0.16, 0.1, 0.2]);
      mesh(head, block, '#6a4a35', [0.32, 0.2, 0.15], [0.16, 0.1, 0.2]);
      mesh(head, cyl, '#e8e2d0', [-0.2, 0.34, 0.1], [0.04, 0.2, 0.04]);
      mesh(head, cyl, '#e8e2d0', [0.2, 0.34, 0.1], [0.04, 0.2, 0.04]);
      // A brass bell on a leather strap.
      mesh(body, cyl, '#b0803a', [0, 0.66, 1.02], [0.1, 0.14, 0.1]);
      const legs = [
        [-0.28, -0.7],
        [0.28, -0.7],
        [-0.28, 0.7],
        [0.28, 0.7],
      ].map(([x, z]) => {
        const g = new THREE.Group();
        g.position.set(x, 0.6, z);
        body.add(g);
        mesh(g, block, '#ebe6dc', [0, -0.3, 0], [0.18, 0.6, 0.18]);
        mesh(g, block, '#3a3230', [0, -0.62, 0.01], [0.2, 0.08, 0.22]);
        return g;
      });
      const tail = new THREE.Group();
      tail.position.set(0, 1.25, -0.95);
      body.add(tail);
      mesh(tail, cyl, '#d9d3c6', [0, -0.3, -0.05], [0.03, 0.6, 0.03]);
      const start = centre
        .clone()
        .addScaledVector(side, (k - 1.5) * 4)
        .addScaledVector(dir, (rand(k) - 0.5) * 6);
      root.position.set(start.x, groundAt(start.x, start.z), start.z);
      root.scale.setScalar(0.86);
      group.add(root);
      cows.push({
        root,
        head,
        legs,
        tail,
        home: centre.clone(),
        target: start.clone(),
        heading: rand(k + 9) * 6,
        state: 'graze',
        timer: rand(k + 3) * 8,
        seed: k * 5.1,
      });
    }
  }

  // ---- A few benches (lake, porches) -------------------------------------------------------------------
  {
    const bench = (x: number, z: number, yaw: number) => {
      const g = new THREE.Group();
      mesh(g, block, '#8a6a4a', [0, 0.42, 0], [1.5, 0.07, 0.45]);
      mesh(g, block, '#8a6a4a', [0, 0.75, -0.2], [1.5, 0.3, 0.05]);
      for (const sx of [-0.65, 0.65]) mesh(g, block, '#6a4a35', [sx, 0.2, 0], [0.08, 0.4, 0.4]);
      g.position.set(x, groundAt(x, z), z);
      g.rotation.y = yaw;
      group.add(g);
    };
    const hd = house('danau');
    const p = new V(hd.x, 0, hd.z)
      .addScaledVector(new V(-ctx.away.z, 0, ctx.away.x), -7)
      .addScaledVector(ctx.away, 4);
    bench(p.x, p.z, Math.atan2(ctx.away.x, ctx.away.z) + Math.PI);
    for (const id of ['lereng', 'sungai', 'kebun', 'sawah', 'pantai'] as const) {
      const h = house(id);
      const dir = new V(Math.sin(h.yaw), 0, Math.cos(h.yaw));
      const q = new V(h.x, 0, h.z)
        .addScaledVector(dir, h.hz + 1.2)
        .addScaledVector(new V(-dir.z, 0, dir.x), h.hx * 0.7 + 1.0);
      bench(q.x, q.z, h.yaw + Math.PI);
    }
  }

  // ---- Per-frame -----------------------------------------------------------------------------------------
  const toLuna = new V();
  let lastTime = 0;
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const turn = (from: number, to: number, rate: number) => from + wrap(to - from) * rate;

  const pose = (p: Person, time: number, task: Task, waving: boolean, moving: boolean) => {
    const t = time + p.seed;
    const sw = Math.sin(t * (task === 'play' ? 10 : 6.5));
    const walking = moving;
    // Defaults: standing, arms at the sides.
    let lean = 0,
      armLx = 0,
      armRx = 0,
      armLz = 0.05,
      armRz = -0.05,
      legLx = 0,
      legRx = 0,
      bodyY = 0,
      tool: keyof Person['tools'] | '' = '',
      headX = 0;
    if (walking) {
      const k = task === 'play' ? 0.9 : 0.55;
      legLx = sw * k;
      legRx = -sw * k;
      armLx = -sw * k * 0.7;
      armRx = sw * k * 0.7;
      bodyY =
        Math.abs(Math.sin(t * (task === 'play' ? 10 : 6.5))) * (task === 'play' ? 0.05 : 0.015);
      if (task === 'play') {
        armLz = 0.9 + sw * 0.2;
        armRz = -0.9 - sw * 0.2;
      }
      if (task === 'herd') tool = 'staff';
      if (p.id === 'warga-6' || p.id === 'warga-7') tool = '';
    } else {
      switch (task) {
        case 'plant':
          // Bent over the seedlings, hands dipping into the water.
          lean = 1.05;
          legLx = -0.25;
          legRx = 0.25;
          armLx = 0.5 + Math.sin(t * 2.4) * 0.5;
          armRx = 0.5 + Math.sin(t * 2.4 + 1.6) * 0.5;
          break;
        case 'hoe':
          lean = 0.35 + Math.max(0, Math.sin(t * 2.2)) * 0.25;
          tool = 'hoe';
          armRx = -1.3 + Math.sin(t * 2.2) * 1.0;
          armLx = -1.1 + Math.sin(t * 2.2) * 0.9;
          break;
        case 'pick':
          lean = -0.05;
          armRx = -2.4 + Math.sin(t * 1.8) * 0.35;
          armLx = Math.sin(t * 1.8 + 1) * 0.15;
          headX = -0.25;
          break;
        case 'fish': {
          tool = 'rod';
          armRx = -1.0 + Math.sin(t * 0.7) * 0.05 - Math.max(0, Math.sin(t * 0.23)) * 0.5;
          armLx = -0.8;
          break;
        }
        case 'sit':
          armLx = -0.4;
          armRx = -0.4;
          headX = 0.1 + Math.sin(t * 0.4) * 0.05;
          break;
        case 'herd':
          tool = 'staff';
          armRx = -0.3;
          break;
        case 'sweep':
          tool = 'broom';
          lean = 0.2;
          armRx = -0.9 + Math.sin(t * 3.2) * 0.25;
          armLx = -0.7 + Math.sin(t * 3.2) * 0.25;
          break;
        default:
          headX = Math.sin(t * 0.5) * 0.04;
          armLx = Math.sin(t * 1.1) * 0.03;
      }
    }
    // Sitting folds the legs forward and lowers the body onto the seat.
    if (task === 'sit' || task === 'fish') {
      const sitting = task === 'sit' || (task === 'fish' && p.id === 'warga-6');
      if (sitting) {
        legLx = legRx = -1.45;
        bodyY = -0.22;
      }
    }
    if (waving) {
      armRx = -3.0 + Math.sin(time * 9) * 0.25;
      armRz = -0.35;
      tool = '';
    }
    p.torso.rotation.x = lean;
    p.head.rotation.x = headX - lean * 0.6;
    p.armL.rotation.set(armLx, 0, armLz);
    p.armR.rotation.set(armRx, 0, armRz);
    p.legL.rotation.x = legLx;
    p.legR.rotation.x = legRx;
    p.body.position.y = bodyY;
    for (const [name, obj] of Object.entries(p.tools)) obj!.visible = name === tool;
  };

  return {
    group,
    folk: FOLK,
    /** Cow positions (for bells and mooing). */
    cows: () => cows.map((c) => c.root.position),
    /**
     * Call each frame. `luna` is where the player is (villagers wave when she comes near), `eye` the
     * camera (far-away people are hidden).
     */
    update(time: number, luna: THREE.Vector3 | null, eye: THREE.Vector3, reduced: boolean) {
      const dt = Math.min(0.1, Math.max(0, time - lastTime));
      lastTime = time;
      for (const p of people) {
        // Out of sight, out of mind: people far from the camera are hidden (and not drawn).
        const far = p.root.position.distanceTo(eye) > 55;
        p.root.visible = !far;
        if (far && p.phase === 'work') {
          // Still keep time while out of sight.
        }
        const stop = p.stops[p.stop];
        let moving = false;
        let task: Task = stop.task;
        if (p.phase === 'walk') {
          const dx = stop.at.x - p.root.position.x,
            dz = stop.at.z - p.root.position.z,
            d = Math.hypot(dx, dz);
          if (d < 0.25) {
            p.phase = 'work';
            p.timer = stop.seconds[0] + rand(p.seed + p.stop) * (stop.seconds[1] - stop.seconds[0]);
          } else {
            const step = Math.min(d, p.speed * dt);
            p.root.position.x += (dx / d) * step;
            p.root.position.z += (dz / d) * step;
            p.heading = turn(p.heading, Math.atan2(dx, dz), reduced ? 1 : 0.18);
            moving = true;
            task = stop.task === 'play' ? 'play' : stop.task === 'herd' ? 'herd' : 'idle';
          }
        } else {
          p.timer -= dt;
          if (stop.face)
            p.heading = turn(
              p.heading,
              Math.atan2(stop.face.x - stop.at.x, stop.face.z - stop.at.z),
              0.1,
            );
          if (p.timer <= 0 && p.stops.length > 1) {
            p.stop = (p.stop + 1) % p.stops.length;
            p.phase = 'walk';
          }
        }
        // Wave at Luna when she's near (not while fishing or sitting down for good).
        let waving = false;
        if (luna && !reduced) {
          toLuna.set(luna.x - p.root.position.x, 0, luna.z - p.root.position.z);
          const d = toLuna.length();
          if (d < 7 && p.id !== 'warga-6' && task !== 'play') {
            waving = d < 6;
            p.heading = turn(p.heading, Math.atan2(toLuna.x, toLuna.z), 0.1);
            if (d < 5) moving = false;
            if (d < 5 && p.phase === 'walk') p.timer = Math.max(p.timer, 0);
          }
        }
        // The fisherman sits on the pier's deck, not on the sea floor below it.
        const y =
          p.id === 'warga-6' ? ctx.pier.deckY : groundAt(p.root.position.x, p.root.position.z);
        p.root.position.y = y;
        p.root.rotation.y = p.heading;
        if (!far) pose(p, reduced ? 0 : time, task, waving, moving && !waving);
      }
      for (const c of cows) {
        c.root.visible = c.root.position.distanceTo(eye) < 75;
        c.timer -= dt;
        if (c.timer <= 0) {
          if (c.state === 'graze') {
            c.state = 'walk';
            c.timer = 3 + rand(c.seed + time) * 5;
            const a = rand(c.seed + time * 1.3) * Math.PI * 2,
              r = 3 + rand(c.seed + time * 0.7) * 9;
            c.target.set(c.home.x + Math.cos(a) * r, 0, c.home.z + Math.sin(a) * r);
          } else {
            c.state = 'graze';
            c.timer = 6 + rand(c.seed + time * 2.1) * 9;
          }
        }
        let walking = false;
        if (c.state === 'walk' && !reduced) {
          const dx = c.target.x - c.root.position.x,
            dz = c.target.z - c.root.position.z,
            d = Math.hypot(dx, dz);
          if (d > 0.3) {
            const step = Math.min(d, 0.4 * dt);
            c.root.position.x += (dx / d) * step;
            c.root.position.z += (dz / d) * step;
            c.heading = turn(c.heading, Math.atan2(dx, dz), 0.05);
            walking = true;
          }
        }
        c.root.position.y = groundAt(c.root.position.x, c.root.position.z);
        c.root.rotation.y = c.heading;
        const t = time + c.seed;
        c.legs.forEach(
          (leg, i) =>
            (leg.rotation.x = walking
              ? Math.sin(t * 3 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.4
              : 0),
        );
        c.head.rotation.x =
          c.state === 'graze' ? 0.75 + Math.sin(t * 1.4) * 0.08 : 0.1 + Math.sin(t * 0.8) * 0.05;
        c.tail.rotation.x = Math.sin(t * 2) * 0.25;
        c.tail.rotation.z = Math.sin(t * 1.5) * 0.2;
      }
    },
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      group.removeFromParent();
    },
  };
}
