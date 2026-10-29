// Free build mode: the data model for a player-built house (walls on a grid, floors, doors and
// windows, furniture, a roof) and the 3D builder that turns that data into meshes, collisions and a
// cursor preview. The house stands on a lot of the island; one cell is one world unit.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonGradient } from './toon';

export type Opening = 'door' | 'window' | 'arch';
/** A piece of wall along one cell edge: `m` is the wall material, `o` an opening in it. */
export type Edge = { m: number; o?: Opening };
export type Piece = {
  id: string;
  /** Catalogue id (see `CATALOGUE`). */
  t: string;
  /** Centre on the lot, in cells (snapped to half cells). */
  x: number;
  z: number;
  /** Quarter turns. */
  r: 0 | 1 | 2 | 3;
  /** Colour choice from `TINTS`. */
  c: number;
};
export type RoofKind = 'none' | 'flat' | 'gable';
export type HouseData = {
  v: 1;
  cols: number;
  rows: number;
  /** Floor material per cell, key "x,z". */
  floors: Record<string, number>;
  /** Walls running along the lot's x axis (from node (x,z) to (x+1,z)), key "x,z". */
  h: Record<string, Edge>;
  /** Walls running along z (from node (x,z) to (x,z+1)). */
  w: Record<string, Edge>;
  items: Piece[];
  roof: { kind: RoofKind; c: number };
};

export const WALL_HEIGHT = 2.6;
const WALL_THICK = 0.2;
const FLOOR_THICK = 0.1;
const DOOR_HEIGHT = 2.0;
const SILL = 0.9;
const WINDOW_TOP = 1.75;

export const WALLS = [
  { name: 'Plester putih', color: '#efe8dc' },
  { name: 'Kayu', color: '#9a6b45' },
  { name: 'Kayu gelap', color: '#6b4a32' },
  { name: 'Bata', color: '#a8573f' },
  { name: 'Batu', color: '#9a9a92' },
  { name: 'Hijau sage', color: '#8fae8a' },
  { name: 'Biru muda', color: '#9bbcd4' },
  { name: 'Krem', color: '#f0dfb8' },
  { name: 'Merah muda', color: '#e8b4b0' },
  { name: 'Abu-abu', color: '#b8b8b6' },
];
export const FLOORS = [
  { name: 'Kayu terang', color: '#c9a273' },
  { name: 'Kayu gelap', color: '#7a5538' },
  { name: 'Ubin abu', color: '#b4b4b0' },
  { name: 'Ubin putih', color: '#ece8e0' },
  { name: 'Ubin catur', color: '#2f2f33', alt: '#ece8e0' },
  { name: 'Karpet krem', color: '#e0d2b4' },
  { name: 'Karpet biru', color: '#7f9bb8' },
  { name: 'Batu', color: '#928f88' },
  { name: 'Teras kerikil', color: '#c8b790' },
];
export const ROOFS = ['#5b4538', '#8a3b30', '#4d4a46', '#6d4a3a', '#3f6f8f', '#7a8a5a'];
export const TINTS = [
  { name: 'Kayu', color: '#c9a273' },
  { name: 'Cokelat', color: '#8a5a3a' },
  { name: 'Putih', color: '#e8e2d0' },
  { name: 'Biru', color: '#4a6fa5' },
  { name: 'Merah', color: '#b8574a' },
  { name: 'Hijau', color: '#6f8f5a' },
];

type PartKit = {
  box: (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    color: string,
    ry?: number,
  ) => void;
  cyl: (
    r: number,
    h: number,
    x: number,
    y: number,
    z: number,
    color: string,
    glow?: boolean,
  ) => void;
  ball: (r: number, x: number, y: number, z: number, color: string) => void;
};
export type CatalogueItem = {
  id: string;
  name: string;
  /** Footprint in cells at rotation 0 (x by z). */
  w: number;
  d: number;
  /** Things you can walk over (rugs) don't block. */
  walkable?: boolean;
  /** Where Luna can sit or lie (lot-local offset from the centre, for later). */
  seat?: 'sit' | 'lie';
  build: (kit: PartKit, tint: string) => void;
};

const dark = (hex: string, k: number) =>
  '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();

export const CATALOGUE: CatalogueItem[] = [
  {
    id: 'kasur',
    name: 'Kasur',
    w: 2,
    d: 1.5,
    seat: 'lie',
    build: (k, t) => {
      k.box(2, 0.3, 1.5, 0, 0.15, 0, '#6a4a35');
      k.box(1.9, 0.18, 1.4, 0, 0.39, 0, '#f2eee6');
      k.box(0.05, 0.7, 1.5, -0.98, 0.5, 0, '#6a4a35');
      k.box(0.5, 0.12, 0.9, -0.66, 0.54, 0, '#ffffff');
      k.box(1.1, 0.1, 1.42, 0.35, 0.52, 0, t);
    },
  },
  {
    id: 'sofa',
    name: 'Sofa',
    w: 2,
    d: 1,
    seat: 'sit',
    build: (k, t) => {
      k.box(2, 0.35, 0.95, 0, 0.18, 0, t);
      k.box(2, 0.55, 0.22, 0, 0.55, -0.37, dark(t, 0.9));
      for (const x of [-0.92, 0.92]) k.box(0.18, 0.5, 0.95, x, 0.4, 0, dark(t, 0.85));
      for (const x of [-0.45, 0.45]) k.box(0.85, 0.15, 0.7, x, 0.42, 0.08, dark(t, 1.08));
    },
  },
  {
    id: 'meja',
    name: 'Meja makan',
    w: 1.5,
    d: 1,
    build: (k, t) => {
      k.box(1.5, 0.08, 1, 0, 0.74, 0, t);
      for (const x of [-0.65, 0.65])
        for (const z of [-0.4, 0.4]) k.box(0.08, 0.72, 0.08, x, 0.36, z, dark(t, 0.7));
    },
  },
  {
    id: 'kursi',
    name: 'Kursi',
    w: 0.5,
    d: 0.5,
    seat: 'sit',
    build: (k, t) => {
      k.box(0.46, 0.06, 0.46, 0, 0.42, 0, t);
      k.box(0.46, 0.5, 0.05, 0, 0.7, -0.2, t);
      for (const x of [-0.19, 0.19])
        for (const z of [-0.19, 0.19]) k.box(0.05, 0.4, 0.05, x, 0.2, z, dark(t, 0.7));
    },
  },
  {
    id: 'lemari',
    name: 'Lemari',
    w: 1.2,
    d: 0.6,
    build: (k, t) => {
      k.box(1.2, 2, 0.6, 0, 1, 0, t);
      k.box(0.02, 1.9, 0.02, 0, 1, 0.31, dark(t, 0.6));
      for (const x of [-0.1, 0.1]) k.box(0.04, 0.12, 0.04, x, 1, 0.33, '#d6b45c');
    },
  },
  {
    id: 'rak',
    name: 'Rak buku',
    w: 1.2,
    d: 0.4,
    build: (k, t) => {
      k.box(1.2, 1.8, 0.4, 0, 0.9, -0.02, t);
      const cols = ['#b8574a', '#4a6fa5', '#e0b34a', '#6f8f5a', '#e8e2d0', '#8a5a8a'];
      for (let r = 0; r < 4; r++)
        for (let i = 0; i < 8; i++)
          k.box(
            0.1,
            0.3 + (i % 3) * 0.04,
            0.26,
            -0.5 + i * 0.14,
            0.32 + r * 0.42,
            0.06,
            cols[(i + r) % cols.length],
          );
    },
  },
  {
    id: 'lampu',
    name: 'Lampu berdiri',
    w: 0.4,
    d: 0.4,
    build: (k, t) => {
      k.cyl(0.14, 0.04, 0, 0.02, 0, '#4a3a30');
      k.cyl(0.02, 1.3, 0, 0.68, 0, '#4a3a30');
      k.cyl(0.2, 0.3, 0, 1.45, 0, '#ffe2a8', true);
      void t;
    },
  },
  {
    id: 'tanaman',
    name: 'Tanaman',
    w: 0.5,
    d: 0.5,
    build: (k, t) => {
      k.cyl(0.2, 0.3, 0, 0.15, 0, t);
      for (const [x, y, z, r] of [
        [0, 0.55, 0, 0.26],
        [0.1, 0.8, 0.05, 0.2],
        [-0.1, 0.72, -0.08, 0.2],
      ] as const)
        k.ball(r, x, y, z, '#5f8f3c');
    },
  },
  {
    id: 'karpet',
    name: 'Karpet',
    w: 2,
    d: 1.5,
    walkable: true,
    build: (k, t) => {
      k.box(2, 0.025, 1.5, 0, 0.0125, 0, t);
      k.box(1.7, 0.03, 1.2, 0, 0.015, 0, dark(t, 1.18));
    },
  },
  {
    id: 'dapur',
    name: 'Dapur',
    w: 1.8,
    d: 0.6,
    build: (k, t) => {
      k.box(1.8, 0.9, 0.6, 0, 0.45, 0, t);
      k.box(1.84, 0.05, 0.64, 0, 0.92, 0, '#ece8e0');
      for (const x of [-0.45, 0.45]) k.cyl(0.1, 0.02, x, 0.96, 0.02, '#2a2a2c');
      k.box(0.4, 0.02, 0.35, 0.65, 0.96, 0, '#aeb4b8');
      k.cyl(0.02, 0.2, 0.65, 1.04, -0.2, '#c9c9c9');
    },
  },
  {
    id: 'bak',
    name: 'Bak mandi',
    w: 1.6,
    d: 0.8,
    build: (k) => {
      k.box(1.6, 0.5, 0.8, 0, 0.25, 0, '#f4f4f0');
      k.box(1.4, 0.06, 0.6, 0, 0.52, 0, '#bcdbe6');
      k.cyl(0.02, 0.2, -0.7, 0.62, 0, '#c9c9c9');
    },
  },
  {
    id: 'tv',
    name: 'TV',
    w: 1.4,
    d: 0.4,
    build: (k, t) => {
      k.box(1.4, 0.45, 0.4, 0, 0.22, 0, t);
      k.box(1.1, 0.65, 0.05, 0, 0.8, 0, '#1c1c20');
      k.box(0.1, 0.18, 0.1, 0, 0.55, 0, '#1c1c20');
    },
  },
  {
    id: 'meja-kerja',
    name: 'Meja kerja',
    w: 1.2,
    d: 0.6,
    build: (k, t) => {
      k.box(1.2, 0.06, 0.6, 0, 0.74, 0, t);
      k.box(0.4, 0.68, 0.55, 0.38, 0.34, 0, dark(t, 0.85));
      k.box(0.06, 0.7, 0.55, -0.55, 0.35, 0, dark(t, 0.85));
      k.box(0.45, 0.3, 0.04, -0.15, 0.93, -0.18, '#1c1c20');
    },
  },
  {
    id: 'perapian',
    name: 'Perapian',
    w: 1.2,
    d: 0.5,
    build: (k) => {
      k.box(1.2, 1.5, 0.5, 0, 0.75, 0, '#9a9a92');
      k.box(0.7, 0.6, 0.3, 0, 0.35, 0.12, '#2a2a2c');
      k.cyl(0.12, 0.3, 0, 0.3, 0.14, '#ff9a3a', true);
      k.box(1.4, 0.08, 0.6, 0, 1.54, 0, '#8a5a3a');
    },
  },
  {
    id: 'bangku',
    name: 'Bangku taman',
    w: 1.4,
    d: 0.5,
    seat: 'sit',
    build: (k, t) => {
      k.box(1.4, 0.07, 0.45, 0, 0.42, 0, t);
      k.box(1.4, 0.3, 0.05, 0, 0.75, -0.2, t);
      for (const x of [-0.6, 0.6]) k.box(0.08, 0.4, 0.4, x, 0.2, 0, dark(t, 0.7));
    },
  },
];
const itemById = new Map(CATALOGUE.map((c) => [c.id, c]));
export const catalogueItem = (id: string) => itemById.get(id);

export const emptyHouse = (cols: number, rows: number): HouseData => ({
  v: 1,
  cols,
  rows,
  floors: {},
  h: {},
  w: {},
  items: [],
  roof: { kind: 'gable', c: 0 },
});

const KEY = /^\d{1,3},\d{1,3}$/;
/** Loads untrusted JSON (e.g. from storage) into a valid house for this lot. */
export function sanitize(raw: unknown, cols: number, rows: number): HouseData {
  const out = emptyHouse(cols, rows);
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Partial<HouseData>;
  const inRange = (key: string, dx: number, dz: number) => {
    if (!KEY.test(key)) return false;
    const [x, z] = key.split(',').map(Number);
    return x >= 0 && z >= 0 && x <= cols + dx && z <= rows + dz;
  };
  const num = (v: unknown, max: number) =>
    Number.isInteger(v) && (v as number) >= 0 && (v as number) < max ? (v as number) : 0;
  for (const [k, v] of Object.entries(r.floors ?? {}))
    if (
      inRange(k, -1, -1) &&
      Number.isInteger(v) &&
      (v as number) >= 0 &&
      (v as number) < FLOORS.length
    )
      out.floors[k] = v as number;
  for (const [src, dst, dx, dz] of [
    [r.h, out.h, -1, 0],
    [r.w, out.w, 0, -1],
  ] as const)
    for (const [k, e] of Object.entries(src ?? {})) {
      if (!inRange(k, dx, dz) || !e || typeof e !== 'object') continue;
      const edge = e as Edge;
      dst[k] = {
        m: num(edge.m, WALLS.length),
        ...(edge.o === 'door' || edge.o === 'window' || edge.o === 'arch' ? { o: edge.o } : {}),
      };
    }
  for (const p of Array.isArray(r.items) ? r.items.slice(0, 120) : []) {
    const item = p as Piece;
    const def = typeof item?.t === 'string' ? itemById.get(item.t) : undefined;
    if (!def || !Number.isFinite(item.x) || !Number.isFinite(item.z)) continue;
    out.items.push({
      id: typeof item.id === 'string' ? item.id.slice(0, 40) : crypto.randomUUID(),
      t: item.t,
      x: THREE.MathUtils.clamp(Math.round(item.x * 2) / 2, 0, cols),
      z: THREE.MathUtils.clamp(Math.round(item.z * 2) / 2, 0, rows),
      r: ([0, 1, 2, 3].includes(item.r) ? item.r : 0) as 0 | 1 | 2 | 3,
      c: num(item.c, TINTS.length),
    });
  }
  const roof = r.roof;
  if (roof && (roof.kind === 'none' || roof.kind === 'flat' || roof.kind === 'gable'))
    out.roof = { kind: roof.kind, c: num(roof.c, ROOFS.length) };
  return out;
}

/** Footprint of a piece on the lot (half extents, after rotation). */
export const footprint = (p: Pick<Piece, 't' | 'r'>) => {
  const def = itemById.get(p.t)!;
  return p.r % 2 ? { hx: def.d / 2, hz: def.w / 2 } : { hx: def.w / 2, hz: def.d / 2 };
};

// ---------------------------------------------------------------------------------------------

export type Cursor =
  | { kind: 'cell'; x: number; z: number; w?: number; d?: number; ok?: boolean }
  | { kind: 'edge'; axis: 'h' | 'w'; x: number; z: number; ok?: boolean }
  | { kind: 'item'; t: string; x: number; z: number; r: 0 | 1 | 2 | 3; ok: boolean };

export function createHouseBuilder(lot: {
  origin: THREE.Vector3;
  /** Lot axes on the ground: x runs along `xAxis`, z along `zAxis` (a right-handed pair). */
  xAxis: THREE.Vector3;
  zAxis: THREE.Vector3;
  cols: number;
  rows: number;
  /** Ground height of the lot. */
  y: number;
}) {
  const { cols, rows } = lot;
  const group = new THREE.Group();
  group.name = 'World_House';
  const frame = new THREE.Matrix4().makeBasis(lot.xAxis, new THREE.Vector3(0, 1, 0), lot.zAxis);
  frame.setPosition(lot.origin.x, lot.y, lot.origin.z);
  group.matrixAutoUpdate = false;
  group.matrix.copy(frame);
  group.matrixWorldNeedsUpdate = true;
  const inverse = frame.clone().invert();

  const materials = new Map<string, THREE.Material>();
  const toon = (color: string, transparent = false) => {
    const key = color + (transparent ? 't' : '');
    let m = materials.get(key);
    if (!m) {
      m = transparent
        ? new THREE.MeshToonMaterial({
            color,
            gradientMap: toonGradient(),
            transparent: true,
            opacity: 0.38,
            depthWrite: false,
          })
        : new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() });
      materials.set(key, m);
    }
    return m;
  };
  const glowMaterials = new Map<string, THREE.MeshBasicMaterial>();
  const glow = (color: string) => {
    let m = glowMaterials.get(color);
    if (!m) glowMaterials.set(color, (m = new THREE.MeshBasicMaterial({ color })));
    return m;
  };

  // --- Parts: collected per colour and merged into one mesh each. ---------------------------
  type Bucket = { colour: string; list: THREE.BufferGeometry[]; glow: boolean; clear: boolean };
  const newKit = () => {
    const buckets = new Map<string, Bucket>();
    const bucket = (colour: string, isGlow = false, clear = false) => {
      const key = colour + (isGlow ? 'g' : '') + (clear ? 't' : '');
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { colour, list: [], glow: isGlow, clear }));
      return b;
    };
    const place = (g: THREE.BufferGeometry, b: Bucket, m: THREE.Matrix4) => {
      g.applyMatrix4(m);
      b.list.push(g.index ? g.toNonIndexed() : g);
    };
    const kit: PartKit & {
      glass: (
        w: number,
        h: number,
        d: number,
        x: number,
        y: number,
        z: number,
        ry?: number,
      ) => void;
      tri: (shape: THREE.Shape, depth: number, m: THREE.Matrix4, color: string) => void;
    } = {
      box(w, h, d, x, y, z, color, ry = 0) {
        place(
          new THREE.BoxGeometry(w, h, d),
          bucket(color),
          new THREE.Matrix4().compose(
            new THREE.Vector3(x, y, z),
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry),
            new THREE.Vector3(1, 1, 1),
          ),
        );
      },
      cyl(r, h, x, y, z, color, isGlow = false) {
        place(
          new THREE.CylinderGeometry(r, r, h, 10),
          bucket(color, isGlow),
          new THREE.Matrix4().makeTranslation(x, y, z),
        );
      },
      ball(r, x, y, z, color) {
        place(
          new THREE.IcosahedronGeometry(r, 1),
          bucket(color),
          new THREE.Matrix4().makeTranslation(x, y, z),
        );
      },
      glass(w, h, d, x, y, z, ry = 0) {
        place(
          new THREE.BoxGeometry(w, h, d),
          bucket('#bfe0ee', false, true),
          new THREE.Matrix4().compose(
            new THREE.Vector3(x, y, z),
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry),
            new THREE.Vector3(1, 1, 1),
          ),
        );
      },
      tri(shape, depth, m, color) {
        const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
        place(g, bucket(color), m);
      },
    };
    const flush = (into: THREE.Group, name: string) => {
      for (const b of buckets.values()) {
        const merged = mergeGeometries(b.list);
        b.list.forEach((g) => g.dispose());
        if (!merged) continue;
        const mesh = new THREE.Mesh(merged, b.glow ? glow(b.colour) : toon(b.colour, b.clear));
        mesh.name = name;
        mesh.castShadow = !b.clear && !b.glow;
        mesh.receiveShadow = true;
        into.add(mesh);
      }
    };
    return { kit, flush };
  };

  // Dynamic content, rebuilt whenever the house changes.
  const content = new THREE.Group();
  group.add(content);
  const roofGroup = new THREE.Group();
  group.add(roofGroup);

  let data = emptyHouse(cols, rows);
  let roofVisible = true,
    wallScale = 1;
  const disposeChildren = (g: THREE.Group) => {
    for (const child of [...g.children]) {
      (child as THREE.Mesh).geometry?.dispose();
      g.remove(child);
    }
  };

  const edgeAt = (axis: 'h' | 'w', x: number, z: number) => data[axis][`${x},${z}`];

  const buildWalls = (kit: ReturnType<typeof newKit>['kit']) => {
    const H = WALL_HEIGHT,
      t = WALL_THICK;
    const wall = (axis: 'h' | 'w', x: number, z: number, e: Edge) => {
      const colour = WALLS[e.m].color,
        // Along-wall frame: centre of the edge, turned for walls running along z.
        cx = axis === 'h' ? x + 0.5 : x,
        cz = axis === 'h' ? z : z + 0.5,
        ry = axis === 'h' ? 0 : Math.PI / 2;
      // Offsets are given along the wall (a) and across it (b), then turned into x/z.
      const put = (
        len: number,
        h: number,
        thick: number,
        a: number,
        y: number,
        b: number,
        col = colour,
      ) => {
        const dx = axis === 'h' ? a : b,
          dz = axis === 'h' ? b : a;
        kit.box(
          axis === 'h' ? len : thick,
          h,
          axis === 'h' ? thick : len,
          cx + dx,
          y,
          cz + dz,
          col,
        );
      };
      if (!e.o) {
        put(1, H, t, 0, H / 2, 0);
        return;
      }
      // Pillars either side, then what's above (and below) the opening.
      for (const s of [-1, 1]) put(0.12, H, t, s * 0.44, H / 2, 0);
      if (e.o === 'window') {
        put(0.76, SILL, t, 0, SILL / 2, 0);
        put(0.76, H - WINDOW_TOP, t, 0, (H + WINDOW_TOP) / 2, 0);
        const gx = axis === 'h' ? cx : cx,
          gz = cz;
        kit.glass(
          axis === 'h' ? 0.76 : 0.04,
          WINDOW_TOP - SILL,
          axis === 'h' ? 0.04 : 0.76,
          gx,
          (SILL + WINDOW_TOP) / 2,
          gz,
          0,
        );
        // A slim white frame and a sill.
        put(0.8, 0.05, t + 0.06, 0, SILL, 0, '#f4efe4');
        put(0.8, 0.05, t + 0.04, 0, WINDOW_TOP, 0, '#f4efe4');
        put(0.05, WINDOW_TOP - SILL, t + 0.04, 0, (SILL + WINDOW_TOP) / 2, 0, '#f4efe4');
        return;
      }
      put(0.76, H - DOOR_HEIGHT, t, 0, (H + DOOR_HEIGHT) / 2, 0);
      if (e.o === 'door') {
        // The door leaf stands ajar, hinged on one pillar.
        const hinge =
          axis === 'h' ? new THREE.Vector3(cx - 0.38, 0, cz) : new THREE.Vector3(cx, 0, cz - 0.38);
        const open = 1.15;
        const leafLen = 0.74;
        const dirA =
          axis === 'h'
            ? new THREE.Vector3(Math.cos(open), 0, Math.sin(open))
            : new THREE.Vector3(-Math.sin(open), 0, Math.cos(open));
        const mid = hinge.clone().addScaledVector(dirA, leafLen / 2);
        kit.box(
          leafLen,
          DOOR_HEIGHT,
          0.05,
          mid.x,
          DOOR_HEIGHT / 2,
          mid.z,
          '#6b4a32',
          axis === 'h' ? -open : Math.PI / 2 - open - 0.0,
        );
        void ry;
        const knob = hinge.clone().addScaledVector(dirA, leafLen - 0.1);
        kit.box(
          0.06,
          0.06,
          0.1,
          knob.x,
          1.0,
          knob.z,
          '#d6b45c',
          axis === 'h' ? -open : Math.PI / 2 - open,
        );
      }
    };
    for (const [key, e] of Object.entries(data.h)) {
      const [x, z] = key.split(',').map(Number);
      wall('h', x, z, e);
    }
    for (const [key, e] of Object.entries(data.w)) {
      const [x, z] = key.split(',').map(Number);
      wall('w', x, z, e);
    }
    // Corner and end posts wherever walls meet.
    const nodes = new Map<string, number>();
    const mark = (x: number, z: number, m: number) => {
      const k = `${x},${z}`;
      if (!nodes.has(k)) nodes.set(k, m);
    };
    for (const [key, e] of Object.entries(data.h)) {
      const [x, z] = key.split(',').map(Number);
      mark(x, z, e.m);
      mark(x + 1, z, e.m);
    }
    for (const [key, e] of Object.entries(data.w)) {
      const [x, z] = key.split(',').map(Number);
      mark(x, z, e.m);
      mark(x, z + 1, e.m);
    }
    for (const [k, m] of nodes) {
      const [x, z] = k.split(',').map(Number);
      kit.box(t, H, t, x, H / 2, z, WALLS[m].color);
    }
  };

  const buildFloors = (kit: ReturnType<typeof newKit>['kit']) => {
    for (const [key, m] of Object.entries(data.floors)) {
      const [x, z] = key.split(',').map(Number);
      const f = FLOORS[m];
      const colour = 'alt' in f && f.alt && (x + z) % 2 ? f.alt : f.color;
      kit.box(1, FLOOR_THICK, 1, x + 0.5, FLOOR_THICK / 2, z + 0.5, colour);
    }
  };

  const buildItems = (kit: ReturnType<typeof newKit>['kit']) => {
    for (const p of data.items) {
      const def = itemById.get(p.t);
      if (!def) continue;
      // Each piece is built around its own origin, then turned and moved into place.
      const sub = newKit();
      def.build(sub.kit, TINTS[p.c].color);
      const holder = new THREE.Group();
      sub.flush(holder, 'Item');
      holder.position.set(p.x, onFloor(p.x, p.z), p.z);
      holder.rotation.y = -(p.r * Math.PI) / 2;
      content.add(holder);
    }
    void kit;
  };
  const onFloor = (x: number, z: number) =>
    data.floors[`${Math.min(cols - 1, Math.floor(x))},${Math.min(rows - 1, Math.floor(z))}`] !==
    undefined
      ? FLOOR_THICK
      : 0;

  /** A flat roof: a slab over the whole house with a slightly darker deck on top. */
  const buildFlat = () => {
    disposeChildren(roofGroup);
    const bounds = houseBounds();
    if (!bounds || data.roof.kind !== 'flat') return;
    const { kit, flush } = newKit();
    const colour = ROOFS[data.roof.c],
      w = bounds.maxX - bounds.minX,
      d = bounds.maxZ - bounds.minZ,
      cx = (bounds.minX + bounds.maxX) / 2,
      cz = (bounds.minZ + bounds.maxZ) / 2,
      over = 0.7;
    kit.box(w + over, 0.18, d + over, cx, WALL_HEIGHT + 0.09, cz, colour);
    kit.box(w + over - 0.2, 0.12, d + over - 0.2, cx, WALL_HEIGHT + 0.22, cz, dark(colour, 0.85));
    flush(roofGroup, 'Roof');
    roofGroup.visible = roofVisible;
  };

  // A proper tilted gable roof, built directly (the helper above only handles the flat kind).
  const buildGable = () => {
    disposeChildren(roofGroup);
    const bounds = houseBounds();
    if (!bounds || data.roof.kind !== 'gable') return;
    const colour = ROOFS[data.roof.c],
      w = bounds.maxX - bounds.minX,
      d = bounds.maxZ - bounds.minZ,
      cx = (bounds.minX + bounds.maxX) / 2,
      cz = (bounds.minZ + bounds.maxZ) / 2,
      over = 0.7,
      H = WALL_HEIGHT,
      pitch = 0.55;
    const alongX = w >= d;
    const half = (alongX ? d : w) / 2,
      span = half + over,
      len = (alongX ? w : d) + over * 2,
      rise = Math.tan(pitch) * span,
      slope = Math.hypot(span, rise);
    const parts: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) {
      const g = new THREE.BoxGeometry(alongX ? len : slope, 0.16, alongX ? slope : len);
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(
          alongX ? cx : cx + s * (span / 2),
          H + rise / 2 + 0.05,
          alongX ? cz + s * (span / 2) : cz,
        ),
        new THREE.Quaternion().setFromEuler(
          new THREE.Euler(alongX ? s * pitch : 0, 0, alongX ? 0 : -s * pitch),
        ),
        new THREE.Vector3(1, 1, 1),
      );
      g.applyMatrix4(m);
      parts.push(g.toNonIndexed());
      g.dispose();
    }
    // Ridge cap.
    {
      const g = new THREE.BoxGeometry(alongX ? len : 0.3, 0.14, alongX ? 0.3 : len);
      g.translate(cx, H + rise + 0.1, cz);
      parts.push(g.toNonIndexed());
      g.dispose();
    }
    const roof = new THREE.Mesh(mergeGeometries(parts)!, toon(colour));
    parts.forEach((g) => g.dispose());
    roof.name = 'Roof';
    roof.castShadow = true;
    roofGroup.add(roof);
    // Wooden gable ends close the triangle under the roof.
    const tri = new THREE.Shape();
    const baseHalf = half + 0.05;
    tri.moveTo(-baseHalf, 0);
    tri.lineTo(baseHalf, 0);
    tri.lineTo(0, Math.tan(pitch) * baseHalf);
    tri.closePath();
    for (const s of [-1, 1]) {
      const g = new THREE.ExtrudeGeometry(tri, { depth: 0.12, bevelEnabled: false });
      if (alongX) {
        g.rotateY(Math.PI / 2);
        g.translate(s > 0 ? bounds.maxX : bounds.minX - 0.12, H, cz);
      } else g.translate(cx, H, s > 0 ? bounds.maxZ : bounds.minZ - 0.12);
      const end = new THREE.Mesh(g, toon(WALLS[1].color));
      end.name = 'Roof';
      roofGroup.add(end);
    }
    roofGroup.visible = roofVisible;
  };
  const houseBounds = () => {
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    const grow = (x0: number, z0: number, x1: number, z1: number) => {
      minX = Math.min(minX, x0);
      maxX = Math.max(maxX, x1);
      minZ = Math.min(minZ, z0);
      maxZ = Math.max(maxZ, z1);
    };
    for (const k of Object.keys(data.floors)) {
      const [x, z] = k.split(',').map(Number);
      grow(x, z, x + 1, z + 1);
    }
    for (const k of Object.keys(data.h)) {
      const [x, z] = k.split(',').map(Number);
      grow(x, z, x + 1, z);
    }
    for (const k of Object.keys(data.w)) {
      const [x, z] = k.split(',').map(Number);
      grow(x, z, x, z + 1);
    }
    return Number.isFinite(minX) && maxX - minX >= 1 && maxZ - minZ >= 1
      ? { minX, maxX, minZ, maxZ }
      : null;
  };

  const rebuild = () => {
    disposeChildren(content);
    const { kit, flush } = newKit();
    buildFloors(kit);
    buildWalls(kit);
    flush(content, 'Wall');
    for (const child of content.children)
      if (child.name === 'Wall') child.scale.y = Math.max(0.02, wallScale);
    buildItems(kit);
    disposeChildren(roofGroup);
    if (data.roof.kind === 'flat') buildFlat();
    else if (data.roof.kind === 'gable') buildGable();
  };

  // --- Grid, markers and cursor ----------------------------------------------------------------
  const grid = (() => {
    const pts: number[] = [];
    for (let x = 0; x <= cols; x++) pts.push(x, 0.14, 0, x, 0.14, rows);
    for (let z = 0; z <= rows; z++) pts.push(0, 0.14, z, cols, 0.14, z);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const l = new THREE.LineSegments(
      g,
      new THREE.LineBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      }),
    );
    l.visible = false;
    l.renderOrder = 4;
    group.add(l);
    return l;
  })();
  // Little posts at the lot's four corners (and a sign), so the plot is visible outside build mode.
  const markers = new THREE.Group();
  {
    const post = new THREE.BoxGeometry(0.14, 0.9, 0.14),
      wood = toon('#a88860');
    for (const [x, z] of [
      [0, 0],
      [cols, 0],
      [0, rows],
      [cols, rows],
    ]) {
      const m = new THREE.Mesh(post, wood);
      m.position.set(x, 0.45, z);
      markers.add(m);
    }
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.55, 0.06), toon('#8a5a3a'));
    sign.position.set(1.2, 1.1, -0.3);
    markers.add(sign);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.4, 0.07), toon('#f0e6c8'));
    board.position.set(1.2, 1.1, -0.3);
    markers.add(board);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), wood);
    leg.position.set(1.2, 0.45, -0.3);
    markers.add(leg);
    group.add(markers);
  }
  const cursorMaterial = new THREE.MeshBasicMaterial({
    color: '#7be39a',
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  const cursorMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), cursorMaterial);
  cursorMesh.visible = false;
  cursorMesh.renderOrder = 5;
  group.add(cursorMesh);

  const api = {
    group,
    cols,
    rows,
    get data() {
      return data;
    },
    setData(next: HouseData) {
      data = next;
      rebuild();
    },
    setRoofVisible(on: boolean) {
      roofVisible = on;
      roofGroup.visible = on;
    },
    /** How tall the walls are drawn (1 = full, lower to see into the rooms while building). */
    setWallHeight(k: number) {
      wallScale = k;
      for (const child of content.children)
        if (child.name === 'Wall') child.scale.y = Math.max(0.02, k);
    },
    /** Grid lines and the building tools' overlay (build mode only). */
    setBuilding(on: boolean) {
      grid.visible = on;
      markers.visible = !on;
      if (!on) cursorMesh.visible = false;
    },
    cursor(c: Cursor | null) {
      if (!c) {
        cursorMesh.visible = false;
        return;
      }
      cursorMesh.visible = true;
      const ok = c.ok !== false;
      cursorMaterial.color.set(ok ? '#7be39a' : '#ff7a6a');
      cursorMaterial.opacity = 0.45;
      if (c.kind === 'cell') {
        const w = c.w ?? 1,
          d = c.d ?? 1;
        cursorMesh.scale.set(w, 0.06, d);
        cursorMesh.position.set(c.x + w / 2, 0.16, c.z + d / 2);
      } else if (c.kind === 'edge') {
        const horizontal = c.axis === 'h';
        cursorMesh.scale.set(horizontal ? 1.05 : 0.3, 0.2, horizontal ? 0.3 : 1.05);
        cursorMesh.position.set(horizontal ? c.x + 0.5 : c.x, 0.18, horizontal ? c.z : c.z + 0.5);
      } else {
        const f = footprint(c);
        cursorMesh.scale.set(f.hx * 2, 0.4, f.hz * 2);
        cursorMesh.position.set(c.x, 0.22, c.z);
      }
    },
    /** World point to lot coordinates (cells). */
    toLocal(x: number, z: number) {
      const p = new THREE.Vector3(x, lot.y, z).applyMatrix4(inverse);
      return { x: p.x, z: p.z };
    },
    toWorld(x: number, z: number, y = 0) {
      return new THREE.Vector3(x, y, z).applyMatrix4(frame);
    },
    /** Is something solid at this world position (walls, windows, furniture)? */
    collide(wx: number, wz: number) {
      const { x, z } = api.toLocal(wx, wz);
      if (x < -1 || z < -1 || x > cols + 1 || z > rows + 1) return false;
      const r = 0.17;
      const cx = Math.floor(x),
        cz = Math.floor(z);
      // Walls running along x sit on node rows z; along z, on node columns x.
      for (let k = -1; k <= 1; k++) {
        const hz = Math.round(z) + 0,
          hx = cx + k;
        const e = data.h[`${hx},${hz}`];
        if (e && Math.abs(z - hz) < r + WALL_THICK / 2 && x > hx - r && x < hx + 1 + r) {
          // A doorway is open between its pillars.
          if (!((e.o === 'door' || e.o === 'arch') && x > hx + 0.14 && x < hx + 0.86)) return true;
        }
        const vx = Math.round(x),
          vz = cz + k;
        const f = data.w[`${vx},${vz}`];
        if (f && Math.abs(x - vx) < r + WALL_THICK / 2 && z > vz - r && z < vz + 1 + r) {
          if (!((f.o === 'door' || f.o === 'arch') && z > vz + 0.14 && z < vz + 0.86)) return true;
        }
      }
      for (const p of data.items) {
        const def = itemById.get(p.t);
        if (!def || def.walkable) continue;
        const f = footprint(p);
        if (Math.abs(x - p.x) < f.hx + 0.05 && Math.abs(z - p.z) < f.hz + 0.05) return true;
      }
      return false;
    },
    /** Floor height at a world position if a floor has been laid there, else null. */
    floorAt(wx: number, wz: number) {
      const { x, z } = api.toLocal(wx, wz);
      if (x < 0 || z < 0 || x >= cols || z >= rows) return null;
      return data.floors[`${Math.floor(x)},${Math.floor(z)}`] !== undefined
        ? lot.y + FLOOR_THICK
        : null;
    },
    edgeAt,
    /** Seats and beds Luna can use: world position, heading and kind. */
    spots() {
      const out: { id: string; kind: 'sit' | 'lie'; position: THREE.Vector3; heading: number }[] =
        [];
      for (const p of data.items) {
        const def = itemById.get(p.t);
        if (!def?.seat) continue;
        const f = footprint(p);
        const pos = api.toWorld(p.x, p.z, onFloor(p.x, p.z) + (def.seat === 'lie' ? 0.52 : 0.46));
        // Local facing (r quarter turns from +z) into a world heading.
        const dir = new THREE.Vector3(
          Math.sin(-(p.r * Math.PI) / 2 + 0),
          0,
          Math.cos(-(p.r * Math.PI) / 2),
        ).transformDirection(frame);
        void f;
        out.push({ id: p.id, kind: def.seat, position: pos, heading: Math.atan2(dir.x, dir.z) });
      }
      return out;
    },
    dispose() {
      disposeChildren(content);
      disposeChildren(roofGroup);
      materials.forEach((m) => m.dispose());
      glowMaterials.forEach((m) => m.dispose());
      grid.geometry.dispose();
      cursorMesh.geometry.dispose();
      cursorMaterial.dispose();
      group.removeFromParent();
    },
  };
  return api;
}

export type HouseBuilder = ReturnType<typeof createHouseBuilder>;

// ---------------------------------------------------------------------------------------------
// Editing helpers (pure: they return a new house, so undo is just keeping the old one).
// ---------------------------------------------------------------------------------------------

const clone = (d: HouseData): HouseData => JSON.parse(JSON.stringify(d));
const inLot = (d: HouseData, x: number, z: number) => x >= 0 && z >= 0 && x < d.cols && z < d.rows;

export const edit = {
  /** Walls along a straight run of edges from node a to node b (snapped to the dominant axis). */
  walls(d: HouseData, a: { x: number; z: number }, b: { x: number; z: number }, material: number) {
    const out = clone(d);
    const dx = b.x - a.x,
      dz = b.z - a.z;
    if (Math.abs(dx) >= Math.abs(dz)) {
      const z = a.z;
      for (let x = Math.min(a.x, b.x); x < Math.max(a.x, b.x); x++)
        if (z >= 0 && z <= d.rows && x >= 0 && x < d.cols)
          out.h[`${x},${z}`] = { m: material, o: out.h[`${x},${z}`]?.o };
    } else {
      const x = a.x;
      for (let z = Math.min(a.z, b.z); z < Math.max(a.z, b.z); z++)
        if (x >= 0 && x <= d.cols && z >= 0 && z < d.rows)
          out.w[`${x},${z}`] = { m: material, o: out.w[`${x},${z}`]?.o };
    }
    return out;
  },
  /** A rectangular room: four walls and (optionally) a floor inside. */
  room(
    d: HouseData,
    a: { x: number; z: number },
    b: { x: number; z: number },
    wall: number,
    floor: number | null,
  ) {
    let out = clone(d);
    const x0 = Math.max(0, Math.min(a.x, b.x)),
      x1 = Math.min(d.cols, Math.max(a.x, b.x)),
      z0 = Math.max(0, Math.min(a.z, b.z)),
      z1 = Math.min(d.rows, Math.max(a.z, b.z));
    if (x1 - x0 < 1 || z1 - z0 < 1) return out;
    out = edit.walls(out, { x: x0, z: z0 }, { x: x1, z: z0 }, wall);
    out = edit.walls(out, { x: x0, z: z1 }, { x: x1, z: z1 }, wall);
    out = edit.walls(out, { x: x0, z: z0 }, { x: x0, z: z1 }, wall);
    out = edit.walls(out, { x: x1, z: z0 }, { x: x1, z: z1 }, wall);
    if (floor !== null) out = edit.floor(out, { x: x0, z: z0 }, { x: x1 - 1, z: z1 - 1 }, floor);
    return out;
  },
  floor(
    d: HouseData,
    a: { x: number; z: number },
    b: { x: number; z: number },
    material: number | null,
  ) {
    const out = clone(d);
    for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++)
      for (let z = Math.min(a.z, b.z); z <= Math.max(a.z, b.z); z++) {
        if (!inLot(d, x, z)) continue;
        if (material === null) delete out.floors[`${x},${z}`];
        else out.floors[`${x},${z}`] = material;
      }
    return out;
  },
  /** Opens (or closes again) a wall edge with a door, window or arch. */
  opening(d: HouseData, axis: 'h' | 'w', x: number, z: number, kind: Opening) {
    const out = clone(d),
      e = out[axis][`${x},${z}`];
    if (!e) return out;
    if (e.o === kind) delete e.o;
    else e.o = kind;
    return out;
  },
  paintEdge(d: HouseData, axis: 'h' | 'w', x: number, z: number, material: number) {
    const out = clone(d),
      e = out[axis][`${x},${z}`];
    if (e) e.m = material;
    return out;
  },
  removeEdge(d: HouseData, axis: 'h' | 'w', x: number, z: number) {
    const out = clone(d);
    delete out[axis][`${x},${z}`];
    return out;
  },
  addItem(d: HouseData, piece: Omit<Piece, 'id'>) {
    const out = clone(d);
    out.items.push({ ...piece, id: crypto.randomUUID() });
    return out;
  },
  removeItem(d: HouseData, id: string) {
    const out = clone(d);
    out.items = out.items.filter((p) => p.id !== id);
    return out;
  },
  updateItem(d: HouseData, id: string, patch: Partial<Piece>) {
    const out = clone(d);
    const p = out.items.find((i) => i.id === id);
    if (p) Object.assign(p, patch);
    return out;
  },
  roof(d: HouseData, roof: HouseData['roof']) {
    const out = clone(d);
    out.roof = roof;
    return out;
  },
};

/** Is a furniture piece fully inside the lot and not on top of another solid piece? */
export function canPlace(d: HouseData, piece: Pick<Piece, 't' | 'x' | 'z' | 'r'>, ignore?: string) {
  const f = footprint(piece);
  if (
    piece.x - f.hx < -0.01 ||
    piece.z - f.hz < -0.01 ||
    piece.x + f.hx > d.cols + 0.01 ||
    piece.z + f.hz > d.rows + 0.01
  )
    return false;
  const def = itemById.get(piece.t)!;
  for (const o of d.items) {
    if (o.id === ignore) continue;
    const od = itemById.get(o.t)!;
    // Rugs lie under everything; only two solid pieces (or two rugs) can't overlap.
    if (!!od.walkable !== !!def.walkable) continue;
    const of = footprint(o);
    if (
      Math.abs(piece.x - o.x) < f.hx + of.hx - 0.02 &&
      Math.abs(piece.z - o.z) < f.hz + of.hz - 0.02
    )
      return false;
  }
  // Not across a wall (touching a wall's centre line is fine: furniture stands against it).
  if (!def.walkable) {
    for (const key of Object.keys(d.h)) {
      const [x, z] = key.split(',').map(Number);
      if (
        piece.x + f.hx > x + 0.02 &&
        piece.x - f.hx < x + 0.98 &&
        Math.abs(piece.z - z) < f.hz - 0.05
      )
        return false;
    }
    for (const key of Object.keys(d.w)) {
      const [x, z] = key.split(',').map(Number);
      if (
        piece.z + f.hz > z + 0.02 &&
        piece.z - f.hz < z + 0.98 &&
        Math.abs(piece.x - x) < f.hx - 0.05
      )
        return false;
    }
  }
  return true;
}

const STORAGE = 'windstopia-house-v1';
export function loadHouse(cols: number, rows: number): HouseData {
  try {
    return sanitize(JSON.parse(localStorage.getItem(STORAGE) || 'null'), cols, rows);
  } catch {
    return emptyHouse(cols, rows);
  }
}
export function saveHouse(d: HouseData) {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(d));
  } catch {
    /* Storage blocked: the house lasts for this visit. */
  }
}
