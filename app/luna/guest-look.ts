// Guests in Luna's own art style: a copy of her model without the barista's vest, name tag,
// pens and bow, with grown-up proportions (smaller head, longer legs and torso). Each guest gets
// a hairstyle, a face drawn in Luna's pixel style, and colours, all following their name, so the
// same regular always looks the same. Men and women have their own hairstyles.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lunaCafeRig } from './cafe-rig';

const MALE_HAIR = ['crop', 'spiky', 'sidepart', 'buzz', 'cap', 'curly'] as const;
const FEMALE_HAIR = ['long', 'ponytail', 'bun', 'bob', 'hijab', 'pigtails'] as const;
type HairStyle = (typeof MALE_HAIR)[number] | (typeof FEMALE_HAIR)[number];
const EYES = ['oval', 'dot', 'round', 'happy', 'narrow', 'sleepy'] as const;
const MOUTHS = ['smile', 'grin', 'flat', 'o', 'smirk'] as const;

export type GuestLook = {
  male: boolean;
  skin: number;
  hair: number;
  shirt: number;
  pants: number;
  shoes: number;
  /** Cap, hijab and hair ties. */
  accent: number;
  style: HairStyle;
  /** Overall size around the base guest height (men a little taller on average). */
  size: number;
  face: {
    eyes: (typeof EYES)[number];
    eyeColor: string;
    brows: 0 | 1 | 2;
    mouth: (typeof MOUTHS)[number];
    blush: boolean;
    freckles: boolean;
    glasses: boolean;
    beard: 'none' | 'mustache' | 'goatee' | 'stubble';
  };
};

const SKIN = [0xf6d2b0, 0xeec19a, 0xe0ad84, 0xcf9a6e, 0xb98257, 0x9c6a45];
const HAIR = [0x1b1412, 0x2a1d17, 0x3b2619, 0x553522, 0x6e4128, 0x8a5a36, 0x2c2b33];
const SHIRT = [
  0x7fa6c9, 0xe8b4b8, 0x9cc59a, 0xf2d48c, 0xb9a3d6, 0xf3efe7, 0x6c7fa0, 0xd98b6a, 0x4f6d5a,
  0xc0504d, 0x3e4a61, 0xe9e2d0,
];
const PANTS = [0x3a4256, 0x6b5b4a, 0x2f2f33, 0x8a7a62, 0x5d6b55, 0xd8ccb4, 0x45506e];
const SHOES = [0xf4f1ea, 0x2b2b2b, 0x9a6b4a, 0x6f86a8, 0xc94f4f];
const ACCENT = [0xd9c2a3, 0x8c6f9e, 0x5f7f99, 0xc98a8a, 0x3f3a3a, 0x9fb59a, 0xe6dccb, 0x7a4e3a];
const EYE_COLORS = ['#2a1810', '#3a2217', '#1d1a1a', '#4a3020'];
// Barista-only pieces, by mesh or material name (the vest's meshes are only called mesh_2…).
// Careful: "Elbow" contains "bow", so the bow is matched by its full names.
const STAFF_ONLY = /vest|name ?tag|(?:^|[_\s])pens?(?:$|[_\s])|pen caps|Body_bow|vest bow/i;

type Tinted = 'skin' | 'hair' | 'shirt' | 'pants' | 'shoes' | 'accent';
const PARTS: [Tinted, RegExp][] = [
  ['skin', /skin|ears/i],
  ['hair', /hair/i],
  ['shirt', /shirt|sleeve/i],
  ['pants', /cargo/i],
  ['shoes', /sneakers$/i],
  ['accent', /guest accent/i],
];

/** A small seeded generator, so a name always gives the same picks. */
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable look for a guest (by name when known); `male` from the guest's name when known. */
export function lookFor(seed: string, male?: boolean): GuestLook {
  const r = seeded(seed);
  const pick = <T>(list: readonly T[]) => list[Math.floor(r() * list.length)];
  const man = male ?? r() < 0.5;
  return {
    male: man,
    skin: pick(SKIN),
    hair: pick(HAIR),
    shirt: pick(SHIRT),
    pants: pick(PANTS),
    shoes: pick(SHOES),
    accent: pick(ACCENT),
    style: man ? pick(MALE_HAIR) : pick(FEMALE_HAIR),
    size: man ? 1 + r() * 0.08 : 0.92 + r() * 0.07,
    face: {
      eyes: pick(EYES),
      eyeColor: pick(EYE_COLORS),
      brows: man ? (r() < 0.6 ? 2 : 1) : r() < 0.5 ? 1 : 0,
      mouth: pick(MOUTHS),
      blush: r() < (man ? 0.15 : 0.6),
      freckles: r() < 0.18,
      glasses: r() < 0.25,
      beard: man ? pick(['none', 'none', 'mustache', 'goatee', 'stubble'] as const) : 'none',
    },
  };
}

// ---------- hair shapes (head-joint space: skull 0.30 × 0.27 × 0.27, centred at y 0.14) ----------
type Box = {
  size: [number, number, number];
  at: [number, number, number];
  rot?: [number, number, number];
  round?: number;
  taperTop?: number;
  taperBottom?: number;
  /** Hang from the top face, so a rotation swings it from its root. */
  top?: boolean;
  accent?: boolean;
};
function boxGeometry(b: Box) {
  const [w, h, d] = b.size;
  const g = new THREE.BoxGeometry(w, h, d, 3, 3, 3);
  const p = g.attributes.position,
    v = new THREE.Vector3(),
    n = new THREE.Vector3(),
    half = new THREE.Vector3(w / 2, h / 2, d / 2);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = (v.y + h / 2) / h,
      s = (b.taperBottom ?? 1) + ((b.taperTop ?? 1) - (b.taperBottom ?? 1)) * t;
    if (b.round) {
      n.set(v.x / half.x, v.y / half.y, v.z / half.z);
      v.lerp(n.divideScalar(n.length() || 1).multiply(half), b.round);
    }
    v.x *= s;
    v.z *= s;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  if (b.top) g.translate(0, -h / 2, 0);
  const flat = g.toNonIndexed();
  g.dispose();
  flat.computeVertexNormals();
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...b.at),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(b.rot ?? [0, 0, 0]), 'YXZ')),
    new THREE.Vector3(1, 1, 1),
  );
  return flat.applyMatrix4(m);
}
// A cap of hair over the top and back of the skull, clear of the forehead.
const dome = (h = 0.17, grow = 1): Box => ({
  size: [0.33 * grow, h, 0.31 * grow],
  at: [0, 0.27 - (0.17 - h) / 2, -0.012],
  round: 0.85,
});
const backOfHead = (len = 0.14): Box => ({
  size: [0.3, len, 0.1],
  at: [0, 0.25 - len / 2, -0.1],
  round: 0.5,
});
const temples = (len = 0.09): Box[] =>
  [-1, 1].map((s) => ({
    size: [0.04, len, 0.17],
    at: [s * 0.152, 0.235 - len / 2, -0.02],
    round: 0.4,
  }));
const fringe = (n: number, len: number, sweep = 0): Box[] =>
  Array.from({ length: n }, (_, i) => {
    const x = -0.12 + (0.24 * i) / Math.max(1, n - 1);
    return {
      size: [0.24 / n + 0.02, len, 0.04],
      at: [x + sweep * 0.02, 0.3, 0.138 - x * x * 1.6],
      rot: [-0.25, x * 1.1, -x * 0.5 - sweep * 0.35],
      taperBottom: 0.55,
      top: true,
    };
  });

const STYLES: Record<HairStyle, () => Box[]> = {
  crop: () => [dome(), backOfHead(), ...temples(), ...fringe(5, 0.06)],
  buzz: () => [dome(0.13, 0.97), backOfHead(0.1), ...temples(0.06)],
  sidepart: () => [
    dome(),
    backOfHead(),
    ...temples(),
    { size: [0.22, 0.06, 0.07], at: [0.03, 0.27, 0.125], rot: [-0.3, 0, -0.22], round: 0.5 },
    { size: [0.09, 0.05, 0.12], at: [-0.12, 0.29, 0.07], round: 0.6 },
  ],
  spiky: () => [
    dome(0.15),
    backOfHead(),
    ...temples(),
    ...[-0.1, -0.035, 0.035, 0.1].map(
      (x, i): Box => ({
        size: [0.06, 0.1, 0.06],
        at: [x, 0.32, 0.07 - (i % 2) * 0.03],
        rot: [-0.5, 0, -x * 2],
        taperTop: 0.15,
      }),
    ),
    ...[-0.07, 0, 0.07].map(
      (x): Box => ({
        size: [0.06, 0.09, 0.06],
        at: [x, 0.34, -0.05],
        rot: [0.3, 0, -x * 2],
        taperTop: 0.15,
      }),
    ),
  ],
  curly: () => [
    dome(0.15),
    ...temples(0.07),
    ...Array.from({ length: 13 }, (_, i): Box => {
      const a = (i / 13) * Math.PI * 2,
        ring = i % 2 ? 0.1 : 0.14;
      return {
        size: [0.085, 0.08, 0.085],
        at: [Math.sin(a) * ring, 0.31 + (i % 3) * 0.012, Math.cos(a) * ring * 0.9 - 0.03],
        round: 0.9,
      };
    }).filter((b) => b.at[2] < 0.1),
  ],
  cap: () => [
    backOfHead(0.12),
    ...temples(0.07),
    { size: [0.33, 0.13, 0.32], at: [0, 0.29, -0.01], round: 0.7, taperTop: 0.9, accent: true },
    {
      size: [0.24, 0.016, 0.13],
      at: [0, 0.245, 0.17],
      rot: [-0.1, 0, 0],
      round: 0.3,
      accent: true,
    },
  ],
  long: () => [
    dome(),
    { size: [0.31, 0.34, 0.08], at: [0, 0.27, -0.115], round: 0.3, taperBottom: 1.05, top: true },
    ...[-1, 1].map(
      (s): Box => ({ size: [0.05, 0.3, 0.13], at: [s * 0.158, 0.28, 0], round: 0.3, top: true }),
    ),
    ...[-1, 1].map(
      (s): Box => ({
        size: [0.15, 0.07, 0.045],
        at: [s * 0.065, 0.3, 0.13],
        rot: [-0.25, 0, s * 0.35],
        taperBottom: 0.6,
        top: true,
      }),
    ),
  ],
  bob: () => [
    dome(),
    ...Array.from({ length: 11 }, (_, i): Box => {
      const a = THREE.MathUtils.lerp(1.15, Math.PI * 2 - 1.15, i / 10);
      return {
        size: [0.075, 0.17, 0.05],
        at: [Math.sin(a) * 0.15, 0.28, Math.cos(a) * 0.15 - 0.012],
        rot: [-0.15, a, 0],
        taperBottom: 1.1,
        top: true,
      };
    }),
    { size: [0.27, 0.06, 0.04], at: [0, 0.3, 0.135], rot: [-0.2, 0, 0], top: true },
  ],
  ponytail: () => [
    dome(0.16),
    ...fringe(4, 0.07, 1),
    { size: [0.06, 0.05, 0.05], at: [0, 0.24, -0.15], round: 0.8, accent: true },
    {
      size: [0.08, 0.24, 0.07],
      at: [0, 0.25, -0.17],
      rot: [0.35, 0, 0],
      taperBottom: 0.45,
      top: true,
    },
  ],
  bun: () => [
    dome(0.16),
    ...fringe(3, 0.065, -1),
    { size: [0.13, 0.12, 0.13], at: [0, 0.35, -0.06], round: 0.9 },
  ],
  pigtails: () => [
    dome(),
    ...fringe(6, 0.07),
    ...[-1, 1].flatMap((s): Box[] => [
      { size: [0.05, 0.05, 0.05], at: [s * 0.17, 0.19, -0.04], round: 0.8, accent: true },
      {
        size: [0.07, 0.2, 0.07],
        at: [s * 0.18, 0.2, -0.05],
        rot: [0.1, 0, s * 0.35],
        taperBottom: 0.5,
        top: true,
      },
    ]),
  ],
  // Hijab: over the head, round the sides and back, under the chin, and over the shoulders.
  hijab: () => [
    { size: [0.35, 0.13, 0.33], at: [0, 0.27, -0.01], round: 0.8, accent: true },
    ...[-1, 1].map(
      (s): Box => ({
        size: [0.045, 0.29, 0.3],
        at: [s * 0.17, 0.14, -0.01],
        round: 0.4,
        accent: true,
      }),
    ),
    { size: [0.35, 0.3, 0.07], at: [0, 0.14, -0.15], round: 0.4, accent: true },
    { size: [0.33, 0.05, 0.03], at: [0, 0.255, 0.142], round: 0.3, accent: true },
    { size: [0.3, 0.06, 0.12], at: [0, 0.01, 0.07], round: 0.5, accent: true },
    {
      size: [0.32, 0.12, 0.26],
      at: [0, -0.02, -0.01],
      round: 0.5,
      taperBottom: 1.45,
      accent: true,
    },
  ],
};

// ---------- faces (32 × 32, the skull's front, drawn like Luna's) ----------
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
const shade = (n: number, k: number) => hex(new THREE.Color(n).multiplyScalar(k).getHex());
function drawFace(ctx: CanvasRenderingContext2D, look: GuestLook) {
  const f = look.face,
    px = (x: number, y: number, c: string, w = 1, h = 1) => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, w, h);
    };
  const skin = hex(look.skin),
    dark = shade(look.skin, 0.86),
    hair = shade(look.hair, 0.9),
    eye = f.eyeColor,
    glint = '#fff8ee',
    mouth = shade(0xb9634f, look.skin < 0xc00000 ? 0.75 : 1),
    frame = '#2b2522';
  px(0, 0, skin, 32, 32);
  for (const [x0, side] of [
    [9, -1],
    [19, 1],
  ] as const) {
    if (f.eyes === 'oval') {
      px(x0, 15, eye, 3, 4);
      px(x0 + 1, 14, eye);
      px(x0 + 1, 15, glint);
    } else if (f.eyes === 'dot') px(x0 + 1, 16, eye, 2, 2);
    else if (f.eyes === 'round') {
      px(x0 + 1, 14, eye, 2, 1);
      px(x0, 15, eye, 4, 4);
      px(x0 + 1, 19, eye, 2, 1);
      px(x0 + 2, 15, glint);
      px(x0, 17, glint);
    } else if (f.eyes === 'happy') {
      px(x0, 17, eye);
      px(x0 + 1, 16, eye, 2, 1);
      px(x0 + 3, 17, eye);
    } else if (f.eyes === 'narrow') {
      px(x0, 16, eye, 4, 2);
      px(x0 + (side < 0 ? 2 : 1), 16, glint);
    } else {
      px(x0 - 1, 16, dark, 5, 1);
      px(x0, 17, eye, 3, 2);
    }
    if (f.brows) px(x0 - (side > 0 ? 1 : 0), 12 - (f.brows - 1), hair, 4, f.brows);
    if (f.blush) px(x0 - 2 + (side > 0 ? 5 : 0), 21, '#eea093', 3, 2);
    if (f.freckles) {
      px(x0 - 1 + (side > 0 ? 4 : 0), 21, dark);
      px(x0 + 1 + (side > 0 ? 2 : 0), 22, dark);
    }
    if (f.glasses) {
      px(x0 - 1, 13, frame, 6, 1);
      px(x0 - 1, 20, frame, 6, 1);
      px(x0 - 1, 13, frame, 1, 8);
      px(x0 + 4, 13, frame, 1, 8);
    }
  }
  if (f.glasses) px(14, 16, frame, 4, 1);
  if (f.mouth === 'smile') {
    px(14, 24, mouth);
    px(15, 25, mouth, 2, 1);
    px(17, 24, mouth);
  } else if (f.mouth === 'grin') {
    px(14, 24, '#6b2f26', 4, 2);
    px(14, 24, '#fbf3ea', 4, 1);
  } else if (f.mouth === 'flat') px(14, 25, mouth, 4, 1);
  else if (f.mouth === 'o') px(15, 24, mouth, 2, 2);
  else {
    px(14, 25, mouth, 3, 1);
    px(17, 24, mouth);
  }
  if (f.beard === 'mustache') px(13, 23, hair, 6, 1);
  if (f.beard === 'goatee') px(15, 27, hair, 2, 2);
  if (f.beard === 'stubble')
    for (let y = 26; y < 31; y += 2) for (let x = 9 + (y % 4); x < 23; x += 3) px(x, y, dark);
  px(0, 31, dark, 32, 1); // jaw shade
}

// Luna's tiny pixel textures, turned grey (brightness kept, average lifted to ~0.85) so a colour
// tints them cleanly while the pixel shading stays. One grey copy per source texture.
const greys = new WeakMap<THREE.Texture, THREE.Texture>();
function greyOf(source: THREE.Texture) {
  const known = greys.get(source);
  if (known) return known;
  const image = source.image as CanvasImageSource & { width: number; height: number };
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx || !canvas.width) return source;
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) sum += px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
  const mean = Math.max(1, sum / (px.length / 4));
  for (let i = 0; i < px.length; i += 4) {
    const v = Math.min(255, ((px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11) / mean) * 217);
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(data, 0, 0);
  const grey = sameSettings(new THREE.CanvasTexture(canvas), source);
  greys.set(source, grey);
  return grey;
}
function sameSettings<T extends THREE.Texture>(texture: T, source: THREE.Texture): T {
  texture.flipY = source.flipY;
  texture.magFilter = source.magFilter;
  texture.minFilter = source.minFilter;
  texture.wrapS = source.wrapS;
  texture.wrapT = source.wrapT;
  texture.colorSpace = source.colorSpace;
  texture.generateMipmaps = source.generateMipmaps;
  return texture;
}

/**
 * Luna's legs are one piece; grown-ups sitting on a chair need a knee. The trouser leg is split
 * in two and everything below the knee (shin, cuff, shoes) hangs from a new knee joint.
 */
function addKnees(model: THREE.Object3D) {
  const KNEE = 0.065;
  const knees: THREE.Group[] = [];
  for (const side of ['L', 'R']) {
    const leg = model.getObjectByName('Luna_Leg_' + side),
      pants = model.getObjectByName(`Luna_Leg_${side}_pants`) as THREE.Mesh | undefined;
    if (!leg || !pants) continue;
    // The trousers run from the hip (0) down to -0.2; the knee sits a third of the way down.
    const knee = new THREE.Group();
    knee.name = 'Guest_Knee_' + side;
    knee.position.set(pants.position.x, -KNEE, 0);
    leg.add(knee);
    const shin = pants.clone();
    shin.name = `Guest_Leg_${side}_shin`;
    shin.scale.y = (0.2 - KNEE) / 0.2 + 0.05;
    shin.position.set(0, -(0.2 - KNEE) / 2 + 0.005, pants.position.z);
    knee.add(shin);
    pants.scale.y = KNEE / 0.2 + 0.05;
    pants.position.y = -KNEE / 2;
    for (const child of [...leg.children])
      if (/cuff|sneaker|midsole|sole/i.test(child.name)) {
        child.position.x -= knee.position.x;
        child.position.y += KNEE;
        knee.add(child);
      }
    knees.push(knee);
  }
  return knees;
}

/** Grown-up proportions: legs, torso and arms longer, head a little smaller. */
function growUp(model: THREE.Object3D) {
  const LEGS = 1.4,
    TORSO = 1.16;
  const node = (name: string) => model.getObjectByName(name);
  const body = node('Luna_Body');
  if (body) body.position.y *= LEGS;
  for (const side of ['L', 'R']) {
    const leg = node('Luna_Leg_' + side);
    if (leg) {
      leg.position.y *= LEGS;
      leg.scale.y = LEGS;
    }
    const arm = node('Luna_Arm_' + side);
    if (arm) {
      arm.position.y *= TORSO;
      arm.scale.y = 1.18;
    }
  }
  // The shirt (merged with the collar) stretches up from the waist; the neck and head ride on it.
  node('Luna_Body_shirt')?.scale.setY(TORSO);
  for (const name of ['Luna_Body_neck', 'Luna_Head']) {
    const part = node(name);
    if (part) part.position.y *= TORSO;
  }
  node('Luna_Head')?.scale.setScalar(0.84);
}

export function guestRig(luna: THREE.Group, height: number) {
  const model = luna.clone(true);
  const own = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  const geometries: THREE.BufferGeometry[] = [];
  // Luna's own hair goes; each guest gets the hairstyles below instead.
  const lunaHair = model.getObjectByName('Luna_Head_hair');
  let hairSource: THREE.MeshStandardMaterial | null = null;
  lunaHair?.traverse((n) => {
    if (n instanceof THREE.Mesh) hairSource = n.material as THREE.MeshStandardMaterial;
  });
  lunaHair?.removeFromParent();
  model.getObjectByName('Luna_Body_bow')?.removeFromParent();
  // Fewer draw calls: under each joint, pieces sharing a material become one mesh. The
  // barista-only pieces are dropped.
  const parents = new Set<THREE.Object3D>();
  model.traverse((node) => {
    if (node instanceof THREE.Mesh && node.parent) parents.add(node.parent);
  });
  for (const parent of parents) {
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of [...parent.children]) {
      if (!(child instanceof THREE.Mesh)) continue;
      if (STAFF_ONLY.test(child.name) || STAFF_ONLY.test((child.material as THREE.Material).name)) {
        parent.remove(child);
        continue;
      }
      const list = batches.get(child.material as THREE.Material) ?? [];
      list.push(child);
      batches.set(child.material as THREE.Material, list);
    }
    for (const [material, parts] of batches) {
      if (parts.length < 2) continue;
      const sources = parts.map((part) => {
        part.updateMatrix();
        return part.geometry.clone().applyMatrix4(part.matrix);
      });
      const merged = mergeGeometries(sources);
      sources.forEach((g) => g.dispose());
      if (!merged) continue;
      geometries.push(merged);
      parts.forEach((part) => parent.remove(part));
      const one = new THREE.Mesh(merged, material);
      one.name = parts[0].name;
      parent.add(one);
    }
  }
  growUp(model);
  const knees = addKnees(model);
  // The ears in a group of their own, so their outline hides with them under a hijab.
  const ears = new THREE.Group();
  const earMesh = model.getObjectByName('Luna_Head_ear');
  if (earMesh?.parent) {
    earMesh.parent.add(ears);
    ears.add(earMesh);
  }
  model.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    // Each guest gets its own materials so it can be recoloured alone.
    const source = node.material as THREE.MeshStandardMaterial;
    let copy = own.get(source);
    if (!copy) {
      copy = source.clone();
      own.set(source, copy);
    }
    node.material = copy;
  });
  const rig = lunaCafeRig(model, height);

  // Hairstyles, built once and switched with the look (guests are reused for new visitors).
  const head = model.getObjectByName('Luna_Head');
  const hairMat =
    (hairSource as THREE.MeshStandardMaterial | null)?.clone() ??
    new THREE.MeshStandardMaterial({ name: 'Luna hair', roughness: 0.95 });
  const accentMat = new THREE.MeshStandardMaterial({ name: 'Guest accent', roughness: 0.9 });
  const styles = new Map<HairStyle, THREE.Group>();
  for (const [style, build] of Object.entries(STYLES) as [HairStyle, () => Box[]][]) {
    const group = new THREE.Group();
    group.name = 'Guest_hair_' + style;
    group.visible = false;
    const boxes = build();
    for (const accent of [false, true]) {
      const parts = boxes.filter((b) => !!b.accent === accent).map(boxGeometry);
      if (!parts.length) continue;
      const merged = mergeGeometries(parts);
      parts.forEach((g) => g.dispose());
      if (!merged) continue;
      geometries.push(merged);
      const mesh = new THREE.Mesh(merged, accent ? accentMat : hairMat);
      mesh.name = group.name + (accent ? '_accent' : '');
      group.add(mesh);
    }
    head?.add(group);
    styles.set(style, group);
  }

  // Each guest's own face, redrawn for every new look.
  let faceCanvas: HTMLCanvasElement | null = null,
    faceCtx: CanvasRenderingContext2D | null = null,
    faceTexture: THREE.CanvasTexture | null = null;

  let size = 1;
  return {
    rig,
    /** Luna's rig, plus the knees: bent on a chair, a little with each step when walking. */
    update(age: number, stride: number, task: string, reduced: boolean, climb = 0, phase = 0) {
      rig.update(age, stride, task, reduced, climb, { phase, run: false });
      knees.forEach((knee, i) => {
        knee.rotation.x =
          task === 'sitting'
            ? 1.45
            : Math.max(0, stride * (i ? 1 : -1)) * 0.5 + Math.abs(climb) * 0.3;
      });
    },
    materials: [...own.values(), hairMat, accentMat],
    geometries,
    /** Hip height above the soles, and half the leg's thickness, at this guest's size. */
    hip: () => rig.hip * size,
    legHalf: () => rig.legHalf * size,
    setLook(look: GuestLook) {
      size = look.size;
      rig.root.scale.setScalar(size);
      styles.forEach((group, style) => (group.visible = style === look.style));
      ears.visible = look.style !== 'hijab';
      if (!faceCanvas && typeof document !== 'undefined') {
        faceCanvas = document.createElement('canvas');
        faceCanvas.width = faceCanvas.height = 32;
        faceCtx = faceCanvas.getContext('2d');
      }
      if (faceCtx) drawFace(faceCtx, look);
      // Looked up on each call: the scene swaps in toon copies of these materials after loading.
      model.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        const m = node.material as THREE.MeshStandardMaterial;
        if (/face/i.test(m.name)) {
          if (!faceTexture && m.map && faceCanvas) {
            faceTexture = sameSettings(new THREE.CanvasTexture(faceCanvas), m.map);
            // The model's own texture is stored flipped (glTF); this canvas is drawn upright.
            faceTexture.flipY = !m.map.flipY;
          }
          if (faceTexture && m.map !== faceTexture) {
            m.map = faceTexture;
            m.needsUpdate = true;
          }
          if (faceTexture) faceTexture.needsUpdate = true;
          m.color.setHex(0xffffff);
          return;
        }
        const key = PARTS.find(([, pattern]) => pattern.test(m.name))?.[0];
        if (!key) return;
        if (m.map && !m.userData.grey) {
          m.map = greyOf(m.map);
          m.userData.grey = true;
          m.needsUpdate = true;
        }
        m.color.setHex(look[key]);
      });
    },
  };
}
