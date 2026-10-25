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
  /** The café's whole site (floors, yard, pond, sidewalk) on the ground, world units. */
  bounds: THREE.Box3;
  /** Ground level around the site: the café's concrete floor. */
  groundY: number;
  /**
   * Top-down mask of the café's floors, pond and sidewalk (white = cut the ground away there),
   * covering `rect` = (minX, minZ, maxX, maxZ) in world units, image up = −Z.
   */
  holeMask?: { texture: THREE.Texture; rect: THREE.Vector4 };
  /** Road through the scene: a point on its centre line, direction, half width. */
  road?: {
    origin: THREE.Vector3;
    direction: THREE.Vector3;
    halfWidth: number;
    /** Height of the road surface (the café road's top). */
    surfaceY?: number;
  };
};

const GRASS_LOW = new THREE.Color('#5d6f3a'),
  GRASS_MID = new THREE.Color('#7f9149'),
  GRASS_HIGH = new THREE.Color('#9fae63'),
  DIRT = new THREE.Color('#9a8458'),
  ASPHALT = new THREE.Color('#1c1c1d'),
  ROCK = new THREE.Color('#7a877c'),
  ROCK_GREEN = new THREE.Color('#4c6639');

export function createCafeWorld(layout: WorldLayout, windTime: { value: number }) {
  const group = new THREE.Group();
  group.name = 'Cafe_World';
  const geometries: THREE.BufferGeometry[] = [],
    materials: THREE.Material[] = [],
    textures: THREE.Texture[] = [];
  const noise = makeNoise();
  const { bounds, groundY } = layout;
  const center = bounds.getCenter(new THREE.Vector3());
  const road = layout.road ?? {
    origin: new THREE.Vector3(bounds.min.x - 2, groundY, center.z),
    direction: new THREE.Vector3(0, 0, 1),
    halfWidth: 1.6,
    surfaceY: undefined as number | undefined,
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

  // A small wooden footbridge where the river passes closest to the café, with a dirt path
  // from the road down to it and on beyond.
  const bridgeMid = riverSamples.reduce((best, p) =>
    p.distanceToSquared(center) < best.distanceToSquared(center) ? p : best,
  );
  const bridgeT = riverSamples.indexOf(bridgeMid) / (riverSamples.length - 1),
    bridgeAlong = river.getTangentAt(bridgeT).setY(0).normalize(),
    bridgeAcross = new THREE.Vector3(-bridgeAlong.z, 0, bridgeAlong.x);
  // Point the bridge from the road side to the far bank.
  if (bridgeAcross.dot(center.clone().sub(bridgeMid)) < 0) bridgeAcross.negate();
  const bridgeHalf = 3.9,
    bridgeNear = bridgeMid.clone().addScaledVector(bridgeAcross, bridgeHalf),
    bridgeFar = bridgeMid.clone().addScaledVector(bridgeAcross, -bridgeHalf);
  const roadEdge = (() => {
    const rel = bridgeNear.clone().sub(road.origin),
      along = rel.dot(roadDir);
    return road.origin
      .clone()
      .addScaledVector(roadDir, along)
      .addScaledVector(roadSide, -sideOfCafe * (road.halfWidth + 0.4));
  })();
  const pathEnd = bridgeFar.clone().addScaledVector(bridgeAcross, -7);
  const segmentDistance = (x: number, z: number, a: THREE.Vector3, b: THREE.Vector3) => {
    const abx = b.x - a.x,
      abz = b.z - a.z,
      t = THREE.MathUtils.clamp(
        ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz),
        0,
        1,
      );
    return Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t));
  };
  const pathDistance = (x: number, z: number) =>
    Math.min(
      segmentDistance(x, z, roadEdge, bridgeNear),
      segmentDistance(x, z, bridgeFar, pathEnd),
    );

  // The observatory sits on a hill behind the café, away from the road.
  const towerAt = center
    .clone()
    .addScaledVector(roadSide, sideOfCafe * 46)
    .addScaledVector(roadDir, -34);

  // Marble stepping stones from behind Winds Space, winding across the land to the tower's
  // door (which faces the last stretch of the path). Trees keep clear of it.
  const cafeSize = bounds.getSize(new THREE.Vector3()),
    cafeHalfAcross = (cafeSize.x * Math.abs(roadSide.x) + cafeSize.z * Math.abs(roadSide.z)) / 2;
  const towerPathStart = center
    .clone()
    .addScaledVector(roadSide, sideOfCafe * (cafeHalfAcross + 2.2))
    .setY(0);
  const doorDir = towerPathStart.clone().sub(towerAt).setY(0).normalize(),
    doorAngle = Math.atan2(doorDir.x, doorDir.z),
    towerPathEnd = towerAt.clone().addScaledVector(doorDir, 5.0).setY(0);
  const towerPathCurve = (() => {
    const across = new THREE.Vector3(-doorDir.z, 0, doorDir.x),
      points: THREE.Vector3[] = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8,
        wiggle =
          k === 0 || k === 8 ? 0 : Math.sin(t * Math.PI * 2.6 + 0.6) * 4.2 * Math.sin(t * Math.PI);
      points.push(towerPathStart.clone().lerp(towerPathEnd, t).addScaledVector(across, wiggle));
    }
    return new THREE.CatmullRomCurve3(points, false, 'centripetal');
  })();
  const towerPathPoints = towerPathCurve.getSpacedPoints(120);
  const towerPathDistance = (x: number, z: number) => {
    let best = Infinity;
    for (const p of towerPathPoints) best = Math.min(best, (p.x - x) ** 2 + (p.z - z) ** 2);
    return Math.sqrt(best);
  };

  const flatZone = (x: number, z: number) => {
    const dx = Math.max(bounds.min.x - x, 0, x - bounds.max.x),
      dz = Math.max(bounds.min.z - z, 0, z - bounds.max.z);
    const cafe = Math.hypot(dx, dz);
    const rel = new THREE.Vector3(x - road.origin.x, 0, z - road.origin.z);
    const roadGap = Math.abs(rel.dot(roadSide)) - road.halfWidth - 1.2;
    return { cafe, roadGap, flat: Math.min(Math.max(0, cafe - 3) / 7, Math.max(0, roadGap) / 4) };
  };
  /** Terrain height (world units). */
  const height = (x: number, z: number, r = riverDistance(x, z)) => {
    const { flat } = flatZone(x, z);
    const dist = Math.hypot(x - center.x, z - center.z);
    const hills =
      (noise(x * 0.028, z * 0.028) - 0.35) * 9 * THREE.MathUtils.smoothstep(dist, 10, 45) +
      (noise(x * 0.09 + 40, z * 0.09) - 0.5) * 1.2;
    // Ground outside the café's site comes up to the sidewalk, so the site sits in the land
    // instead of on a visible plinth; inside the site it stays hidden below the café's own floors.
    if (flatZone(x, z).cafe <= 0) return groundY;
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
    const { roadGap } = flatZone(x, z);
    const n = noise(x * 0.15, z * 0.15, 2);
    const rise = THREE.MathUtils.clamp((y - groundY) / 6, 0, 1);
    color.copy(GRASS_LOW).lerp(GRASS_MID, THREE.MathUtils.clamp(rise * 1.6 + n * 0.4, 0, 1));
    color.lerp(GRASS_HIGH, THREE.MathUtils.smoothstep(rise, 0.45, 1));
    // A dirt verge along the road; the grass is the same everywhere else.
    if (roadGap < 0.8) color.lerp(DIRT, 1 - THREE.MathUtils.smoothstep(roadGap, -0.4, 0.8));
    if (roadGap < -1.1) color.copy(ASPHALT);
    // Footpath to the bridge, with a soft, uneven edge.
    const path = pathDistance(x, z) + (n - 0.5) * 0.5;
    color.lerp(DIRT, 1 - THREE.MathUtils.smoothstep(path, 0.55, 1.1));
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
  // Cut the ground away exactly where the café's own floors, pond and sidewalk are — following
  // their real shapes, so nothing else is opened up.
  if (layout.holeMask) {
    const { texture, rect } = layout.holeMask;
    terrainMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.holeMask = { value: texture };
      shader.uniforms.holeRect = { value: rect };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vGroundXZ;')
        .replace(
          '#include <worldpos_vertex>',
          '#include <worldpos_vertex>\nvGroundXZ = (modelMatrix * vec4(transformed, 1.0)).xz;',
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform sampler2D holeMask;\nuniform vec4 holeRect;\nvarying vec2 vGroundXZ;',
        )
        .replace(
          'void main() {',
          `void main() {
          vec2 holeUv = vec2(
            (vGroundXZ.x - holeRect.x) / (holeRect.z - holeRect.x),
            (holeRect.w - vGroundXZ.y) / (holeRect.w - holeRect.y));
          if (all(greaterThan(holeUv, vec2(0.0))) && all(lessThan(holeUv, vec2(1.0))) &&
              texture2D(holeMask, holeUv).r > 0.5) discard;`,
        );
    };
    terrainMaterial.customProgramCacheKey = () => 'world-terrain-mask';
  }
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

  // --- Mountains -------------------------------------------------------------------------------
  // Behind the café: straight ranges running off to the horizon. In front, beyond the river:
  // separate karst hills. Both well away from the café, softened by the fog.
  const karstColor = (g: THREE.BufferGeometry, top: number, bottom: number) => {
    const p = g.attributes.position,
      c = new Float32Array(p.count * 3);
    for (let k = 0; k < p.count; k++) {
      const t = THREE.MathUtils.clamp((p.getY(k) - bottom) / (top - bottom), 0, 1);
      color.copy(ROCK_GREEN).lerp(ROCK, THREE.MathUtils.smoothstep(t, 0.3, 0.9));
      c.set([color.r, color.g, color.b], k * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  };
  const mountainParts: THREE.BufferGeometry[] = [];
  /**
   * A peak's profile at distance d (0 = summit) with half width w. `sharp` near 1 gives a pointed
   * top, around 2 a rounded one, 5+ a flat table top: mixing them reads like natural karst.
   */
  const peakShape = (d: number, w: number, sharp: number) =>
    Math.exp(-Math.pow(Math.abs(d) / w, sharp));
  const shapes = [1.1, 1.4, 2, 2.6, 4, 6];
  {
    // Behind the café: two straight rows parallel to the road, running off to the horizon.
    for (const [row, distance, depth, scale] of [
      [0, 95, 26, 1],
      [1, 130, 30, 1.35],
    ] as const) {
      const length = 520,
        cols = 220,
        rows = 6;
      const peaks = Array.from({ length: 34 }, (_, k) => ({
        at: (k / 33 - 0.5) * length + (noise(k + row * 50, 61) - 0.5) * 12,
        h: (5 + noise(k + row * 50, 62) * 13) * scale,
        w: 7 + noise(k + row * 50, 63) * 16,
        sharp: shapes[Math.floor(noise(k + row * 50, 64) * shapes.length * 0.999)],
      }));
      const g = new THREE.PlaneGeometry(1, 1, cols, rows);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const u = p.getX(k) + 0.5,
          v = p.getY(k) + 0.5;
        const along = (u - 0.5) * length;
        let top = 3 + (noise(u * 14 + row, 5) - 0.4) * 4;
        for (const peak of peaks)
          top = Math.max(top, peak.h * peakShape(along - peak.at, peak.w, peak.sharp));
        top += (noise(u * 60 + row, 9) - 0.5) * 0.8;
        // Slope from the foot (front edge) up to the crest, then back down behind it.
        const profile = Math.sin(Math.PI * Math.min(1, v)) ** 0.7;
        const at = center
          .clone()
          .addScaledVector(roadDir, along)
          .addScaledVector(roadSide, sideOfCafe * (distance + v * depth));
        p.setXYZ(k, at.x, groundY - 2.5 + top * profile, at.z);
      }
      g.deleteAttribute('uv');
      g.computeVertexNormals();
      karstColor(g, groundY + 18 * scale, groundY);
      mountainParts.push(g);
    }
  }
  // In front, beyond the river: a loose scatter of small karst hills in mixed shapes.
  const placed: THREE.Vector3[] = [];
  for (let i = 0; placed.length < 8 && i < 80; i++) {
    const spot = center
      .clone()
      .addScaledVector(roadDir, (noise(i * 3.1, 51) - 0.5) * 220)
      .addScaledVector(roadSide, -sideOfCafe * (55 + noise(i * 2.7, 52) * 70));
    if (placed.some((q) => q.distanceTo(spot) < 22)) continue;
    placed.push(spot);
    const peak = 4 + noise(i, 53) * 7,
      width = 4 + noise(i, 54) * 5,
      sharp = shapes[Math.floor(noise(i, 57) * shapes.length * 0.999)],
      twin = noise(i, 58) > 0.6;
    // A lathe from the profile: pointed, domed or flat-topped, sometimes with a second hump.
    const outline: THREE.Vector2[] = [];
    for (let k = 0; k <= 14; k++) {
      const t = k / 14,
        r = width * (1 - t * 0.98);
      outline.push(new THREE.Vector2(Math.max(0.01, r), peak * Math.pow(t, 1 / sharp)));
    }
    const g = new THREE.LatheGeometry(outline, 14);
    const p = g.attributes.position,
      v = new THREE.Vector3();
    for (let k = 0; k < p.count; k++) {
      v.fromBufferAttribute(p, k);
      const n = noise(v.x * 0.5 + i, v.z * 0.5 + v.y * 0.3) - 0.5;
      v.x *= 1 + n * 0.35;
      v.z *= 1 + n * 0.35;
      v.y *= 1 + n * 0.15;
      p.setXYZ(k, v.x, v.y, v.z);
    }
    const parts = [g];
    if (twin) {
      const second = g.clone();
      second.scale(0.7, 0.75, 0.7);
      second.translate(width * 0.9, 0, width * 0.2);
      parts.push(second);
    }
    const hill = mergeGeometries(parts.map((x) => x.toNonIndexed()))!;
    parts.forEach((x) => x.dispose());
    hill.deleteAttribute('uv');
    hill.rotateY(noise(i, 55) * 6.28);
    hill.scale(1, 1, 0.7 + noise(i, 56) * 0.6);
    hill.translate(spot.x, groundY - 0.8, spot.z);
    hill.computeVertexNormals();
    karstColor(hill, groundY + peak, groundY);
    mountainParts.push(hill);
  }
  const karstGeometry = mergeGeometries(
    mountainParts.map((g) => (g.index ? g.toNonIndexed() : g)),
  )!;
  mountainParts.forEach((g) => g.dispose());
  geometries.push(karstGeometry);
  const karstMaterial = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: toonGradient(),
    side: THREE.DoubleSide,
  });
  materials.push(karstMaterial);
  const karst = new THREE.Mesh(karstGeometry, karstMaterial);
  karst.name = 'World_Mountains';
  group.add(karst);

  // --- Road: one hand-made road for the whole scene (the café model's own road is hidden) -----
  {
    const length = 300,
      tile = 14,
      W = 256,
      H = 1024,
      roadCanvas = document.createElement('canvas');
    roadCanvas.width = W;
    roadCanvas.height = H;
    const x = roadCanvas.getContext('2d')!;
    let seed = 91;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    // Gravel shoulders with a ragged edge, then the asphalt.
    x.fillStyle = '#6b6152';
    x.fillRect(0, 0, W, H);
    for (let i = 0; i < 2600; i++) {
      x.fillStyle = rand() < 0.5 ? 'rgba(40,34,28,0.35)' : 'rgba(170,158,135,0.35)';
      x.fillRect(rand() * W, rand() * H, 2, 2);
    }
    const shoulder = W * 0.07;
    x.fillStyle = '#1b1b1d';
    x.beginPath();
    x.moveTo(shoulder, 0);
    for (let y = 0; y <= H; y += 16) x.lineTo(shoulder + (rand() - 0.5) * 6, y);
    for (let y = H; y >= 0; y -= 16) x.lineTo(W - shoulder + (rand() - 0.5) * 6, y);
    x.closePath();
    x.fill();
    // Speckle and slightly lighter wheel tracks.
    for (let i = 0; i < 9000; i++) {
      const v = 18 + Math.floor(rand() * 26);
      x.fillStyle = `rgba(${v},${v},${v + 2},0.6)`;
      x.fillRect(shoulder + rand() * (W - 2 * shoulder), rand() * H, 2, 2);
    }
    for (const lane of [0.3, 0.42, 0.58, 0.7]) {
      x.fillStyle = 'rgba(70,70,74,0.18)';
      x.fillRect(W * lane - 6, 0, 12, H);
    }
    // Tar patches and a few cracks.
    for (let i = 0; i < 7; i++) {
      x.fillStyle = 'rgba(8,8,9,0.55)';
      x.beginPath();
      const cx = shoulder + 20 + rand() * (W - 2 * shoulder - 40),
        cy = rand() * H;
      x.ellipse(cx, cy, 10 + rand() * 22, 14 + rand() * 40, rand() * 3, 0, Math.PI * 2);
      x.fill();
    }
    x.strokeStyle = 'rgba(60,60,64,0.55)';
    x.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      let cx = shoulder + 10 + rand() * (W - 2 * shoulder - 20),
        cy = rand() * H;
      x.beginPath();
      x.moveTo(cx, cy);
      for (let k = 0; k < 6; k++) x.lineTo((cx += (rand() - 0.5) * 18), (cy += 6 + rand() * 12));
      x.stroke();
    }
    // Worn centre dashes of uneven length.
    for (let y = 0; y < H; y += 128) {
      x.fillStyle = `rgba(200,198,188,${0.55 + rand() * 0.3})`;
      x.fillRect(W / 2 - 4, y + 10, 8, 52 + rand() * 18);
    }
    const roadTexture = new THREE.CanvasTexture(roadCanvas);
    roadTexture.colorSpace = THREE.SRGBColorSpace;
    roadTexture.wrapT = THREE.RepeatWrapping;
    roadTexture.repeat.set(1, length / tile);
    roadTexture.anisotropy = 4;
    // Asphalt as wide as the café road; the outer 7% on each side is gravel shoulder.
    const width = (road.halfWidth * 2 + 0.3) / (1 - 0.07 * 2);
    const roadGeometry = new THREE.PlaneGeometry(width, length, 1, 1);
    roadGeometry.rotateX(-Math.PI / 2);
    geometries.push(roadGeometry);
    const roadMaterial = new THREE.MeshToonMaterial({
      map: roadTexture,
      gradientMap: toonGradient(),
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    materials.push(roadMaterial);
    const longRoad = new THREE.Mesh(roadGeometry, roadMaterial);
    longRoad.name = 'World_Road';
    longRoad.position.copy(road.origin).setY(road.surfaceY ?? road.origin.y);
    longRoad.rotation.y = Math.atan2(roadDir.x, roadDir.z);
    longRoad.receiveShadow = true;
    group.add(longRoad);
    textures.push(roadTexture);
  }

  // --- Wooden footbridge -----------------------------------------------------------------------
  const nearY = height(bridgeNear.x, bridgeNear.z),
    farY = height(bridgeFar.x, bridgeFar.z),
    rise = 1.0;
  {
    const deckParts: THREE.BufferGeometry[] = [],
      railParts: THREE.BufferGeometry[] = [],
      stoneParts: THREE.BufferGeometry[] = [];
    const at = (t: number, side = 0, lift = 0) =>
      bridgeNear
        .clone()
        .lerp(bridgeFar, t)
        .addScaledVector(bridgeAlong, side)
        .setY(THREE.MathUtils.lerp(nearY, farY, t) + Math.sin(Math.PI * t) * rise + lift);
    const yaw = Math.atan2(bridgeAcross.x, bridgeAcross.z);
    const planks = 18;
    for (let k = 0; k < planks; k++) {
      const t0 = k / planks,
        t1 = (k + 0.82) / planks,
        a = at(t0),
        b = at(t1),
        mid = a.clone().lerp(b, 0.5);
      const plank = new THREE.BoxGeometry(1.5 + (k % 3) * 0.04, 0.08, a.distanceTo(b));
      plank.rotateX(-Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z)));
      plank.rotateY(yaw);
      plank.translate(mid.x, mid.y, mid.z);
      deckParts.push(plank.toNonIndexed());
    }
    for (const side of [-0.7, 0.7]) {
      for (let k = 0; k <= 6; k++) {
        const t = k / 6,
          base = at(t, side);
        const post = new THREE.CylinderGeometry(0.045, 0.055, 0.75, 6);
        post.translate(base.x, base.y + 0.37, base.z);
        railParts.push(post.toNonIndexed());
      }
      const rail = new THREE.CatmullRomCurve3(
        Array.from({ length: 9 }, (_, k) => at(k / 8, side, 0.72)),
      );
      railParts.push(new THREE.TubeGeometry(rail, 24, 0.04, 5).toNonIndexed());
    }
    for (const end of [bridgeNear, bridgeFar]) {
      const stone = new THREE.BoxGeometry(1.9, 0.5, 0.7);
      stone.rotateY(yaw);
      stone.translate(end.x, height(end.x, end.z) - 0.12, end.z);
      stoneParts.push(stone.toNonIndexed());
    }
    const build = (parts: THREE.BufferGeometry[], color: string, name: string) => {
      const geometry = mergeGeometries(parts)!;
      parts.forEach((g) => g.dispose());
      geometry.computeVertexNormals();
      geometries.push(geometry);
      const material = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() });
      materials.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.receiveShadow = true;
      group.add(mesh);
    };
    build(deckParts, '#a8784a', 'World_Bridge_Deck');
    build(railParts, '#7a5233', 'World_Bridge_Rails');
    build(stoneParts, '#9a9284', 'World_Bridge_Stones');
  }

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
  for (let i = 0; treeSpots.length < 55 && i < 2000; i++) {
    const a = noise(i * 1.7, 2) * Math.PI * 8,
      r = 16 + noise(i * 2.3, 5) * 70;
    const x = center.x + Math.cos(a) * r,
      z = center.z + Math.sin(a) * r;
    const { flat, roadGap } = flatZone(x, z);
    if (flat < 0.9 || roadGap < 3 || riverDistance(x, z) < 5) continue;
    if (Math.hypot(x - towerAt.x, z - towerAt.z) < 10) continue;
    if (towerPathDistance(x, z) < 2.5) continue;
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
  // After the painted reference: a wide brick tower on a rocky base with stone bands, small arched
  // windows with lanterns, a big round window on the 4th level, an arched door, and a balustrade
  // around the roof. Inside it is a library: a railed spiral staircase hugs the wall with
  // bookshelves following it all the way up, lit by hanging open-book lamps. On the roof, a
  // small slanted-roof hut covers the top of the stairs. Heights are relative to the tower base.
  const tower = new THREE.Group();
  tower.name = 'World_Observatory';
  const towerBase = height(towerAt.x, towerAt.z) - 0.2;
  tower.position.set(towerAt.x, towerBase, towerAt.z);
  const T = {
    plinth: 1.2,
    plinthR: 3.7,
    wallIn: 2.3,
    wallOut: 2.6,
    door: 0.72,
    doorHeight: 2.5,
    stairIn: 1.25,
    stairOut: 2.0,
    turns: 4,
    top: 13.4,
    parapet: 2.85,
    holeArc: 2.6,
  };
  const wallR = (T.wallIn + T.wallOut) / 2,
    stairStart = doorAngle + 1.1,
    pitch = (T.top - T.plinth) / T.turns,
    stairEnd = stairStart + T.turns * Math.PI * 2;
  const toon = (color: string, extra: THREE.MeshToonMaterialParameters = {}) => {
    const m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...extra });
    materials.push(m);
    return m;
  };
  // Plaster-and-brick wall texture: warm rose plaster with patches of exposed brick.
  const wallTexture = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d')!;
    g.fillStyle = '#c4978a';
    g.fillRect(0, 0, 512, 512);
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(${150 + rand() * 40},${95 + rand() * 25},${85 + rand() * 20},0.35)`;
      g.beginPath();
      g.ellipse(rand() * 512, rand() * 512, 30 + rand() * 70, 20 + rand() * 50, rand() * 3, 0, 7);
      g.fill();
    }
    for (let p = 0; p < 9; p++) {
      const x0 = rand() * 512,
        y0 = rand() * 512;
      for (let r = 0; r < 3; r++)
        for (let k = 0; k < 2 + Math.floor(rand() * 3); k++) {
          g.fillStyle = `rgb(${150 + rand() * 30},${70 + rand() * 20},${55 + rand() * 15})`;
          g.fillRect(x0 + k * 22 + (r % 2) * 11, y0 + r * 11, 20, 9);
        }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 2);
    textures.push(t);
    return t;
  })();
  const brick = toon('#ffffff', { map: wallTexture, side: THREE.DoubleSide }),
    stone = toon('#b8b0a2'),
    stoneDark = toon('#7f7a72'),
    rock = toon('#9a978f', { vertexColors: true }),
    dark = toon('#3b2f27'),
    wood = toon('#8a5d3b'),
    woodDark = toon('#5c3d27'),
    marble = toon('#e9e6df', { vertexColors: true }),
    books = toon('#ffffff', { vertexColors: true });
  // Warm night glows (lanterns, the round window, the book lamps): brightened by setNight().
  const glow = new THREE.MeshBasicMaterial({ color: '#ffd9a0' }),
    glass = new THREE.MeshBasicMaterial({ color: '#cfe4ea', transparent: true, opacity: 0.75 });
  materials.push(glow, glass);
  const add = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material | THREE.Material[],
    y = 0,
  ) => {
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y;
    tower.add(mesh);
    return mesh;
  };
  const around = (mesh: THREE.Object3D, a: number, r: number) => {
    mesh.position.x = Math.sin(a) * r;
    mesh.position.z = Math.cos(a) * r;
    mesh.rotation.y = a;
    return mesh;
  };
  const merge = (parts: THREE.BufferGeometry[]) => {
    const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!;
    parts.forEach((p) => p.dispose());
    g.computeVertexNormals();
    return g;
  };
  const tint = (g: THREE.BufferGeometry, r: number, gg: number, b: number) => {
    const n = g.getAttribute('position').count,
      c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.set([r, gg, b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  };

  // Rocky base: a stone plinth wrapped in boulders, with steps up to the door.
  add(
    new THREE.CylinderGeometry(T.plinthR, T.plinthR + 0.7, T.plinth, 24),
    stoneDark,
    T.plinth / 2,
  );
  {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 26; i++) {
      const a = doorAngle + 0.75 + (i / 26) * (Math.PI * 2 - 1.5),
        size = 0.55 + noise(i, 31) * 0.7,
        g = new THREE.DodecahedronGeometry(size, 0);
      g.scale(1.2, 0.6 + noise(i, 33) * 0.5, 1);
      g.rotateY(noise(i, 35) * 6.28);
      g.translate(
        Math.sin(a) * (T.plinthR + 0.4),
        size * 0.35 + noise(i, 37) * 0.4,
        Math.cos(a) * (T.plinthR + 0.4),
      );
      const v = 0.72 + noise(i, 39) * 0.2;
      parts.push(tint(g.toNonIndexed(), v, v * 0.99, v * 0.96));
    }
    add(merge(parts), rock);
  }
  // Steps from the land up to the base top: as many as the slope in front of the door needs.
  const stepDepth = 0.4;
  // The land keeps falling away from the hilltop, so find where the last step meets it.
  let stepCount = 4,
    foot = 0;
  for (let i = 0; i < 6; i++) {
    const at = towerAt.clone().addScaledVector(doorDir, T.plinthR + stepCount * stepDepth);
    foot = height(at.x, at.z) - towerBase;
    stepCount = Math.max(3, Math.ceil((T.plinth - foot) / 0.24));
  }
  const stepRise = (T.plinth - foot) / stepCount;
  for (let k = 0; k < stepCount - 1; k++) {
    const top = T.plinth - (k + 1) * stepRise,
      tall = top - foot + 0.3;
    around(
      add(new THREE.BoxGeometry(1.8, tall, stepDepth + 0.02), stone, top - tall / 2),
      doorAngle,
      T.plinthR + (k + 0.5) * stepDepth,
    );
  }

  // Wall: the lower ring leaves the arched doorway open; the rest is whole.
  const doorHalf = T.door / wallR;
  add(
    new THREE.CylinderGeometry(
      wallR,
      wallR,
      T.doorHeight,
      40,
      1,
      true,
      doorAngle + doorHalf,
      Math.PI * 2 - 2 * doorHalf,
    ),
    brick,
    T.plinth + T.doorHeight / 2,
  );
  // Above the door: the wall closes over a round arch.
  {
    const archR = T.door,
      springY = T.plinth + T.doorHeight - archR;
    const shape = new THREE.Shape();
    shape.moveTo(-archR - 0.25, springY - T.plinth);
    shape.lineTo(archR + 0.25, springY - T.plinth);
    shape.lineTo(archR + 0.25, T.doorHeight + 0.6);
    shape.lineTo(-archR - 0.25, T.doorHeight + 0.6);
    shape.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, springY - T.plinth, archR, 0, Math.PI, false);
    hole.lineTo(-archR, springY - T.plinth - 0.01);
    hole.lineTo(archR, springY - T.plinth - 0.01);
    shape.holes.push(hole);
    const infill = new THREE.ExtrudeGeometry(shape, {
      depth: T.wallOut - T.wallIn,
      bevelEnabled: false,
      curveSegments: 16,
    });
    infill.translate(0, 0, -(T.wallOut - T.wallIn) / 2);
    around(add(infill, brick, T.plinth), doorAngle, wallR);
    // Arch frame and wooden door leaves standing open inward.
    const frame = new THREE.TorusGeometry(archR, 0.07, 6, 20, Math.PI);
    around(add(frame, dark, springY), doorAngle, T.wallOut + 0.02);
    for (const side of [-1, 1]) {
      const post = new THREE.BoxGeometry(0.14, springY - T.plinth, 0.16);
      const m = add(post, dark, T.plinth + (springY - T.plinth) / 2);
      around(m, doorAngle + (side * archR) / T.wallOut, T.wallOut + 0.02);
      const leaf = new THREE.BoxGeometry(archR, T.doorHeight - 0.4, 0.06);
      leaf.translate((side * -archR) / 2, 0, 0);
      const l = add(leaf, woodDark, T.plinth + (T.doorHeight - 0.4) / 2);
      const hinge = doorAngle + (side * archR) / T.wallIn;
      l.position.x = Math.sin(hinge) * (T.wallIn - 0.05);
      l.position.z = Math.cos(hinge) * (T.wallIn - 0.05);
      l.rotation.y = doorAngle + side * 1.25;
    }
  }
  add(
    new THREE.CylinderGeometry(wallR, wallR, T.top - T.plinth - T.doorHeight, 40, 1, true),
    brick,
    T.plinth + T.doorHeight + (T.top - T.plinth - T.doorHeight) / 2,
  );
  // Stone bands between the levels (the 4th level holds the round window).
  const level = (n: number) => T.plinth + n * ((T.top - T.plinth) / 5);
  for (let n = 1; n <= 4; n++)
    add(
      new THREE.CylinderGeometry(T.wallOut + 0.08, T.wallOut + 0.1, 0.16, 40, 1, true),
      stone,
      level(n),
    );
  // Small arched windows with little hooded lanterns beside two of them.
  [
    [1.6, 1.5],
    [-1.9, 2.5],
    [2.6, 3.5],
  ].forEach(([da, lv], i) => {
    const a = doorAngle + da,
      y = level(lv);
    around(add(new THREE.BoxGeometry(0.42, 0.75, 0.1), dark, y), a, T.wallOut + 0.01);
    around(
      add(
        new THREE.CylinderGeometry(0.21, 0.21, 0.1, 12, 1, false, -Math.PI / 2, Math.PI),
        dark,
        y + 0.37,
      ),
      a,
      T.wallOut + 0.01,
    ).rotation.x = Math.PI / 2;
    if (i < 2) {
      const la = a + 0.32;
      around(add(new THREE.BoxGeometry(0.16, 0.24, 0.16), glow, y + 0.05), la, T.wallOut + 0.14);
      around(
        add(new THREE.ConeGeometry(0.2, 0.18, 4), dark, y + 0.27),
        la,
        T.wallOut + 0.14,
      ).rotation.y += Math.PI / 4;
    }
  });
  // The big round window on the 4th level (front, a little to the side of the door).
  {
    const a = doorAngle + 0.25,
      y = (level(3) + level(4)) / 2;
    around(add(new THREE.CircleGeometry(0.85, 28), glass, y), a, T.wallOut + 0.02);
    const ring = around(
      add(new THREE.TorusGeometry(0.85, 0.07, 6, 28), dark, y),
      a,
      T.wallOut + 0.03,
    );
    void ring;
    for (const tilt of [0.6, -0.6]) {
      const bar = around(add(new THREE.BoxGeometry(0.05, 1.7, 0.04), dark, y), a, T.wallOut + 0.04);
      bar.rotateZ(tilt);
    }
  }
  // Roof: a corbelled stone ring and a balustrade of little pillars; floor open over the stairs.
  {
    add(new THREE.CylinderGeometry(T.parapet + 0.15, T.wallOut, 0.45, 40), stone, T.top - 0.25);
    const ring = (inner: number, outer: number, start: number, length: number) => {
      const g = new THREE.RingGeometry(inner, outer, 48, 1, start, length);
      g.rotateX(-Math.PI / 2);
      return g;
    };
    // RingGeometry angles run from +X toward −Z once flat; ours are (sin, cos) from +Z.
    const holeStart = Math.PI / 2 - stairEnd;
    add(ring(0, T.stairIn - 0.05, 0, Math.PI * 2), stone, T.top + 0.005);
    add(
      ring(T.stairIn - 0.05, T.stairOut + 0.35, holeStart, Math.PI * 2 - T.holeArc),
      stone,
      T.top + 0.005,
    );
    add(ring(T.stairOut + 0.35, T.parapet + 0.15, 0, Math.PI * 2), stone, T.top + 0.005);
    add(new THREE.TorusGeometry(T.parapet, 0.09, 6, 48), stone, T.top + 0.78).rotation.x =
      Math.PI / 2;
    const pillars: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * Math.PI * 2,
        g = new THREE.CylinderGeometry(0.06, 0.08, 0.7, 6);
      g.translate(Math.sin(a) * T.parapet, T.top + 0.38, Math.cos(a) * T.parapet);
      pillars.push(g);
    }
    add(merge(pillars), stone);
  }
  // Roof hut over the top of the stairs: an arc of wall each side and a roof sloping up toward
  // the opening, so the stairwell is never just a hole (and stays dry).
  {
    const roofParts: THREE.BufferGeometry[] = [],
      wallParts: THREE.BufferGeometry[] = [],
      a0 = stairEnd - T.holeArc,
      steps = 18,
      roofAt = (u: number) => T.top + 0.7 + u * 1.25;
    for (let k = 0; k < steps; k++) {
      const u0 = k / steps,
        u1 = (k + 1) / steps,
        b0 = a0 + u0 * T.holeArc,
        b1 = a0 + u1 * T.holeArc;
      const quad = (r0: number, r1: number, y0a: number, y0b: number, y1a: number, y1b: number) => {
        const g = new THREE.BufferGeometry(),
          p = [
            [Math.sin(b0) * r0, y0a, Math.cos(b0) * r0],
            [Math.sin(b0) * r1, y0b, Math.cos(b0) * r1],
            [Math.sin(b1) * r1, y1b, Math.cos(b1) * r1],
            [Math.sin(b1) * r0, y1a, Math.cos(b1) * r0],
          ];
        g.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(
            [...p[0], ...p[1], ...p[2], ...p[0], ...p[2], ...p[3]],
            3,
          ),
        );
        return g;
      };
      roofParts.push(
        quad(T.stairIn - 0.15, T.stairOut + 0.45, roofAt(u0), roofAt(u0), roofAt(u1), roofAt(u1)),
      );
      for (const r of [T.stairIn - 0.1, T.stairOut + 0.4])
        wallParts.push(quad(r, r, T.top, roofAt(u0), T.top, roofAt(u1)));
    }
    const shut = new THREE.BufferGeometry(),
      e0 = [Math.sin(a0), Math.cos(a0)],
      r0 = T.stairIn - 0.1,
      r1 = T.stairOut + 0.4;
    shut.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          e0[0] * r0,
          T.top,
          e0[1] * r0,
          e0[0] * r1,
          T.top,
          e0[1] * r1,
          e0[0] * r1,
          roofAt(0),
          e0[1] * r1,
          e0[0] * r0,
          T.top,
          e0[1] * r0,
          e0[0] * r1,
          roofAt(0),
          e0[1] * r1,
          e0[0] * r0,
          roofAt(0),
          e0[1] * r0,
        ],
        3,
      ),
    );
    wallParts.push(shut);
    const roofMesh = add(merge(roofParts), toon('#7d4b38', { side: THREE.DoubleSide }));
    roofMesh.name = 'World_Tower_Stair_Roof';
    add(merge(wallParts), brick);
  }
  // Inside: the railed spiral staircase, and bookshelves along the wall following it up.
  {
    const perTurn = 22,
      count = perTurn * T.turns,
      mid = (T.stairIn + T.stairOut) / 2,
      treads: THREE.BufferGeometry[] = [],
      rail: THREE.Vector3[] = [],
      posts: THREE.BufferGeometry[] = [],
      shelves: THREE.BufferGeometry[] = [],
      spines: THREE.BufferGeometry[] = [];
    const bookColors = [
      '#7a3b2e',
      '#2f4f5e',
      '#5d6b3a',
      '#a0672f',
      '#6b4c7a',
      '#b98c4a',
      '#3c5a46',
      '#8e3f4f',
    ].map((c) => new THREE.Color(c));
    for (let k = 0; k < count; k++) {
      const a = stairStart + ((k + 0.5) / perTurn) * Math.PI * 2,
        y = T.plinth + ((k + 1) / count) * (T.top - T.plinth),
        arc = ((Math.PI * 2) / perTurn) * mid * 1.1;
      const tread = new THREE.BoxGeometry(T.stairOut - T.stairIn, 0.1, arc);
      tread.translate(mid, 0, 0);
      tread.rotateY(a - Math.PI / 2);
      tread.translate(0, y - 0.05, 0);
      treads.push(tread);
      rail.push(
        new THREE.Vector3(
          Math.sin(a) * (T.stairIn + 0.04),
          y + 0.85,
          Math.cos(a) * (T.stairIn + 0.04),
        ),
      );
      if (k % 2 === 0) {
        const post = new THREE.CylinderGeometry(0.025, 0.025, 0.85, 5);
        post.translate(
          Math.sin(a) * (T.stairIn + 0.04),
          y + 0.42,
          Math.cos(a) * (T.stairIn + 0.04),
        );
        posts.push(post);
      }
      // A bookcase on the wall above each tread: back, three shelves, and a row of books.
      const shelfR = T.wallIn - 0.14,
        width = ((Math.PI * 2) / perTurn) * shelfR;
      const place = (g: THREE.BufferGeometry, dy: number, inset = 0) => {
        g.translate(0, dy, 0);
        g.rotateY(Math.PI / 2);
        g.translate(shelfR - inset, 0, 0);
        g.rotateY(a - Math.PI / 2);
        g.translate(0, y, 0);
        return g;
      };
      shelves.push(place(new THREE.BoxGeometry(width, 1.9, 0.04), 1.05, -0.12));
      for (let row = 0; row < 3; row++) {
        shelves.push(place(new THREE.BoxGeometry(width, 0.04, 0.26), 0.25 + row * 0.6));
        let x = -width / 2 + 0.02;
        let b = 0;
        while (x < width / 2 - 0.06) {
          const w = 0.05 + noise(k * 7 + row * 3, b) * 0.05,
            h = 0.36 + noise(k * 5 + b, row) * 0.16,
            g = new THREE.BoxGeometry(w, h, 0.2);
          g.translate(x + w / 2, 0, 0);
          const color = bookColors[(k * 3 + row * 5 + b) % bookColors.length];
          spines.push(tint(place(g, 0.27 + row * 0.6 + h / 2), color.r, color.g, color.b));
          x += w + 0.008;
          b++;
        }
      }
    }
    add(merge(treads), stone);
    add(merge(posts), woodDark);
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail), count * 2, 0.035, 5), woodDark);
    add(merge(shelves), wood);
    add(merge(spines), books);
    // A round rug on the ground floor.
    const rug = add(new THREE.CircleGeometry(1.1, 24), toon('#9c5b47'), T.plinth + 0.012);
    rug.rotation.x = -Math.PI / 2;
  }
  // Hanging lamps shaped like open books, pages drifting down from them.
  const bookLamps: THREE.Object3D[] = [];
  for (const [n, ang] of [
    [0.8, 0.4],
    [2.3, 2.4],
    [3.6, 4.4],
  ] as const) {
    const lamp = new THREE.Group(),
      y = level(n);
    for (const side of [-1, 1]) {
      const cover = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.46), wood);
      cover.position.x = side * 0.16;
      cover.rotation.z = side * 0.42;
      const pages = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.42), glow);
      pages.position.set(side * 0.15, 0.025, 0);
      pages.rotation.z = side * 0.42;
      lamp.add(cover, pages);
      geometries.push(cover.geometry, pages.geometry);
    }
    for (let k = 0; k < 6; k++) {
      const page = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.18), glow);
      page.position.set((k - 2.5) * 0.06, -0.14 - (k % 3) * 0.12, k % 2 ? 0.08 : -0.06);
      page.rotation.set(0.15 * (k % 2 ? 1 : -1), k * 0.6, 0.2);
      (page.material as THREE.Material).side = THREE.DoubleSide;
      geometries.push(page.geometry);
      lamp.add(page);
    }
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.4, 4), dark);
    cord.position.y = 0.72;
    geometries.push(cord.geometry);
    lamp.add(cord);
    lamp.position.set(Math.sin(ang) * 0.55, y + 1.0, Math.cos(ang) * 0.55);
    tower.add(lamp);
    bookLamps.push(lamp);
  }
  glow.side = THREE.DoubleSide;
  // One warm light inside the tower (and the lamps and windows glow) at night.
  const towerLight = new THREE.PointLight('#ffcf8a', 0, 9, 1.6);
  towerLight.position.set(0, level(2.2), 0);
  tower.add(towerLight);
  group.add(tower);

  // Marble stepping stones (well spaced) along the winding path, and marble boulders around.
  const rocks: { x: number; z: number; r: number }[] = [];
  {
    const slabs: THREE.BufferGeometry[] = [],
      boulders: THREE.BufferGeometry[] = [],
      shade = (g: THREE.BufferGeometry, v: number) => tint(g, v, v * 0.995, v * 0.985);
    const count = Math.floor(towerPathCurve.getLength() / 1.35);
    for (let i = 0; i <= count; i++) {
      const t = i / count,
        p = towerPathCurve.getPointAt(t),
        tangent = towerPathCurve.getTangentAt(t).setY(0).normalize(),
        jitter = (noise(i * 1.3, 4) - 0.5) * 0.5,
        x = p.x + tangent.z * jitter,
        z = p.z - tangent.x * jitter;
      if (Math.hypot(x - towerAt.x, z - towerAt.z) < T.plinthR + 1.3) continue;
      const slab = new THREE.CylinderGeometry(0.36, 0.4, 0.07, 6 + (i % 3));
      slab.scale(1 + noise(i, 2) * 0.4, 1, 0.75 + noise(i, 3) * 0.3);
      slab.rotateY(noise(i, 7) * 6.28);
      slab.translate(x, height(x, z) + 0.04, z);
      slabs.push(shade(slab.toNonIndexed(), 0.96 + noise(i, 5) * 0.07));
    }
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + noise(i, 11) * 0.3,
        r = T.plinthR + 2.2 + noise(i * 2.1, 13) * 6,
        x = towerAt.x + Math.sin(a) * r,
        z = towerAt.z + Math.cos(a) * r;
      if (towerPathDistance(x, z) < 1.8) continue;
      const size = 0.45 + noise(i, 17) * 1.2;
      const g = new THREE.DodecahedronGeometry(size, 0);
      g.scale(1, 0.55 + noise(i, 19) * 0.4, 0.85);
      g.rotateY(noise(i, 23) * 6.28);
      g.translate(x, height(x, z) + size * 0.15, z);
      boulders.push(shade(g.toNonIndexed(), 0.84 + noise(i, 29) * 0.13));
      rocks.push({ x, z, r: size * 0.85 });
    }
    for (const [parts, name] of [
      [slabs, 'World_Marble_Path'],
      [boulders, 'World_Marble_Rocks'],
    ] as const) {
      const geometry = mergeGeometries(parts)!;
      parts.forEach((g) => g.dispose());
      geometry.computeVertexNormals();
      geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, marble);
      mesh.name = name;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  // Wooden sign by the path in front of the tower.
  const signAt = towerPathEnd
    .clone()
    .addScaledVector(doorDir, 0.6)
    .addScaledVector(new THREE.Vector3(doorDir.z, 0, -doorDir.x), 1.6);
  {
    const sign = new THREE.Group();
    sign.name = 'World_Tower_Sign';
    sign.position.set(signAt.x, height(signAt.x, signAt.z), signAt.z);
    sign.rotation.y = doorAngle;
    const postGeometry = new THREE.BoxGeometry(0.09, 1.1, 0.09);
    geometries.push(postGeometry);
    for (const x of [-0.42, 0.42]) {
      const post = new THREE.Mesh(postGeometry, wood);
      post.position.set(x, 0.55, 0);
      sign.add(post);
    }
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 192;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#9b6a43';
    g.fillRect(0, 0, 512, 192);
    for (let i = 0; i < 9; i++) {
      g.fillStyle = `rgba(60,36,20,${0.1 + (i % 3) * 0.05})`;
      g.fillRect(0, 18 + i * 20 + (i % 2) * 4, 512, 2);
    }
    g.fillStyle = '#3a2416';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold 54px Georgia, serif';
    g.fillText('CHAPTER 4', 256, 70);
    g.font = 'bold 44px Georgia, serif';
    g.fillText(': LOCKED', 256, 132);
    g.strokeStyle = '#5a3820';
    g.lineWidth = 10;
    g.strokeRect(5, 5, 502, 182);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.push(texture);
    const boardGeometry = new THREE.BoxGeometry(1.15, 0.43, 0.05);
    geometries.push(boardGeometry);
    const face = new THREE.MeshToonMaterial({ map: texture, gradientMap: toonGradient() });
    materials.push(face);
    const board = new THREE.Mesh(boardGeometry, [wood, wood, wood, wood, face, face]);
    board.position.y = 0.9;
    sign.add(board);
    group.add(sign);
  }

  /** Floors inside and on the tower (tower-relative heights) at a point, or null outside it. */
  const towerFloors = (x: number, z: number): number[] | null => {
    const dx = x - towerAt.x,
      dz = z - towerAt.z,
      r = Math.hypot(dx, dz);
    if (r >= Math.max(T.plinthR + 1.2, T.plinthR + stepCount * stepDepth + 0.2)) return null;
    const a = Math.atan2(dx, dz),
      wrap = (v: number) => Math.atan2(Math.sin(v), Math.cos(v)),
      fromDoor = wrap(a - doorAngle),
      floors: number[] = [];
    // Steps up the rocky base in front of the door; elsewhere its rocks are a wall.
    const onSteps = Math.cos(fromDoor) > 0 && Math.abs(r * Math.sin(fromDoor)) < 0.85,
      stepsEnd = T.plinthR + (stepCount - 1) * stepDepth;
    if (onSteps && r >= T.plinthR && r < stepsEnd)
      floors.push(T.plinth - (Math.floor((r - T.plinthR) / stepDepth) + 1) * stepRise);
    if (r >= stepsEnd || r >= T.plinthR + 1.0) floors.push(height(x, z) - towerBase);
    // Base top outside the wall, through the doorway, and the ground floor inside.
    const inWall = r > T.wallIn - 0.05 && r < T.wallOut + 0.05;
    if (r < T.plinthR && (!inWall || Math.abs(fromDoor) < (T.door - 0.12) / wallR))
      floors.push(T.plinth);
    // The staircase: a smooth ramp under the treads, railed on the inside.
    const u0 = (((a - stairStart) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (r >= T.stairIn + 0.08 && r <= T.stairOut - 0.04)
      for (let k = 0; k < T.turns; k++) {
        const u = u0 / (Math.PI * 2) + k;
        if (u <= T.turns) floors.push(T.plinth + u * pitch);
      }
    // The roof, open over the last stretch of stairs (under the little hut).
    const overHole = r > T.stairIn - 0.12 && r < T.stairOut + 0.42 && u0 > Math.PI * 2 - T.holeArc;
    if (r <= T.parapet - 0.12 && !overHole) floors.push(T.top);
    return floors;
  };
  /** Night glow 0–1 for the tower's lanterns, round window and book lamps. */
  const setTowerNight = (night: number) => {
    towerLight.intensity = 2.2 * night;
    glow.color.setRGB(0.55 + 0.45 * night, 0.5 + 0.35 * night, 0.42 + 0.2 * night);
    glass.color.set(night > 0.5 ? '#ffcf8a' : '#cfe4ea');
    bookLamps.forEach((l, i) => (l.rotation.y = Math.sin(performance.now() / 4000 + i) * 0.15));
  };

  // Where Luna can walk outside the café (explore mode): the land, the road, along the river
  // banks and over the footbridge; not into the water, the observatory or tree trunks.
  const trunkSpots = treeSpots.map((m) => new THREE.Vector3().setFromMatrixPosition(m));
  const span = bridgeFar.clone().sub(bridgeNear),
    spanLength = span.length();
  span.divideScalar(spanLength);
  const walkHeight = (x: number, z: number, fromY?: number): number | null => {
    if (Math.hypot(x - center.x, z - center.z) > 110) return null;
    // The tower: pick the floor Luna can step onto from where she stands (one step up or down).
    const floors = towerFloors(x, z);
    if (floors) {
      const options = floors.map((f) => f + towerBase);
      if (fromY === undefined) return options.length ? Math.max(...options) : null;
      const reach = options.filter((y) => y <= fromY + 0.35 && y >= fromY - 0.45);
      return reach.length ? Math.max(...reach) : null;
    }
    for (const rock of rocks) if (Math.hypot(rock.x - x, rock.z - z) < rock.r) return null;
    if (Math.hypot(signAt.x - x, signAt.z - z) < 0.6) return null;
    // Footbridge deck (planks 1.5 wide, rails at ±0.7).
    const rx = x - bridgeNear.x,
      rz = z - bridgeNear.z,
      t = (rx * span.x + rz * span.z) / spanLength,
      side = rx * bridgeAlong.x + rz * bridgeAlong.z;
    if (t > -0.03 && t < 1.03 && Math.abs(side) < 0.6) {
      const k = THREE.MathUtils.clamp(t, 0, 1);
      return Math.max(
        height(x, z),
        THREE.MathUtils.lerp(nearY, farY, k) + Math.sin(Math.PI * k) * rise + 0.04,
      );
    }
    if (t > 0.04 && t < 0.96 && Math.abs(side) < 0.85) return null;
    const r = riverDistance(x, z);
    if (r < 3.3) return null;
    for (const trunk of trunkSpots)
      if (Math.abs(trunk.x - x) < 0.4 && Math.abs(trunk.z - z) < 0.4) return null;
    const y = height(x, z, r);
    const across = Math.abs((x - road.origin.x) * roadSide.x + (z - road.origin.z) * roadSide.z);
    return road.surfaceY !== undefined && across < road.halfWidth ? Math.max(y, road.surfaceY) : y;
  };

  return {
    group,
    terrain,
    walkHeight,
    /** The observatory (for camera collision: Luna can climb inside it). */
    tower,
    setTowerNight,
    /** Ground height under a point (for placing things on the world). */
    heightAt: height,
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      trunks.dispose();
      canopies.dispose();
      group.removeFromParent();
    },
  };
}
