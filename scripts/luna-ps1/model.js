// Luna — PS1-style low-poly chibi for Winds Space.
// Builds an articulated THREE.Group with small pixel-art textures (nearest filtering).
// Faces +Z; character's left is +X. Joint names match the café rig and greeting animation:
// Luna_Body, Luna_Head, Luna_Arm_L/R, Luna_Elbow_L/R, Luna_Wrist_L/R, Luna_Leg_L/R.
import * as THREE from 'three';

const PAL = {
  hair: ['#6e4128', '#7d4c2f', '#8a5634', '#5c3520'],
  skin: '#f3c9a3',
  skinShade: '#e6b58f',
  blush: '#eea197',
  eye: '#3b2217',
  eyeLow: '#6e3f26',
  mouth: '#b4604f',
  shirt: ['#c9799f', '#d185a8', '#bd6f94'],
  vest: ['#3b3634', '#34302e', '#433d3a', '#2e2a28'],
  vestLine: '#25211f',
  pants: ['#3b3e55', '#33364b', '#43475e'],
  pocket: ['#4a3d36', '#40342e', '#544540'],
  shoe: ['#e7e1d6', '#dcd5c8'],
  shoeGrey: '#b3ada3',
  sole: '#3e3a37',
  bandGrey: '#8f8b86',
  bandDark: '#2c2a29',
};

// Deterministic noise so every build produces identical textures.
let seed = 20041024;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

function canvasTexture(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  paint(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapNearestFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
const px = (g, x, y, color, w = 1, h = 1) => {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
};
// PS1 cloth: blocky value noise drawn from a small palette.
function noise(g, w, h, colors, block = 1) {
  for (let y = 0; y < h; y += block)
    for (let x = 0; x < w; x += block) {
      const r = rand();
      px(g, x, y, colors[r < 0.55 ? 0 : r < 0.8 ? 1 : r < 0.95 ? 2 : colors.length - 1], block, block);
    }
}

const materials = new Map();
function mat(name, map) {
  if (materials.has(name)) return materials.get(name);
  const m = new THREE.MeshStandardMaterial({ name, map, roughness: 0.95, metalness: 0 });
  materials.set(name, m);
  return m;
}
const flat = (name, color, size = 4) =>
  mat(name, canvasTexture(size, size, (g, w, h) => px(g, 0, 0, color, w, h)));

// Low-poly helpers. Geometry is made non-indexed so normals are faceted (PS1 look).
function shapedBox(w, h, d, { seg = [1, 1, 1], round = 0, taperTop = 1, taperBottom = 1, shift } = {}) {
  const geo = new THREE.BoxGeometry(w, h, d, ...seg);
  const p = geo.attributes.position,
    v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = (v.y + h / 2) / h; // 0 bottom … 1 top
    const s = taperBottom + (taperTop - taperBottom) * t;
    v.x *= s;
    v.z *= s;
    if (round) {
      // Blend each vertex toward an ellipsoid of the same extents.
      const n = new THREE.Vector3(v.x / (w / 2), v.y / (h / 2), v.z / (d / 2));
      const len = n.length() || 1;
      const e = n.clone().divideScalar(len).multiply(new THREE.Vector3(w / 2, h / 2, d / 2));
      e.x *= s;
      e.z *= s;
      v.lerp(e, round);
    }
    if (shift) v.add(shift(t));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  const out = geo.toNonIndexed();
  geo.dispose();
  out.computeVertexNormals();
  return out;
}
function part(parent, name, geometry, material, [x, y, z] = [0, 0, 0], rot, order = "XYZ") {
  const m = new THREE.Mesh(geometry, material);
  m.name = name;
  m.position.set(x, y, z);
  if (rot) m.rotation.set(...rot, order);
  parent.add(m);
  return m;
}
function joint(parent, name, [x, y, z], rot) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  if (rot) g.rotation.set(...rot);
  parent.add(g);
  return g;
}

// ---------- textures ----------
function buildTextures() {
  const T = {};
  T.shirt = canvasTexture(16, 16, (g, w, h) => noise(g, w, h, PAL.shirt, 2));
  T.sleeve = canvasTexture(16, 16, (g, w, h) => {
    noise(g, w, h, PAL.shirt, 2);
    px(g, 0, 13, '#b0628a', 16, 3); // cuff hem
  });
  T.vestBack = canvasTexture(16, 16, (g, w, h) => {
    noise(g, w, h, PAL.vest, 2);
    px(g, 0, 15, PAL.vestLine, 16, 1);
  });
  T.vestSide = canvasTexture(16, 16, (g, w, h) => noise(g, w, h, PAL.vest, 2));
  // Front: shirt V-neck, button line, two lower patch pockets and a chest pocket (wearer's left).
  T.vestFront = canvasTexture(32, 32, (g, w, h) => {
    noise(g, w, h, PAL.vest, 2);
    for (let y = 0; y < 9; y++) {
      const half = Math.max(0, 6 - Math.floor(y * 0.75));
      px(g, 16 - half, y, PAL.shirt[(y >> 1) % 2], half * 2, 1);
    }
    px(g, 15, 9, PAL.vestLine, 2, 23);
    for (const y of [12, 18, 24]) px(g, 17, y, '#6f6863', 1, 1);
    for (const x0 of [4, 21]) {
      px(g, x0, 20, PAL.vestLine, 8, 1);
      px(g, x0, 20, PAL.vestLine, 1, 9);
      px(g, x0 + 7, 20, PAL.vestLine, 1, 9);
      px(g, x0, 28, PAL.vestLine, 8, 1);
      px(g, x0 + 1, 22, '#4a4441', 6, 1);
    }
    px(g, 20, 14, PAL.vestLine, 7, 1);
    px(g, 20, 14, PAL.vestLine, 1, 5);
    px(g, 26, 14, PAL.vestLine, 1, 5);
    px(g, 0, 31, PAL.vestLine, 32, 1);
  });
  T.pants = canvasTexture(16, 16, (g, w, h) => {
    noise(g, w, h, PAL.pants, 2);
    px(g, 0, 15, '#2b2d3d', 16, 1);
  });
  T.cuff = canvasTexture(16, 4, (g, w, h) => {
    noise(g, w, h, ['#33364b', '#2d3043', '#3b3e55', '#282a3a'], 2);
    px(g, 0, 0, '#2b2d3d', 16, 1);
  });
  T.pocket = canvasTexture(8, 8, (g, w, h) => {
    noise(g, w, h, PAL.pocket, 2);
    px(g, 0, 2, '#2f2622', 8, 1);
    px(g, 0, 0, '#2f2622', 1, 8);
    px(g, 7, 0, '#2f2622', 1, 8);
    px(g, 0, 7, '#2f2622', 8, 1);
  });
  T.hair = canvasTexture(16, 16, (g, w, h) => {
    for (let x = 0; x < w; x++) {
      const col = PAL.hair[(x * 7 + (x >> 1)) % 3];
      for (let y = 0; y < h; y++) px(g, x, y, rand() < 0.12 ? PAL.hair[3] : col);
    }
  });
  T.shoe = canvasTexture(16, 8, (g, w, h) => {
    noise(g, w, h, [...PAL.shoe, PAL.shoe[0], '#d0c8ba'], 2);
    px(g, 0, 5, PAL.shoeGrey, 16, 2);
    px(g, 6, 1, PAL.shoeGrey, 4, 2);
  });
  // "LUNA" in a 3×5 pixel font, white on black with a white border.
  T.tag = canvasTexture(24, 10, (g) => {
    px(g, 0, 0, '#f2eee6', 24, 10);
    px(g, 1, 1, '#1d1b1a', 22, 8);
    const glyphs = {
      L: ['100', '100', '100', '100', '111'],
      U: ['101', '101', '101', '101', '111'],
      N: ['101', '111', '111', '111', '101'],
      A: ['010', '101', '111', '101', '101'],
    };
    [...'LUNA'].forEach((ch, i) =>
      glyphs[ch].forEach((row, y) =>
        [...row].forEach((bit, x) => bit === '1' && px(g, 4 + i * 4 + x, 3 + y, '#f2eee6')),
      ),
    );
  });
  // Face: big warm-brown eyes with glints, blush and a small smile.
  T.face = canvasTexture(32, 32, (g, w, h) => {
    px(g, 0, 0, PAL.skin, w, h);
    for (const cx of [10, 22]) {
      const x0 = cx - 3,
        outer = cx < 16 ? x0 - 1 : x0 + 6;
      px(g, x0, 14, PAL.eye, 6, 1); // upper lash line, flicked outward
      px(g, outer, 14, PAL.eye, 1, 2);
      px(g, x0, 15, PAL.eye, 6, 8);
      px(g, x0 + 1, 19, PAL.eyeLow, 4, 3);
      px(g, x0 + 2, 21, '#8a5434', 2, 1);
      px(g, x0 + 1, 16, '#fff6ea', 2, 2); // glint
      px(g, x0 + 4, 20, '#f0dccb', 1, 1);
      px(g, cx < 16 ? x0 - 2 : x0 + 6, 23, PAL.blush, 3, 2);
    }
    px(g, 16, 23, PAL.skinShade, 1, 1); // nose
    px(g, 14, 26, PAL.mouth, 1, 1); // smile
    px(g, 15, 27, PAL.mouth, 3, 1);
    px(g, 18, 26, PAL.mouth, 1, 1);
    px(g, 0, 31, PAL.skinShade, 32, 1); // jaw shade
  });
  return T;
}

// ---------- model ----------
// Proportions follow the PS1 concept sheet: head ≈ 40 % of height, short vest,
// wide cargo legs and chunky sneakers. Height ≈ 0.93 model units (the café rig rescales).
export function buildLuna() {
  materials.clear();
  seed = 20041024;
  const T = buildTextures();
  const M = {
    skin: flat('Luna skin', PAL.skin),
    face: mat('Luna face', T.face),
    hair: mat('Luna hair', T.hair),
    shirt: mat('Luna pink shirt', T.shirt),
    sleeve: mat('Luna pink sleeve', T.sleeve),
    vestFront: mat('Luna vest front', T.vestFront),
    vestSide: mat('Luna vest', T.vestSide),
    vestBack: mat('Luna vest back', T.vestBack),
    vestDark: flat('Luna vest ties', '#2a2624'),
    pants: mat('Luna cargo pants', T.pants),
    cuff: mat('Luna cargo cuffs', T.cuff),
    pocket: mat('Luna cargo pockets', T.pocket),
    shoe: mat('Luna sneakers', T.shoe),
    sole: flat('Luna sneaker soles', PAL.sole),
    tag: mat('Luna name tag', T.tag),
    bandGrey: flat('Luna grey wristband', PAL.bandGrey),
    bandDark: flat('Luna dark wristband', PAL.bandDark),
    pen: flat('Luna pens', '#c9c6c0'),
  };

  const root = new THREE.Group();
  root.name = 'Luna';

  // Body pivot at the waist. Torso, head and arms hang from here; legs are siblings.
  const body = joint(root, 'Luna_Body', [0, 0.32, 0]);
  part(body, 'Luna_Body_hips', shapedBox(0.21, 0.07, 0.12), M.pants, [0, -0.02, 0]);
  part(body, 'Luna_Body_shirt', shapedBox(0.2, 0.22, 0.12, { taperTop: 0.95 }), M.shirt, [0, 0.09, 0]);
  const vest = new THREE.Mesh(
    shapedBox(0.218, 0.235, 0.135, { taperTop: 0.92, taperBottom: 1.07 }),
    [M.vestSide, M.vestSide, M.vestSide, M.vestSide, M.vestFront, M.vestBack],
  );
  vest.name = 'Luna_Body_vest';
  vest.position.set(0, 0.078, 0);
  body.add(vest);
  part(body, 'Luna_Body_collar', shapedBox(0.09, 0.022, 0.07), M.shirt, [0, 0.2, 0.004]);
  part(body, 'Luna_Body_nametag', shapedBox(0.056, 0.023, 0.006), M.tag, [0.05, 0.158, 0.07]);
  for (const [x, h] of [
    [0.044, 0.026],
    [0.054, 0.022],
  ])
    part(body, 'Luna_Body_pen', shapedBox(0.006, h, 0.006), M.pen, [x, 0.122 + h / 2, 0.066]);
  const bow = joint(body, 'Luna_Body_bow', [0, 0.03, -0.071]);
  part(bow, 'Luna_Body_bow_knot', shapedBox(0.022, 0.02, 0.014), M.vestDark);
  for (const s of [-1, 1]) {
    part(bow, 'Luna_Body_bow_loop', shapedBox(0.04, 0.028, 0.01, { taperTop: 0.6 }), M.vestDark, [s * 0.026, 0.002, -0.002], [0, 0, s * 1.35]);
    part(bow, 'Luna_Body_bow_tail', shapedBox(0.015, 0.05, 0.008), M.vestDark, [s * 0.011, -0.034, -0.001], [0, 0, s * 0.25]);
  }
  part(body, 'Luna_Body_neck', shapedBox(0.055, 0.035, 0.055), M.skin, [0, 0.21, 0]);

  // Head pivot at the base of the neck; big rounded chibi head with a tapered chin.
  const head = joint(body, 'Luna_Head', [0, 0.2, 0]);
  const skull = new THREE.Mesh(
    shapedBox(0.32, 0.29, 0.285, { seg: [3, 3, 3], round: 0.5, taperBottom: 0.84 }),
    [M.skin, M.skin, M.skin, M.skin, M.face, M.skin],
  );
  skull.name = 'Luna_Head_face';
  skull.position.set(0, 0.165, 0.006);
  head.add(skull);
  for (const s of [-1, 1])
    part(head, 'Luna_Head_ear', shapedBox(0.028, 0.048, 0.034, { round: 0.3 }), M.skin, [s * 0.158, 0.15, -0.005]);
  // Hair: rounded faceted dome, a flared bob of chunky strands, side locks and layered bangs.
  part(head, 'Luna_Head_hair_dome', shapedBox(0.36, 0.2, 0.33, { seg: [4, 3, 4], round: 0.85 }), M.hair, [0, 0.29, -0.01]);
  part(head, 'Luna_Head_hair_back', shapedBox(0.3, 0.17, 0.12, { seg: [3, 2, 2], round: 0.5, taperBottom: 1.1 }), M.hair, [0, 0.2, -0.105]);
  const strands = 15;
  for (let i = 0; i < strands; i++) {
    const a = THREE.MathUtils.lerp(1.0, Math.PI * 2 - 1.0, i / (strands - 1)); // cheek → back → cheek
    const len = 0.225 + ((i * 5) % 3) * 0.014 - Math.abs(Math.cos(a)) * 0.012;
    const r = 0.158;
    part(
      head,
      'Luna_Head_hair_bob',
      shapedBox(0.072, len, 0.055, { taperBottom: 0.7, round: 0.15 }),
      M.hair,
      [Math.sin(a) * r, 0.29 - len / 2, Math.cos(a) * r - 0.012],
      [-0.2, a, 0],
      'YXZ',
    );
  }
  for (const s of [-1, 1])
    part(head, 'Luna_Head_hair_sidelock', shapedBox(0.056, 0.22, 0.05, { taperBottom: 0.55 }), M.hair, [s * 0.148, 0.16, 0.078], [-0.1, s * 0.12, s * 0.04], 'YXZ');
  const bangs = [
    [-0.118, 0.1, 0.062],
    [-0.072, 0.12, 0.07],
    [-0.022, 0.105, 0.064],
    [0.026, 0.125, 0.072],
    [0.075, 0.11, 0.066],
    [0.118, 0.095, 0.058],
  ];
  for (const [x, len, w] of bangs)
    part(head, 'Luna_Head_hair_bangs', shapedBox(w, len, 0.038, { taperBottom: 0.45 }), M.hair, [x, 0.312 - len / 2, 0.142 - x * x * 1.8], [-0.22, x * 1.2, -x * 0.6], 'YXZ');

  // Short, chunky arms that hang slightly outward.
  for (const [side, s] of [
    ['L', 1],
    ['R', -1],
  ]) {
    const arm = joint(body, 'Luna_Arm_' + side, [s * 0.114, 0.18, 0], [0, 0, s * 0.12]);
    part(arm, `Luna_Arm_${side}_sleeve`, shapedBox(0.078, 0.08, 0.085, { taperBottom: 1.06, round: 0.18 }), M.sleeve, [s * 0.02, -0.028, 0]);
    part(arm, `Luna_Arm_${side}_upper`, shapedBox(0.05, 0.05, 0.05), M.skin, [s * 0.018, -0.085, 0]);
    const elbow = joint(arm, 'Luna_Elbow_' + side, [s * 0.018, -0.105, 0]);
    part(elbow, `Luna_Elbow_${side}_forearm`, shapedBox(0.048, 0.07, 0.048, { taperBottom: 0.94 }), M.skin, [0, -0.033, 0]);
    part(elbow, `Luna_Elbow_${side}_wristband`, shapedBox(0.055, 0.017, 0.055), side === 'L' ? M.bandDark : M.bandGrey, [0, -0.062, 0]);
    const wrist = joint(elbow, 'Luna_Wrist_' + side, [0, -0.07, 0]);
    part(wrist, `Luna_Wrist_${side}_hand`, shapedBox(0.054, 0.054, 0.05, { round: 0.45 }), M.skin, [0, -0.025, 0.004]);
  }

  // Wide cargo legs with brown side pockets, rolled cuffs and chunky sneakers.
  for (const [side, s] of [
    ['L', 1],
    ['R', -1],
  ]) {
    const leg = joint(root, 'Luna_Leg_' + side, [s * 0.057, 0.31, 0]);
    part(leg, `Luna_Leg_${side}_pants`, shapedBox(0.11, 0.225, 0.115, { taperBottom: 1.12 }), M.pants, [0, -0.11, 0]);
    part(leg, `Luna_Leg_${side}_cuff`, shapedBox(0.128, 0.035, 0.132), M.cuff, [0, -0.225, 0]);
    part(leg, `Luna_Leg_${side}_cargo_pocket`, shapedBox(0.02, 0.07, 0.066), M.pocket, [s * 0.065, -0.135, 0.002]);
    part(leg, `Luna_Leg_${side}_sneaker`, shapedBox(0.098, 0.058, 0.168, { seg: [2, 2, 2], round: 0.35, taperTop: 0.82 }), M.shoe, [0, -0.262, 0.024]);
    part(leg, `Luna_Leg_${side}_sole`, shapedBox(0.102, 0.022, 0.172), M.sole, [0, -0.299, 0.024]);
  }

  root.traverse((n) => {
    if (n.isMesh) {
      n.castShadow = true;
      n.receiveShadow = true;
    }
  });
  return root;
}
