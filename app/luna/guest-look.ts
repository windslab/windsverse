// Guests in Luna's own art style: a copy of her model without the barista's vest, name tag,
// pens and bow, recoloured per guest. Men lose the long bob and side locks (short hair, the
// dome and fringe stay); women keep the bob. The look follows the guest's name.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lunaCafeRig } from './cafe-rig';

export type GuestLook = {
  male: boolean;
  skin: number;
  hair: number;
  shirt: number;
  pants: number;
  shoes: number;
};

const SKIN = [0xf3cfae, 0xe6b48c, 0xd09a6c, 0xb07a52];
const HAIR = [0x1d1613, 0x34221a, 0x553522, 0x7b4b2a, 0x2c2b33];
const SHIRT = [0x7fa6c9, 0xe8b4b8, 0x9cc59a, 0xf2d48c, 0xb9a3d6, 0xf3efe7, 0x6c7fa0, 0xd98b6a];
const PANTS = [0x3a4256, 0x6b5b4a, 0x2f2f33, 0x8a7a62, 0x5d6b55, 0xd8ccb4];
const SHOES = [0xf4f1ea, 0x2b2b2b, 0x9a6b4a, 0x6f86a8];
// Barista-only pieces, by mesh or material name (the vest's meshes are only called mesh_2…).
const STAFF_ONLY = /vest|name ?tag|(?:^|[_\s])pens?(?:$|[_\s])|bow/i;
const LONG_HAIR = /hair_(bob|sidelock|back)/i;

/** Stable look for a guest key; `male` from the guest's name when known. */
export function lookFor(seed: string, male?: boolean): GuestLook {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const pick = <T>(list: T[], shift: number) => list[(h >>> shift) % list.length];
  return {
    male: male ?? ((h >>> 3) & 1) === 1,
    skin: pick(SKIN, 5),
    hair: pick(HAIR, 9),
    shirt: pick(SHIRT, 13),
    pants: pick(PANTS, 17),
    shoes: pick(SHOES, 21),
  };
}

const PARTS: [keyof Omit<GuestLook, 'male'>, RegExp][] = [
  ['skin', /skin|ears|face/i],
  ['hair', /hair/i],
  ['shirt', /shirt|sleeve/i],
  ['pants', /cargo/i],
  ['shoes', /sneakers$/i],
];

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
  const grey = new THREE.CanvasTexture(canvas);
  grey.flipY = source.flipY;
  grey.magFilter = source.magFilter;
  grey.minFilter = source.minFilter;
  grey.wrapS = source.wrapS;
  grey.wrapT = source.wrapT;
  grey.colorSpace = source.colorSpace;
  grey.generateMipmaps = source.generateMipmaps;
  greys.set(source, grey);
  return grey;
}

export function guestRig(luna: THREE.Group, height: number) {
  const model = luna.clone(true);
  const own = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  const longHair: THREE.Object3D[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  // Fewer draw calls: under each joint, pieces sharing a material become one mesh (the long hair
  // stays apart so it can be hidden). The barista-only pieces are dropped.
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
      if (LONG_HAIR.test(child.name)) continue;
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
  model.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    if (LONG_HAIR.test(node.name)) longHair.push(node);
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
  return {
    rig,
    materials: [...own.values()],
    geometries,
    setLook(look: GuestLook) {
      // Looked up on each call: the scene swaps in toon copies of these materials after loading.
      model.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        const m = node.material as THREE.MeshStandardMaterial;
        const key = PARTS.find(([, pattern]) => pattern.test(m.name))?.[0];
        if (!key) return;
        if (m.map && !m.userData.grey) {
          m.map = greyOf(m.map);
          m.userData.grey = true;
          m.needsUpdate = true;
        }
        m.color.setHex(look[key]);
      });
      for (const part of longHair) part.visible = !look.male;
    },
  };
}
