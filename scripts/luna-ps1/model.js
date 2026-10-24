// Luna — PS1-style low-poly chibi for Winds Space.
// Builds an articulated THREE.Group with small pixel-art textures (nearest filtering) and
// baked vertex shading. Faces +Z; character's left is +X. Joint names match the café rig and
// greeting animation: Luna_Body, Luna_Head, Luna_Arm_L/R, Luna_Elbow_L/R, Luna_Wrist_L/R,
// Luna_Leg_L/R. Proportions are measured from the owner's "LUNA — PS1 style concept" sheet.
import * as THREE from 'three';

const PAL = {
  hair: ['#94573a', '#8a5034', '#a0623f', '#7b4529'],
  skin: '#f4cba5',
  skinShade: '#e8b690',
  ear: '#eebf98',
  blush: '#f0a49a',
  eye: '#3a2217',
  eyeLow: '#5a3322',
  mouth: '#b9634f',
  shirt: ['#c97ba3', '#d388ad', '#bc6f97', '#b4668e'],
  vest: ['#3a3533', '#332e2c', '#423c39', '#2b2725', '#4a4340'],
  vestLine: '#221e1c',
  pants: ['#3a3d55', '#33364c', '#42465f', '#2d3044'],
  pocket: ['#5a4136', '#4e382e', '#664a3c', '#45322a'],
  shoe: ['#e9e3d8', '#ded7ca', '#f1ece3'],
  shoeGrey: '#b5aea3',
  midsole: '#d7d0c4',
  sole: '#3d3936',
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
      const i = r < 0.5 ? 0 : r < 0.75 ? 1 : r < 0.9 ? 2 : r < 0.97 ? 3 : colors.length - 1;
      px(g, x, y, colors[Math.min(i, colors.length - 1)], block, block);
    }
}

const materials = new Map();
function mat(name, map, extra = {}) {
  if (materials.has(name)) return materials.get(name);
  const m = new THREE.MeshStandardMaterial({ name, map, roughness: 0.95, metalness: 0, ...extra });
  materials.set(name, m);
  return m;
}
const flat = (name, color, size = 4) =>
  mat(name, canvasTexture(size, size, (g, w, h) => px(g, 0, 0, color, w, h)));

// Low-poly helpers. Geometry is made non-indexed so normals are faceted (PS1 look).
function facet(geo) {
  const out = geo.index ? geo.toNonIndexed() : geo;
  if (out !== geo) geo.dispose();
  out.computeVertexNormals();
  return out;
}
function shapedBox(
  w,
  h,
  d,
  { seg = [1, 1, 1], round = 0, taperTop = 1, taperBottom = 1, top = false, shift } = {},
) {
  const geo = new THREE.BoxGeometry(w, h, d, ...seg);
  const p = geo.attributes.position,
    v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = (v.y + h / 2) / h; // 0 bottom … 1 top
    const s = taperBottom + (taperTop - taperBottom) * t;
    if (round) {
      // Blend each vertex toward an ellipsoid of the same extents.
      const n = new THREE.Vector3(v.x / (w / 2), v.y / (h / 2), v.z / (d / 2));
      const e = n
        .clone()
        .divideScalar(n.length() || 1)
        .multiply(new THREE.Vector3(w / 2, h / 2, d / 2));
      v.lerp(e, round);
    }
    v.x *= s;
    v.z *= s;
    if (shift) v.add(shift(t, v));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  // `top` hangs the box from its top face, so rotations pivot at the root of a strand.
  if (top) geo.translate(0, -h / 2, 0);
  return facet(geo);
}
function part(parent, name, geometry, material, [x, y, z] = [0, 0, 0], rot, order = 'XYZ') {
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

// Bakes a vertical light-to-dark gradient into vertex colours (in the model's root space), the
// cheap Gouraud shading PS1 games used to give hair and cloth volume.
function bakeGradient(root, test, yTop, yBottom, top, bottom) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(),
    m = new THREE.Matrix4(),
    v = new THREE.Vector3();
  root.traverse((mesh) => {
    if (!mesh.isMesh || !test(mesh.name)) return;
    m.multiplyMatrices(inv, mesh.matrixWorld);
    const p = mesh.geometry.attributes.position,
      colors = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      const t = THREE.MathUtils.clamp((v.y - yBottom) / (yTop - yBottom), 0, 1);
      const k = bottom + (top - bottom) * t;
      colors.set([k, k, k], i * 3);
    }
    mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    for (const material of [mesh.material].flat()) material.vertexColors = true;
  });
}

// ---------- textures ----------
function buildTextures() {
  const T = {};
  T.shirt = canvasTexture(16, 16, (g, w, h) => noise(g, w, h, PAL.shirt, 2));
  T.sleeve = canvasTexture(16, 16, (g, w, h) => {
    noise(g, w, h, PAL.shirt, 2);
    px(g, 0, 14, '#a95f86', 16, 2); // hem
  });
  T.vest = canvasTexture(16, 16, (g, w, h) => noise(g, w, h, PAL.vest, 2));
  T.vestBack = canvasTexture(16, 16, (g, w, h) => {
    noise(g, w, h, PAL.vest, 2);
    px(g, 7, 0, PAL.vestLine, 2, 16); // centre seam
    px(g, 0, 15, PAL.vestLine, 16, 1);
  });
  // Front: pink V-neck, button placket and hem. Pockets, tag and pens are separate 3D parts.
  T.vestFront = canvasTexture(32, 32, (g, w, h) => {
    noise(g, w, h, PAL.vest, 2);
    for (let y = 0; y < 10; y++) {
      const half = Math.max(0, 7 - Math.floor(y * 0.75));
      px(g, 16 - half, y, PAL.shirt[(y >> 1) % 2], half * 2, 1);
      if (half) {
        px(g, 15 - half, y, PAL.vestLine, 1, 1);
        px(g, 16 + half, y, PAL.vestLine, 1, 1);
      }
    }
    px(g, 15, 10, PAL.vestLine, 2, 22);
    for (const y of [13, 19, 25]) px(g, 17, y, '#77706a', 1, 1);
    px(g, 0, 31, PAL.vestLine, 32, 1);
  });
  T.pocket = canvasTexture(8, 8, (g, w, h) => {
    noise(g, w, h, PAL.vest, 2);
    px(g, 0, 0, PAL.vestLine, 8, 1);
    px(g, 0, 7, PAL.vestLine, 8, 1);
    px(g, 0, 0, PAL.vestLine, 1, 8);
    px(g, 7, 0, PAL.vestLine, 1, 8);
  });
  T.flap = canvasTexture(8, 4, (g, w, h) => {
    noise(g, w, h, PAL.vest.slice(2), 2);
    px(g, 0, 3, PAL.vestLine, 8, 1);
    px(g, 3, 2, '#77706a', 2, 1); // snap
  });
  T.pants = canvasTexture(16, 16, (g, w, h) => {
    noise(g, w, h, PAL.pants, 2);
    for (const y of [5, 11]) px(g, 0, y, '#2b2d40', 16, 1); // faint folds
  });
  T.cuff = canvasTexture(16, 4, (g, w, h) => {
    noise(g, w, h, ['#33364c', '#2d3044', '#3a3d55', '#272a3b'], 2);
    px(g, 0, 0, '#25283a', 16, 1);
  });
  T.cargo = canvasTexture(8, 8, (g, w, h) => {
    noise(g, w, h, PAL.pocket, 2);
    px(g, 0, 0, '#33241e', 8, 1);
    px(g, 0, 7, '#33241e', 8, 1);
    px(g, 0, 0, '#33241e', 1, 8);
    px(g, 7, 0, '#33241e', 1, 8);
  });
  T.cargoFlap = canvasTexture(8, 4, (g, w, h) => {
    noise(g, w, h, PAL.pocket.slice(1), 2);
    px(g, 0, 3, '#33241e', 8, 1);
  });
  // Hair: chunky 2-px blocks with lighter streaks; vertex colours add the top-to-bottom shading.
  T.hair = canvasTexture(16, 16, (g, w, h) => {
    noise(g, w, h, PAL.hair, 2);
    for (let i = 0; i < 6; i++) px(g, Math.floor(rand() * 8) * 2, Math.floor(rand() * 6) * 2, '#ad7048', 2, 4);
  });
  T.shoe = canvasTexture(16, 8, (g, w, h) => {
    noise(g, w, h, PAL.shoe, 2);
    px(g, 0, 4, PAL.shoeGrey, 5, 4); // heel panel
    px(g, 11, 4, PAL.shoeGrey, 5, 4); // toe panel
    px(g, 6, 0, PAL.shoeGrey, 4, 2); // tongue
  });
  T.ear = canvasTexture(4, 4, (g) => {
    px(g, 0, 0, PAL.ear, 4, 4);
    px(g, 1, 1, '#d99f7d', 2, 2);
  });
  T.bow = canvasTexture(8, 8, (g, w, h) => {
    noise(g, w, h, ['#4a4340', '#423c39', '#554d49', '#3a3533'], 2);
    px(g, 0, 0, '#1c1917', 8, 1);
    px(g, 0, 7, '#1c1917', 8, 1);
    px(g, 0, 0, '#1c1917', 1, 8);
    px(g, 7, 0, '#1c1917', 1, 8);
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
  // Face: simple dark oval eyes with one glint, soft blush under the eyes and a small smile.
  T.face = canvasTexture(32, 32, (g, w, h) => {
    px(g, 0, 0, PAL.skin, w, h);
    for (const x0 of [9, 19]) {
      px(g, x0 + 1, 14, PAL.eye, 2, 1);
      px(g, x0, 15, PAL.eye, 4, 5);
      px(g, x0 + 1, 20, PAL.eye, 2, 1);
      px(g, x0 + 1, 18, PAL.eyeLow, 2, 2);
      px(g, x0 + 2, 15, '#fff8ee', 1, 2); // glint
      px(g, x0 - 2 + (x0 > 16 ? 5 : 0), 21, PAL.blush, 3, 2);
    }
    px(g, 14, 24, PAL.mouth, 1, 1); // smile
    px(g, 15, 25, PAL.mouth, 2, 1);
    px(g, 17, 24, PAL.mouth, 1, 1);
    px(g, 0, 31, PAL.skinShade, 32, 1); // jaw shade
  });
  return T;
}

// ---------- model ----------
// Measured from the concept front view (character ≈ 530 px tall → 0.91 units):
// head + hair ≈ 45 % of the height, hair ≈ 0.52 wide, vest hem at 0.24, baggy legs, chunky shoes.
export function buildLuna() {
  materials.clear();
  seed = 20041024;
  const T = buildTextures();
  const M = {
    skin: flat('Luna skin', PAL.skin),
    ear: mat('Luna ears', T.ear),
    face: mat('Luna face', T.face),
    hair: mat('Luna hair', T.hair),
    shirt: mat('Luna pink shirt', T.shirt),
    sleeve: mat('Luna pink sleeve', T.sleeve),
    vestFront: mat('Luna vest front', T.vestFront),
    vest: mat('Luna vest', T.vest),
    vestBack: mat('Luna vest back', T.vestBack),
    vestPocket: mat('Luna vest pockets', T.pocket),
    vestFlap: mat('Luna vest flaps', T.flap),
    vestDark: mat('Luna vest bow', T.bow),
    pants: mat('Luna cargo pants', T.pants),
    cuff: mat('Luna cargo cuffs', T.cuff),
    cargo: mat('Luna cargo pockets', T.cargo),
    cargoFlap: mat('Luna cargo flaps', T.cargoFlap),
    shoe: mat('Luna sneakers', T.shoe),
    midsole: flat('Luna sneaker midsole', PAL.midsole),
    sole: flat('Luna sneaker soles', PAL.sole),
    tag: mat('Luna name tag', T.tag),
    bandGrey: flat('Luna grey wristband', PAL.bandGrey),
    bandDark: flat('Luna dark wristband', PAL.bandDark),
    pen: flat('Luna pens', '#cfccc6'),
    penCap: flat('Luna pen caps', '#2b2928'),
  };

  const root = new THREE.Group();
  root.name = 'Luna';

  // ----- torso (pivot at the waist; head and arms hang from here, legs are siblings) -----
  const body = joint(root, 'Luna_Body', [0, 0.25, 0]);
  part(body, 'Luna_Body_hips', shapedBox(0.25, 0.06, 0.16, { round: 0.2 }), M.pants, [0, -0.01, 0]);
  part(body, 'Luna_Body_shirt', shapedBox(0.21, 0.24, 0.145, { taperTop: 0.92 }), M.shirt, [0, 0.12, 0]);
  const vestW = 0.24,
    vestH = 0.235,
    vestD = 0.17,
    vestY = 0.108,
    vestTop = 0.9,
    vestBottom = 1.06;
  const vest = new THREE.Mesh(
    shapedBox(vestW, vestH, vestD, { seg: [2, 2, 2], taperTop: vestTop, taperBottom: vestBottom }),
    [M.vest, M.vest, M.vest, M.vest, M.vestFront, M.vestBack],
  );
  vest.name = 'Luna_Body_vest';
  vest.position.set(0, vestY, 0);
  body.add(vest);
  // Front surface of the vest at a given height (body space), so pockets sit flush.
  const vestFront = (y) => {
    const t = (y - (vestY - vestH / 2)) / vestH;
    return (vestD / 2) * (vestBottom + (vestTop - vestBottom) * t);
  };
  const vestHalfW = (y) => {
    const t = (y - (vestY - vestH / 2)) / vestH;
    return (vestW / 2) * (vestBottom + (vestTop - vestBottom) * t);
  };
  // Shoulder straps over the sleeves' inner edge.
  for (const s of [-1, 1])
    part(body, 'Luna_Body_vest_strap', shapedBox(0.045, 0.02, 0.15), M.vest, [s * 0.085, 0.228, 0]);
  part(body, 'Luna_Body_collar', shapedBox(0.1, 0.022, 0.08), M.shirt, [0, 0.235, 0.004]);
  // Four flap pockets: two small chest pockets and two large hip pockets.
  for (const [x, y, w, h] of [
    [-0.058, 0.155, 0.064, 0.05],
    [0.058, 0.155, 0.064, 0.05],
    [-0.06, 0.045, 0.078, 0.068],
    [0.06, 0.045, 0.078, 0.068],
  ]) {
    const xs = Math.sign(x) * Math.min(Math.abs(x), vestHalfW(y) - w / 2 - 0.006);
    part(body, 'Luna_Body_vest_pocket', shapedBox(w, h, 0.012), M.vestPocket, [xs, y, vestFront(y) + 0.002]);
    part(
      body,
      'Luna_Body_vest_flap',
      shapedBox(w + 0.006, 0.018, 0.016, { taperBottom: 0.95 }),
      M.vestFlap,
      [xs, y + h / 2 - 0.006, vestFront(y + h / 2) + 0.006],
    );
  }
  // Name tag above the wearer's left chest pocket, two pens sticking out of that pocket.
  part(body, 'Luna_Body_nametag', shapedBox(0.064, 0.026, 0.008), M.tag, [0.06, 0.205, vestFront(0.205) + 0.004]);
  for (const [x, h] of [
    [0.048, 0.036],
    [0.062, 0.03],
  ]) {
    const z = vestFront(0.175) + 0.001;
    part(body, 'Luna_Body_pen', shapedBox(0.008, h, 0.008), M.pen, [x, 0.17 + h / 2 - 0.012, z]);
    part(body, 'Luna_Body_pen_cap', shapedBox(0.009, 0.01, 0.009), M.penCap, [x, 0.17 + h - 0.012, z]);
  }
  // Big 3D bow on the back of the vest.
  const bowZ = -vestFront(0.13) - 0.006;
  const bow = joint(body, 'Luna_Body_bow', [0, 0.13, bowZ]);
  part(bow, 'Luna_Body_bow_knot', shapedBox(0.03, 0.028, 0.02, { round: 0.3 }), M.vestDark);
  for (const s of [-1, 1]) {
    part(
      bow,
      'Luna_Body_bow_loop',
      shapedBox(0.06, 0.044, 0.018, { seg: [2, 1, 1], taperTop: 1, shift: (t, v) => new THREE.Vector3(0, v.x * s * 0.0, 0) }),
      M.vestDark,
      [s * 0.04, 0.004, -0.002],
      [0, s * -0.25, s * -0.12],
    );
    part(
      bow,
      'Luna_Body_bow_tail',
      shapedBox(0.024, 0.075, 0.012, { taperBottom: 1.3, top: true }),
      M.vestDark,
      [s * 0.01, -0.008, 0.001],
      [0, 0, s * 0.3],
    );
  }
  part(body, 'Luna_Body_neck', shapedBox(0.06, 0.04, 0.06), M.skin, [0, 0.25, 0]);

  // ----- head (pivot at the base of the neck) -----
  const head = joint(body, 'Luna_Head', [0, 0.25, 0]);
  const skull = new THREE.Mesh(
    shapedBox(0.3, 0.27, 0.27, { seg: [4, 4, 4], round: 0.62, taperBottom: 0.86 }),
    [M.skin, M.skin, M.skin, M.skin, M.face, M.skin],
  );
  skull.name = 'Luna_Head_face';
  skull.position.set(0, 0.14, 0.004);
  head.add(skull);
  for (const s of [-1, 1])
    part(head, 'Luna_Head_ear', shapedBox(0.036, 0.062, 0.044, { round: 0.45 }), M.ear, [s * 0.158, 0.125, 0.014], [0, 0, s * -0.16]);

  // Hair: faceted cap, crown chunks over the dome, a bell-shaped bob of pointed clumps that
  // stops behind the ears, a lock in front of each ear and jagged bangs following the dome.
  const cap = part(
    head,
    'Luna_Head_hair_cap',
    facet(new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.5)),
    M.hair,
    [0, 0.205, -0.015],
  );
  cap.scale.set(0.19, 0.21, 0.19);
  // A clump hangs from its root; `bulge` bows it outward in the middle for a rounder bell shape.
  const clump = (name, angle, { r, y, len, w, d, tilt, side = 0, taper = 0.42, bulge = 0 }) =>
    part(
      head,
      name,
      shapedBox(w, len, d, {
        top: true,
        taperTop: 0.85,
        taperBottom: taper,
        seg: [1, 3, 1],
        shift: bulge ? (t) => new THREE.Vector3(0, 0, Math.sin(Math.PI * t) * bulge) : undefined,
      }),
      M.hair,
      [Math.sin(angle) * r, y, Math.cos(angle) * r - 0.015],
      [tilt, angle, side],
      'YXZ',
    );
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.31;
    clump('Luna_Head_hair_crown', a, { r: 0.045, y: 0.392, len: 0.115, w: 0.1, d: 0.05, tilt: -1.02, taper: 0.55 });
  }
  const bob = 17;
  for (let i = 0; i < bob; i++) {
    const a = THREE.MathUtils.lerp(2.0, Math.PI * 2 - 2.0, i / (bob - 1)); // behind ear → back → behind ear
    const jag = [0, 0.022, -0.01, 0.014, 0.004][i % 5];
    clump('Luna_Head_hair_bob', a, { r: 0.145, y: 0.32, len: 0.3 + jag, w: 0.095, d: 0.07, tilt: -0.26, bulge: 0.035 });
  }
  for (const s of [-1, 1])
    clump('Luna_Head_hair_sidelock', s * 0.88, { r: 0.13, y: 0.29, len: 0.25, w: 0.06, d: 0.05, tilt: -0.16, side: s * 0.04, taper: 0.36, bulge: 0.012 });
  const bangs = [
    [-0.118, 0.19],
    [-0.078, 0.21],
    [-0.038, 0.19],
    [0.0, 0.215],
    [0.04, 0.192],
    [0.08, 0.208],
    [0.118, 0.185],
  ];
  for (const [x, len] of bangs)
    clump('Luna_Head_hair_bangs', x / 0.13, { r: 0.09, y: 0.36, len: len + 0.01, w: 0.066, d: 0.05, tilt: -0.46, side: -x * 0.8, taper: 0.32, bulge: 0.012 });

  // ----- arms: short, slightly open, round fists -----
  for (const [side, s] of [
    ['L', 1],
    ['R', -1],
  ]) {
    const arm = joint(body, 'Luna_Arm_' + side, [s * 0.128, 0.215, 0], [0, 0, s * 0.2]);
    part(arm, `Luna_Arm_${side}_sleeve`, shapedBox(0.088, 0.088, 0.092, { taperBottom: 1.08, round: 0.3, seg: [2, 2, 2] }), M.sleeve, [s * 0.018, -0.03, 0]);
    part(arm, `Luna_Arm_${side}_upper`, shapedBox(0.054, 0.05, 0.054), M.skin, [s * 0.016, -0.085, 0]);
    const elbow = joint(arm, 'Luna_Elbow_' + side, [s * 0.016, -0.105, 0]);
    part(elbow, `Luna_Elbow_${side}_forearm`, shapedBox(0.052, 0.07, 0.052, { taperBottom: 0.94 }), M.skin, [0, -0.033, 0]);
    part(elbow, `Luna_Elbow_${side}_wristband`, shapedBox(0.06, 0.018, 0.06, { round: 0.2 }), side === 'L' ? M.bandDark : M.bandGrey, [0, -0.06, 0]);
    const wrist = joint(elbow, 'Luna_Wrist_' + side, [0, -0.07, 0]);
    part(wrist, `Luna_Wrist_${side}_hand`, shapedBox(0.066, 0.062, 0.064, { seg: [2, 2, 2], round: 0.6 }), M.skin, [0, -0.026, 0.004]);
    part(wrist, `Luna_Wrist_${side}_thumb`, shapedBox(0.022, 0.03, 0.024, { round: 0.4 }), M.skin, [-s * 0.022, -0.018, 0.03]);
  }

  // ----- legs: baggy cargo trousers bunching over chunky sneakers -----
  for (const [side, s] of [
    ['L', 1],
    ['R', -1],
  ]) {
    const leg = joint(root, 'Luna_Leg_' + side, [s * 0.072, 0.25, 0]);
    part(leg, `Luna_Leg_${side}_pants`, shapedBox(0.14, 0.2, 0.15, { seg: [2, 3, 2], round: 0.18, taperTop: 0.92, taperBottom: 1.08 }), M.pants, [s * 0.006, -0.1, 0]);
    part(leg, `Luna_Leg_${side}_cuff`, shapedBox(0.166, 0.045, 0.178, { round: 0.25, seg: [2, 1, 2], taperBottom: 1.04 }), M.cuff, [s * 0.006, -0.188, 0.004]);
    part(leg, `Luna_Leg_${side}_cargo_pocket`, shapedBox(0.026, 0.075, 0.078), M.cargo, [s * 0.083, -0.125, 0.004], [0, 0, s * 0.04]);
    part(leg, `Luna_Leg_${side}_cargo_flap`, shapedBox(0.032, 0.022, 0.084), M.cargoFlap, [s * 0.086, -0.088, 0.004], [0, 0, s * 0.04]);
    part(leg, `Luna_Leg_${side}_sneaker`, shapedBox(0.118, 0.056, 0.196, { seg: [2, 2, 3], round: 0.42, taperTop: 0.8 }), M.shoe, [s * 0.004, -0.193, 0.028]);
    part(leg, `Luna_Leg_${side}_midsole`, shapedBox(0.126, 0.02, 0.204, { round: 0.15, seg: [2, 1, 2] }), M.midsole, [s * 0.004, -0.224, 0.028]);
    part(leg, `Luna_Leg_${side}_sole`, shapedBox(0.124, 0.016, 0.2, { round: 0.12, seg: [2, 1, 2] }), M.sole, [s * 0.004, -0.242, 0.028]);
  }

  // Vertex shading: lighter crown, darker tips; cloth darkens slightly toward the ground.
  bakeGradient(root, (n) => n.includes('_hair_'), 0.9, 0.52, 1.0, 0.6);
  bakeGradient(root, (n) => /pants|fold|cuff|hips/.test(n), 0.26, 0.04, 1.0, 0.72);
  bakeGradient(root, (n) => /_vest|_bow/.test(n), 0.49, 0.24, 1.0, 0.82);

  root.traverse((n) => {
    if (n.isMesh) {
      n.castShadow = true;
      n.receiveShadow = true;
    }
  });
  return root;
}
