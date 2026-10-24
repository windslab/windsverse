// The world around the café, built in 3D from the Windstronout panorama: rolling green hills,
// a winding river in the valley, karst towers on the horizon, scattered trees and the observatory
// tower on its hill. Flat-shaded toon colours so it reads like the illustration, and cheap enough
// for phones (one terrain mesh, merged mountains, instanced trees).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonGradient } from './toon';

/** Small deterministic value noise so the world looks the same on every visit. */
function makeNoise(seed = 7) {
  const hash = (x: number, z: number) => {
    const s = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const noise = (x: number, z: number) => {
    const xi = Math.floor(x),
      zi = Math.floor(z),
      xf = smooth(x - xi),
      zf = smooth(z - zi);
    const a = hash(xi, zi),
      b = hash(xi + 1, zi),
      c = hash(xi, zi + 1),
      d = hash(xi + 1, zi + 1);
    return a + (b - a) * xf + (c - a) * zf + (a - b - c + d) * xf * zf;
  };
  return (x: number, z: number, octaves = 4) => {
    let total = 0,
      amp = 0.5,
      freq = 1;
    for (let i = 0; i < octaves; i++) {
      total += noise(x * freq, z * freq) * amp;
      freq *= 2.03;
      amp *= 0.5;
    }
    return total;
  };
}

export type WorldLayout = {
  /** Café footprint on the ground (world units). */
  bounds: THREE.Box3;
  /** Ground height of the café floor. */
  groundY: number;
  /** Road through the scene: a point on its centre line, direction, half width. */
  road?: { origin: THREE.Vector3; direction: THREE.Vector3; halfWidth: number };
};

const GRASS_LOW = new THREE.Color('#5d6f3a'),
  GRASS_MID = new THREE.Color('#7f9149'),
  GRASS_HIGH = new THREE.Color('#9fae63'),
  GRASS_YARD = new THREE.Color('#8f9d5c'),
  DIRT = new THREE.Color('#9a8458'),
  ASPHALT = new THREE.Color('#57575a'),
  ROCK = new THREE.Color('#7a877c'),
  ROCK_GREEN = new THREE.Color('#4c6639');

export function createCafeWorld(layout: WorldLayout, windTime: { value: number }) {
  const group = new THREE.Group();
  group.name = 'Cafe_World';
  const geometries: THREE.BufferGeometry[] = [],
    materials: THREE.Material[] = [];
  const noise = makeNoise();
  const { bounds, groundY } = layout;
  const center = bounds.getCenter(new THREE.Vector3());
  const road = layout.road ?? {
    origin: new THREE.Vector3(bounds.min.x - 2, groundY, center.z),
    direction: new THREE.Vector3(0, 0, 1),
    halfWidth: 1.6,
  };
  const roadDir = road.direction.clone().setY(0).normalize(),
    roadSide = new THREE.Vector3(roadDir.z, 0, -roadDir.x);
  /** Signed side of the road: the café is on the positive side. */
  const sideOfCafe = Math.sign(roadSide.dot(center.clone().sub(road.origin))) || 1;

  // River: a meandering line beyond the road (the panorama's valley in front of the café).
  const riverPoints: THREE.Vector3[] = [];
  for (let i = -6; i <= 6; i++) {
    const along = i * 16,
      across = -sideOfCafe * (19 + Math.sin(i * 0.9) * 5 + i * i * 0.35);
    riverPoints.push(
      road.origin
        .clone()
        .addScaledVector(roadDir, along)
        .addScaledVector(roadSide, across)
        .setY(groundY - 0.55),
    );
  }
  const river = new THREE.CatmullRomCurve3(riverPoints);
  const riverSamples = river.getSpacedPoints(240);
  const riverDistance = (x: number, z: number) => {
    let best = Infinity;
    for (const p of riverSamples) best = Math.min(best, (p.x - x) ** 2 + (p.z - z) ** 2);
    return Math.sqrt(best);
  };

  // The observatory sits on a hill behind the café, away from the road.
  const towerAt = center
    .clone()
    .addScaledVector(roadSide, sideOfCafe * 46)
    .addScaledVector(roadDir, -34);

  const flatZone = (x: number, z: number) => {
    const dx = Math.max(bounds.min.x - 3 - x, 0, x - bounds.max.x - 3),
      dz = Math.max(bounds.min.z - 3 - z, 0, z - bounds.max.z - 3);
    const cafe = Math.hypot(dx, dz);
    const rel = new THREE.Vector3(x - road.origin.x, 0, z - road.origin.z);
    const roadGap = Math.abs(rel.dot(roadSide)) - road.halfWidth - 1.2;
    return { cafe, roadGap, flat: Math.min(cafe / 7, Math.max(0, roadGap) / 4) };
  };
  /** Terrain height (world units). */
  const height = (x: number, z: number, r = riverDistance(x, z)) => {
    const { flat } = flatZone(x, z);
    const dist = Math.hypot(x - center.x, z - center.z);
    const hills =
      (noise(x * 0.028, z * 0.028) - 0.35) * 9 * THREE.MathUtils.smoothstep(dist, 10, 45) +
      (noise(x * 0.09 + 40, z * 0.09) - 0.5) * 1.2;
    let h = groundY + hills * THREE.MathUtils.smoothstep(flat, 0, 1);
    // Observatory hill.
    const tower = Math.hypot(x - towerAt.x, z - towerAt.z);
    h += 6.5 * Math.exp(-(tower * tower) / 120);
    // River valley.
    const carve = 1 - THREE.MathUtils.smoothstep(r, 2.2, 7);
    return THREE.MathUtils.lerp(h, groundY - 0.9, carve);
  };

  // --- Terrain ---------------------------------------------------------------------------
  const size = 260,
    segments = 110;
  const terrainGeometry = new THREE.PlaneGeometry(size, size, segments, segments);
  terrainGeometry.rotateX(-Math.PI / 2);
  terrainGeometry.translate(center.x, 0, center.z);
  const pos = terrainGeometry.attributes.position,
    colors = new Float32Array(pos.count * 3),
    color = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      z = pos.getZ(i),
      r = riverDistance(x, z),
      y = height(x, z, r);
    pos.setY(i, y);
    const { cafe, roadGap } = flatZone(x, z);
    const n = noise(x * 0.15, z * 0.15, 2);
    const rise = THREE.MathUtils.clamp((y - groundY) / 6, 0, 1);
    color.copy(GRASS_LOW).lerp(GRASS_MID, THREE.MathUtils.clamp(rise * 1.6 + n * 0.4, 0, 1));
    color.lerp(GRASS_HIGH, THREE.MathUtils.smoothstep(rise, 0.45, 1));
    // Yard around the café and a dirt verge along the road.
    color.lerp(GRASS_YARD, 1 - THREE.MathUtils.smoothstep(cafe, 0, 5));
    if (roadGap < 0.8) color.lerp(DIRT, 1 - THREE.MathUtils.smoothstep(roadGap, -0.4, 0.8));
    if (roadGap < -1.1) color.copy(ASPHALT);
    // Muddy banks.
    color.lerp(DIRT, (1 - THREE.MathUtils.smoothstep(r, 2.5, 5)) * 0.7);
    colors.set([color.r, color.g, color.b], i * 3);
  }
  terrainGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeometry.computeVertexNormals();
  geometries.push(terrainGeometry);
  const terrainMaterial = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: toonGradient(),
  });
  materials.push(terrainMaterial);
  const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
  terrain.name = 'World_Terrain';
  terrain.receiveShadow = true;
  group.add(terrain);

  // --- River: a ribbon with slowly drifting light streaks ------------------------------------
  const ribbon: number[] = [],
    ribbonUv: number[] = [],
    index: number[] = [];
  const up = new THREE.Vector3(0, 1, 0),
    tangent = new THREE.Vector3(),
    across = new THREE.Vector3();
  riverSamples.forEach((p, i) => {
    tangent
      .copy(river.getTangentAt(i / (riverSamples.length - 1)))
      .setY(0)
      .normalize();
    across.crossVectors(up, tangent);
    const half = 2.6 + Math.sin(i * 0.07) * 0.6;
    const a = p.clone().addScaledVector(across, half),
      b = p.clone().addScaledVector(across, -half);
    ribbon.push(a.x, groundY - 0.42, a.z, b.x, groundY - 0.42, b.z);
    ribbonUv.push(0, i / 6, 1, i / 6);
    if (i) {
      const k = i * 2;
      index.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
  });
  const riverGeometry = new THREE.BufferGeometry();
  riverGeometry.setAttribute('position', new THREE.Float32BufferAttribute(ribbon, 3));
  riverGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(ribbonUv, 2));
  riverGeometry.setIndex(index);
  riverGeometry.computeVertexNormals();
  geometries.push(riverGeometry);
  const riverMaterial = new THREE.MeshToonMaterial({
    color: '#8fc3cb',
    gradientMap: toonGradient(),
  });
  riverMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = windTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRiverUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvRiverUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float windTime;\nvarying vec2 vRiverUv;',
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float flow = vRiverUv.y * 3.0 - windTime * 0.6;
        float streak = smoothstep(0.82, 0.98, sin(flow + sin(vRiverUv.x * 9.0 + vRiverUv.y) * 0.8));
        float bank = smoothstep(0.0, 0.12, vRiverUv.x) * smoothstep(1.0, 0.88, vRiverUv.x);
        diffuseColor.rgb = mix(diffuseColor.rgb * 0.88, diffuseColor.rgb, bank);
        diffuseColor.rgb += streak * 0.22 * bank;`,
      );
  };
  riverMaterial.customProgramCacheKey = () => 'world-river';
  materials.push(riverMaterial);
  const water = new THREE.Mesh(riverGeometry, riverMaterial);
  water.name = 'World_River';
  water.receiveShadow = true;
  group.add(water);

  // --- Karst towers on the horizon -------------------------------------------------------------
  const karstParts: THREE.BufferGeometry[] = [];
  const karstCount = 16;
  for (let i = 0; i < karstCount; i++) {
    const angle = (i / karstCount) * Math.PI * 2 + noise(i, 3) * 0.4,
      radius = 92 + noise(i, 9) * 30,
      peak = 14 + noise(i, 5) * 20,
      width = 7 + noise(i, 11) * 9;
    const g = new THREE.CylinderGeometry(width * 0.55, width, peak, 10, 6);
    // Rounded, lumpy limestone: bulge the sides, round the top.
    const p = g.attributes.position,
      v = new THREE.Vector3(),
      c = new Float32Array(p.count * 3);
    for (let k = 0; k < p.count; k++) {
      v.fromBufferAttribute(p, k);
      const t = (v.y + peak / 2) / peak,
        bulge = 1 + 0.18 * Math.sin(t * Math.PI) + (noise(v.x * 0.4 + i, v.z * 0.4) - 0.5) * 0.35;
      v.x *= bulge;
      v.z *= bulge;
      if (t > 0.92) v.y += (1 - Math.hypot(v.x, v.z) / width) * width * 0.25;
      p.setXYZ(k, v.x, v.y, v.z);
      color.copy(ROCK_GREEN).lerp(ROCK, THREE.MathUtils.smoothstep(t, 0.25, 0.85));
      c.set([color.r, color.g, color.b], k * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.deleteAttribute('uv');
    g.translate(
      center.x + Math.cos(angle) * radius,
      groundY + peak / 2 - 2,
      center.z + Math.sin(angle) * radius,
    );
    karstParts.push(g);
  }
  const karstGeometry = mergeGeometries(karstParts)!;
  karstParts.forEach((g) => g.dispose());
  karstGeometry.computeVertexNormals();
  geometries.push(karstGeometry);
  const karstMaterial = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: toonGradient(),
  });
  materials.push(karstMaterial);
  const karst = new THREE.Mesh(karstGeometry, karstMaterial);
  karst.name = 'World_Karst';
  group.add(karst);

  // --- Trees (instanced) -----------------------------------------------------------------------
  const trunkGeometry = new THREE.CylinderGeometry(0.12, 0.18, 1.4, 6);
  trunkGeometry.translate(0, 0.7, 0);
  const canopyGeometry = new THREE.IcosahedronGeometry(1, 1);
  canopyGeometry.scale(1, 0.85, 1);
  canopyGeometry.translate(0, 2.1, 0);
  geometries.push(trunkGeometry, canopyGeometry);
  const trunkMaterial = new THREE.MeshToonMaterial({
    color: '#6b4a32',
    gradientMap: toonGradient(),
  });
  const canopyMaterial = new THREE.MeshToonMaterial({
    color: '#ffffff',
    gradientMap: toonGradient(),
  });
  canopyMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = windTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float windTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 treeBase = instanceMatrix[3].xyz;
        #else
          vec3 treeBase = vec3(0.0);
        #endif
        float treeSway = sin(windTime * 1.3 + treeBase.x * 0.37 + treeBase.z * 0.29);
        transformed.x += treeSway * 0.09 * max(0.0, transformed.y - 1.2);
        transformed.z += cos(windTime * 1.1 + treeBase.z * 0.31) * 0.05 * max(0.0, transformed.y - 1.2);`,
      );
  };
  canopyMaterial.customProgramCacheKey = () => 'world-tree-wind';
  materials.push(trunkMaterial, canopyMaterial);
  const treeSpots: THREE.Matrix4[] = [],
    treeColors: THREE.Color[] = [];
  const shades = ['#4f6b33', '#5d7a3a', '#6e8a42', '#47612f'].map((c) => new THREE.Color(c));
  for (let i = 0; treeSpots.length < 140 && i < 2000; i++) {
    const a = noise(i * 1.7, 2) * Math.PI * 8,
      r = 16 + noise(i * 2.3, 5) * 70;
    const x = center.x + Math.cos(a) * r,
      z = center.z + Math.sin(a) * r;
    const { flat, roadGap } = flatZone(x, z);
    if (flat < 0.9 || roadGap < 3 || riverDistance(x, z) < 5) continue;
    if (Math.hypot(x - towerAt.x, z - towerAt.z) < 5) continue;
    const s = 0.8 + noise(i, 8) * 0.9;
    treeSpots.push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, height(x, z) - 0.1, z),
        new THREE.Quaternion().setFromAxisAngle(up, noise(i, 1) * 6.28),
        new THREE.Vector3(s, s * (0.9 + noise(i, 4) * 0.4), s),
      ),
    );
    treeColors.push(shades[i % shades.length]);
  }
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, treeSpots.length),
    canopies = new THREE.InstancedMesh(canopyGeometry, canopyMaterial, treeSpots.length);
  treeSpots.forEach((m, i) => {
    trunks.setMatrixAt(i, m);
    canopies.setMatrixAt(i, m);
    canopies.setColorAt(i, treeColors[i]);
  });
  trunks.name = 'World_TreeTrunks';
  canopies.name = 'World_TreeCanopies';
  group.add(trunks, canopies);

  // --- Observatory tower (the panorama landmark) ----------------------------------------------
  const tower = new THREE.Group();
  tower.name = 'World_Observatory';
  tower.position.set(towerAt.x, height(towerAt.x, towerAt.z) - 0.2, towerAt.z);
  const brick = new THREE.MeshToonMaterial({ color: '#a2603f', gradientMap: toonGradient() }),
    stone = new THREE.MeshToonMaterial({ color: '#c9b9a0', gradientMap: toonGradient() }),
    dark = new THREE.MeshToonMaterial({ color: '#3b2a20', gradientMap: toonGradient() }),
    roof = new THREE.MeshToonMaterial({ color: '#d8d2c4', gradientMap: toonGradient() });
  materials.push(brick, stone, dark, roof);
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, y: number) => {
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y;
    tower.add(mesh);
    return mesh;
  };
  add(new THREE.CylinderGeometry(2.6, 3.4, 1.2, 14), stone, 0.6);
  add(new THREE.CylinderGeometry(1.6, 1.9, 9, 14), brick, 5.7);
  add(new THREE.CylinderGeometry(2.3, 2.3, 0.35, 16), stone, 4.2);
  add(new THREE.CylinderGeometry(2.2, 2.2, 0.35, 16), stone, 10.3);
  for (let k = 0; k < 6; k++) {
    const w = add(new THREE.BoxGeometry(0.42, 0.8, 0.2), dark, k % 2 ? 7.4 : 3);
    const a = (k / 6) * Math.PI * 2;
    w.position.x = Math.cos(a) * 1.72;
    w.position.z = Math.sin(a) * 1.72;
    w.rotation.y = -a + Math.PI / 2;
  }
  add(new THREE.SphereGeometry(1.5, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), roof, 10.45);
  const scope = add(new THREE.CylinderGeometry(0.14, 0.2, 1.6, 8), dark, 11.4);
  scope.rotation.z = 0.9;
  group.add(tower);

  return {
    group,
    terrain,
    /** Ground height under a point (for placing things on the world). */
    heightAt: height,
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      trunks.dispose();
      canopies.dispose();
      group.removeFromParent();
    },
  };
}
