// Sky for the café scene, matching Windstronout: the telescope's atmosphere and clouds, the real
// star field for Pangkajene at the current time, and a sun/moon whose positions drive the lighting.
// A time-of-day preset can replace the real sun (fajar, pagi, siang, sore, senja, malam).
import * as THREE from 'three';
import * as Astro from 'astronomy-engine';
import { createSkyAtmosphere } from './sky-landscape';

const OBSERVER = new Astro.Observer(-4.8499, 119.5885, 10),
  D = Math.PI / 180;

export type SkyPhase = 'live' | 'fajar' | 'pagi' | 'siang' | 'sore' | 'senja' | 'malam';
export const SKY_PHASES: { id: SkyPhase; label: string }[] = [
  { id: 'live', label: 'Live' },
  { id: 'fajar', label: 'Fajar' },
  { id: 'pagi', label: 'Pagi' },
  { id: 'siang', label: 'Siang' },
  { id: 'sore', label: 'Sore' },
  { id: 'senja', label: 'Senja' },
  { id: 'malam', label: 'Malam' },
];
/** Sun azimuth/altitude (degrees) for each preset; azimuth 90 = east, 270 = west. */
const PRESET_SUN: Record<Exclude<SkyPhase, 'live'>, [number, number]> = {
  fajar: [100, -3],
  pagi: [95, 18],
  siang: [140, 72],
  sore: [255, 28],
  senja: [262, 2.5],
  malam: [300, -35],
};

/** Same horizontal → world mapping as the telescope (app/sky-viewer.tsx). */
const toWorld = (h: Astro.Vector) => new THREE.Vector3(-h.y, h.z, -h.x);
const fromAzAlt = (az: number, alt: number) => {
  const a = az * D,
    h = alt * D;
  // Horizontal frame: x north, y west, z up (astronomy-engine), then toWorld.
  return toWorld(
    new Astro.Vector(
      Math.cos(h) * Math.cos(a),
      -Math.cos(h) * Math.sin(a),
      Math.sin(h),
      Astro.MakeTime(new Date()),
    ),
  ).normalize();
};

export type SkyState = {
  sun: THREE.Vector3;
  moon: THREE.Vector3;
  /** Sun altitude in degrees. */
  altitude: number;
  daylight: number;
  twilight: number;
  /** 1 at full night, 0 in daylight. */
  night: number;
  /** Golden-hour warmth, 0–1. */
  warm: number;
  phase: Exclude<SkyPhase, 'live'>;
};

export function phaseOf(altitude: number, sun: THREE.Vector3): Exclude<SkyPhase, 'live'> {
  // World x points east in this frame (toWorld above), so a positive x means a morning sun.
  const morning = sun.x > 0;
  if (altitude < -10) return 'malam';
  if (altitude < 4) return morning ? 'fajar' : 'senja';
  if (altitude < 30) return morning ? 'pagi' : 'sore';
  return 'siang';
}

export function createCafeSky(radius = 85) {
  const group = new THREE.Group();
  group.name = 'Cafe_Sky';
  const atmosphere = createSkyAtmosphere();
  atmosphere.mesh.scale.setScalar(radius / 126);
  atmosphere.material.uniforms.strength.value = 1;
  // The telescope writes these colours straight to the screen; the café renders in linear space
  // (lib/toon.ts converts at the end), so convert here to land on the same colours.
  atmosphere.material.fragmentShader = atmosphere.material.fragmentShader.replace(
    'gl_FragColor=vec4(color,opacity*strength);',
    'gl_FragColor=vec4(pow(max(color,vec3(0.)),vec3(2.2)),opacity*strength);',
  );
  group.add(atmosphere.mesh);

  // Stars sit just inside the atmosphere, which fades them by day.
  let stars: THREE.Points | undefined;
  const starMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { scale: { value: 1 }, visibility: { value: 0 } },
    vertexShader:
      'attribute float size; attribute vec3 color; varying vec3 tint; uniform float scale; void main(){tint=color;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_PointSize=size*scale;}',
    fragmentShader:
      'uniform float visibility;varying vec3 tint;void main(){float d=length(gl_PointCoord-0.5)*2.0;if(d>1.0)discard;float a=exp(-d*d*4.0)*(1.0-smoothstep(.65,1.0,d));vec3 stellar=mix(vec3(1.),tint,.35);gl_FragColor=vec4(stellar,a*visibility);\n#include <colorspace_fragment>\n}',
  });
  let starGeometry: THREE.BufferGeometry | undefined;
  const abort = new AbortController();
  void fetch('/sky/stars.json', { signal: abort.signal })
    .then((r) => (r.ok ? (r.json() as Promise<number[][]>) : Promise.reject()))
    .then((catalog: number[][]) => {
      const positions: number[] = [],
        colors: number[] = [],
        sizes: number[] = [],
        r = radius * 0.94;
      for (const star of catalog) {
        if (star[3] > 5.2) continue; // naked-eye stars only keep the point count small
        const ra = star[1] * D,
          dec = star[2] * D;
        positions.push(
          Math.cos(dec) * Math.cos(ra) * r,
          Math.cos(dec) * Math.sin(ra) * r,
          Math.sin(dec) * r,
        );
        const color = new THREE.Color(
          star[4] < 0.1 ? '#b7d5ff' : star[4] > 0.9 ? '#ffcb9d' : '#fff4df',
        );
        colors.push(color.r, color.g, color.b);
        sizes.push(THREE.MathUtils.clamp(1.2 + (6 - star[3]) * 0.6, 1.3, 6));
      }
      starGeometry = new THREE.BufferGeometry();
      starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      starGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      starGeometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
      stars = new THREE.Points(starGeometry, starMaterial);
      stars.matrixAutoUpdate = false;
      stars.frustumCulled = false;
      stars.renderOrder = -3;
      group.add(stars);
      lastRotation = 0;
    })
    .catch(() => {});

  // Moon: a soft glowing disc facing the camera.
  const moonCanvas = document.createElement('canvas');
  moonCanvas.width = moonCanvas.height = 128;
  {
    const x = moonCanvas.getContext('2d')!,
      g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,250,232,1)');
    g.addColorStop(0.32, 'rgba(255,246,220,1)');
    g.addColorStop(0.36, 'rgba(255,240,210,0.35)');
    g.addColorStop(1, 'rgba(255,240,210,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
  }
  const moonTexture = new THREE.CanvasTexture(moonCanvas);
  moonTexture.colorSpace = THREE.SRGBColorSpace;
  const moonMaterial = new THREE.SpriteMaterial({
    map: moonTexture,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const moonSprite = new THREE.Sprite(moonMaterial);
  moonSprite.scale.setScalar(radius * 0.09);
  moonSprite.renderOrder = -2;
  group.add(moonSprite);

  // Sun: a bright disc with a soft halo, bigger and orange near the horizon.
  const glowTexture = (stops: [number, string][]) => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d')!,
      g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    for (const [at, color] of stops) g.addColorStop(at, color);
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const sunTexture = glowTexture([
      [0, 'rgba(255,255,255,1)'],
      [0.18, 'rgba(255,255,255,1)'],
      [0.22, 'rgba(255,255,255,0.55)'],
      [0.45, 'rgba(255,255,255,0.16)'],
      [1, 'rgba(255,255,255,0)'],
    ]),
    flareTexture = glowTexture([
      [0, 'rgba(255,255,255,0.0)'],
      [0.55, 'rgba(255,255,255,0.12)'],
      [0.82, 'rgba(255,255,255,0.4)'],
      [1, 'rgba(255,255,255,0)'],
    ]),
    dotTexture = glowTexture([
      [0, 'rgba(255,255,255,0.9)'],
      [0.4, 'rgba(255,255,255,0.35)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
  const sunMaterial = new THREE.SpriteMaterial({
    map: sunTexture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const sunSprite = new THREE.Sprite(sunMaterial);
  sunSprite.renderOrder = -1;
  group.add(sunSprite);
  // Lens flare: ghosts along the line from the sun through the centre of the view.
  const flares = [
    { at: 0.35, size: 0.05, texture: dotTexture, color: '#ffe6b8', opacity: 0.35 },
    { at: 0.62, size: 0.11, texture: flareTexture, color: '#bfe3ff', opacity: 0.45 },
    { at: 0.9, size: 0.035, texture: dotTexture, color: '#ffd59a', opacity: 0.4 },
    { at: 1.25, size: 0.16, texture: flareTexture, color: '#ffc6a0', opacity: 0.35 },
    { at: 1.6, size: 0.06, texture: dotTexture, color: '#d6f0ff', opacity: 0.3 },
  ].map((f) => {
    const material = new THREE.SpriteMaterial({
      map: f.texture,
      color: f.color,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.renderOrder = 10;
    sprite.visible = false;
    return { ...f, base: new THREE.Color(f.color), material, sprite };
  });
  const flareGroup = new THREE.Group();
  flares.forEach((f) => flareGroup.add(f.sprite));
  let flareFade = 0;
  const sunNdc = new THREE.Vector3(),
    flarePoint = new THREE.Vector3(),
    sunWorld = new THREE.Vector3(),
    SUN_WHITE = new THREE.Color('#fff6dc'),
    SUN_DUSK = new THREE.Color('#ffa63d');

  const state: SkyState = {
    sun: new THREE.Vector3(0, 1, 0),
    moon: new THREE.Vector3(0, -1, 0),
    altitude: 45,
    daylight: 1,
    twilight: 0,
    night: 0,
    warm: 0,
    phase: 'siang',
  };
  let lastRotation = -Infinity;
  const targetSun = new THREE.Vector3();

  return {
    group,
    state,
    /** Call each frame. `dt` in seconds; presets ease the sun across the sky. */
    /** Lens flare sprites; add to the scene (they are placed in front of the camera). */
    flareGroup,
    update(
      camera: THREE.Camera,
      phase: SkyPhase,
      time: number,
      dt: number,
      reduced: boolean,
      /** True while something (café, hill, mountain) stands between the camera and the sun. */
      sunBlocked = false,
    ) {
      group.position.copy(camera.position);
      const now = new Date();
      // Stars and the real sun/moon move slowly: recompute twice a second.
      if (time - lastRotation > 0.5) {
        lastRotation = time;
        const rotation = Astro.Rotation_EQJ_HOR(now, OBSERVER);
        if (stars) {
          const at = Astro.MakeTime(now);
          const basis = [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
          ].map((v) =>
            toWorld(Astro.RotateVector(rotation, new Astro.Vector(v[0], v[1], v[2], at))),
          );
          stars.matrix.makeBasis(basis[0], basis[1], basis[2]);
          stars.matrixWorldNeedsUpdate = true;
        }
        const sunEq = Astro.Equator(Astro.Body.Sun, now, OBSERVER, false, true),
          moonEq = Astro.Equator(Astro.Body.Moon, now, OBSERVER, false, true);
        state.moon.copy(toWorld(Astro.RotateVector(rotation, moonEq.vec))).normalize();
        if (phase === 'live')
          targetSun.copy(toWorld(Astro.RotateVector(rotation, sunEq.vec))).normalize();
      }
      if (phase !== 'live') targetSun.copy(fromAzAlt(...PRESET_SUN[phase]));
      // Glide toward the new sun so switching presets feels like time passing.
      if (state.sun.angleTo(targetSun) > 0.0005)
        state.sun.lerp(targetSun, reduced ? 1 : 1 - Math.exp(-dt * 2.2)).normalize();
      const altitude = Math.asin(THREE.MathUtils.clamp(state.sun.y, -1, 1)) / D;
      state.altitude = altitude;
      state.daylight = THREE.MathUtils.smoothstep(altitude, -6, 6);
      state.twilight =
        THREE.MathUtils.smoothstep(altitude, -18, -3) *
        (1 - THREE.MathUtils.smoothstep(altitude, 0, 8));
      state.night = 1 - THREE.MathUtils.smoothstep(altitude, -12, -2);
      state.warm =
        (1 - THREE.MathUtils.smoothstep(altitude, 6, 26)) *
        THREE.MathUtils.smoothstep(altitude, -10, -1);
      state.phase = phaseOf(altitude, state.sun);

      const u = atmosphere.material.uniforms;
      u.sunDirection.value.copy(state.sun);
      u.daylight.value = state.daylight;
      u.twilight.value = state.twilight;
      u.cloudTime.value = reduced ? 0 : time;
      // Clouds from sunrise until the sun's disc has set.
      u.cloudVisibility.value = THREE.MathUtils.smoothstep(altitude, -6, -0.833);
      starMaterial.uniforms.visibility.value = 1 - THREE.MathUtils.smoothstep(altitude, -14, -1);
      starMaterial.uniforms.scale.value = Math.min(2, window.devicePixelRatio || 1);
      // Sun disc: whiter and smaller high up, larger and orange-gold near the horizon.
      const low = 1 - THREE.MathUtils.smoothstep(altitude, 2, 22);
      sunSprite.position.copy(state.sun).multiplyScalar(radius * 0.88);
      sunSprite.scale.setScalar(radius * (0.11 + 0.09 * low));
      sunMaterial.color.copy(SUN_WHITE).lerp(SUN_DUSK, low);
      sunMaterial.opacity = THREE.MathUtils.smoothstep(altitude, -2.5, 0.5);
      sunSprite.visible = sunMaterial.opacity > 0.01;
      // Flare only while the sun is on screen and above the horizon.
      sunWorld.copy(camera.position).addScaledVector(state.sun, radius * 0.88);
      sunNdc.copy(sunWorld).project(camera);
      const onScreen =
        sunNdc.z < 1 &&
        Math.abs(sunNdc.x) < 1.1 &&
        Math.abs(sunNdc.y) < 1.1 &&
        altitude > -1 &&
        !reduced;
      flareFade += ((sunBlocked ? 0 : 1) - flareFade) * Math.min(1, dt * 8);
      const strength = onScreen
        ? THREE.MathUtils.smoothstep(altitude, -1, 3) *
          (1 - THREE.MathUtils.smoothstep(Math.hypot(sunNdc.x, sunNdc.y), 0.8, 1.15)) *
          flareFade
        : 0;
      for (const f of flares) {
        f.sprite.visible = strength > 0.01;
        if (!f.sprite.visible) continue;
        flarePoint.set(sunNdc.x * (1 - f.at * 2), sunNdc.y * (1 - f.at * 2), 0.2).unproject(camera);
        const distance = flarePoint.distanceTo(camera.position);
        f.sprite.position.copy(flarePoint);
        f.sprite.scale.setScalar(distance * f.size * (1 + low * 0.4));
        f.material.opacity = f.opacity * strength;
        f.material.color.copy(f.base).lerp(SUN_DUSK, low * 0.4);
      }
      moonSprite.position.copy(state.moon).multiplyScalar(radius * 0.9);
      moonSprite.visible = state.moon.y > -0.02;
      moonMaterial.opacity =
        (0.35 + 0.65 * state.night) * THREE.MathUtils.smoothstep(state.moon.y, -0.02, 0.05);
    },
    /** Horizon colour for fog: the atmosphere shader's colour at the horizon (given in sRGB). */
    horizon(target: THREE.Color) {
      const { daylight, twilight, warm } = state;
      const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
      let c = mix([0.025, 0.035, 0.055], [0.47, 0.3, 0.19], twilight);
      c = mix(c, [0.68, 0.7, 0.59], daylight);
      if (warm > 0) c = mix(c, [0.86, 0.6, 0.42], warm * daylight * 0.5);
      return target.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
    },
    dispose() {
      abort.abort();
      atmosphere.geometry.dispose();
      atmosphere.material.dispose();
      starGeometry?.dispose();
      starMaterial.dispose();
      moonTexture.dispose();
      [sunTexture, flareTexture, dotTexture].forEach((t) => t.dispose());
      sunMaterial.dispose();
      flares.forEach((f) => f.material.dispose());
      flareGroup.removeFromParent();
      moonMaterial.dispose();
      group.removeFromParent();
    },
  };
}
