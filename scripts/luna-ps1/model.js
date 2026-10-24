// Luna — PS1-style low-poly chibi for Winds Space.
// Builds an articulated THREE.Group with small pixel-art textures (nearest filtering) and
// baked vertex shading. Faces +Z; character's left is +X. Joint names match the café rig and
// greeting animation: Luna_Body, Luna_Head, Luna_Arm_L/R, Luna_Elbow_L/R, Luna_Wrist_L/R,
// Luna_Leg_L/R. Proportions are measured from the owner's "LUNA — PS1 style concept" sheet.
import * as THREE from 'three';

const PAL = {
  hair: ['#8a5236', '#7f4a30', '#965b3b', '#703f28'],
  skin: '#f4cba5',
  skinShade: '#e8b690',
  ear: '#eebf98',
  earIn: '#d99f7d',
  blush: '#f0a49a',
  eye: '#3a2217',
  eyeLow: '#5a3322',
  eyeLight: '#6e4630',
  lash: '#24140d',
  brow: '#8a5a3c',
  nose: '#e6a08a',
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
// Slopes the top outer corners down so shoulders read round instead of square.
const shoulderSlope = (w, drop) => (t, v) =>
  new THREE.Vector3(0, -Math.max(0, t - 0.55) / 0.45 * Math.pow(Math.abs(v.x) / (w / 2), 1.6) * drop, 0);
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
    for (let i = 0; i < 6; i++) px(g, Math.floor(rand() * 8) * 2, Math.floor(rand() * 6) * 2, '#a26641', 2, 4);
  });
  T.hair.wrapS = T.hair.wrapT = THREE.RepeatWrapping;
  T.shoe = canvasTexture(16, 8, (g, w, h) => {
    noise(g, w, h, PAL.shoe, 2);
    px(g, 0, 4, PAL.shoeGrey, 5, 4); // heel panel
    px(g, 11, 4, PAL.shoeGrey, 5, 4); // toe panel
    px(g, 6, 0, PAL.shoeGrey, 4, 2); // tongue
  });
  // Ear: rounded with a darker C-shaped fold.
  T.ear = canvasTexture(8, 8, (g) => {
    px(g, 0, 0, PAL.ear, 8, 8);
    px(g, 2, 2, PAL.earIn, 3, 4); // inner fold
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
  // Face, wrapped around the head (48 px = the front half of the head, 32 px = y 0.30 → 0.00 in head
  // space): tall oval eyes with a dark lash line and an outer flick, thin brows, a nose dot,
  // a small smile and blush under the outer corner of each eye.
  T.face = canvasTexture(48, 32, (g, w, h) => {
    px(g, 0, 0, PAL.skin, w, h);
    for (const side of [-1, 1]) {
      const x0 = side > 0 ? 29 : 14; // eye columns x0 … x0+4
      const outer = side > 0 ? x0 + 5 : x0 - 1; // just outside the outer corner
      px(g, x0 + 1, 15, PAL.lash, 3, 1); // rounded lash line
      px(g, x0, 16, PAL.lash, 5, 1);
      px(g, outer, 15, PAL.lash, 1, 1); // outer flick
      px(g, x0, 17, PAL.eye, 5, 4);
      px(g, x0, 21, PAL.eyeLow, 5, 2);
      px(g, x0 + 1, 23, PAL.eyeLow, 3, 1);
      px(g, side > 0 ? x0 + 1 : x0 + 3, 17, PAL.eyeLight, 1, 2); // soft highlight
      px(g, x0, 10, PAL.brow, 4, 1); // brow, a short arc
      px(g, side > 0 ? x0 + 4 : x0 - 1, 11, PAL.brow, 1, 1);
      px(g, side > 0 ? x0 + 3 : x0 - 3, 24, PAL.blush, 5, 2); // blush
    }
    px(g, 23, 23, PAL.nose, 2, 1); // nose
    px(g, 20, 25, PAL.mouth, 1, 1); // smile
    px(g, 21, 26, PAL.mouth, 6, 1);
    px(g, 27, 25, PAL.mouth, 1, 1);
    px(g, 0, 30, PAL.skinShade, 48, 2); // under the jaw
  });
  return T;
}

// ---------- head ----------
// Low-poly head, measured from the concept (head space, y up from the chin, z forward): wide
// cheeks, rounded chin. The face texture wraps around the front half (u = 0.5 + φ/π), so the
// eyes still read in profile the way they do in the side view of the concept.
const HEAD_RINGS = [
  // y, half-width, front depth, back depth
  [0.012, 0.05, 0.1, 0.06],
  [0.05, 0.106, 0.134, 0.11],
  [0.11, 0.135, 0.148, 0.14],
  [0.17, 0.14, 0.148, 0.15],
  [0.23, 0.134, 0.136, 0.15],
  [0.29, 0.11, 0.1, 0.125],
  [0.33, 0.062, 0.05, 0.072],
];
function headMesh(faceMaterial) {
  const N = 14,
    pos = [],
    uv = [];
  // The front half is a superellipse so the face is a broad, fairly flat plane (as in the concept)
  // and both eyes stay readable in a 3/4 view; the back of the skull stays round.
  const ringPoint = ([y, rx, zf, zb], phi) => {
    const sn = Math.sin(phi),
      cs = Math.cos(phi),
      e = cs > 0 ? 2 / 3 : 1;
    return [Math.sign(sn) * Math.pow(Math.abs(sn), e) * rx, y, Math.sign(cs) * Math.pow(Math.abs(cs), e) * (cs > 0 ? zf : zb)];
  };
  const uvOf = (p, phi) => [0.5 + phi / Math.PI, p[1] / 0.3];
  const tri = (...verts) => {
    for (const [p, phi] of verts) {
      pos.push(...p);
      uv.push(...uvOf(p, phi));
    }
  };
  const bottom = [0, 0.0, 0.03],
    top = [0, 0.345, -0.005];
  for (let k = 0; k < N; k++) {
    const p0 = -Math.PI + (k / N) * Math.PI * 2,
      p1 = -Math.PI + ((k + 1) / N) * Math.PI * 2,
      pm = (p0 + p1) / 2;
    tri([bottom, pm], [ringPoint(HEAD_RINGS[0], p1), p1], [ringPoint(HEAD_RINGS[0], p0), p0]);
    for (let r = 0; r < HEAD_RINGS.length - 1; r++) {
      const a0 = ringPoint(HEAD_RINGS[r], p0),
        a1 = ringPoint(HEAD_RINGS[r], p1),
        b0 = ringPoint(HEAD_RINGS[r + 1], p0),
        b1 = ringPoint(HEAD_RINGS[r + 1], p1);
      tri([a0, p0], [a1, p1], [b1, p1]);
      tri([a0, p0], [b1, p1], [b0, p0]);
    }
    const last = HEAD_RINGS[HEAD_RINGS.length - 1];
    tri([ringPoint(last, p0), p0], [ringPoint(last, p1), p1], [top, pm]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, faceMaterial);
  mesh.name = 'Luna_Head_face';
  return mesh;
}

// ---------- hair ----------
// Every strand starts at the crown, follows a dome down to the "equator" and then hangs as a
// skirt to its own hem. Each strand is three columns wide (inner edge, raised ridge, outer edge)
// and ends in a point, so the hem breaks into the chunky tips of the concept.
const HAIR = { apexY: 0.42, eqY: 0.2, cz: -0.03, rx: 0.2, rzFront: 0.22, rzBack: 0.225, shear: -0.025, domeR: 0.21, top: 1.15, tex: 0.36 };
const hairRadius = (phi) => {
  const rz = Math.cos(phi) > 0 ? HAIR.rzFront : HAIR.rzBack;
  return 1 / Math.hypot(Math.sin(phi) / HAIR.rx, Math.cos(phi) / rz);
};
// Strands for the wearer's left side (φ > 0); the right side is mirrored. hem = [inner, tip, outer]
// heights in head space; out = how far the tip flares (>1) or hugs the face (<1); layer alternates
// so neighbouring strands overlap instead of z-fighting.
const STRANDS = [
  // Fringe: narrow strands with pointed tips of different lengths, down to the top of the eyes.
  { phi: 0.15, w: 0.09, hem: [0.186, 0.17, 0.19], out: 0.97, bulge: 0.02, hug: 0.92, layer: 1, sweep: 0.02 },
  { phi: 0.3, w: 0.09, hem: [0.2, 0.176, 0.21], out: 0.97, bulge: 0.02, hug: 0.91, layer: 2, sweep: 0.04 },
  // Curtain cut on a slant so the forehead and the brows show through.
  { phi: 0.47, w: 0.11, hem: [0.272, 0.256, 0.246], out: 1, hug: 0.88, layer: 1, sweep: 0.05 },
  { phi: 0.68, w: 0.12, hem: [0.246, 0.226, 0.21], out: 1, hug: 0.88, layer: 2, sweep: 0.05 },
  { phi: 0.88, w: 0.11, hem: [0.21, 0.19, 0.178], out: 0.97, hug: 0.9, layer: 1, sweep: 0.03 },
  // Locks framing the cheeks: one long one hugging the face, a shorter one in front of the ear.
  { phi: 1.05, w: 0.11, hem: [0.07, 0.025, 0.08], out: 0.82, bulge: 0.02, layer: 2 },
  { phi: 1.22, w: 0.09, hem: [0.15, 0.118, 0.16], out: 0.92, layer: 1 },
  // Above and behind the ear.
  { phi: 1.43, w: 0.14, hem: [0.18, 0.166, 0.186], out: 1.0, layer: 2 },
  { phi: 1.68, w: 0.14, hem: [0.165, 0.1, 0.075], out: 1.18, bulge: 0.02, layer: 1 },
  // Outer tier of the bob: long at the sides, a little shorter at the back, flaring out.
  { phi: 1.92, w: 0.14, hem: [0.055, 0.0, 0.05], out: 1.28, bulge: 0.03, layer: 2 },
  { phi: 2.17, w: 0.14, hem: [0.08, 0.035, 0.085], out: 1.24, bulge: 0.035, layer: 1 },
  { phi: 2.42, w: 0.14, hem: [0.1, 0.06, 0.095], out: 1.25, bulge: 0.035, layer: 2 },
  { phi: 2.67, w: 0.14, hem: [0.11, 0.07, 0.115], out: 1.25, bulge: 0.035, layer: 1 },
  { phi: 2.92, w: 0.14, hem: [0.115, 0.075, 0.11], out: 1.25, bulge: 0.035, layer: 2 },
  // Under tier peeking out below the outer tier at the nape.
  { phi: 2.05, w: 0.16, hem: [0.035, -0.02, 0.04], out: 1.1, layer: -2 },
  { phi: 2.35, w: 0.16, hem: [0.04, -0.012, 0.035], out: 1.1, layer: -2 },
  { phi: 2.65, w: 0.16, hem: [0.035, -0.022, 0.04], out: 1.1, layer: -2 },
  { phi: 2.95, w: 0.16, hem: [0.04, -0.008, 0.035], out: 1.1, layer: -2 },
];
const CENTRE_STRANDS = [
  { phi: 0, w: 0.09, hem: [0.182, 0.162, 0.182], out: 0.97, bulge: 0.02, hug: 0.92, layer: 2 },
  { phi: Math.PI, w: 0.14, hem: [0.115, 0.07, 0.115], out: 1.25, bulge: 0.035, layer: 1 },
  { phi: Math.PI, w: 0.16, hem: [0.035, -0.018, 0.035], out: 1.1, layer: -2 },
];
function hairStrands(material) {
  const ROWS = 8,
    pos = [],
    uv = [],
    col = [];
  const strands = [...CENTRE_STRANDS];
  for (const st of STRANDS) {
    strands.push(st);
    strands.push({ ...st, phi: -st.phi, sweep: -(st.sweep || 0), mirrored: true });
  }
  for (const st of strands) {
    const shade = 0.84 + rand() * 0.13 - (st.layer === 1 ? 0.05 : 0) - (st.layer < 0 ? 0.1 : 0);
    const uOff = rand() * 4,
      vOff = rand() * 4;
    // Column c = 0 (φ - w), 1 (ridge), 2 (φ + w). For the mirrored side the inner edge is c = 2.
    const hemOf = (c) => {
      if (c === 1) return st.hem[1];
      const corner = (c === 0) !== !!st.mirrored ? st.hem[0] : st.hem[2];
      return st.hem[1] + (corner - st.hem[1]) * 0.75; // tips a little blunter than drawn
    };
    const columns = [0, 1, 2].map((c) => {
      const phi0 = st.phi + (c - 1) * st.w;
      const hem = hemOf(c);
      const thetaEnd = hem >= HAIR.eqY ? Math.acos(Math.min(1, (hem - HAIR.eqY) / (HAIR.apexY - HAIR.eqY))) : Math.PI / 2;
      const domeLen = thetaEnd * HAIR.domeR,
        skirtLen = Math.max(0, HAIR.eqY - hem),
        total = domeLen + skirtLen;
      const pts = [];
      for (let i = 0; i < ROWS; i++) {
        const a = i / (ROWS - 1),
          L = a * total;
        const phi = phi0 + (c === 1 ? (st.sweep || 0) * a * a : 0);
        // `hug` pulls the end of a strand in toward the face (curtain over the brows, fringe).
        const hug = 1 + ((st.hug || 1) - 1) * THREE.MathUtils.smoothstep(a, 0.45, 1);
        const R = (hairRadius(phi) * (1 + 0.012 * st.layer) + (c === 1 ? 0.006 : 0)) * hug;
        let x, y, z;
        if (L <= domeLen) {
          const th = L / HAIR.domeR,
            r = R * Math.pow(Math.sin(th), HAIR.top);
          y = HAIR.eqY + Math.cos(th) * (HAIR.apexY - HAIR.eqY);
          x = Math.sin(phi) * r;
          z = HAIR.cz + Math.cos(phi) * r + HAIR.shear * Math.cos(th);
        } else {
          const t = skirtLen ? (L - domeLen) / skirtLen : 1;
          const r = R * (1 + (st.out - 1) * t + (st.bulge || 0) * Math.sin(Math.PI * t));
          y = HAIR.eqY + (hem - HAIR.eqY) * t;
          x = Math.sin(phi) * r;
          z = HAIR.cz + Math.cos(phi) * r;
        }
        pts.push({ p: [x, y, z], v: L / HAIR.tex + vOff, r: Math.hypot(x, z - HAIR.cz) });
      }
      return { pts, c };
    });
    const k = (p, c) => {
      const g = 0.62 + 0.38 * THREE.MathUtils.clamp(p[1] / HAIR.apexY, 0, 1);
      return Math.min(1.1, g * shade * (c === 1 ? 1.06 : 1));
    };
    const push = (c, i) => {
      const q = columns[c].pts[i];
      pos.push(...q.p);
      uv.push(uOff + ((c - 1) * st.w * q.r) / HAIR.tex, q.v);
      const kk = k(q.p, c);
      col.push(kk, kk, kk);
    };
    for (let c = 0; c < 2; c++)
      for (let i = 0; i < ROWS - 1; i++) {
        push(c, i), push(c, i + 1), push(c + 1, i + 1);
        push(c, i), push(c + 1, i + 1), push(c + 1, i);
      }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'Luna_Head_hair';
  return mesh;
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
    hair: mat('Luna hair', T.hair, { side: THREE.DoubleSide, vertexColors: true }),
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
  part(body, 'Luna_Body_shirt', shapedBox(0.21, 0.24, 0.145, { seg: [4, 3, 1], taperTop: 0.9, round: 0.12, shift: shoulderSlope(0.21, 0.04) }), M.shirt, [0, 0.12, 0]);
  const vestW = 0.24,
    vestH = 0.26,
    vestD = 0.17,
    vestY = 0.097,
    vestTop = 0.9,
    vestBottom = 1.13;
  const vest = new THREE.Mesh(
    shapedBox(vestW, vestH, vestD, { seg: [4, 3, 2], taperTop: vestTop, taperBottom: vestBottom, shift: shoulderSlope(vestW, 0.03) }),
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
    part(body, 'Luna_Body_vest_strap', shapedBox(0.045, 0.02, 0.15), M.vest, [s * 0.08, 0.222, 0], [0, 0, s * -0.3]);
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
  const bowZ = -vestFront(0.055) - 0.006;
  const bow = joint(body, 'Luna_Body_bow', [0, 0.055, bowZ]);
  bow.scale.set(1.3, 1.1, 1.2);
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
  part(body, 'Luna_Body_neck', shapedBox(0.06, 0.03, 0.06), M.skin, [0, 0.235, 0]);

  // ----- head (pivot at the base of the neck) -----
  // Chin sits just above the shoulders and the bob's tips reach the shoulder line, as in the concept.
  const head = joint(body, 'Luna_Head', [0, 0.232, 0]);
  head.add(headMesh(M.face));
  // Ears: big and rounded, turned a little forward, sitting just under the hair line.
  for (const s of [-1, 1])
    part(
      head,
      'Luna_Head_ear',
      shapedBox(0.03, 0.072, 0.06, { seg: [1, 2, 2], round: 0.62 }),
      M.ear,
      [s * 0.15, 0.118, -0.014],
      [0, s * 0.35, s * -0.18],
    );
  // Hair: overlapping strands that meet at the crown (see hairStrands).
  head.add(hairStrands(M.hair));

  // ----- arms: short, slightly open, round fists -----
  for (const [side, s] of [
    ['L', 1],
    ['R', -1],
  ]) {
    const arm = joint(body, 'Luna_Arm_' + side, [s * 0.128, 0.215, 0], [0, 0, s * 0.33]);
    part(arm, `Luna_Arm_${side}_sleeve`, shapedBox(0.094, 0.108, 0.096, { taperTop: 0.8, taperBottom: 1.06, round: 0.38, seg: [2, 3, 2] }), M.sleeve, [s * 0.016, -0.046, 0]);
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
    // Baggy legs that widen toward the ankle and stack in two folds over the sneakers.
    part(leg, `Luna_Leg_${side}_pants`, shapedBox(0.15, 0.19, 0.16, { seg: [2, 4, 2], round: 0.2, taperTop: 0.9, taperBottom: 1.12 }), M.pants, [s * 0.008, -0.085, 0]);
    part(leg, `Luna_Leg_${side}_fold`, shapedBox(0.176, 0.034, 0.184, { seg: [2, 2, 2], round: 0.5 }), M.pants, [s * 0.01, -0.142, 0.002]);
    part(leg, `Luna_Leg_${side}_cuff`, shapedBox(0.184, 0.05, 0.196, { round: 0.45, seg: [2, 2, 2], taperBottom: 0.97 }), M.cuff, [s * 0.01, -0.178, 0.006]);
    part(leg, `Luna_Leg_${side}_cargo_pocket`, shapedBox(0.03, 0.086, 0.086, { round: 0.15 }), M.cargo, [s * 0.088, -0.112, 0.006], [0, 0, s * 0.05]);
    part(leg, `Luna_Leg_${side}_cargo_flap`, shapedBox(0.036, 0.024, 0.092), M.cargoFlap, [s * 0.091, -0.07, 0.006], [0, 0, s * 0.05]);
    part(leg, `Luna_Leg_${side}_sneaker`, shapedBox(0.118, 0.056, 0.196, { seg: [2, 2, 3], round: 0.42, taperTop: 0.8 }), M.shoe, [s * 0.004, -0.193, 0.028]);
    part(leg, `Luna_Leg_${side}_midsole`, shapedBox(0.126, 0.02, 0.204, { round: 0.15, seg: [2, 1, 2] }), M.midsole, [s * 0.004, -0.224, 0.028]);
    part(leg, `Luna_Leg_${side}_sole`, shapedBox(0.124, 0.016, 0.2, { round: 0.12, seg: [2, 1, 2] }), M.sole, [s * 0.004, -0.242, 0.028]);
  }

  // Vertex shading: lighter crown, darker tips; cloth darkens slightly toward the ground.
  bakeGradient(root, (n) => /pants|fold|cuff|hips/.test(n), 0.26, 0.04, 1.0, 0.72);
  bakeGradient(root, (n) => /_vest|_bow/.test(n), 0.49, 0.24, 1.0, 0.82);

  root.traverse((n) => {
    if (n.isMesh) {
      // The hair doesn't cast shadows so it never darkens the face (the concept is evenly lit).
      n.castShadow = n.name !== 'Luna_Head_hair';
      n.receiveShadow = true;
    }
  });
  return root;
}
