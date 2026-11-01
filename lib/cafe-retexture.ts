// The café model's surfaces carry small baked textures (256–512 px per object), which stretch on
// big or oddly unwrapped pieces (floors, walls, benches). Each baked surface gets a small seamless
// texture of its own colour instead (plaster speckle, concrete, timber planks, plywood grain,
// bark, terracotta), projected from the side it faces at a fixed size, so nothing stretches.
import * as THREE from 'three';

type Kind = 'plaster' | 'concrete' | 'timber' | 'plywood' | 'bark' | 'terracotta';
const KINDS: [RegExp, Kind][] = [
  [/plaster/i, 'plaster'],
  [/concrete/i, 'concrete'],
  [/timber/i, 'timber'],
  [/plywood/i, 'plywood'],
  [/bark/i, 'bark'],
  [/terracotta/i, 'terracotta'],
];
/** Metres one tile of each texture covers. */
const TILE: Record<Kind, number> = {
  plaster: 0.6,
  concrete: 0.9,
  timber: 0.8,
  plywood: 0.6,
  bark: 0.45,
  terracotta: 0.4,
};

/**
 * The surface's own colour (sRGB 0–255): the baked texture sampled where the mesh's UVs actually
 * land. (A plain average would be dragged towards black by the empty space between the islands
 * of a baked texture.)
 */
function surfaceColour(
  texture: THREE.Texture,
  geometry: THREE.BufferGeometry,
): [number, number, number] | null {
  const image = texture.image as (CanvasImageSource & { width: number; height: number }) | null,
    uv = geometry.getAttribute('uv');
  if (!image?.width || !uv) return null;
  const w = image.width,
    h = image.height,
    canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0);
  const px = ctx.getImageData(0, 0, w, h).data,
    index = geometry.index,
    count = index ? index.count : uv.count,
    step = Math.max(3, Math.floor(count / 3 / 1500) * 3);
  const fract = (v: number) => v - Math.floor(v);
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  // Each triangle's centre, and its corners pulled a little inward.
  for (let i = 0; i + 2 < count; i += step) {
    const ids = [0, 1, 2].map((k) => (index ? index.getX(i + k) : i + k));
    const cu = ids.reduce((t, id) => t + uv.getX(id), 0) / 3,
      cv = ids.reduce((t, id) => t + uv.getY(id), 0) / 3;
    for (const [su, sv] of [
      [cu, cv],
      ...ids.map((id) => [cu + (uv.getX(id) - cu) * 0.6, cv + (uv.getY(id) - cv) * 0.6]),
    ]) {
      const x = Math.min(w - 1, Math.floor(fract(su) * w)),
        y = Math.min(h - 1, Math.floor(fract(texture.flipY ? 1 - sv : sv) * h)),
        o = (y * w + x) * 4;
      // Skip the black padding a sample may still catch at an island's edge.
      if (px[o] + px[o + 1] + px[o + 2] < 24) continue;
      r += px[o];
      g += px[o + 1];
      b += px[o + 2];
      n++;
    }
  }
  return n ? [r / n, g / n, b / n] : null;
}

/** A seamless 64 px tile of one kind, in the given colour. */
function tile(kind: Kind, [r, g, b]: [number, number, number], seed: number) {
  const size = 64,
    canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  let s = seed;
  const rand = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const shade = (k: number) =>
    `rgb(${Math.min(255, r * k) | 0},${Math.min(255, g * k) | 0},${Math.min(255, b * k) | 0})`;
  ctx.fillStyle = shade(1);
  ctx.fillRect(0, 0, size, size);
  // Wraps around the edges, so the tile repeats without seams.
  const dot = (x: number, y: number, w: number, h: number, k: number) => {
    ctx.fillStyle = shade(k);
    for (const dx of [0, -size]) for (const dy of [0, -size]) ctx.fillRect(x + dx, y + dy, w, h);
  };
  if (kind === 'plaster' || kind === 'terracotta') {
    for (let i = 0; i < 260; i++)
      dot(rand() * size, rand() * size, 1 + rand() * 2, 1 + rand() * 2, 0.9 + rand() * 0.14);
  } else if (kind === 'concrete') {
    // Soft blotches, fine grit and a few pores: weathered concrete.
    for (let i = 0; i < 46; i++)
      dot(rand() * size, rand() * size, 4 + rand() * 12, 4 + rand() * 12, 0.88 + rand() * 0.16);
    for (let i = 0; i < 260; i++) dot(rand() * size, rand() * size, 1, 1, 0.8 + rand() * 0.3);
    for (let i = 0; i < 18; i++) dot(rand() * size, rand() * size, 2, 1, 0.7);
  } else if (kind === 'timber') {
    // Four planks with soft grain and a dark seam between them.
    for (let p = 0; p < 4; p++) {
      const y0 = p * 16,
        tone = 0.92 + rand() * 0.14;
      dot(0, y0, size, 16, tone);
      for (let i = 0; i < 14; i++)
        dot(rand() * size, y0 + 2 + rand() * 12, 6 + rand() * 18, 1, tone * (0.9 + rand() * 0.06));
      dot(0, y0 + 15, size, 1, 0.72);
    }
  } else if (kind === 'plywood') {
    for (let y = 0; y < size; y += 2) dot(0, y, size, 1, 0.95 + rand() * 0.08);
    for (let i = 0; i < 10; i++) dot(rand() * size, rand() * size, 10 + rand() * 20, 1, 0.88);
  } else {
    for (let x = 0; x < size; x += 3) dot(x, 0, 2, size, 0.85 + rand() * 0.25);
    for (let i = 0; i < 30; i++) dot(rand() * size, rand() * size, 2, 4 + rand() * 6, 0.75);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

/**
 * New UVs from the side each triangle faces (box projection in the model's own metres), so a
 * tile is the same size everywhere on the café.
 */
function boxProject(mesh: THREE.Mesh, root: THREE.Object3D, metres: number) {
  let geometry = mesh.geometry;
  if (geometry.index) {
    const flat = geometry.toNonIndexed();
    geometry.dispose();
    mesh.geometry = geometry = flat;
  }
  const position = geometry.getAttribute('position'),
    uv = new Float32Array(position.count * 2),
    toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(mesh.matrixWorld),
    a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    n = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i).applyMatrix4(toRoot);
    b.fromBufferAttribute(position, i + 1).applyMatrix4(toRoot);
    c.fromBufferAttribute(position, i + 2).applyMatrix4(toRoot);
    n.subVectors(b, a).cross(c.clone().sub(a));
    const ax = Math.abs(n.x),
      ay = Math.abs(n.y),
      az = Math.abs(n.z);
    [a, b, c].forEach((v, k) => {
      const [u, w] = ay >= ax && ay >= az ? [v.x, v.z] : ax >= az ? [v.z, v.y] : [v.x, v.y];
      uv[(i + k) * 2] = u / metres;
      uv[(i + k) * 2 + 1] = w / metres;
    });
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** Swap every baked surface under `root` for a seamless tile. Returns what to dispose. */
export function retextureCafe(root: THREE.Object3D) {
  const made: THREE.Texture[] = [];
  const tiles = new Map<THREE.Texture, THREE.Texture>();
  root.updateMatrixWorld(true);
  let seed = 7;
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const material = mesh.material as THREE.MeshToonMaterial;
    if (!material.map || !/_baked_/i.test(material.name)) return;
    const kind = KINDS.find(([pattern]) => pattern.test(material.name))?.[1];
    if (!kind) return;
    let texture = tiles.get(material.map);
    if (!texture) {
      const colour = surfaceColour(material.map, mesh.geometry);
      if (!colour) return;
      texture = tile(kind, colour, (seed += 97));
      tiles.set(material.map, texture);
      made.push(texture);
    }
    boxProject(mesh, root, TILE[kind]);
    material.map = texture;
    material.needsUpdate = true;
  });
  return made;
}
