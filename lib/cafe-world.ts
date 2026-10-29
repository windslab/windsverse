// The world around the café, built in 3D from the Windstronout panorama: rolling green hills,
// a winding river in the valley, karst towers on the horizon, scattered trees and the observatory
// tower on its hill. Flat-shaded toon colours so it reads like the illustration, and cheap enough
// for phones (one terrain mesh, merged mountains, instanced trees).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonGradient } from './toon';
import { createHouseBuilder, loadHouse, saveHouse, type HouseData } from './build-house';

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
  ROCK_GREEN = new THREE.Color('#4c6639'),
  SAND = new THREE.Color('#e3d3a8'),
  PEAK = new THREE.Color('#eceeea');

export function createCafeWorld(layout: WorldLayout, windTime: { value: number }) {
  const group = new THREE.Group();
  group.name = 'Cafe_World';
  const geometries: THREE.BufferGeometry[] = [],
    materials: THREE.Material[] = [],
    textures: THREE.Texture[] = [];
  const noise = makeNoise();
  /**
   * The land is a little floating world: toward its rim everything melts into the fog/sky colour
   * (by distance from the island's centre, not from the camera). Wraps a material's shader.
   */
  const ISLAND_FADE = [460, 520];
  const islandFade = (m: THREE.Material) => {
    const before = m.onBeforeCompile,
      key = m.customProgramCacheKey.bind(m);
    m.onBeforeCompile = (shader, renderer) => {
      before.call(m, shader, renderer);
      shader.uniforms.islandCentre = { value: new THREE.Vector2(center.x, center.z) };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vIslandXZ;')
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          vec4 islandWorld = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            islandWorld = instanceMatrix * islandWorld;
          #endif
          vIslandXZ = (modelMatrix * islandWorld).xz;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform vec2 islandCentre;\nvarying vec2 vIslandXZ;',
        )
        .replace(
          '#include <fog_fragment>',
          `#include <fog_fragment>
          #ifdef USE_FOG
            float islandEdge = smoothstep(${ISLAND_FADE[0].toFixed(1)}, ${ISLAND_FADE[1].toFixed(1)}, distance(vIslandXZ, islandCentre));
            gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, islandEdge);
          #endif`,
        );
    };
    m.customProgramCacheKey = () => key() + '-island';
  };
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
  // Long enough to run off both edges of the land.
  for (let i = -9; i <= 9; i++) {
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
  // Toward the left end of the land, between the river and the sea: a small heart-shaped lake
  // (loose, wobbly natural shores) fed by a few little branching streams from the river.
  const away = roadSide.clone().multiplyScalar(-sideOfCafe),
    lakeAcross = new THREE.Vector3(-away.z, 0, away.x),
    alongOf = (p: THREE.Vector3) => p.clone().sub(road.origin).dot(roadDir),
    riverNear = (along: number) =>
      riverSamples.reduce((best, p) =>
        Math.abs(alongOf(p) - along) < Math.abs(alongOf(best) - along) ? p : best,
      );
  const LAKE_ALONG = -62;
  const lakeCentre = riverNear(LAKE_ALONG).clone().addScaledVector(away, 13).setY(0);
  const lakeShore: THREE.Vector3[] = [];
  for (let k = 0; k < 140; k++) {
    const t = (k / 140) * Math.PI * 2,
      hx = 16 * Math.sin(t) ** 3,
      hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t),
      wobble = 1 + (noise(k * 0.23, 71) - 0.5) * 0.26 + Math.sin(t * 5 + 1) * 0.05;
    lakeShore.push(
      lakeCentre
        .clone()
        .addScaledVector(lakeAcross, hx * 0.36 * wobble)
        .addScaledVector(away, (hy * 0.36 + 1.5) * wobble),
    );
  }
  const shoreNear = (p: THREE.Vector3) =>
    lakeShore.reduce((best, q) => (q.distanceToSquared(p) < best.distanceToSquared(p) ? q : best));
  /** A small stream: wiggles naturally from `from` to `to`. */
  const stream = (from: THREE.Vector3, to: THREE.Vector3, seed: number) => {
    const points: THREE.Vector3[] = [],
      dir = to.clone().sub(from).setY(0),
      side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    for (let k = 0; k <= 5; k++) {
      const t = k / 5,
        wiggle =
          k === 0 || k === 5 ? 0 : (noise(seed + k * 0.7, 81) - 0.5) * 4 * Math.sin(t * Math.PI);
      points.push(from.clone().lerp(to, t).addScaledVector(side, wiggle).setY(0));
    }
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    return { curve, samples: curve.getSpacedPoints(30) };
  };
  // Two streams from the river into the heart's point and side, one splitting into a little fork.
  const lakeNear = (dx: number, dy: number) =>
    shoreNear(lakeCentre.clone().addScaledVector(lakeAcross, dx).addScaledVector(away, dy));
  const streams = [
    stream(riverNear(LAKE_ALONG + 9), lakeNear(-4, -5), 1),
    stream(riverNear(LAKE_ALONG - 10), lakeNear(3, -6), 3),
  ];
  streams.push(stream(streams[0].curve.getPointAt(0.5), lakeNear(-5, -2), 4));
  const insideLake = (x: number, z: number) => {
    let inside = false;
    for (let a = 0, b = lakeShore.length - 1; a < lakeShore.length; b = a++) {
      const pa = lakeShore[a],
        pb = lakeShore[b];
      if (pa.z > z !== pb.z > z && x < ((pb.x - pa.x) * (z - pa.z)) / (pb.z - pa.z) + pa.x)
        inside = !inside;
    }
    return inside;
  };
  const riverDistance = (x: number, z: number) => {
    let best = Infinity;
    for (const p of riverSamples) best = Math.min(best, (p.x - x) ** 2 + (p.z - z) ** 2);
    let main = Math.sqrt(best);
    // Streams are narrow: treat them as farther away than the river.
    if (Math.abs(x - lakeCentre.x) < 30 && Math.abs(z - lakeCentre.z) < 30) {
      for (const st of streams)
        for (const p of st.samples)
          main = Math.min(main, Math.sqrt((p.x - x) ** 2 + (p.z - z) ** 2) + 2.6);
      if (insideLake(x, z)) return 0;
      let shore = Infinity;
      for (const p of lakeShore) shore = Math.min(shore, (p.x - x) ** 2 + (p.z - z) ** 2);
      main = Math.min(main, Math.sqrt(shore) + 2.6);
    }
    return main;
  };
  // The open sea beyond the river, in front of the café: the land slopes down to a beach.
  // Windstopia is an island: a long beach in front (the sea past the river), the mountains
  // behind, and a coast all the way round. `seaOut` is the distance past the shore (SEA at the
  // waterline, growing out to sea), measured from the island's rounded-rectangle outline.
  const SEA = 56,
    ISLAND = { halfAlong: 165, back: 280, radius: 60 },
    seaLevel = groundY - 0.55;
  /** Along the road (0 at the café's road point) and inland from the road (negative = seaward). */
  const uOf = (x: number, z: number) =>
      (x - road.origin.x) * roadDir.x + (z - road.origin.z) * roadDir.z,
    wOf = (x: number, z: number) => -((x - road.origin.x) * away.x + (z - road.origin.z) * away.z);
  const islandMid = (SEA * -1 + ISLAND.back) / 2,
    islandHalfDepth = (ISLAND.back + SEA) / 2;
  const seaOut = (x: number, z: number) => {
    const u = uOf(x, z),
      w = wOf(x, z),
      qx = Math.abs(u) - (ISLAND.halfAlong - ISLAND.radius),
      qy = Math.abs(w - islandMid) - (islandHalfDepth - ISLAND.radius);
    let d =
      Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - ISLAND.radius;
    // A natural, uneven coast; the front's middle stretch (the pier, the boat) stays straight.
    const nearFront = THREE.MathUtils.smoothstep(
      islandMid - w,
      islandHalfDepth * 0.6,
      islandHalfDepth * 0.85,
    );
    d +=
      (noise(u * 0.03 + 11, w * 0.03 + 5) - 0.5) *
      16 *
      (1 - nearFront * (1 - THREE.MathUtils.smoothstep(Math.abs(u), 35, 80)));
    return SEA + d;
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
  // The door faces the café; the outside stairs wind up around the base to it, starting a
  // little way round, where the path arrives.
  const doorDir = towerPathStart.clone().sub(towerAt).setY(0).normalize(),
    doorAngle = Math.atan2(doorDir.x, doorDir.z),
    TOWER_BASE_R = 3.7,
    stairFootAngle = doorAngle + 1.35,
    towerPathEnd = towerAt
      .clone()
      .add(
        new THREE.Vector3(Math.sin(stairFootAngle), 0, Math.cos(stairFootAngle)).multiplyScalar(
          TOWER_BASE_R + 2.2,
        ),
      )
      .setY(0);
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
  /** Extra height of the mountain range at the back of the island (0 in front of it). */
  const mountain = (x: number, z: number) => {
    const w = wOf(x, z),
      band =
        THREE.MathUtils.smoothstep(w, 128, 182) * (1 - THREE.MathUtils.smoothstep(w, 255, 300));
    if (band <= 0) return 0;
    const u = uOf(x, z),
      n1 = noise(u * 0.018 + 31, w * 0.018 + 17),
      n2 = noise(u * 0.045 + 5, w * 0.045 + 23),
      n3 = noise(u * 0.11, w * 0.11 + 7);
    return band * (Math.pow(n1, 1.4) * 40 + n2 * 10 + n3 * 2.5 + 7);
  };
  /** Terrain height (world units). */
  const baseHeight = (x: number, z: number, r = riverDistance(x, z)) => {
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
    // The mountains behind the island: a broad massif with peaks, reaching toward the back coast.
    h += mountain(x, z);
    // Dips in the meadow never fall below the water: the sea only shows at the coast, and the only
    // water inland is the river and the lake.
    const dryTop = groundY + 0.15;
    if (h < dryTop) h = dryTop + (h - dryTop) * 0.12;
    // River valley.
    const carve = 1 - THREE.MathUtils.smoothstep(r, 2.2, 7);
    h = THREE.MathUtils.lerp(h, groundY - 0.9, carve);
    // Down to the beach and under the sea.
    const shore = THREE.MathUtils.smoothstep(seaOut(x, z), SEA - 6, SEA + 8);
    return THREE.MathUtils.lerp(h, groundY - 2.8, shore);
  };

  // The building lot (free build mode): a level plot beside the road, east of the café, where the
  // player builds a house. Its axes: x runs along the road, z inland (a right-handed pair).
  const LOT = { along: 50, inland: 20, cols: 16, rows: 12 };
  const lotZ = away.clone().multiplyScalar(-1).setY(0).normalize(),
    lotX = new THREE.Vector3(lotZ.z, 0, -lotZ.x);
  const lotCentre = road.origin
    .clone()
    .addScaledVector(roadDir, LOT.along)
    .addScaledVector(away, -LOT.inland)
    .setY(0);
  const lotOrigin = lotCentre
    .clone()
    .addScaledVector(lotX, -LOT.cols / 2)
    .addScaledVector(lotZ, -LOT.rows / 2);
  const lotY = baseHeight(lotCentre.x, lotCentre.z);
  /** Distance outside the lot's rectangle (0 inside it). */
  const lotOutside = (x: number, z: number) => {
    const lx = (x - lotOrigin.x) * lotX.x + (z - lotOrigin.z) * lotX.z,
      lz = (x - lotOrigin.x) * lotZ.x + (z - lotOrigin.z) * lotZ.z;
    return Math.hypot(Math.max(-lx, 0, lx - LOT.cols), Math.max(-lz, 0, lz - LOT.rows));
  };
  const height = (x: number, z: number, r = riverDistance(x, z)) => {
    const h = baseHeight(x, z, r),
      d = lotOutside(x, z);
    return d < 7 ? THREE.MathUtils.lerp(h, lotY, 1 - THREE.MathUtils.smoothstep(d, 0, 7)) : h;
  };

  // --- Terrain ---------------------------------------------------------------------------
  const size = 460,
    segments = 184;
  const islandCentre = road.origin.clone().addScaledVector(away, -islandMid);
  const terrainGeometry = new THREE.PlaneGeometry(size, size, segments, segments);
  terrainGeometry.rotateX(-Math.PI / 2);
  terrainGeometry.translate(islandCentre.x, 0, islandCentre.z);
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
    // The mountains: green foothills turning to grey rock, with pale tops on the highest peaks.
    const alt = y - groundY;
    color.lerp(ROCK_GREEN, THREE.MathUtils.smoothstep(alt, 7, 17) * 0.75);
    color.lerp(ROCK, THREE.MathUtils.smoothstep(alt, 17, 31));
    color.lerp(PEAK, THREE.MathUtils.smoothstep(alt, 33, 44) * 0.85);
    // A dirt verge along the road; the grass is the same everywhere else.
    if (roadGap < 0.8) color.lerp(DIRT, 1 - THREE.MathUtils.smoothstep(roadGap, -0.4, 0.8));
    if (roadGap < -1.1) color.copy(ASPHALT);
    // Footpath to the bridge, with a soft, uneven edge.
    const path = pathDistance(x, z) + (n - 0.5) * 0.5;
    color.lerp(DIRT, 1 - THREE.MathUtils.smoothstep(path, 0.55, 1.1));
    // Muddy banks.
    color.lerp(DIRT, (1 - THREE.MathUtils.smoothstep(r, 2.5, 5)) * 0.7);
    // A pale sandy beach down to the sea.
    color.lerp(SAND, THREE.MathUtils.smoothstep(seaOut(x, z), SEA - 12, SEA - 4));
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
  islandFade(terrainMaterial);
  const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
  terrain.name = 'World_Terrain';
  terrain.receiveShadow = true;
  group.add(terrain);

  // --- River: a ribbon with slowly drifting light streaks ------------------------------------
  const up = new THREE.Vector3(0, 1, 0),
    tangent = new THREE.Vector3(),
    across = new THREE.Vector3();
  /** A water ribbon along a curve; `half` gives the half width at each sample. */
  const ribbonGeometry = (
    curve: THREE.Curve<THREE.Vector3>,
    samples: THREE.Vector3[],
    half: (i: number) => number,
    y: number,
  ) => {
    const ribbon: number[] = [],
      ribbonUv: number[] = [],
      index: number[] = [];
    samples.forEach((p, i) => {
      tangent
        .copy(curve.getTangentAt(i / (samples.length - 1)))
        .setY(0)
        .normalize();
      across.crossVectors(up, tangent);
      const w = half(i);
      const a = p.clone().addScaledVector(across, w),
        b = p.clone().addScaledVector(across, -w);
      ribbon.push(a.x, y, a.z, b.x, y, b.z);
      ribbonUv.push(0, i / 6, 1, i / 6);
      if (i) {
        const k = i * 2;
        index.push(k - 2, k - 1, k, k - 1, k + 1, k);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(ribbon, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(ribbonUv, 2));
    g.setIndex(index);
    return g;
  };
  const riverGeometry = mergeGeometries([
    ribbonGeometry(river, riverSamples, (i) => 2.6 + Math.sin(i * 0.07) * 0.6, groundY - 0.42),
    ...streams.map(({ curve, samples }, i) =>
      ribbonGeometry(
        curve,
        samples,
        (k) => (i < 2 ? 0.7 : 0.5) - (k / samples.length) * 0.15,
        groundY - 0.425,
      ),
    ),
    (() => {
      // The lake surface: a flat shape along its shore.
      const shape = new THREE.Shape(lakeShore.map((p) => new THREE.Vector2(p.x, -p.z)));
      const g = new THREE.ShapeGeometry(shape, 1);
      g.rotateX(-Math.PI / 2);
      g.translate(0, groundY - 0.43, 0);
      const uv = g.getAttribute('position');
      const uvs = new Float32Array(uv.count * 2);
      // Gentle ripples across the whole lake (no single band of light).
      for (let k = 0; k < uv.count; k++)
        uvs.set([0.5 + Math.sin(uv.getZ(k) * 0.3) * 0.3, uv.getX(k) * 0.45], k * 2);
      g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      g.deleteAttribute('normal');
      return g;
    })(),
  ])!;
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
  islandFade(riverMaterial);
  materials.push(riverMaterial);
  const water = new THREE.Mesh(riverGeometry, riverMaterial);
  water.name = 'World_River';
  water.receiveShadow = true;
  group.add(water);

  // --- The sea, a wooden pier reaching out into it, and a fishing boat ------------------------
  const seaMaterial = new THREE.MeshToonMaterial({ color: '#7fb5c2', gradientMap: toonGradient() });
  seaMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = windTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSea;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvSea = (modelMatrix * vec4(position, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float windTime;\nvarying vec3 vSea;',
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float wave = sin(vSea.x * 0.35 + windTime * 0.7) * sin(vSea.z * 0.31 - windTime * 0.5);
        float glint = smoothstep(0.86, 0.98, sin(vSea.x * 0.9 + vSea.z * 0.6 + wave * 2.0 + windTime));
        diffuseColor.rgb += wave * 0.025 + glint * 0.16;`,
      );
  };
  seaMaterial.customProgramCacheKey = () => 'world-sea';
  materials.push(seaMaterial);
  islandFade(seaMaterial);
  {
    // The open sea all around the island, out to the horizon.
    const g = new THREE.PlaneGeometry(1100, 1100, 1, 1);
    g.rotateX(-Math.PI / 2);
    geometries.push(g);
    const sea = new THREE.Mesh(g, seaMaterial);
    sea.name = 'World_Sea';
    sea.position.set(islandCentre.x, seaLevel, islandCentre.z);
    group.add(sea);
  }
  // Pier: from the beach in front of the café straight out to sea.
  const pierAlong = 14,
    pierFrom = road.origin
      .clone()
      .addScaledVector(roadDir, pierAlong)
      .addScaledVector(away, SEA - 3),
    pierLength = 20,
    pierHalf = 0.9,
    pierDeck = groundY + 0.12;
  {
    const parts: THREE.BufferGeometry[] = [],
      posts: THREE.BufferGeometry[] = [],
      yaw = Math.atan2(away.x, away.z);
    for (let k = 0; k < pierLength / 0.32; k++) {
      const plank = new THREE.BoxGeometry(pierHalf * 2 + (k % 3) * 0.04, 0.06, 0.28);
      plank.translate((noise(k, 91) - 0.5) * 0.06, pierDeck - 0.03, k * 0.32 + 0.16);
      parts.push(plank.toNonIndexed());
    }
    for (let k = 0; k <= pierLength / 2.5; k++)
      for (const side of [-1, 1]) {
        const post = new THREE.CylinderGeometry(0.08, 0.09, 3.6, 7);
        post.translate(side * (pierHalf - 0.05), pierDeck - 1.7, k * 2.5);
        posts.push(post.toNonIndexed());
        const rail = new THREE.CylinderGeometry(0.035, 0.035, 0.85, 5);
        rail.translate(side * (pierHalf - 0.05), pierDeck + 0.42, k * 2.5);
        posts.push(rail.toNonIndexed());
      }
    for (const side of [-1, 1]) {
      const bar = new THREE.BoxGeometry(0.05, 0.05, pierLength);
      bar.translate(side * (pierHalf - 0.05), pierDeck + 0.82, pierLength / 2);
      posts.push(bar.toNonIndexed());
    }
    const build = (list: THREE.BufferGeometry[], color: string) => {
      const geometry = mergeGeometries(list)!;
      list.forEach((g) => g.dispose());
      geometry.computeVertexNormals();
      geometry.rotateY(yaw);
      geometry.translate(pierFrom.x, 0, pierFrom.z);
      geometries.push(geometry);
      const m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() });
      materials.push(m);
      const mesh = new THREE.Mesh(geometry, m);
      mesh.name = 'World_Pier';
      group.add(mesh);
    };
    build(parts, '#a8784a');
    build(posts, '#6e4a2f');
  }
  // A small fishing boat moored beside the end of the pier, rocking on the swell.
  const boat = new THREE.Group();
  boat.name = 'World_Fishing_Boat';
  {
    const hullMaterial = new THREE.MeshToonMaterial({
        color: '#f0ebe0',
        gradientMap: toonGradient(),
      }),
      stripe = new THREE.MeshToonMaterial({ color: '#3f6f8f', gradientMap: toonGradient() }),
      wood = new THREE.MeshToonMaterial({ color: '#8a5d3b', gradientMap: toonGradient() }),
      red = new THREE.MeshToonMaterial({ color: '#c0533f', gradientMap: toonGradient() });
    materials.push(hullMaterial, stripe, wood, red);
    const part = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
      geometries.push(g);
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, y, z);
      boat.add(mesh);
      return mesh;
    };
    // Hull: half a stretched cylinder with a pointed bow.
    const hull = new THREE.CylinderGeometry(0.75, 0.75, 3.2, 16, 1, false, Math.PI / 2, Math.PI);
    hull.rotateX(Math.PI / 2);
    hull.rotateZ(Math.PI);
    hull.scale(1, 0.7, 1);
    part(hull, hullMaterial, 0, 0.05, 0);
    const bow = new THREE.ConeGeometry(0.75, 1.2, 16, 1, false, Math.PI / 2, Math.PI);
    bow.rotateX(Math.PI / 2);
    bow.rotateZ(Math.PI);
    bow.scale(1, 0.7, 1);
    part(bow, hullMaterial, 0, 0.05, 2.2);
    part(new THREE.BoxGeometry(1.52, 0.1, 3.2), stripe, 0, 0.02, 0);
    part(new THREE.BoxGeometry(1.4, 0.05, 3.0), wood, 0, 0.0, 0);
    part(new THREE.BoxGeometry(0.9, 0.7, 0.9), hullMaterial, 0, 0.38, -0.6);
    part(new THREE.BoxGeometry(1.0, 0.08, 1.0), red, 0, 0.77, -0.6);
    part(new THREE.CylinderGeometry(0.04, 0.05, 2.2, 6), wood, 0, 1.15, 0.5);
    part(new THREE.BoxGeometry(0.02, 0.3, 0.45), red, 0, 2.05, 0.73);
  }
  const boatAt = pierFrom
    .clone()
    .addScaledVector(away, pierLength - 3)
    .addScaledVector(new THREE.Vector3(-away.z, 0, away.x), 2.1);
  boat.position.set(boatAt.x, seaLevel + 0.36, boatAt.z);
  boat.rotation.y = Math.atan2(away.x, away.z) + 0.15;
  group.add(boat);
  /** Gentle motion for the boat (call each frame). */
  const updateWorld = (time: number) => {
    boat.position.y = seaLevel + 0.36 + Math.sin(time * 1.1) * 0.05;
    boat.rotation.z = Math.sin(time * 0.9) * 0.04;
    boat.rotation.x = Math.sin(time * 0.7 + 1) * 0.025;
  };

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
    islandFade(roadMaterial);
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
  islandFade(canopyMaterial);
  islandFade(trunkMaterial);
  materials.push(trunkMaterial, canopyMaterial);
  const treeSpots: THREE.Matrix4[] = [],
    treeColors: THREE.Color[] = [];
  const shades = ['#4f6b33', '#5d7a3a', '#6e8a42', '#47612f'].map((c) => new THREE.Color(c));
  const scatter = (n: number) => {
    const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  for (let i = 0; treeSpots.length < 190 && i < 9000; i++) {
    // Anywhere on the island: meadow, foothills and the lower mountain slopes (not the beach).
    const u = (scatter(i * 1.37) - 0.5) * 2 * (ISLAND.halfAlong - 14),
      w = -SEA + 12 + scatter(i * 2.11 + 7) * (ISLAND.back + SEA - 30);
    const x = road.origin.x + roadDir.x * u - away.x * w,
      z = road.origin.z + roadDir.z * u - away.z * w;
    const { flat, roadGap } = flatZone(x, z);
    if (flat < 0.9 || roadGap < 3 || riverDistance(x, z) < 5) continue;
    if (seaOut(x, z) > SEA - 18 || height(x, z) > groundY + 17) continue;
    if (lotOutside(x, z) < 6) continue;
    // Fewer trees up the slopes.
    if (scatter(i * 3.7) < THREE.MathUtils.smoothstep(height(x, z) - groundY, 6, 17) * 0.8)
      continue;
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
  // After the painted reference, narrowing a little toward the top like a lighthouse. Stone steps
  // wind up around a rocky base to an arched door. Inside: a library along a railed spiral
  // staircase that hugs the wall up to the 4th floor, a cosy living room there (sofa, piano,
  // guitar, cello, study desk, an empty frame for a Story of Winds photo) behind the big round
  // window that faces the café, then a plain spiral stair in the middle up to the open 5th floor
  // (stone balustrade and round pillars) and the roof. Heights are relative to the tower base.
  const tower = new THREE.Group();
  tower.name = 'World_Observatory';
  const towerBase = height(towerAt.x, towerAt.z) - 0.2;
  tower.position.set(towerAt.x, towerBase, towerAt.z);
  const T = {
    plinth: 1.2,
    plinthR: TOWER_BASE_R,
    wallBottom: 2.5,
    wallTopR: 2.15,
    thick: 0.15,
    door: 0.72,
    doorHeight: 2.5,
    stairIn: 1.25,
    stairOut: 2.0,
    turns: 3,
    top: 13.4,
    holeArc: 3.0,
    core: 1.05,
    outerStairIn: TOWER_BASE_R + 0.08,
    outerStairOut: TOWER_BASE_R + 1.02,
  };
  const wallAt = (y: number) =>
    THREE.MathUtils.lerp(
      T.wallBottom,
      T.wallTopR,
      THREE.MathUtils.clamp((y - T.plinth) / (T.top - T.plinth), 0, 1),
    );
  const level = (n: number) => T.plinth + n * ((T.top - T.plinth) / 5);
  const floor4 = level(3),
    floor5 = level(4);
  const stairStart = doorAngle + 1.1,
    pitch = (floor4 - T.plinth) / T.turns,
    stairEnd = stairStart + T.turns * Math.PI * 2,
    corePitch = (T.top - floor4) / 2,
    coreStart = doorAngle + Math.PI,
    // How much of the core stair's last turn needs head room through the floor above it.
    coreHole = 3.2;
  // The big round window on the 4th floor faces the café (and the road beyond it).
  const windowY = (floor4 + floor5) / 2,
    windowAngle = doorAngle,
    windowR = 0.85;
  const toon = (color: string, extra: THREE.MeshToonMaterialParameters = {}) => {
    const m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...extra });
    materials.push(m);
    return m;
  };
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
    stone = toon('#b8b0a2', { side: THREE.DoubleSide }),
    stoneDark = toon('#8a857c'),
    rock = toon('#9a978f', { vertexColors: true }),
    dark = toon('#3b2f27'),
    wood = toon('#8a5d3b'),
    woodDark = toon('#5c3d27'),
    woodLight = toon('#b5865a'),
    fabric = toon('#7f9a8a'),
    cushion = toon('#e6d2b5'),
    ivory = toon('#f1ead9'),
    marble = toon('#e9e6df', { vertexColors: true }),
    books = toon('#ffffff', { vertexColors: true });
  const glow = new THREE.MeshBasicMaterial({ color: '#ffd9a0', side: THREE.DoubleSide }),
    glass = new THREE.MeshBasicMaterial({
      color: '#cfe4ea',
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    canvasMaterial = new THREE.MeshBasicMaterial({ color: '#efe7d6' });
  materials.push(glow, glass, canvasMaterial);
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
  const wallRing = (y0: number, y1: number, gap = 0, at = 0) =>
    add(
      new THREE.CylinderGeometry(
        wallAt(y1),
        wallAt(y0),
        y1 - y0,
        44,
        1,
        true,
        gap ? at + gap / 2 : 0,
        gap ? Math.PI * 2 - gap : Math.PI * 2,
      ),
      brick,
      (y0 + y1) / 2,
    );
  /** A flat ring (or pie-cut ring) at a height; angles use our (sin, cos) convention. */
  const slab = (y: number, inner: number, outer: number, from = 0, length = Math.PI * 2) => {
    const g = new THREE.RingGeometry(inner, outer, 56, 1, from - Math.PI / 2, length);
    g.rotateX(-Math.PI / 2);
    return add(g, stone, y);
  };

  // Stone base and the steps winding up around it from the path to the door.
  add(
    new THREE.CylinderGeometry(T.plinthR, T.plinthR + 0.35, T.plinth + 0.6, 32),
    stoneDark,
    (T.plinth - 0.6) / 2,
  );
  const footAt = new THREE.Vector3(
      Math.sin(stairFootAngle),
      0,
      Math.cos(stairFootAngle),
    ).multiplyScalar((T.outerStairIn + T.outerStairOut) / 2),
    foot = height(towerAt.x + footAt.x, towerAt.z + footAt.z) - towerBase,
    outerSpan = stairFootAngle - doorAngle,
    outerSteps = Math.max(6, Math.ceil((T.plinth - foot) / 0.17));
  const outerStairAt = (a: number) => {
    const u = THREE.MathUtils.clamp((stairFootAngle - a) / outerSpan, 0, 1);
    return (
      foot + (Math.min(outerSteps, Math.floor(u * outerSteps) + 1) / outerSteps) * (T.plinth - foot)
    );
  };
  {
    const parts: THREE.BufferGeometry[] = [],
      mid = (T.outerStairIn + T.outerStairOut) / 2;
    for (let k = 0; k < outerSteps; k++) {
      const a = stairFootAngle - ((k + 0.5) / outerSteps) * outerSpan,
        top = foot + ((k + 1) / outerSteps) * (T.plinth - foot),
        under =
          Math.min(
            foot,
            height(towerAt.x + Math.sin(a) * mid, towerAt.z + Math.cos(a) * mid) - towerBase,
          ) - 0.4,
        g = new THREE.BoxGeometry(
          T.outerStairOut - T.outerStairIn,
          top - under,
          (outerSpan / outerSteps) * mid * 1.08,
        );
      g.translate(mid, (top + under) / 2, 0);
      g.rotateY(a - Math.PI / 2);
      parts.push(g);
    }
    add(merge(parts), stone);
  }

  // Walls up to the 5th floor: the door ring, then the window band, then the rest.
  const doorWall = wallAt(T.plinth),
    doorHalf = T.door / doorWall;
  wallRing(T.plinth, T.plinth + T.doorHeight, 2 * doorHalf, doorAngle);
  wallRing(T.plinth + T.doorHeight, windowY - 1.0);
  wallRing(windowY - 1.0, windowY + 1.0, (2 * 1.0) / wallAt(windowY), windowAngle);
  wallRing(windowY + 1.0, floor5);
  {
    // The door arch: only its two top corners are filled.
    const chord = 2 * Math.sin(doorHalf) * doorWall,
      archR = chord / 2,
      springY = T.doorHeight - archR;
    const shape = new THREE.Shape();
    shape.moveTo(-archR, 0);
    shape.lineTo(-archR, archR + 0.02);
    shape.lineTo(archR, archR + 0.02);
    shape.lineTo(archR, 0);
    shape.absarc(0, 0, archR, 0, Math.PI, false);
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: 0.14,
      bevelEnabled: false,
      curveSegments: 20,
    });
    g.translate(0, 0, -0.07);
    around(add(g, brick, T.plinth + springY), doorAngle, doorWall * Math.cos(doorHalf));
    around(
      add(new THREE.TorusGeometry(archR, 0.07, 6, 20, Math.PI), dark, T.plinth + springY),
      doorAngle,
      doorWall + 0.03,
    );
    for (const side of [-1, 1]) {
      around(
        add(new THREE.BoxGeometry(0.14, springY, 0.18), dark, T.plinth + springY / 2),
        doorAngle + side * doorHalf,
        doorWall + 0.02,
      );
      const leaf = new THREE.BoxGeometry(archR, T.doorHeight - 0.5, 0.06);
      leaf.translate((side * -archR) / 2, 0, 0);
      const l = add(leaf, woodDark, T.plinth + (T.doorHeight - 0.5) / 2);
      const hinge = doorAngle + side * doorHalf * 0.98;
      l.position.x = Math.sin(hinge) * (doorWall - T.thick);
      l.position.z = Math.cos(hinge) * (doorWall - T.thick);
      l.rotation.y = doorAngle - side * 1.25;
    }
  }
  {
    // Round window: a panel with a round hole, a thin pane and a cross of mullions.
    const r = wallAt(windowY),
      half = 1.0 / r,
      hole = new THREE.Path();
    hole.absarc(0, 1.0, windowR, 0, Math.PI * 2, false);
    const shape = new THREE.Shape();
    const w = 2 * Math.sin(half) * r;
    shape.moveTo(-w / 2, 0);
    shape.lineTo(w / 2, 0);
    shape.lineTo(w / 2, 2.0);
    shape.lineTo(-w / 2, 2.0);
    shape.closePath();
    shape.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: 0.14,
      bevelEnabled: false,
      curveSegments: 24,
    });
    g.translate(0, 0, -0.07);
    const inset = r * Math.cos(half);
    around(add(g, brick, windowY - 1.0), windowAngle, inset);
    around(add(new THREE.CircleGeometry(windowR, 28), glass, windowY), windowAngle, inset);
    around(
      add(new THREE.TorusGeometry(windowR, 0.07, 6, 28), dark, windowY),
      windowAngle,
      inset + 0.07,
    );
    for (const tilt of [0.6, -0.6])
      around(
        add(new THREE.BoxGeometry(0.05, windowR * 2, 0.04), dark, windowY),
        windowAngle,
        inset + 0.07,
      ).rotateZ(tilt);
  }
  for (const n of [1, 2]) {
    const y = level(n);
    add(
      new THREE.CylinderGeometry(wallAt(y) + 0.09, wallAt(y) + 0.11, 0.16, 44, 1, true),
      stone,
      y,
    );
  }
  // Small arched windows with lanterns beside two of them.
  [
    [1.9, 1.5],
    [-1.9, 2.5],
  ].forEach(([da, lv]) => {
    const a = doorAngle + da,
      y = level(lv),
      r = wallAt(y);
    around(add(new THREE.BoxGeometry(0.42, 0.75, 0.1), dark, y), a, r + 0.01);
    const la = a + 0.34;
    around(add(new THREE.BoxGeometry(0.16, 0.24, 0.16), glow, y + 0.05), la, r + 0.14);
    around(add(new THREE.ConeGeometry(0.2, 0.18, 4), dark, y + 0.27), la, r + 0.14).rotation.y +=
      Math.PI / 4;
  });

  // 4th floor (living room): floor open only where the wall stair comes up.
  const room = wallAt(floor4) - T.thick;
  slab(floor4, 0, T.stairIn - 0.15);
  slab(floor4, T.stairIn - 0.15, T.stairOut + 0.1, stairEnd, Math.PI * 2 - T.holeArc);
  slab(floor4, T.stairOut + 0.1, room + 0.05);
  // 5th floor: open all round, a stone balustrade on the wall top, round pillars up to the roof.
  const fifth = wallAt(floor5);
  // The floor is open only over the stretch of the core stair coming up through it; the rest of
  // the middle is a landing, so the stair arrives onto floor (not into a hole).
  add(
    new THREE.CylinderGeometry(fifth + 0.12, fifth + 0.02, 0.3, 44, 1, true),
    stone,
    floor5 - 0.15,
  );
  slab(floor5 + 0.005, T.core, fifth + 0.1);
  slab(floor5 - 0.295, T.core, fifth + 0.1);
  slab(floor5 + 0.005, 0.1, T.core, coreStart, Math.PI * 2 - coreHole);
  slab(floor5 - 0.295, 0.1, T.core, coreStart, Math.PI * 2 - coreHole);
  add(
    new THREE.CylinderGeometry(T.core, T.core, 0.3, 24, 1, true, coreStart - coreHole, coreHole),
    stone,
    floor5 - 0.15,
  );
  {
    const parts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2,
        g = new THREE.CylinderGeometry(0.05, 0.07, 0.42, 6);
      g.translate(Math.sin(a) * (fifth - 0.02), floor5 + 0.21, Math.cos(a) * (fifth - 0.02));
      parts.push(g);
    }
    add(merge(parts), stone);
    add(new THREE.TorusGeometry(fifth - 0.02, 0.07, 6, 48), stone, floor5 + 0.45).rotation.x =
      Math.PI / 2;
    const pillars: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8,
        g = new THREE.CylinderGeometry(0.13, 0.15, T.top - floor5, 12);
      g.translate(Math.sin(a) * (fifth - 0.2), (floor5 + T.top) / 2, Math.cos(a) * (fifth - 0.2));
      pillars.push(g);
    }
    add(merge(pillars), stone);
  }
  // Roof: corbelled slab with the core stair opening, a balustrade around the edge.
  // A wide roof terrace that overhangs the 5th floor's pillars.
  const parapet = T.wallTopR + 1.05;
  {
    add(
      new THREE.CylinderGeometry(parapet + 0.12, fifth - 0.05, 0.4, 56, 1, true),
      stone,
      T.top - 0.2,
    );
    slab(T.top + 0.005, T.core, parapet + 0.12);
    slab(T.top - 0.395, T.core, fifth - 0.05);
    slab(T.top + 0.005, 0.1, T.core, coreStart, Math.PI * 2 - coreHole);
    slab(T.top - 0.395, 0.1, T.core, coreStart, Math.PI * 2 - coreHole);
    add(
      new THREE.CylinderGeometry(T.core, T.core, 0.4, 24, 1, true, coreStart - coreHole, coreHole),
      stone,
      T.top - 0.2,
    );
    add(new THREE.TorusGeometry(parapet, 0.08, 6, 64), stone, T.top + 0.52).rotation.x =
      Math.PI / 2;
    const pillars: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 44; k++) {
      const a = (k / 44) * Math.PI * 2,
        g = new THREE.CylinderGeometry(0.06, 0.08, 0.48, 6);
      g.translate(Math.sin(a) * parapet, T.top + 0.25, Math.cos(a) * parapet);
      pillars.push(g);
    }
    add(merge(pillars), stone);
  }

  // The railed wall stair with bookshelves along it, up to the 4th floor.
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
        y = T.plinth + ((k + 1) / count) * (floor4 - T.plinth),
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
      if (y + 1.9 > floor4 - 0.05) continue;
      const shelfR = wallAt(y + 1) - T.thick - 0.13,
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
        let x = -width / 2 + 0.02,
          b = 0;
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
    const rug = add(new THREE.CircleGeometry(1.1, 24), toon('#9c5b47'), T.plinth + 0.012);
    rug.rotation.x = -Math.PI / 2;
  }
  // The plain spiral stair in the middle: 4th floor → 5th floor → roof, around a pole.
  {
    const perTurn = 16,
      count = perTurn * 2,
      treads: THREE.BufferGeometry[] = [],
      rail: THREE.Vector3[] = [],
      posts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < count; k++) {
      const a = coreStart + ((k + 0.5) / perTurn) * Math.PI * 2,
        y = floor4 + ((k + 1) / count) * (T.top - floor4);
      const g = new THREE.BoxGeometry(0.82, 0.07, 0.3);
      g.translate(0.55, y - 0.035, 0);
      g.rotateY(a - Math.PI / 2);
      treads.push(g);
      rail.push(new THREE.Vector3(Math.sin(a) * 0.95, y + 0.85, Math.cos(a) * 0.95));
      const post = new THREE.CylinderGeometry(0.018, 0.018, 0.85, 4);
      post.translate(Math.sin(a) * 0.95, y + 0.42, Math.cos(a) * 0.95);
      posts.push(post);
    }
    add(merge(treads), woodLight);
    add(merge(posts), dark);
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail), count * 3, 0.03, 5), dark);
    add(
      new THREE.CylinderGeometry(0.09, 0.09, T.top - floor4 + 0.9, 10),
      dark,
      (floor4 + T.top + 0.9) / 2,
    );
  }
  // Places for Luna to settle (tower-local seat point and the way she faces), the instruments
  // on their stands, and fresh copies of them for her to hold while playing.
  const playSpots: Record<string, { local: THREE.Vector3; heading: number; lie?: number }> = {};
  const heldInstruments: Partial<Record<'guitar' | 'cello', () => THREE.Group>> = {};
  const standingInstruments: Partial<Record<'guitar' | 'cello', THREE.Object3D>> = {};
  // Living room furniture against the wall, away from where the wall stair arrives.
  const furniture: { a: number; r: number; size: number }[] = [];
  const frameSpot = new THREE.Vector3();
  let framePicture: THREE.Mesh | null = null;
  {
    const r = room - 0.36,
      at = (a: number, depth = r) =>
        new THREE.Vector3(Math.sin(a) * depth, floor4, Math.cos(a) * depth);
    /** Tower-local point at `lx` across / `lz` towards the room of a piece placed at angle a. */
    const spotAt = (a: number, depth: number, lx: number, lz: number, y: number) => {
      const t = a + Math.PI;
      return at(a, depth).add(
        new THREE.Vector3(
          lx * Math.cos(t) + lz * Math.sin(t),
          y,
          -lx * Math.sin(t) + lz * Math.cos(t),
        ),
      );
    };
    const place = (g: THREE.Group, a: number, depth = r) => {
      g.position.copy(at(a, depth));
      g.rotation.y = a + Math.PI;
      tower.add(g);
      return g;
    };
    const box = (
      parent: THREE.Group,
      w: number,
      h: number,
      d: number,
      m: THREE.Material,
      x: number,
      y: number,
      z: number,
    ) => {
      const g = new THREE.BoxGeometry(w, h, d);
      geometries.push(g);
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };
    const free = stairEnd + 0.35; // just past where the wall stair arrives
    /** Four legs under a seat or table top (width × depth, height). */
    const legs = (
      parent: THREE.Group,
      w: number,
      d: number,
      h: number,
      m: THREE.Material,
      z = 0,
    ) => {
      for (const x of [-w / 2, w / 2])
        for (const dz of [-d / 2, d / 2]) box(parent, 0.035, h, 0.035, m, x, h / 2, z + dz);
    };
    // Sofa.
    {
      const s = new THREE.Group();
      box(s, 1.3, 0.22, 0.55, fabric, 0, 0.2, 0);
      box(s, 1.3, 0.45, 0.14, fabric, 0, 0.42, -0.24);
      for (const x of [-0.62, 0.62]) box(s, 0.12, 0.34, 0.55, fabric, x, 0.32, 0);
      for (const x of [-0.32, 0.32]) box(s, 0.56, 0.08, 0.46, cushion, x, 0.35, 0.03);
      for (const x of [-0.6, 0.6])
        for (const z of [-0.22, 0.22]) box(s, 0.05, 0.09, 0.05, woodDark, x, 0.045, z);
      place(s, free + 0.4);
      furniture.push({ a: free + 0.4, r, size: 0.42 });
      const a = free + 0.4,
        t = a + Math.PI;
      playSpots.sofa = { local: spotAt(a, r, 0.32, 0.05, 0.39), heading: t };
      // Lying along the sofa: feet to one arm, head on the other.
      playSpots.sofaLie = {
        local: spotAt(a, r, 0, 0.04, 0.39),
        heading: Math.atan2(Math.cos(t), -Math.sin(t)),
        lie: 1,
      };
    }
    // Upright piano: cabinet, music desk, a real keyboard (white keys with black keys in twos and
    // threes), cheek blocks, front legs, three brass pedals, and a stool on four legs.
    {
      const p = new THREE.Group(),
        brass = toon('#c8a24a'),
        black = toon('#1f1c1c'),
        width = 1.18,
        white = 29,
        keyW = (width - 0.12) / white;
      box(p, width, 1.0, 0.36, woodDark, 0, 0.62, -0.12);
      box(p, width + 0.04, 0.04, 0.4, woodDark, 0, 1.14, -0.12);
      box(p, width - 0.16, 0.26, 0.03, wood, 0, 0.95, 0.07);
      box(p, width, 0.06, 0.3, woodDark, 0, 0.66, 0.12);
      for (const x of [-(width / 2 - 0.03), width / 2 - 0.03]) {
        box(p, 0.06, 0.1, 0.3, woodDark, x, 0.74, 0.12);
        box(p, 0.06, 0.6, 0.06, woodDark, x, 0.3, 0.22);
      }
      for (let k = 0; k < white; k++)
        box(p, keyW * 0.92, 0.025, 0.18, ivory, -width / 2 + 0.06 + keyW * (k + 0.5), 0.705, 0.17);
      for (let k = 0; k < white - 1; k++) {
        const n = k % 7;
        if (n === 2 || n === 6) continue; // no black key between E–F and B–C
        box(p, keyW * 0.55, 0.03, 0.11, black, -width / 2 + 0.06 + keyW * (k + 1), 0.73, 0.135);
      }
      for (const x of [-0.08, 0, 0.08]) box(p, 0.035, 0.02, 0.07, brass, x, 0.05, 0.12);
      const stool = new THREE.Group();
      box(stool, 0.5, 0.06, 0.3, woodDark, 0, 0.45, 0);
      box(stool, 0.46, 0.04, 0.26, toon('#6b3b3b'), 0, 0.49, 0);
      legs(stool, 0.42, 0.22, 0.42, woodDark);
      stool.position.z = 0.6;
      p.add(stool);
      place(p, free + 1.2);
      furniture.push({ a: free + 1.2, r, size: 0.42 });
      // On the stool, facing the keys.
      playSpots.piano = { local: spotAt(free + 1.2, r, 0, 0.62, 0.51), heading: free + 1.2 };
    }
    // Guitar and cello on stands, with their real outlines: figure-of-eight bodies, a sound hole
    // or f-holes, bridge, fingerboard with frets, headstock or scroll, and strings.
    const bodyOutline = (upper: number, lower: number, waist: number, length: number) => {
      const shape = new THREE.Shape(),
        h = length;
      shape.moveTo(0, 0);
      shape.bezierCurveTo(lower * 1.05, 0, lower, h * 0.32, waist, h * 0.5);
      shape.bezierCurveTo(upper, h * 0.62, upper * 1.05, h, 0, h);
      shape.bezierCurveTo(-upper * 1.05, h, -upper, h * 0.62, -waist, h * 0.5);
      shape.bezierCurveTo(-lower, h * 0.32, -lower * 1.05, 0, 0, 0);
      return shape;
    };
    /** A thin rod (string) from one point to another. */
    const rod = (
      parent: THREE.Group,
      from: THREE.Vector3,
      to: THREE.Vector3,
      r: number,
      m: THREE.Material,
    ) => {
      const length = from.distanceTo(to),
        geometry = new THREE.CylinderGeometry(r, r, length, 4);
      geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, m);
      mesh.position.copy(from).lerp(to, 0.5);
      mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        to.clone().sub(from).normalize(),
      );
      parent.add(mesh);
      return mesh;
    };
    /**
     * Guitar or cello (no stand), standing on y = 0 with its front facing +z. The fingerboard
     * runs from the neck onto the body; every string runs from its anchor (bridge pins or the
     * tailpiece) over the saddle/bridge and the nut to its own tuning peg.
     */
    const buildInstrument = (cello: boolean, colour: THREE.Material) => {
      const g = new THREE.Group(),
        y0 = cello ? 0.12 : 0.04,
        len = cello ? 0.75 : 0.46,
        depth = cello ? 0.16 : 0.09,
        shape = bodyOutline(cello ? 0.17 : 0.13, cello ? 0.22 : 0.18, cello ? 0.12 : 0.1, len);
      const body = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelThickness: 0.012,
        bevelSize: 0.01,
        bevelSegments: 2,
        curveSegments: 18,
      });
      body.translate(0, y0, -depth / 2);
      geometries.push(body);
      g.add(new THREE.Mesh(body, colour));
      const front = depth / 2 + 0.012,
        neckLen = cello ? 0.62 : 0.5,
        top = y0 + len,
        nutY = top + neckLen - 0.01,
        // The fingerboard sits proud of the cello's arched top; flush on the guitar.
        neckFront = cello ? front + 0.017 : front - 0.004,
        boardFront = neckFront + 0.008,
        boardFrom = cello ? y0 + len * 0.62 : y0 + len * 0.74,
        strings = cello ? 4 : 6,
        stringMat = cello ? toon('#d9d2c2') : toon('#e8e2d0');
      // Neck (into the body's shoulder) and the dark fingerboard on it.
      box(
        g,
        cello ? 0.05 : 0.048,
        neckLen + 0.06,
        0.04,
        colour,
        0,
        top + neckLen / 2 - 0.03,
        neckFront - 0.02,
      );
      box(
        g,
        cello ? 0.05 : 0.046,
        nutY - boardFrom,
        0.008,
        black(),
        0,
        (nutY + boardFrom) / 2,
        boardFront - 0.004,
      );
      // Nut at the top of the fingerboard.
      box(g, cello ? 0.05 : 0.046, 0.008, 0.012, ivory, 0, nutY + 0.004, boardFront + 0.002);
      if (!cello)
        // Frets, closer together up the neck.
        for (let k = 1; k <= 14; k++) {
          const y = nutY - (nutY - (y0 + len * 0.22)) * (1 - Math.pow(2, -k / 12)) * 1.0;
          if (y < boardFrom + 0.01) break;
          box(g, 0.046, 0.003, 0.004, toon('#cfcac0'), 0, y, boardFront + 0.001);
        }
      // Head: angled guitar headstock with six machine heads, or the cello's pegbox and scroll.
      const head = new THREE.Group();
      head.position.set(0, nutY + 0.008, neckFront - 0.01);
      head.rotation.x = cello ? 0.12 : 0.25;
      g.add(head);
      const pegs: THREE.Vector3[] = [];
      if (cello) {
        box(head, 0.05, 0.16, 0.05, colour, 0, 0.08, -0.01);
        box(head, 0.03, 0.13, 0.03, dark, 0, 0.08, 0.012);
        const scroll = new THREE.TorusGeometry(0.035, 0.014, 6, 12);
        geometries.push(scroll);
        const sc = new THREE.Mesh(scroll, colour);
        sc.position.set(0, 0.2, -0.01);
        sc.rotation.y = Math.PI / 2;
        head.add(sc);
        for (let k = 0; k < 4; k++) {
          const y = 0.03 + k * 0.035,
            side = k % 2 ? 1 : -1;
          box(head, 0.11, 0.012, 0.012, dark, side * 0.03, y, -0.01);
          box(head, 0.02, 0.03, 0.012, dark, side * 0.085, y, -0.01);
          pegs.push(new THREE.Vector3(0, y, 0.01));
        }
      } else {
        box(head, 0.075, 0.16, 0.018, woodDark, 0, 0.08, 0);
        for (const side of [-1, 1])
          for (let k = 0; k < 3; k++) {
            const y = 0.04 + k * 0.045;
            box(head, 0.03, 0.01, 0.01, toon('#cfcac0'), side * 0.05, y, -0.006);
            box(head, 0.016, 0.022, 0.008, ivory, side * 0.07, y, -0.006);
            pegs.push(new THREE.Vector3(side * 0.022, y, 0.012));
          }
      }
      head.updateMatrix();
      const pegAt = (k: number) => pegs[k].clone().applyMatrix4(head.matrix);
      const across = (k: number, spread: number) => (k - (strings - 1) / 2) * spread;
      if (cello) {
        // f-holes, a tall bridge, the tailpiece and the endpin.
        for (const x of [-0.07, 0.07])
          box(g, 0.012, 0.13, 0.005, dark, x, y0 + len * 0.5, front).rotation.z =
            x > 0 ? 0.15 : -0.15;
        const bridgeY = y0 + len * 0.42,
          bridgeTop = front + 0.07;
        box(g, 0.12, 0.012, 0.07, woodLight, 0, bridgeY, front + 0.035);
        box(g, 0.075, 0.03, 0.03, black(), 0, y0 + len * 0.18, front + 0.012);
        box(g, 0.05, 0.12, 0.012, black(), 0, y0 + len * 0.25, front + 0.016);
        box(g, 0.015, 0.14, 0.015, dark, 0, 0.06, 0);
        for (let k = 0; k < strings; k++) {
          const tail = new THREE.Vector3(across(k, 0.011), y0 + len * 0.31, front + 0.024),
            bridge = new THREE.Vector3(across(k, 0.017), bridgeY, bridgeTop),
            nut = new THREE.Vector3(across(k, 0.0105), nutY + 0.006, boardFront + 0.008);
          rod(g, tail, bridge, 0.0016, stringMat);
          rod(g, bridge, nut, 0.0016 + k * 0.0002, stringMat);
          rod(g, nut, pegAt(k), 0.0014, stringMat);
        }
      } else {
        // Sound hole and rosette, pickguard, bridge with saddle and pins.
        const holeY = y0 + len * 0.6,
          hole = new THREE.CircleGeometry(0.045, 24),
          rosette = new THREE.RingGeometry(0.045, 0.058, 24),
          guard = new THREE.CircleGeometry(0.038, 16, 0, Math.PI);
        geometries.push(hole, rosette, guard);
        const h = new THREE.Mesh(hole, dark);
        h.position.set(0, holeY, front);
        const ro = new THREE.Mesh(rosette, woodDark);
        ro.position.set(0, holeY, front + 0.0005);
        const pg = new THREE.Mesh(guard, toon('#3a2a22'));
        // Pickguard tucked below and beside the sound hole.
        pg.position.set(0.05, holeY - 0.05, front + 0.0004);
        pg.rotation.z = -Math.PI * 0.62;
        g.add(h, ro, pg);
        const bridgeY = y0 + len * 0.22;
        box(g, 0.13, 0.026, 0.008, woodDark, 0, bridgeY - 0.008, front + 0.004);
        box(g, 0.075, 0.004, 0.006, ivory, 0, bridgeY, front + 0.011);
        for (let k = 0; k < strings; k++) {
          const pin = new THREE.Vector3(across(k, 0.012), bridgeY - 0.016, front + 0.008),
            saddle = new THREE.Vector3(across(k, 0.0115), bridgeY, front + 0.014),
            nut = new THREE.Vector3(across(k, 0.0074), nutY + 0.006, boardFront + 0.007);
          box(g, 0.005, 0.005, 0.006, ivory, pin.x, pin.y, pin.z);
          rod(g, pin, saddle, 0.0011, stringMat);
          rod(g, saddle, nut, 0.0009 + (strings - 1 - k) * 0.00018, stringMat);
          rod(g, nut, pegAt(k), 0.0009, stringMat);
        }
      }
      return g;
    };
    /** Instruments on their stands (hidden while Luna plays them), and a stool for playing. */
    const standing: Record<'guitar' | 'cello', THREE.Object3D> = {} as Record<
      'guitar' | 'cello',
      THREE.Object3D
    >;
    const instrument = (cello: boolean, colour: THREE.Material, a: number) => {
      const g = new THREE.Group();
      g.add(buildInstrument(cello, colour));
      // A simple stand.
      box(g, 0.3, 0.025, 0.2, dark, 0, 0.012, 0.05);
      box(g, 0.025, 0.4, 0.025, dark, 0, 0.2, -0.08);
      g.rotation.x = -0.12;
      const holder = new THREE.Group();
      holder.add(g);
      // A little round stool in front, to sit and play.
      const stool = new THREE.Group();
      const seatTop = new THREE.CylinderGeometry(0.17, 0.17, 0.05, 16);
      geometries.push(seatTop);
      const st = new THREE.Mesh(seatTop, woodDark);
      st.position.y = 0.43;
      stool.add(st);
      for (let k = 0; k < 3; k++) {
        const la = (k / 3) * Math.PI * 2;
        box(stool, 0.03, 0.42, 0.03, woodDark, Math.sin(la) * 0.11, 0.21, Math.cos(la) * 0.11);
      }
      stool.position.z = 0.62;
      holder.add(stool);
      place(holder, a, r + 0.1);
      furniture.push({ a, r: r + 0.1, size: 0.3 });
      standing[cello ? 'cello' : 'guitar'] = g;
      // Luna sits on the stool facing into the room.
      playSpots[cello ? 'cello' : 'guitar'] = {
        local: new THREE.Vector3(
          Math.sin(a) * (r + 0.1 - 0.62),
          floor4 + 0.455,
          Math.cos(a) * (r + 0.1 - 0.62),
        ),
        heading: a + Math.PI,
      };
    };
    const blackMaterial = toon('#1f1c1c');
    const black = () => blackMaterial;
    instrument(false, woodLight, free + 1.8);
    instrument(true, toon('#7a3a1c'), free + 2.15);
    heldInstruments.guitar = () => buildInstrument(false, woodLight);
    heldInstruments.cello = () => buildInstrument(true, toon('#7a3a1c'));
    standingInstruments.guitar = standing.guitar;
    standingInstruments.cello = standing.cello;
    // Study desk with a chair (on legs), a lamp and a few books.
    {
      const d = new THREE.Group();
      box(d, 1.0, 0.05, 0.5, wood, 0, 0.72, 0);
      legs(d, 0.9, 0.4, 0.7, woodDark);
      const chair = new THREE.Group();
      box(chair, 0.42, 0.05, 0.42, wood, 0, 0.45, 0);
      box(chair, 0.42, 0.42, 0.05, wood, 0, 0.68, 0.2);
      legs(chair, 0.36, 0.36, 0.43, woodDark);
      chair.position.z = 0.55;
      d.add(chair);
      box(d, 0.08, 0.3, 0.08, glow, -0.35, 0.9, -0.05);
      box(d, 0.22, 0.06, 0.3, toon('#2f4f5e'), 0.25, 0.77, -0.05);
      box(d, 0.2, 0.05, 0.28, toon('#8e3f4f'), 0.25, 0.82, -0.05);
      place(d, free + 2.7);
      furniture.push({ a: free + 2.7, r, size: 0.42 });
    }
    // The empty frame on the wall above the sofa: Luna can hang her latest photo in it.
    {
      const f = new THREE.Group(),
        a = free + 0.4;
      box(f, 0.86, 0.66, 0.04, woodDark, 0, 0, 0);
      const pic = box(f, 0.74, 0.54, 0.02, canvasMaterial, 0, 0, 0.025);
      framePicture = pic;
      f.position.set(Math.sin(a) * (room - 0.04), floor4 + 1.45, Math.cos(a) * (room - 0.04));
      f.rotation.y = a + Math.PI;
      tower.add(f);
      frameSpot.set(Math.sin(a) * (room - 0.6), floor4, Math.cos(a) * (room - 0.6));
    }
  }
  // Open-book lamps on long cords hanging from under the 4th floor, down into the library.
  const bookLamps: THREE.Object3D[] = [];
  {
    const cords: THREE.BufferGeometry[] = [],
      cover = new THREE.BoxGeometry(0.3, 0.02, 0.4),
      pagesGeometry = new THREE.BoxGeometry(0.26, 0.03, 0.36),
      leafGeometry = new THREE.PlaneGeometry(0.11, 0.16);
    geometries.push(cover, pagesGeometry, leafGeometry);
    for (let c = 0; c < 9; c++) {
      const a = c * 2.39 + noise(c, 41) * 0.6,
        r = 0.25 + noise(c, 43) * 0.7,
        x = Math.sin(a) * r,
        z = Math.cos(a) * r,
        n = 1 + Math.floor(noise(c, 47) * 3);
      let lowest = floor4;
      for (let k = 0; k < n; k++) {
        const y = level(1) + 0.4 + noise(c * 3 + k, 53) * (floor4 - level(1) - 1.6);
        lowest = Math.min(lowest, y);
        const lamp = new THREE.Group();
        for (const side of [-1, 1]) {
          const cv = new THREE.Mesh(cover, wood);
          cv.position.x = side * 0.14;
          cv.rotation.z = side * 0.42;
          const pg = new THREE.Mesh(pagesGeometry, glow);
          pg.position.set(side * 0.13, 0.025, 0);
          pg.rotation.z = side * 0.42;
          lamp.add(cv, pg);
        }
        for (let p = 0; p < 5; p++) {
          const leaf = new THREE.Mesh(leafGeometry, glow);
          leaf.position.set((p - 2) * 0.055, -0.13 - (p % 3) * 0.11, p % 2 ? 0.07 : -0.05);
          leaf.rotation.set(0.15 * (p % 2 ? 1 : -1), p * 0.6, 0.2);
          lamp.add(leaf);
        }
        lamp.position.set(x, y, z);
        lamp.rotation.y = noise(c, k) * 6.28;
        tower.add(lamp);
        bookLamps.push(lamp);
      }
      const cord = new THREE.CylinderGeometry(0.007, 0.007, floor4 - 0.05 - lowest, 4);
      cord.translate(x, (floor4 - 0.05 + lowest) / 2, z);
      cords.push(cord);
    }
    add(merge(cords), dark);
  }
  // Warm lights: the library (low and high), the living room, and over the door.
  const towerLights = [level(0.7), level(2.2), floor4 + 1.8].map((y, i) => {
    const l = new THREE.PointLight('#ffcf8a', 0, 9, 1.4);
    l.position.set(Math.sin(i * 2.1) * 0.6, y, Math.cos(i * 2.1) * 0.6);
    tower.add(l);
    return l;
  });
  const doorLight = new THREE.PointLight('#ffc98a', 0, 6, 1.6);
  doorLight.position.set(
    Math.sin(doorAngle) * (doorWall + 0.6),
    T.plinth + 2.6,
    Math.cos(doorAngle) * (doorWall + 0.6),
  );
  tower.add(doorLight);
  group.add(tower);

  // Marble stepping stones along the winding path; rocks bedded into the hill around the base.
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
      if (Math.hypot(x - towerAt.x, z - towerAt.z) < T.outerStairOut + 0.6) continue;
      const slab = new THREE.CylinderGeometry(0.36, 0.4, 0.07, 6 + (i % 3));
      slab.scale(1 + noise(i, 2) * 0.4, 1, 0.75 + noise(i, 3) * 0.3);
      slab.rotateY(noise(i, 7) * 6.28);
      slab.translate(x, height(x, z) + 0.04, z);
      slabs.push(shade(slab.toNonIndexed(), 0.96 + noise(i, 5) * 0.07));
    }
    const wrap = (v: number) => Math.atan2(Math.sin(v), Math.cos(v));
    const onOuterStairs = (a: number) =>
      wrap(stairFootAngle - a) >= -0.55 && wrap(a - doorAngle) >= -0.45;
    // Hugging the base (not where the steps run), then scattered and half-buried on the hill.
    for (let i = 0; i < 44; i++) {
      const ring = i < 20,
        a = ring ? (i / 20) * Math.PI * 2 + noise(i, 11) * 0.2 : noise(i, 61) * Math.PI * 2,
        r = ring
          ? T.plinthR + 0.35 + noise(i, 13) * 0.4
          : T.outerStairOut + 1.2 + noise(i * 2.1, 63) * 7,
        x = towerAt.x + Math.sin(a) * r,
        z = towerAt.z + Math.cos(a) * r;
      if (ring && onOuterStairs(a)) continue;
      if (towerPathDistance(x, z) < 1.6) continue;
      const size = (ring ? 0.7 : 0.4) + noise(i, 17) * (ring ? 0.6 : 1.1);
      const g = new THREE.DodecahedronGeometry(size, 0);
      g.scale(1.1, 0.6 + noise(i, 19) * 0.35, 0.9);
      g.rotateY(noise(i, 23) * 6.28);
      // Bedded into the ground (a third sunk) so none float on the slope.
      const ground = Math.min(
        height(x, z),
        height(x + size * 0.7, z),
        height(x - size * 0.7, z),
        height(x, z + size * 0.7),
        height(x, z - size * 0.7),
      );
      g.translate(x, ground + size * 0.12, z);
      boulders.push(shade(g.toNonIndexed(), (ring ? 0.74 : 0.84) + noise(i, 29) * 0.13));
      rocks.push({ x, z, r: size * 0.8 });
    }
    for (const [parts, name, material] of [
      [slabs, 'World_Marble_Path', marble],
      [boulders, 'World_Marble_Rocks', rock],
    ] as const) {
      const geometry = mergeGeometries(parts)!;
      parts.forEach((g) => g.dispose());
      geometry.computeVertexNormals();
      geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  // Wooden sign where the path reaches the steps.
  const signAt = towerPathEnd
    .clone()
    .addScaledVector(
      new THREE.Vector3(Math.sin(stairFootAngle + 1.2), 0, Math.cos(stairFootAngle + 1.2)),
      1.4,
    );
  {
    const sign = new THREE.Group();
    sign.name = 'World_Tower_Sign';
    sign.position.set(signAt.x, height(signAt.x, signAt.z), signAt.z);
    sign.rotation.y = stairFootAngle;
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
    g.font = 'bold 50px Georgia, serif';
    g.fillText('SECRET CHAPTER', 256, 70, 470);
    g.font = 'bold 40px Georgia, serif';
    g.fillText(': COMING SOON', 256, 132, 470);
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

  /** Floors inside, on and around the tower (tower-relative heights) at a point, or null. */
  const towerFloors = (x: number, z: number): number[] | null => {
    const dx = x - towerAt.x,
      dz = z - towerAt.z,
      r = Math.hypot(dx, dz);
    if (r >= T.outerStairOut + 0.6) return null;
    const a = Math.atan2(dx, dz),
      wrap = (v: number) => Math.atan2(Math.sin(v), Math.cos(v)),
      fromDoor = wrap(a - doorAngle),
      floors: number[] = [];
    // The outside stairs winding up from the path to the door.
    const along = wrap(stairFootAngle - a);
    if (r >= T.outerStairIn && r <= T.outerStairOut && along >= -0.05 && along <= outerSpan + 0.05)
      floors.push(outerStairAt(a));
    if (r > T.outerStairOut) floors.push(height(x, z) - towerBase);
    // Base top outside the wall, through the doorway, and the ground floor inside.
    const wall = wallAt(T.plinth),
      inWall = r > wall - T.thick - 0.05 && r < wall + 0.08;
    if (r < T.outerStairIn + 0.02 && (!inWall || Math.abs(fromDoor) < (T.door - 0.12) / wall))
      floors.push(T.plinth);
    // The wall stair (a smooth ramp under the treads, railed on the inside) up to the 4th floor.
    const u0 = (((a - stairStart) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (r >= T.stairIn + 0.08 && r <= T.stairOut - 0.04)
      for (let k = 0; k < T.turns; k++) {
        const u = u0 / (Math.PI * 2) + k;
        if (u <= T.turns) floors.push(T.plinth + u * pitch);
      }
    // 4th floor, open where the wall stair arrives, and not where the furniture stands.
    const overHole = r > T.stairIn - 0.15 && r < T.stairOut + 0.1 && u0 > Math.PI * 2 - T.holeArc;
    const onFurniture = furniture.some(
      (f) => Math.hypot(Math.sin(f.a) * f.r - dx, Math.cos(f.a) * f.r - dz) < f.size,
    );
    if (r < room - 0.12 && !overHole && !onFurniture) floors.push(floor4);
    // The core stair in the middle: 4th → 5th floor → roof.
    if (r >= 0.2 && r <= 1.02) {
      const c0 = (((a - coreStart) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      for (let k = 0; k < 2; k++) {
        const u = c0 / (Math.PI * 2) + k;
        floors.push(floor4 + u * corePitch);
      }
    }
    // 5th floor (inside its balustrade) and the roof (inside the parapet), open in the middle.
    // 5th floor (inside its balustrade) and the roof (inside the parapet); in the middle only the
    // landing, not over the stair coming up.
    const c1 = (((a - coreStart) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2),
      overCore = r <= T.core - 0.1 && (r < 0.12 || c1 > Math.PI * 2 - coreHole);
    if (!overCore && r < wallAt(floor5) - 0.15) floors.push(floor5);
    if (!overCore && r <= parapet - 0.12) floors.push(T.top);
    return floors;
  };
  /** Is a point inside the tower's closed rooms (for the explore camera)? */
  const insideTower = (p: THREE.Vector3) =>
    Math.hypot(p.x - towerAt.x, p.z - towerAt.z) < wallAt(p.y - towerBase) - T.thick &&
    p.y > towerBase + T.plinth - 0.3 &&
    p.y < towerBase + floor5 - 0.2;
  /** Night glow 0–1 for the tower's lanterns, round window, book lamps and inside lights. */
  const setTowerNight = (night: number) => {
    towerLights.forEach((l) => (l.intensity = 3.2 * night));
    doorLight.intensity = 2.2 * night;
    glow.color.setRGB(0.55 + 0.45 * night, 0.5 + 0.36 * night, 0.42 + 0.2 * night);
    glass.color.set(night > 0.5 ? '#ffcf8a' : '#cfe4ea');
    glass.opacity = night > 0.5 ? 0.45 : 0.22;
    // Dandelion heads glow a warm yellow after dark.
    dandelionNight.value = night;
    mistUniforms.night.value = night;
    seedMaterial.color.setRGB(1, 0.99 - 0.12 * night, 0.96 - 0.4 * night);
    dandelionGlow.visible = night > 0.02;
    (dandelionGlow.material as THREE.ShaderMaterial).uniforms.night.value = night;
    const t = performance.now() / 4000;
    bookLamps.forEach((l, i) => (l.rotation.y += Math.sin(t + i) * 0.0015));
  };
  /** Hang a picture (e.g. Luna's latest Story of Winds photo) in the living-room frame. */
  const setFramePhoto = (texture: THREE.Texture | null) => {
    if (!framePicture) return;
    canvasMaterial.map = texture;
    canvasMaterial.color.set(texture ? '#ffffff' : '#efe7d6');
    canvasMaterial.needsUpdate = true;
  };
  const towerInfo = {
    centre: new THREE.Vector3(towerAt.x, towerBase, towerAt.z),
    floor: towerBase + T.plinth,
    roof: towerBase + floor5,
    radiusAt: (y: number) => wallAt(y - towerBase) - T.thick,
    inside: insideTower,
    /** Where to stand to hang a photo in the frame (world). */
    frame: frameSpot.clone().add(new THREE.Vector3(towerAt.x, towerBase, towerAt.z)),
  };

  // Where Luna can walk outside the café (explore mode): the land, the road, along the river
  // banks and over the footbridge; not into the water, the observatory or tree trunks.
  const trunkSpots = treeSpots.map((m) => new THREE.Vector3().setFromMatrixPosition(m));
  const span = bridgeFar.clone().sub(bridgeNear),
    spanLength = span.length();
  span.divideScalar(spanLength);
  const walkHeight = (x: number, z: number, fromY?: number): number | null => {
    // The whole island is walkable; the open sea beyond is not.
    if (seaOut(x, z) > SEA + 24) return null;
    // Walls and furniture of the player's house; floors lift her a hand's breadth.
    if (lotOutside(x, z) < 2) {
      if (house.collide(x, z)) return null;
      const floor = house.floorAt(x, z);
      if (floor !== null) return floor;
    }
    // The tower: pick the floor Luna can step onto from where she stands (one step up or down).
    // Rocks are solid everywhere (they never sit on the steps).
    for (const rock of rocks) if (Math.hypot(rock.x - x, rock.z - z) < rock.r) return null;
    const floors = towerFloors(x, z);
    if (floors) {
      const options = floors.map((f) => f + towerBase);
      if (fromY === undefined) return options.length ? Math.max(...options) : null;
      const reach = options.filter((y) => y <= fromY + 0.35 && y >= fromY - 0.45);
      return reach.length ? Math.max(...reach) : null;
    }
    if (Math.hypot(signAt.x - x, signAt.z - z) < 0.6) return null;
    // The pier, then the sea (no swimming).
    {
      const px = x - pierFrom.x,
        pz = z - pierFrom.z,
        out = px * away.x + pz * away.z,
        side = Math.abs(px * -away.z + pz * away.x);
      if (out > -0.2 && out < pierLength && side < pierHalf - 0.15) return pierDeck;
    }
    if (seaOut(x, z) > SEA - 14 && height(x, z) < seaLevel + 0.1) return null;
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
    // Sheer rock faces on the high peaks stay out of reach.
    if (y > groundY + 14) {
      const dx = height(x + 1.2, z) - height(x - 1.2, z),
        dz = height(x, z + 1.2) - height(x, z - 1.2);
      if (Math.hypot(dx, dz) / 2.4 > 1.15) return null;
    }
    const across = Math.abs((x - road.origin.x) * roadSide.x + (z - road.origin.z) * roadSide.z);
    return road.surfaceY !== undefined && across < road.halfWidth ? Math.max(y, road.surfaceY) : y;
  };

  // --- Dandelions: little clusters scattered over the meadow, swaying in the wind. ----------
  // Each is a stem with a fluffy white seed head (some still yellow flowers); now and then a seed
  // drifts off on the breeze.
  const dandelionSpots: THREE.Matrix4[] = [],
    bloomSpots: THREE.Matrix4[] = [],
    dandelionNight = { value: 0 };
  {
    const meadow = (x: number, z: number) =>
      Math.hypot(x - center.x, z - center.z) < 130 &&
      lotOutside(x, z) > 4 &&
      height(x, z) < groundY + 8 &&
      flatZone(x, z).roadGap > 1.5 &&
      flatZone(x, z).cafe > 1.5 &&
      pathDistance(x, z) > 1.4 &&
      towerPathDistance(x, z) > 1.4 &&
      riverDistance(x, z) > 5 &&
      seaOut(x, z) < SEA - 16 &&
      !towerFloors(x, z) &&
      !rocks.some((r) => Math.hypot(r.x - x, r.z - z) < r.r + 0.4) &&
      !trunkSpots.some((t) => Math.hypot(t.x - x, t.z - z) < 0.8);
    const m = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      tilt = new THREE.Euler();
    // Clusters near the café first, then further out on the meadow.
    for (let c = 0, tries = 0; c < 56 && tries < 1200; tries++) {
      const a = Math.random() * Math.PI * 2,
        r = (c < 14 ? 6 : 14) + Math.random() * (c < 14 ? 14 : 110),
        cx = center.x + Math.cos(a) * r,
        cz = center.z + Math.sin(a) * r;
      if (!meadow(cx, cz)) continue;
      c++;
      const count = 6 + Math.floor(Math.random() * 10);
      for (let i = 0; i < count; i++) {
        const d = Math.sqrt(Math.random()) * 1.8,
          b = Math.random() * Math.PI * 2,
          x = cx + Math.cos(b) * d,
          z = cz + Math.sin(b) * d;
        if (!meadow(x, z)) continue;
        q.setFromEuler(tilt.set((Math.random() - 0.5) * 0.25, b, (Math.random() - 0.5) * 0.25));
        const size = 0.8 + Math.random() * 0.5;
        m.compose(
          new THREE.Vector3(x, height(x, z) - 0.02, z),
          q,
          new THREE.Vector3(size, size, size),
        );
        (Math.random() < 0.25 ? bloomSpots : dandelionSpots).push(m.clone());
      }
    }
    // One merged geometry per kind (stem + head), coloured per vertex.
    const coloured = (g: THREE.BufferGeometry, color: string) => {
      const c = new THREE.Color(color),
        n = g.attributes.position.count;
      g.setAttribute(
        'color',
        new THREE.BufferAttribute(
          new Float32Array(n * 3).map((_, i) => [c.r, c.g, c.b][i % 3]),
          3,
        ),
      );
      return g.index ? g.toNonIndexed() : g;
    };
    const stem = () =>
      coloured(
        new THREE.CylinderGeometry(0.007, 0.01, 0.34, 4, 1).translate(0, 0.17, 0),
        '#6f9a4a',
      );
    const leaves = () =>
      coloured(
        new THREE.ConeGeometry(0.05, 0.12, 4, 1).scale(1.4, 1, 0.35).translate(0, 0.05, 0),
        '#5f8a3e',
      );
    const puff = mergeGeometries([
      stem(),
      leaves(),
      coloured(new THREE.IcosahedronGeometry(0.055, 1).translate(0, 0.37, 0), '#fbfaf4'),
      coloured(new THREE.SphereGeometry(0.014, 6, 4).translate(0, 0.37, 0), '#d8d3b8'),
    ])!;
    const bloom = mergeGeometries([
      stem(),
      leaves(),
      coloured(
        new THREE.CylinderGeometry(0.045, 0.02, 0.03, 10, 1).translate(0, 0.35, 0),
        '#f6c531',
      ),
      coloured(new THREE.SphereGeometry(0.018, 6, 4).translate(0, 0.365, 0), '#eaa51c'),
    ])!;
    geometries.push(puff, bloom);
    const dandelionMaterial = new THREE.MeshToonMaterial({
      vertexColors: true,
      gradientMap: toonGradient(),
    });
    dandelionMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.windTime = windTime;
      shader.uniforms.dandelionNight = dandelionNight;
      // Heads (the pale and yellow parts; stems are green) light up warm at night.
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float dandelionNight;')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          float flowerHead = step(0.75, vColor.r) * dandelionNight;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.7, 0.22), flowerHead);
          totalEmissiveRadiance += vec3(0.95, 0.55, 0.12) * flowerHead * 0.75;`,
        );
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float windTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 flowerBase = instanceMatrix[3].xyz;
          #else
            vec3 flowerBase = vec3(0.0);
          #endif
          float bend = transformed.y * transformed.y * 2.2;
          transformed.x += sin(windTime * 1.7 + flowerBase.x * 0.9 + flowerBase.z * 0.6) * 0.09 * bend;
          transformed.z += cos(windTime * 1.3 + flowerBase.z * 0.8) * 0.05 * bend;`,
        );
    };
    dandelionMaterial.customProgramCacheKey = () => 'world-dandelion-wind';
    islandFade(dandelionMaterial);
    materials.push(dandelionMaterial);
    for (const [geometry, spots, name] of [
      [puff, dandelionSpots, 'World_Dandelions'],
      [bloom, bloomSpots, 'World_Dandelion_Blooms'],
    ] as const) {
      if (!spots.length) continue;
      const flowers = new THREE.InstancedMesh(geometry, dandelionMaterial, spots.length);
      flowers.name = name;
      spots.forEach((spot, i) => flowers.setMatrixAt(i, spot));
      flowers.instanceMatrix.needsUpdate = true;
      flowers.computeBoundingSphere();
      group.add(flowers);
    }
  }
  // The player's house (free build mode) on its lot: remembered between visits.
  const house = createHouseBuilder({
    origin: lotOrigin,
    xAxis: lotX,
    zAxis: lotZ,
    cols: LOT.cols,
    rows: LOT.rows,
    y: lotY,
  });
  house.setData(loadHouse(LOT.cols, LOT.rows));
  group.add(house.group);
  let saveTimer = 0;

  // --- Mountain-foot mist: thin, slow-drifting haze lying along the foot of the mountains, hugging
  // the slopes in a few layers, so the mountains rise out of a sea of clouds. Gone from the café.
  const mistUniforms = { time: windTime, night: { value: 0 } };
  {
    const STEP = 4,
      uMin = -ISLAND.halfAlong + 8,
      uMax = ISLAND.halfAlong - 8,
      wMin = 100,
      wMax = 190,
      cols = Math.round((uMax - uMin) / STEP),
      rows = Math.round((wMax - wMin) / STEP);
    const heights = new Float32Array((cols + 1) * (rows + 1)),
      band = new Float32Array((cols + 1) * (rows + 1));
    const flat = new Float32Array((cols + 1) * (rows + 1) * 3);
    for (let j = 0; j <= rows; j++)
      for (let i = 0; i <= cols; i++) {
        const u = uMin + i * STEP,
          w = wMin + j * STEP,
          x = road.origin.x + roadDir.x * u - away.x * w,
          z = road.origin.z + roadDir.z * u - away.z * w,
          k = j * (cols + 1) + i;
        heights[k] = Math.max(height(x, z), seaLevel + 0.4);
        // Thickest at the foot (around w = 146), thinning toward the meadow and the slopes, and
        // gone at the island's side coasts.
        band[k] =
          (1 - THREE.MathUtils.smoothstep(Math.abs(w - 146), 12, 42)) *
          (1 - THREE.MathUtils.smoothstep(seaOut(x, z), SEA - 26, SEA - 8));
        flat.set([x, 0, z], k * 3);
      }
    const indices: number[] = [];
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const a = j * (cols + 1) + i,
          b = a + 1,
          c = a + cols + 1,
          d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    [0.55, 1.5, 2.6].forEach((lift, layer) => {
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(flat.length);
      for (let k = 0; k < heights.length; k++)
        pos.set([flat[k * 3], heights[k] + lift, flat[k * 3 + 2]], k * 3);
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('band', new THREE.BufferAttribute(band, 1));
      g.setIndex(indices);
      geometries.push(g);
      const m = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { ...mistUniforms, layer: { value: layer } },
        vertexShader: `
          attribute float band;
          varying vec2 vXZ;
          varying float vBand, vGraze, vY;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vXZ = w.xz;
            vY = w.y;
            vBand = band;
            // Mist reads thicker looking across it than looking straight down through it.
            vGraze = 1.0 - abs(normalize(w.xyz - cameraPosition).y);
            gl_Position = projectionMatrix * viewMatrix * w;
          }`,
        fragmentShader: `
          uniform float time, night, layer;
          varying vec2 vXZ;
          varying float vBand, vGraze, vY;
          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                       mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
          }
          void main() {
            vec2 drift = vec2(time * (0.07 + layer * 0.02), time * (0.035 - layer * 0.01));
            vec2 p = vXZ * 0.045 + drift * 0.18 + layer * 13.0;
            float n = noise(p) * 0.55 + noise(p * 2.3 - drift * 0.3) * 0.3 + noise(p * 5.1) * 0.15;
            float density = smoothstep(0.3, 0.74, n);
            // Thin out where the camera is right inside the layer, so it never slices the view.
            float inside = smoothstep(0.1, 1.2, abs(cameraPosition.y - vY));
            float a = density * vBand * inside * (0.05 + 0.2 * vGraze * vGraze) * (1.0 - layer * 0.12);
            vec3 colour = mix(vec3(0.97, 0.98, 1.0), vec3(0.56, 0.58, 0.78), night);
            gl_FragColor = vec4(colour, a * (1.0 - 0.35 * night));
          }`,
      });
      materials.push(m);
      const layerMesh = new THREE.Mesh(g, m);
      layerMesh.name = 'World_Mist_' + layer;
      layerMesh.renderOrder = 3;
      layerMesh.frustumCulled = false;
      group.add(layerMesh);
    });
  }
  // Seeds blowing away: each one leaves a random seed head, floats up and off, then starts again.
  const SEEDS = 36;
  const seedGeometry = new THREE.BufferGeometry();
  seedGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SEEDS * 3), 3));
  const seedMaterial = new THREE.PointsMaterial({
    color: '#fffdf4',
    size: 0.05,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  geometries.push(seedGeometry);
  materials.push(seedMaterial);
  const seeds = new THREE.Points(seedGeometry, seedMaterial);
  seeds.frustumCulled = false;
  seeds.name = 'World_Dandelion_Seeds';
  group.add(seeds);
  // A soft warm halo around every flower head at night.
  const headTops = [...dandelionSpots, ...bloomSpots].map((m) =>
    new THREE.Vector3(0, 0.37, 0).applyMatrix4(m),
  );
  const glowGeometry = new THREE.BufferGeometry().setFromPoints(headTops);
  const dandelionGlow = new THREE.Points(
    glowGeometry,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { night: { value: 0 }, windTime },
      vertexShader: `
        uniform float windTime;
        void main() {
          vec3 p = position;
          p.x += sin(windTime * 1.7 + p.x * 0.9 + p.z * 0.6) * 0.03;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = clamp(240.0 / max(1.0, -mv.z), 3.0, 90.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float night;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          if (d > 1.0) discard;
          gl_FragColor = vec4(1.0, 0.74, 0.3, exp(-d * d * 3.5) * 0.6 * night);
        }`,
    }),
  );
  dandelionGlow.name = 'World_Dandelion_Glow';
  dandelionGlow.frustumCulled = false;
  dandelionGlow.visible = false;
  geometries.push(glowGeometry);
  materials.push(dandelionGlow.material as THREE.Material);
  group.add(dandelionGlow);
  const seedFrom = Array.from({ length: SEEDS }, () => new THREE.Vector3()),
    seedLife = Float32Array.from({ length: SEEDS }, () => Math.random() * 12);
  const seedStart = (i: number) => {
    const spot = dandelionSpots[Math.floor(Math.random() * dandelionSpots.length)];
    if (spot) seedFrom[i].setFromMatrixPosition(spot).add(new THREE.Vector3(0, 0.4, 0));
  };
  seedFrom.forEach((_, i) => seedStart(i));
  let lastSeedTime = 0;
  const updateSeeds = (time: number) => {
    const dt = Math.min(0.1, Math.max(0, time - lastSeedTime));
    lastSeedTime = time;
    seeds.visible = dandelionSpots.length > 0;
    if (!seeds.visible) return;
    const p = seedGeometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < SEEDS; i++) {
      seedLife[i] += dt;
      if (seedLife[i] > 12) {
        seedLife[i] = 0;
        seedStart(i);
      }
      const t = seedLife[i],
        f = seedFrom[i];
      p.setXYZ(
        i,
        f.x + t * 0.55 + Math.sin(t * 1.3 + i) * 0.25,
        f.y + Math.sqrt(t) * 0.9 + Math.sin(t * 2.1 + i * 2) * 0.12,
        f.z + t * 0.25 + Math.cos(t * 1.1 + i) * 0.25,
      );
    }
    p.needsUpdate = true;
  };

  return {
    group,
    terrain,
    walkHeight,
    /** The observatory (for camera collision: Luna can climb inside it). */
    tower,
    towerInfo,
    setTowerNight,
    setFramePhoto,
    /** Points along the footpaths and the bridge, where fireflies like to gather at night. */
    fireflyTrails: [
      ...towerPathPoints.filter((_, i) => i % 3 === 0),
      ...Array.from({ length: 14 }, (_, i) => roadEdge.clone().lerp(bridgeNear, i / 13)),
      ...Array.from({ length: 8 }, (_, i) => bridgeNear.clone().lerp(bridgeFar, i / 7)),
      ...Array.from({ length: 10 }, (_, i) => bridgeFar.clone().lerp(pathEnd, i / 9)),
    ].map((p) => new THREE.Vector3(p.x, height(p.x, p.z), p.z)),
    /** Ground height under a point (for placing things on the world). */
    heightAt: height,
    /**
     * Places for Luna to settle (world seat point, the way she faces, lying or not): the piano
     * stool, the guitar's and cello's stools, the sofa, and the end of the pier.
     */
    restSpots: (() => {
      tower.updateMatrixWorld(true);
      const out: Record<string, { position: THREE.Vector3; heading: number; lie: boolean }> = {};
      for (const [name, spot] of Object.entries(playSpots))
        out[name] = {
          position: tower.localToWorld(spot.local.clone()),
          heading: spot.heading,
          lie: !!spot.lie,
        };
      // Sitting on the pier's end, legs over the water, looking out to sea.
      out.pier = {
        position: pierFrom
          .clone()
          .addScaledVector(away, pierLength - 0.12)
          .setY(pierDeck),
        heading: Math.atan2(away.x, away.z),
        lie: false,
      };
      return out;
    })(),
    /** The guitar and cello on their stands, and a fresh one for Luna to hold. */
    instruments: {
      standing: standingInstruments,
      held: (kind: 'guitar' | 'cello') => heldInstruments[kind]?.() ?? null,
    },
    /**
     * Which part of the island a point is in (for the open-world map): ids are listed in
     * lib/windstopia-map.ts.
     */
    regionAt(x: number, z: number, y?: number): string {
      if (Math.hypot(x - towerAt.x, z - towerAt.z) < 11) return 'menara';
      if (lotOutside(x, z) < 1.5) return 'lahan';
      const px = x - pierFrom.x,
        pz = z - pierFrom.z,
        out = px * away.x + pz * away.z,
        side = Math.abs(px * -away.z + pz * away.x);
      if (out > -3 && out < pierLength + 4 && side < pierHalf + 3) return 'dermaga';
      const dx = Math.max(bounds.min.x - x, 0, x - bounds.max.x),
        dz = Math.max(bounds.min.z - z, 0, z - bounds.max.z);
      if (Math.hypot(dx, dz) < 1.5) return 'kafe';
      if (insideLake(x, z) || Math.hypot(x - lakeCentre.x, z - lakeCentre.z) < 11) return 'danau';
      const gap = flatZone(x, z).roadGap;
      if (gap < 1.2) return 'jalan';
      if (riverDistance(x, z) < 6) return 'sungai';
      const w = wOf(x, z),
        u = uOf(x, z);
      if (seaOut(x, z) > SEA - 14)
        return w < islandMid - 20
          ? 'pantai-depan'
          : w > islandMid + 20
            ? 'pantai-belakang'
            : u < 0
              ? 'pantai-kiri'
              : 'pantai-kanan';
      const alt = (y ?? height(x, z)) - groundY;
      if (alt > 22) return 'puncak';
      if (w > 170 || alt > 10) return 'pegunungan';
      if (w > 130) return 'kaki-gunung';
      return 'padang';
    },
    /** The player's house and its lot (free build mode). */
    build: {
      house,
      lot: { centre: lotCentre.clone(), cols: LOT.cols, rows: LOT.rows, y: lotY },
      /** Replace the house and remember it. */
      set(data: HouseData) {
        house.setData(data);
        window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(() => saveHouse(data), 400);
      },
      near(x: number, z: number, within = 9) {
        return lotOutside(x, z) < within;
      },
    },
    /** What the ground is made of here (for footstep sounds). */
    surfaceAt(
      x: number,
      z: number,
    ): 'grass' | 'asphalt' | 'gravel' | 'sand' | 'wood' | 'stone' | 'tile' {
      if (towerFloors(x, z)) return 'stone';
      if (lotOutside(x, z) < 1 && house.floorAt(x, z) !== null) {
        const f =
          house.data.floors[
            `${Math.floor(house.toLocal(x, z).x)},${Math.floor(house.toLocal(x, z).z)}`
          ];
        return f === 2 || f === 3 || f === 4 ? 'tile' : f === 7 || f === 8 ? 'stone' : 'wood';
      }
      {
        const px = x - pierFrom.x,
          pz = z - pierFrom.z,
          out = px * away.x + pz * away.z,
          side = Math.abs(px * -away.z + pz * away.x);
        if (out > -0.2 && out < pierLength && side < pierHalf) return 'wood';
      }
      const rx = x - bridgeNear.x,
        rz = z - bridgeNear.z,
        t = (rx * span.x + rz * span.z) / spanLength,
        side = rx * bridgeAlong.x + rz * bridgeAlong.z;
      if (t > -0.03 && t < 1.03 && Math.abs(side) < 0.7) return 'wood';
      if (flatZone(x, z).roadGap < -1.1) return 'asphalt';
      if (seaOut(x, z) > SEA - 12) return 'sand';
      // The marble path up to the tower; the dirt path to the bridge.
      if (towerPathDistance(x, z) < 1.0) return 'stone';
      if (pathDistance(x, z) < 0.8) return 'gravel';
      return 'grass';
    },
    /** How far to the sea's shore (negative out at sea) and to the river/streams. */
    waterNear(x: number, z: number) {
      return { sea: SEA - 8 - seaOut(x, z), river: riverDistance(x, z) };
    },
    update(time: number) {
      updateWorld(time);
      updateSeeds(time);
    },
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
