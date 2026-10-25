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
  {
    const deckParts: THREE.BufferGeometry[] = [],
      railParts: THREE.BufferGeometry[] = [],
      stoneParts: THREE.BufferGeometry[] = [];
    const nearY = height(bridgeNear.x, bridgeNear.z),
      farY = height(bridgeFar.x, bridgeFar.z),
      rise = 1.0,
      at = (t: number, side = 0, lift = 0) =>
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
      textures.forEach((t) => t.dispose());
      trunks.dispose();
      canopies.dispose();
      group.removeFromParent();
    },
  };
}
