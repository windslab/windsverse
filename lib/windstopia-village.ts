// The villagers' side of Windstopia: Swiss-style wooden chalets (one in each part of the island),
// terraced rice paddies, a plantation, wooden fences, and winding footpaths that tie every house
// to the village road. `planVillage` decides where everything goes (before the ground is built,
// so the ground can be levelled under houses and fields); `buildVillage` makes the meshes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonGradient } from './toon';

export type HouseKind = 'lereng' | 'sungai' | 'danau' | 'pantai' | 'kebun' | 'sawah';

export type House = {
  id: HouseKind;
  /** Placeholder name; the real residents come with the lore. */
  name: string;
  x: number;
  z: number;
  /** Ground height under the house. */
  y: number;
  /** Rotation about Y so the front door (local +z) faces the right way. */
  yaw: number;
  /** Half footprint (local x across the front, local z deep). */
  hx: number;
  hz: number;
  door: THREE.Vector3;
  /** Where the footpath meets the door. */
  approach: THREE.Vector3;
  variant: number;
};

export type Plot = { x: number; z: number; y: number; hu: number; hw: number; color: THREE.Color };

export type VillageContext = {
  origin: THREE.Vector3;
  roadDir: THREE.Vector3;
  away: THREE.Vector3;
  groundY: number;
  seaLevel: number;
  SEA: number;
  /** Height of the ground without the village's levelling. */
  baseHeight: (x: number, z: number) => number;
  seaOut: (x: number, z: number) => number;
  riverDistance: (x: number, z: number) => number;
  insideLake: (x: number, z: number) => boolean;
  noise: (x: number, z: number, octaves?: number) => number;
  cafe: THREE.Box3;
  towerAt: THREE.Vector3;
  roadHalfWidth: number;
  /** Far end of the footbridge's path (across the river) and the pier's landward end. */
  farBank: THREE.Vector3;
  pierBase: THREE.Vector3;
};

const V = THREE.Vector3;
const SAWAH_GRASS = new THREE.Color('#8fb45a'),
  KEBUN_SOIL = new THREE.Color('#7e9a4a'),
  YARD = new THREE.Color('#93b960');

export function planVillage(ctx: VillageContext) {
  const { origin, roadDir, away } = ctx;
  /** World point from (u along the road, w inland from it). */
  const at = (u: number, w: number) =>
    new V(origin.x + roadDir.x * u - away.x * w, 0, origin.z + roadDir.z * u - away.z * w);
  const uOf = (p: THREE.Vector3) => (p.x - origin.x) * roadDir.x + (p.z - origin.z) * roadDir.z;
  const wOf = (p: THREE.Vector3) => -((p.x - origin.x) * away.x + (p.z - origin.z) * away.z);
  const smooth = THREE.MathUtils.smoothstep;
  const hash = (n: number) => {
    const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return v - Math.floor(v);
  };

  // --- Terraced rice paddies (east of the café) and a plantation (west) --------------------
  const SAWAH = { u0: 62, w0: 18, cols: 4, rows: 3, pitchU: 15, pitchW: 11.2, step: 0.55 };
  const sawahCentre = at(
    SAWAH.u0 + (SAWAH.cols * SAWAH.pitchU) / 2,
    SAWAH.w0 + (SAWAH.rows * SAWAH.pitchW) / 2,
  );
  const sawahBase = ctx.baseHeight(sawahCentre.x, sawahCentre.z) - 0.3;
  /** The terraces: flat steps rising away from the road, with short risers between them. */
  const terrace = (w: number) => {
    const t = THREE.MathUtils.clamp((w - SAWAH.w0) / SAWAH.pitchW, 0, SAWAH.rows),
      r = Math.min(SAWAH.rows - 1, Math.floor(t));
    return sawahBase + SAWAH.step * (r + smooth(t - r, 0.8, 1));
  };
  const sawahRect = {
    u: [SAWAH.u0 - 3, SAWAH.u0 + SAWAH.cols * SAWAH.pitchU - 1] as const,
    w: [SAWAH.w0 - 3, SAWAH.w0 + SAWAH.rows * SAWAH.pitchW + 1] as const,
  };
  const plots: Plot[] = [];
  const growth = ['#7fb04a', '#93bb4d', '#a9c050', '#c2b45a', '#7fb04a', '#8dba4e'].map(
    (c) => new THREE.Color(c),
  );
  for (let r = 0; r < SAWAH.rows; r++)
    for (let c = 0; c < SAWAH.cols; c++) {
      const p = at(SAWAH.u0 + c * SAWAH.pitchU + 6.5, SAWAH.w0 + r * SAWAH.pitchW + 4.4);
      plots.push({
        x: p.x,
        z: p.z,
        y: sawahBase + SAWAH.step * r + 0.1,
        hu: 6.5,
        hw: 4.2,
        color: growth[(r * 3 + c * 2) % growth.length],
      });
    }

  const KEBUN = { u: [-134, -76] as const, w: [32, 78] as const, slope: 0.07 };
  const kebunCentre = at((KEBUN.u[0] + KEBUN.u[1]) / 2, (KEBUN.w[0] + KEBUN.w[1]) / 2);
  const kebunBase = ctx.baseHeight(kebunCentre.x, kebunCentre.z);
  const kebunHeight = (w: number) => kebunBase + KEBUN.slope * (w - (KEBUN.w[0] + KEBUN.w[1]) / 2);

  const rectDistance = (u: number, w: number, ur: readonly number[], wr: readonly number[]) =>
    Math.hypot(Math.max(ur[0] - u, 0, u - ur[1]), Math.max(wr[0] - w, 0, w - wr[1]));

  // --- Houses ---------------------------------------------------------------------------------
  type Target = {
    id: HouseKind;
    name: string;
    u: number;
    w: number;
    variant: number;
    far?: boolean;
  };
  const TARGETS: Target[] = [
    { id: 'lereng', name: 'Rumah Lereng', u: 34, w: 100, variant: 0 },
    { id: 'sungai', name: 'Rumah Tepi Sungai', u: 100, w: -12, variant: 1 },
    { id: 'danau', name: 'Rumah Tepi Danau', u: -46, w: -37, variant: 2, far: true },
    { id: 'pantai', name: 'Rumah Pantai', u: 58, w: -43, variant: 3, far: true },
    { id: 'kebun', name: 'Rumah Kebun', u: -96, w: 22, variant: 4 },
    { id: 'sawah', name: 'Rumah Sawah', u: 82, w: 12, variant: 5 },
  ];
  const houses: House[] = [];
  const HX = [3.4, 3.1, 3.6, 3.0, 3.3, 3.2],
    HZ = [2.8, 2.6, 2.9, 2.5, 2.7, 2.6];
  const spotOk = (t: Target, x: number, z: number, hx: number, hz: number) => {
    const reach = Math.hypot(hx, hz) + 1;
    if (ctx.seaOut(x, z) > ctx.SEA - (t.far ? 12 : 22)) return false;
    if (ctx.insideLake(x, z) || ctx.riverDistance(x, z) < (t.id === 'sungai' ? 10 : 8))
      return false;
    // Level enough to build on.
    const y0 = ctx.baseHeight(x, z);
    for (const [dx, dz] of [
      [reach, 0],
      [-reach, 0],
      [0, reach],
      [0, -reach],
    ])
      if (Math.abs(ctx.baseHeight(x + dx, z + dz) - y0) > 1.3) return false;
    const u = uOf(new V(x, 0, z)),
      w = wOf(new V(x, 0, z));
    if (rectDistance(u, w, sawahRect.u, sawahRect.w) < 6 && t.id !== 'sawah') return false;
    if (rectDistance(u, w, KEBUN.u, KEBUN.w) < 5) return false;
    if (Math.hypot(x - ctx.towerAt.x, z - ctx.towerAt.z) < 14) return false;
    const dx = Math.max(ctx.cafe.min.x - x, 0, x - ctx.cafe.max.x),
      dz = Math.max(ctx.cafe.min.z - z, 0, z - ctx.cafe.max.z);
    if (Math.hypot(dx, dz) < 12) return false;
    return houses.every((h) => Math.hypot(h.x - x, h.z - z) > 18);
  };
  for (const t of TARGETS) {
    const hx = HX[t.variant],
      hz = HZ[t.variant];
    let best = at(t.u, t.w);
    search: for (let radius = 0; radius <= 30; radius += 3)
      for (let k = 0; k < (radius ? 8 : 1); k++) {
        const a = (k / 8) * Math.PI * 2,
          p = at(t.u + Math.cos(a) * radius, t.w + Math.sin(a) * radius);
        if (spotOk(t, p.x, p.z, hx, hz)) {
          best = p;
          break search;
        }
      }
    houses.push({
      id: t.id,
      name: t.name,
      x: best.x,
      z: best.z,
      y: ctx.baseHeight(best.x, best.z),
      yaw: 0,
      hx,
      hz,
      door: new V(),
      approach: new V(),
      variant: t.variant,
    });
  }
  const houseOf = (id: HouseKind) => houses.find((h) => h.id === id)!;

  // Doors face where the main footpath comes from: toward the road for the houses on this side
  // of the river, toward the sea or lake for the two on the far bank.
  const faceOf = (h: House, target: THREE.Vector3) => {
    h.yaw = Math.atan2(target.x - h.x, target.z - h.z);
    const dir = new V(Math.sin(h.yaw), 0, Math.cos(h.yaw));
    h.door.set(h.x + dir.x * h.hz, 0, h.z + dir.z * h.hz);
    h.approach.set(h.x + dir.x * (h.hz + 2.4), 0, h.z + dir.z * (h.hz + 2.4));
  };
  const roadPoint = (u: number) => at(u, ctx.roadHalfWidth + 1.4);
  const uHouse = (id: HouseKind) => uOf(new V(houseOf(id).x, 0, houseOf(id).z));
  for (const id of ['lereng', 'sungai', 'sawah', 'kebun'] as const)
    faceOf(houseOf(id), roadPoint(uHouse(id)));
  for (const id of ['danau', 'pantai'] as const)
    faceOf(houseOf(id), new V(houseOf(id).x, 0, houseOf(id).z).addScaledVector(away, 10));

  // --- Levelling the ground for houses and fields ----------------------------------------------
  const pad = (x: number, z: number, base: number) => {
    let h = base;
    for (const house of houses) {
      const dx = x - house.x,
        dz = z - house.z;
      // In the house's own frame: its yard is a little larger than the house.
      const c = Math.cos(house.yaw),
        s = Math.sin(house.yaw);
      const lx = dx * c - dz * s,
        lz = dx * s + dz * c;
      const out = Math.hypot(
        Math.max(Math.abs(lx) - house.hx - 2.5, 0),
        Math.max(Math.abs(lz) - house.hz - 3, 0),
      );
      if (out < 6) h = THREE.MathUtils.lerp(h, house.y, 1 - smooth(out, 0, 6));
    }
    const p = new V(x, 0, z),
      u = uOf(p),
      w = wOf(p);
    const sd = rectDistance(u, w, sawahRect.u, sawahRect.w);
    if (sd < 9) h = THREE.MathUtils.lerp(h, terrace(w), 1 - smooth(sd, 0, 9));
    const kd = rectDistance(u, w, KEBUN.u, KEBUN.w);
    if (kd < 9) h = THREE.MathUtils.lerp(h, kebunHeight(w), 1 - smooth(kd, 0, 9));
    return h;
  };

  // --- Footpaths: winding, linked to each other and to the village road -----------------------
  const roadAt = (u: number) => at(u, ctx.roadHalfWidth + 0.7);
  /** A winding line through `points`, each wandering a little sideways (more in the middle). */
  const winding = (points: THREE.Vector3[], seed: number, sway = 8) => {
    const out: THREE.Vector3[] = [points[0].clone()];
    const total = points.length - 1;
    for (let i = 0; i < total; i++) {
      const a = points[i],
        b = points[i + 1],
        dir = b.clone().sub(a).setY(0),
        len = dir.length(),
        side = new V(-dir.z, 0, dir.x).normalize();
      const pieces = Math.max(2, Math.round(len / 9));
      for (let k = 1; k <= pieces; k++) {
        const t = k / pieces,
          p = a.clone().lerp(b, t);
        const end = k === pieces && i === total - 1;
        const amount = end || (k === pieces && i < total - 1) ? 0 : 1;
        let offset =
          amount *
          (ctx.noise(seed * 7.3 + i * 5.1 + k * 0.9, 21 + seed) - 0.5) *
          2 *
          sway *
          Math.sin(t * Math.PI * 0.9 + 0.15);
        let q = p.clone().addScaledVector(side, offset);
        // Keep out of the water and the sea.
        if (ctx.riverDistance(q.x, q.z) < 5 || ctx.seaOut(q.x, q.z) > ctx.SEA - 12) {
          offset = 0;
          q = p;
        }
        out.push(q);
      }
    }
    return new THREE.CatmullRomCurve3(out, false, 'centripetal', 0.5);
  };
  const A = (id: HouseKind) => houseOf(id).approach;
  const U = uHouse;
  const paths: THREE.CatmullRomCurve3[] = [
    // From the road up to each house on this side of the river.
    winding(
      [roadAt(U('lereng')), at(U('lereng') - 6, 30), at(U('lereng') + 8, 62), A('lereng')],
      1,
    ),
    winding([roadAt(U('sawah')), A('sawah')], 2, 2.5),
    winding([roadAt(U('kebun')), A('kebun')], 3, 2.5),
    winding([roadAt(U('sungai')), at(U('sungai') + 6, -2), A('sungai')], 4, 3),
    // Cross links, so the houses are joined to each other as well.
    winding([A('sawah'), at(51, 24), at(45, 50), at(U('lereng') + 12, 80), A('lereng')], 5),
    winding([A('kebun'), at(-66, 27), at(-50, 52), at(-22, 78), at(8, 92), A('lereng')], 6),
    // Across the bridge: along the far bank to the lake house and the beach house, and on to the pier.
    winding([ctx.farBank, at(uOf(ctx.farBank) - 22, -34), A('danau')], 7, 3),
    winding([ctx.farBank, at(uOf(ctx.farBank) + 26, -35), A('pantai')], 8, 3),
    winding([A('pantai'), at(36, -46), ctx.pierBase], 9, 3),
  ];
  const pathPoints = paths.map((c) =>
    c.getSpacedPoints(Math.max(8, Math.round(c.getLength() / 1.4))),
  );
  const pathDistance = (x: number, z: number) => {
    let best = Infinity;
    for (const list of pathPoints)
      for (const p of list) {
        const d = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d < best) best = d;
      }
    return Math.sqrt(best);
  };

  return {
    houses,
    plots,
    sawah: { rect: sawahRect, terrace, SAWAH },
    kebun: { rect: KEBUN, height: kebunHeight },
    paths,
    pathPoints,
    pad,
    /** Colours the ground under houses, paddies and the plantation (called per terrain vertex). */
    tint(x: number, z: number, color: THREE.Color) {
      const p = new V(x, 0, z),
        u = uOf(p),
        w = wOf(p);
      const sd = rectDistance(u, w, sawahRect.u, sawahRect.w);
      // Grassy bunds between the paddies.
      if (sd < 4) color.lerp(SAWAH_GRASS, 1 - smooth(sd, 0, 4));
      const kd = rectDistance(u, w, KEBUN.u, KEBUN.w);
      if (kd < 4) color.lerp(KEBUN_SOIL, (1 - smooth(kd, 0, 4)) * 0.8);
      for (const h of houses) {
        const d = Math.hypot(h.x - x, h.z - z);
        if (d < 9) color.lerp(YARD, (1 - smooth(d, 4, 9)) * 0.7);
      }
    },
    pathDistance,
    /** Inside the rice paddies' terraces or the plantation. */
    inPatch(x: number, z: number, which: 'sawah' | 'kebun') {
      const p = new V(x, 0, z),
        u = uOf(p),
        w = wOf(p);
      return which === 'sawah'
        ? rectDistance(u, w, sawahRect.u, sawahRect.w) < 1
        : rectDistance(u, w, KEBUN.u, KEBUN.w) < 1;
    },
    at,
    uOf,
    wOf,
    hash,
    /** True where nothing else (trees, flowers, rocks) should be placed. */
    occupied(x: number, z: number, margin = 2) {
      for (const h of houses)
        if (Math.hypot(h.x - x, h.z - z) < Math.hypot(h.hx, h.hz) + 4 + margin) return true;
      const p = new V(x, 0, z),
        u = uOf(p),
        w = wOf(p);
      if (rectDistance(u, w, sawahRect.u, sawahRect.w) < margin + 2) return true;
      if (rectDistance(u, w, KEBUN.u, KEBUN.w) < margin) return true;
      return pathDistance(x, z) < margin + 1;
    },
    /** A footprint a person can't walk through: houses and the inside of each paddy. */
    blocked(x: number, z: number) {
      for (const h of houses) {
        const dx = x - h.x,
          dz = z - h.z,
          c = Math.cos(h.yaw),
          s = Math.sin(h.yaw),
          lx = dx * c - dz * s,
          lz = dx * s + dz * c;
        if (Math.abs(lx) < h.hx + 0.35 && Math.abs(lz) < h.hz + 0.35) return true;
      }
      for (const plot of plots) {
        // Paddies are in the world's (u, w) frame, so test in it.
        const u = (x - plot.x) * roadDir.x + (z - plot.z) * roadDir.z,
          w = -((x - plot.x) * away.x + (z - plot.z) * away.z);
        if (Math.abs(u) < plot.hu - 0.3 && Math.abs(w) < plot.hw - 0.3) return true;
      }
      return false;
    },
  };
}

export type VillagePlan = ReturnType<typeof planVillage>;

// ---------------------------------------------------------------------------------------------
// Meshes
// ---------------------------------------------------------------------------------------------

export function buildVillage(
  plan: VillagePlan,
  ctx: VillageContext,
  height: (x: number, z: number) => number,
  /** The terrain mesh's own height, for things laid flat on it. */
  surface: (x: number, z: number) => number,
) {
  const group = new THREE.Group();
  group.name = 'World_Village';
  const geometries: THREE.BufferGeometry[] = [],
    materials: THREE.Material[] = [],
    textures: THREE.Texture[] = [];
  const toon = (color: string, extra: Partial<THREE.MeshToonMaterialParameters> = {}) => {
    const m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...extra });
    materials.push(m);
    return m;
  };

  // --- Chalets: merged per colour, so seven houses cost only a handful of draw calls. ----------
  const parts = new Map<string, { material: THREE.Material; list: THREE.BufferGeometry[] }>();
  const part = (
    key: string,
    color: string,
    make: () => THREE.BufferGeometry,
    place: THREE.Matrix4,
  ) => {
    let entry = parts.get(key);
    if (!entry) {
      entry = { material: toon(color), list: [] };
      parts.set(key, entry);
    }
    const g = make();
    g.applyMatrix4(place);
    entry.list.push(g.index ? g.toNonIndexed() : g);
    if (g.index) g.dispose();
  };
  const box = (w: number, h: number, d: number) => () => new THREE.BoxGeometry(w, h, d);
  const m4 = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) =>
    new THREE.Matrix4().compose(
      new V(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new V(1, 1, 1),
    );
  const glassGeometries: THREE.BufferGeometry[] = [];
  const WOOD = ['#8a5a3a', '#7a4b2f', '#9b6b45', '#6f4a35', '#86603f', '#7d5236'];
  const ROOF = ['#5b4538', '#8a3b30', '#4d4a46', '#6d4a3a', '#8a3b30', '#4d4a46'];
  const SHUTTER = ['#5f8a5a', '#b0443a', '#4a6fa5', '#5f8a5a', '#c48a3a', '#b0443a'];
  const FLOWER = ['#e0453b', '#f08aa5', '#e0453b', '#f2c14e', '#f08aa5', '#e0453b'];

  const house = (h: (typeof plan.houses)[number]) => {
    const v = h.variant,
      w = h.hx * 2,
      d = h.hz * 2,
      wall = 2.5,
      base = 0.55,
      key = (n: string) => `${n}-${v}`;
    // Everything is built in the house's own frame (front toward +z), then turned and placed.
    const place = new THREE.Matrix4().compose(
      new V(h.x, h.y, h.z),
      new THREE.Quaternion().setFromAxisAngle(new V(0, 1, 0), h.yaw),
      new V(1, 1, 1),
    );
    const at = (m: THREE.Matrix4) => place.clone().multiply(m);
    // Stone foundation and wooden walls.
    part('stone', '#9a9a92', box(w + 0.3, base, d + 0.3), at(m4(0, base / 2 - 0.1, 0)));
    part(key('wood'), WOOD[v], box(w, wall, d), at(m4(0, base + wall / 2 - 0.1, 0)));
    // Horizontal plank lines on the front and back.
    for (let k = 1; k < 5; k++)
      for (const side of [-1, 1])
        part(
          key('plank'),
          '#5e3d27',
          box(w + 0.04, 0.05, 0.03),
          at(m4(0, base - 0.1 + k * 0.45, side * (d / 2 + 0.02))),
        );
    // Gable roof with its ridge running front to back, so the door is under the gable end like an
    // alpine chalet: a wide overhang, a wooden gable triangle at each end, and a ridge cap.
    const pitch = 0.6,
      span = w / 2 + 1.0,
      rise = Math.tan(pitch) * span;
    const gable = new THREE.Shape();
    gable.moveTo(-w / 2, 0);
    gable.lineTo(w / 2, 0);
    gable.lineTo(0, Math.tan(pitch) * (w / 2) * 1.0);
    gable.closePath();
    part(
      key('wood'),
      WOOD[v],
      () => {
        const g = new THREE.ExtrudeGeometry(gable, { depth: d, bevelEnabled: false });
        g.translate(0, 0, -d / 2);
        return g;
      },
      at(m4(0, base + wall - 0.1, 0)),
    );
    const slope = Math.hypot(span, rise);
    for (const side of [-1, 1])
      part(
        key('roof'),
        ROOF[v],
        box(slope, 0.16, d + 2.2),
        at(m4(side * (span / 2), base + wall - 0.1 + rise / 2 + 0.06, 0, 0, 0, -side * pitch)),
      );
    part(
      key('roof'),
      ROOF[v],
      box(0.34, 0.14, d + 2.3),
      at(m4(0, base + wall - 0.1 + rise + 0.1, 0)),
    );
    // Chimney of stacked stone.
    part('stone', '#9a9a92', box(0.7, 1.7, 0.7), at(m4(-w / 4, base + wall + rise * 0.5, -d / 6)));
    part(
      'stone',
      '#9a9a92',
      box(0.9, 0.14, 0.9),
      at(m4(-w / 4, base + wall + rise * 0.5 + 0.9, -d / 6)),
    );
    // Front door with a stoop and a little lantern.
    part('door', '#4a2f20', box(1.0, 1.85, 0.12), at(m4(0, base + 0.82, d / 2 + 0.04)));
    part('stone', '#9a9a92', box(1.7, 0.2, 0.9), at(m4(0, 0.0, d / 2 + 0.45)));
    part('door', '#4a2f20', box(0.1, 0.16, 0.1), at(m4(0.8, base + 1.7, d / 2 + 0.12)));
    // Windows with shutters and flower boxes: two at the front, one on each side.
    const windows: [number, number, number, number][] = [
      [-w * 0.3, d / 2 + 0.03, 0, 1],
      [w * 0.3, d / 2 + 0.03, 0, 1],
      [-w / 2 - 0.03, 0.2, Math.PI / 2, 1],
      [w / 2 + 0.03, 0.2, -Math.PI / 2, 1],
      [0, -d / 2 - 0.03, Math.PI, 1],
    ];
    for (const [wx, wz, ry] of windows) {
      const wy = base + 1.2;
      const m = at(m4(wx, wy, wz, 0, ry, 0));
      const glass = new THREE.BoxGeometry(0.8, 0.8, 0.06);
      glass.applyMatrix4(m);
      glassGeometries.push(glass.toNonIndexed());
      glass.dispose();
      part(
        'frame',
        '#f1e9da',
        box(0.98, 0.98, 0.05),
        at(m4(wx, wy, wz, 0, ry, 0).multiply(m4(0, 0, -0.01))),
      );
      for (const s of [-1, 1])
        part(
          key('shutter'),
          SHUTTER[v],
          box(0.4, 0.98, 0.05),
          at(m4(wx, wy, wz, 0, ry, 0).multiply(m4(s * 0.7, 0, 0.02))),
        );
      part(
        'box',
        '#6a4a30',
        box(1.05, 0.2, 0.28),
        at(m4(wx, wy - 0.62, wz, 0, ry, 0).multiply(m4(0, 0, 0.16))),
      );
      for (let f = -2; f <= 2; f++)
        part(
          key('flower'),
          FLOWER[v],
          () => new THREE.IcosahedronGeometry(0.13, 0),
          at(m4(wx, wy - 0.46, wz, 0, ry, 0).multiply(m4(f * 0.2, 0, 0.2))),
        );
    }
    // A little balcony above the door with a railing.
    part(key('wood'), WOOD[v], box(w * 0.55, 0.1, 1.0), at(m4(0, base + wall - 0.5, d / 2 + 0.5)));
    for (let k = -3; k <= 3; k++)
      part(
        key('wood'),
        WOOD[v],
        box(0.06, 0.6, 0.06),
        at(m4(k * ((w * 0.55) / 6), base + wall - 0.15, d / 2 + 0.98)),
      );
    part(
      key('wood'),
      WOOD[v],
      box(w * 0.55, 0.07, 0.07),
      at(m4(0, base + wall + 0.15, d / 2 + 0.98)),
    );
    for (const s of [-1, 1])
      part(
        key('wood'),
        WOOD[v],
        box(0.07, 0.07, 1.0),
        at(m4(s * w * 0.275, base + wall + 0.15, d / 2 + 0.5)),
      );
    // A woodpile against the side wall.
    for (let k = 0; k < 3; k++)
      for (let j = 0; j <= 2 - k; j++)
        part(
          'log',
          '#a87a4a',
          () => new THREE.CylinderGeometry(0.11, 0.11, 1.0, 6),
          at(
            m4(
              w / 2 + 0.3 + k * 0.0,
              0.14 + k * 0.2,
              -d / 4 + j * 0.24 + k * 0.12,
              Math.PI / 2,
              0,
              0,
            ),
          ),
        );
    // A low fence round the yard, with an opening in front of the door.
    const fx = w / 2 + 1.8,
      fzBack = -d / 2 - 2.6,
      fzFront = d / 2 + 2.2;
    const fence = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0),
        ang = Math.atan2(x1 - x0, z1 - z0),
        n = Math.max(1, Math.round(len / 1.6));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        part(
          'fence',
          '#a88860',
          box(0.1, 0.8, 0.1),
          at(m4(x0 + (x1 - x0) * t, 0.4, z0 + (z1 - z0) * t)),
        );
      }
      for (const y of [0.3, 0.6])
        part(
          'fence',
          '#a88860',
          box(0.06, 0.07, len),
          at(m4((x0 + x1) / 2, y, (z0 + z1) / 2, 0, ang, 0)),
        );
    };
    fence(-fx, fzBack, fx, fzBack);
    fence(-fx, fzBack, -fx, fzFront);
    fence(fx, fzBack, fx, fzFront);
    fence(-fx, fzFront, -1.3, fzFront);
    fence(1.3, fzFront, fx, fzFront);
  };
  for (const h of plan.houses) house(h);
  for (const [key, entry] of parts) {
    const merged = mergeGeometries(entry.list)!;
    entry.list.forEach((g) => g.dispose());
    geometries.push(merged);
    const mesh = new THREE.Mesh(merged, entry.material);
    mesh.name = 'Village_' + key;
    mesh.castShadow = key.startsWith('wood') || key.startsWith('roof');
    group.add(mesh);
  }
  // Glass: dim blue-grey by day, warm yellow at night.
  const glassMaterial = new THREE.MeshBasicMaterial({ color: '#cfe4ea' });
  materials.push(glassMaterial);
  {
    const merged = mergeGeometries(glassGeometries)!;
    glassGeometries.forEach((g) => g.dispose());
    geometries.push(merged);
    const glass = new THREE.Mesh(merged, glassMaterial);
    glass.name = 'Village_Windows';
    group.add(glass);
  }
  const dayGlass = new THREE.Color('#bcd4dc'),
    nightGlass = new THREE.Color('#ffc978');

  // --- Rice paddies: water with rows of seedlings, one stage of growth per paddy. ----------------
  {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#b8d6c8';
    g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 16) {
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(0, y + 10, 128, 3);
      for (let x = 2; x < 128; x += 8) {
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.moveTo(x, y + 12);
        g.lineTo(x + 2.5, y + 2);
        g.lineTo(x + 5, y + 12);
        g.fill();
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    textures.push(texture);
    const material = new THREE.MeshToonMaterial({
      map: texture,
      vertexColors: true,
      gradientMap: toonGradient(),
    });
    materials.push(material);
    const list: THREE.BufferGeometry[] = [];
    for (const p of plan.plots) {
      const g2 = new THREE.PlaneGeometry(p.hu * 2, p.hw * 2, 1, 1);
      g2.rotateX(-Math.PI / 2);
      const uv = g2.attributes.uv;
      for (let k = 0; k < uv.count; k++)
        uv.setXY(k, (uv.getX(k) * (p.hu * 2)) / 6, (uv.getY(k) * (p.hw * 2)) / 6);
      // Rows run along the road (the world's u axis).
      g2.rotateY(Math.atan2(ctx.roadDir.x, ctx.roadDir.z) - Math.PI / 2);
      g2.translate(p.x, p.y, p.z);
      const colors = new Float32Array(4 * 3);
      for (let k = 0; k < 4; k++) colors.set([p.color.r, p.color.g, p.color.b], k * 3);
      g2.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      list.push(g2);
    }
    const merged = mergeGeometries(list)!;
    list.forEach((g2) => g2.dispose());
    geometries.push(merged);
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = 'Village_Sawah';
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // --- Plantation: rows of round bushes, a lane through the middle, and some fruit trees. -------
  {
    const bushGeometry = new THREE.IcosahedronGeometry(0.62, 1);
    bushGeometry.scale(1, 0.72, 1);
    bushGeometry.translate(0, 0.3, 0);
    geometries.push(bushGeometry);
    const bushMaterial = toon('#ffffff');
    const spots: THREE.Matrix4[] = [],
      colors: THREE.Color[] = [];
    const shades = ['#5f8f3c', '#6c9a42', '#548236', '#78a04a'].map((c) => new THREE.Color(c));
    const { rect } = plan.kebun;
    let n = 0;
    for (let w = rect.w[0] + 6; w < rect.w[1] - 8; w += 3.3)
      for (let u = rect.u[0] + 6; u < rect.u[1] - 6; u += 1.9) {
        // A lane for walking at the middle and one at each end.
        if (Math.abs(u - (rect.u[0] + rect.u[1]) / 2) < 2.2) continue;
        const p = plan.at(
          u + (plan.hash(n * 1.7) - 0.5) * 0.3,
          w + (plan.hash(n * 2.3) - 0.5) * 0.3,
        );
        const s = 0.85 + plan.hash(n * 3.1) * 0.35;
        spots.push(
          new THREE.Matrix4().compose(
            new V(p.x, height(p.x, p.z) - 0.05, p.z),
            new THREE.Quaternion(),
            new V(s, s, s),
          ),
        );
        colors.push(shades[n % shades.length]);
        n++;
      }
    const bushes = new THREE.InstancedMesh(bushGeometry, bushMaterial, spots.length);
    spots.forEach((m, i) => {
      bushes.setMatrixAt(i, m);
      bushes.setColorAt(i, colors[i]);
    });
    bushes.name = 'Village_Bushes';
    group.add(bushes);
    // Fruit trees along the back of the plantation: round, light green, with red fruit.
    const trunkGeometry = new THREE.CylinderGeometry(0.14, 0.2, 1.6, 6);
    trunkGeometry.translate(0, 0.8, 0);
    const crownGeometry = new THREE.IcosahedronGeometry(1.15, 1);
    crownGeometry.translate(0, 2.2, 0);
    const fruitGeometry = new THREE.IcosahedronGeometry(0.11, 0);
    geometries.push(trunkGeometry, crownGeometry, fruitGeometry);
    const trees: THREE.Matrix4[] = [];
    for (let k = 0; k < 9; k++) {
      const p = plan.at(rect.u[0] + 8 + k * ((rect.u[1] - rect.u[0] - 16) / 8), rect.w[1] - 3.5);
      const s = 0.9 + plan.hash(k * 5.3) * 0.3;
      trees.push(
        new THREE.Matrix4().compose(
          new V(p.x, height(p.x, p.z) - 0.05, p.z),
          new THREE.Quaternion(),
          new V(s, s, s),
        ),
      );
    }
    const trunks = new THREE.InstancedMesh(trunkGeometry, toon('#6b4a32'), trees.length),
      crowns = new THREE.InstancedMesh(crownGeometry, toon('#8fb552'), trees.length),
      fruit = new THREE.InstancedMesh(fruitGeometry, toon('#e0453b'), trees.length * 7);
    trees.forEach((m, i) => {
      trunks.setMatrixAt(i, m);
      crowns.setMatrixAt(i, m);
      for (let f = 0; f < 7; f++) {
        const a = plan.hash(i * 13 + f) * Math.PI * 2,
          r = 0.85 + plan.hash(i * 7 + f) * 0.35,
          local = new V(Math.cos(a) * r, 2.1 + (plan.hash(i * 3 + f) - 0.5) * 0.9, Math.sin(a) * r);
        fruit.setMatrixAt(
          i * 7 + f,
          new THREE.Matrix4().multiplyMatrices(
            m,
            new THREE.Matrix4().makeTranslation(local.x, local.y, local.z),
          ),
        );
      }
    });
    group.add(trunks, crowns, fruit);
    // A fence along the plantation's front edge, leaving gaps for the lanes.
    const posts: THREE.Matrix4[] = [],
      rails: THREE.Matrix4[] = [];
    const lane = (rect.u[0] + rect.u[1]) / 2;
    for (let u = rect.u[0] + 3; u < rect.u[1] - 3; u += 2) {
      if (Math.abs(u - lane) < 3) continue;
      const p = plan.at(u, rect.w[0] + 1.2);
      posts.push(new THREE.Matrix4().makeTranslation(p.x, height(p.x, p.z) + 0.4, p.z));
      const q = plan.at(u + 1, rect.w[0] + 1.2),
        mid = p.clone().lerp(q, 0.5);
      for (const y of [0.3, 0.62])
        rails.push(
          new THREE.Matrix4().compose(
            new V(mid.x, height(mid.x, mid.z) + y, mid.z),
            new THREE.Quaternion().setFromAxisAngle(
              new V(0, 1, 0),
              Math.atan2(ctx.roadDir.x, ctx.roadDir.z) + Math.PI / 2,
            ),
            new V(1, 1, 1),
          ),
        );
    }
    const postGeo = new THREE.BoxGeometry(0.1, 0.8, 0.1),
      railGeo = new THREE.BoxGeometry(2.0, 0.07, 0.06);
    geometries.push(postGeo, railGeo);
    const postMesh = new THREE.InstancedMesh(postGeo, toon('#a88860'), posts.length),
      railMesh = new THREE.InstancedMesh(railGeo, toon('#a88860'), rails.length);
    posts.forEach((m, i) => postMesh.setMatrixAt(i, m));
    rails.forEach((m, i) => railMesh.setMatrixAt(i, m));
    group.add(postMesh, railMesh);
  }

  // --- Footpaths: ribbons laid on the ground, soft-edged, with dandelion-yellow verge flowers. ---
  {
    const centre = new THREE.Color('#b9a073'),
      edge = new THREE.Color('#98a363');
    const material = new THREE.MeshToonMaterial({
      vertexColors: true,
      gradientMap: toonGradient(),
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    materials.push(material);
    const list: THREE.BufferGeometry[] = [];
    for (const curve of plan.paths) {
      const count = Math.max(8, Math.round(curve.getLength() / 1.0)),
        pts = curve.getSpacedPoints(count);
      const pos: number[] = [],
        col: number[] = [],
        idx: number[] = [];
      pts.forEach((p, i) => {
        const a = pts[Math.max(0, i - 1)],
          b = pts[Math.min(count, i + 1)],
          tx = b.x - a.x,
          tz = b.z - a.z,
          len = Math.hypot(tx, tz) || 1,
          nx = -tz / len,
          nz = tx / len;
        // Narrower and wavy: never a straight, even band.
        const half = 0.78 + (plan.hash(i * 0.37 + curve.points.length) - 0.5) * 0.25;
        for (const [side, c] of [
          [-1.55, edge],
          [-1, centre],
          [1, centre],
          [1.55, edge],
        ] as const) {
          const x = p.x + nx * half * side,
            z = p.z + nz * half * side;
          pos.push(x, surface(x, z) + 0.07, z);
          col.push(c.r, c.g, c.b);
        }
        if (i > 0) {
          const k = i * 4,
            j = k - 4;
          for (let s = 0; s < 3; s++)
            idx.push(j + s, k + s, j + s + 1, j + s + 1, k + s, k + s + 1);
        }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      list.push(g);
    }
    const merged = mergeGeometries(list)!;
    list.forEach((g) => g.dispose());
    geometries.push(merged);
    const ribbons = new THREE.Mesh(merged, material);
    ribbons.name = 'Village_Paths';
    ribbons.receiveShadow = true;
    group.add(ribbons);
  }

  return {
    group,
    /** Windows glow warm after dark. */
    setNight(night: number) {
      glassMaterial.color
        .copy(dayGlass)
        .lerp(nightGlass, THREE.MathUtils.smoothstep(night, 0.3, 0.8));
    },
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      group.removeFromParent();
    },
  };
}
