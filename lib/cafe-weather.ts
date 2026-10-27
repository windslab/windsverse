// Rainy spells over the café, coming and going step by step: the sky clouds over, a fine drizzle
// starts and grows into a downpour (with lightning in the clouds), eases back to drizzle, the
// clouds slowly clear, and a soft rainbow shows in the fresh sky before it is clear again.
// Cheap: one LineSegments draw for the rain, one plane for the storm clouds, a short zigzag line
// for the lightning and one ring for the rainbow.
import * as THREE from 'three';

export type WeatherState = {
  /** 0–1: how heavily it is raining (eases in and out). */
  rain: number;
  /** 0–1: how grey the sky is (comes a little before the rain and stays a little after). */
  overcast: number;
  /** 0–1: lightning brightness this frame. */
  flash: number;
  /** 0–1: the fresh, just-rained sky (rainbow time). */
  after: number;
  /** Name of the current step of the spell (cerah, mendung, gerimis, deras, …). */
  stage: string;
  /** Counts lightning strikes (for thunder) and where the last one was. */
  strikes: number;
  strikePoint: THREE.Vector3;
};

/**
 * One rainy spell, step by step. Each step eases from where the last one ended to its own values
 * over `ease` seconds (default: its whole length), then holds.
 */
type Step = {
  name: string;
  length: [number, number];
  rain: number;
  overcast: number;
  after: number;
  ease?: number;
};
const SPELL: Step[] = [
  { name: 'cerah', length: [150, 330], rain: 0, overcast: 0, after: 0, ease: 40 },
  { name: 'mendung', length: [30, 45], rain: 0, overcast: 0.85, after: 0 },
  { name: 'gerimis', length: [25, 40], rain: 0.22, overcast: 0.92, after: 0 },
  { name: 'makin deras', length: [25, 35], rain: 1, overcast: 1, after: 0 },
  { name: 'deras', length: [40, 80], rain: 1, overcast: 1, after: 0 },
  { name: 'mereda', length: [25, 35], rain: 0.22, overcast: 0.92, after: 0 },
  { name: 'gerimis akhir', length: [20, 30], rain: 0.18, overcast: 0.85, after: 0 },
  { name: 'berhenti', length: [35, 50], rain: 0, overcast: 0.35, after: 1 },
  { name: 'pasca hujan', length: [45, 70], rain: 0, overcast: 0, after: 1 },
];

const DROPS = 3200,
  SPREAD = 18,
  HEIGHT = 22;

export function createWeather(groundY: number) {
  const group = new THREE.Group();
  group.name = 'World_Weather';
  const rand = Math.random;

  // --- Rain: streaks that wrap around the camera so it always rains wherever you look. -------
  const base = new Float32Array(DROPS * 2 * 3),
    tip = new Float32Array(DROPS * 2),
    seed = new Float32Array(DROPS * 2);
  for (let i = 0; i < DROPS; i++) {
    const x = (rand() * 2 - 1) * SPREAD,
      y = rand() * HEIGHT,
      z = (rand() * 2 - 1) * SPREAD;
    for (let k = 0; k < 2; k++) {
      base.set([x, y, z], (i * 2 + k) * 3);
      tip[i * 2 + k] = k;
      seed[i * 2 + k] = i / DROPS;
    }
  }
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute('position', new THREE.BufferAttribute(base, 3));
  rainGeometry.setAttribute('tip', new THREE.BufferAttribute(tip, 1));
  rainGeometry.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const rainMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      fall: { value: 0 },
      density: { value: 0 },
      streak: { value: 0.55 },
      centre: { value: new THREE.Vector3() },
      opacity: { value: 0 },
      flash: { value: 0 },
    },
    vertexShader: `
      attribute float tip, seed;
      uniform float fall, density, streak;
      uniform vec3 centre;
      varying float fade;
      void main() {
        // World-fixed drops, wrapped into a box around the camera as it moves.
        vec3 p = position;
        float span = ${(SPREAD * 2).toFixed(1)}, h = ${HEIGHT.toFixed(1)};
        float x = centre.x + mod(p.x - centre.x + span * 0.5, span) - span * 0.5;
        float z = centre.z + mod(p.z - centre.z + span * 0.5, span) - span * 0.5;
        float y = centre.y - h * 0.45 + mod(p.y - fall - centre.y, h);
        // Drizzle shows only a few short drops; a downpour all of them, long.
        vec3 w = vec3(x + tip * 0.05 * streak, y + tip * streak, z + tip * 0.03 * streak);
        vec4 mv = viewMatrix * vec4(w, 1.0);
        fade = (1.0 - smoothstep(7.0, ${SPREAD.toFixed(1)}, length(w.xz - centre.xz))) *
          smoothstep(0.4, 2.0, -mv.z) * step(seed, density);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float opacity, flash;
      varying float fade;
      void main() {
        gl_FragColor = vec4(mix(vec3(0.72, 0.78, 0.86), vec3(1.0), flash), 0.42 * opacity * fade);
      }`,
  });
  const rain = new THREE.LineSegments(rainGeometry, rainMaterial);
  rain.frustumCulled = false;
  rain.visible = false;
  group.add(rain);

  // --- Storm clouds: a dark, lumpy deck overhead that glows where lightning strikes. ---------
  const cloudMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      time: { value: 0 },
      overcast: { value: 0 },
      night: { value: 0 },
      flash: { value: 0 },
      flashAt: { value: new THREE.Vector2() },
    },
    vertexShader: `
      varying vec2 world;
      varying float rim;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        world = w.xz;
        rim = length(position.xy) / 320.0;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform float time, overcast, night, flash;
      uniform vec2 flashAt;
      varying vec2 world;
      varying float rim;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
                   mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
        return v;
      }
      void main() {
        vec2 p = world * 0.012 + vec2(time * 0.012, time * 0.004);
        float c = fbm(p) * 0.7 + fbm(p * 2.7 - time * 0.01) * 0.3;
        vec3 day = mix(vec3(0.36, 0.38, 0.42), vec3(0.6, 0.62, 0.66), c);
        vec3 dark = mix(vec3(0.08, 0.085, 0.11), vec3(0.18, 0.19, 0.24), c);
        vec3 colour = mix(day, dark, night);
        // Lightning lights the clouds from inside around where it strikes.
        float glow = flash * exp(-length(world - flashAt) / 55.0) * (0.6 + 0.8 * c);
        colour += vec3(0.85, 0.88, 1.0) * glow * 1.6;
        float alpha = overcast * (0.78 + 0.2 * c) * (1.0 - smoothstep(0.7, 1.0, rim));
        gl_FragColor = vec4(colour, alpha);
      }`,
  });
  const clouds = new THREE.Mesh(new THREE.CircleGeometry(320, 48), cloudMaterial);
  clouds.rotation.x = Math.PI / 2;
  clouds.position.y = groundY + 46;
  clouds.renderOrder = -1;
  clouds.frustumCulled = false;
  clouds.visible = false;
  group.add(clouds);

  // --- Lightning: a branching zigzag spreading through the cloud base. -----------------------
  const BOLT = 48;
  const boltGeometry = new THREE.BufferGeometry();
  boltGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BOLT * 6), 3));
  const boltMaterial = new THREE.LineBasicMaterial({
    color: '#eef3ff',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const bolt = new THREE.LineSegments(boltGeometry, boltMaterial);
  bolt.frustumCulled = false;
  bolt.visible = false;
  group.add(bolt);
  const strikeAt = new THREE.Vector3(),
    look = new THREE.Vector3();
  const drawBolt = () => {
    const p = boltGeometry.getAttribute('position') as THREE.BufferAttribute;
    let n = 0;
    const branch = (from: THREE.Vector3, angle: number, steps: number, drop: number) => {
      const at = from.clone();
      for (let i = 0; i < steps && n < BOLT; i++) {
        angle += (rand() - 0.5) * 1.3;
        const next = at
          .clone()
          .add(new THREE.Vector3(Math.cos(angle) * 6, -rand() * drop, Math.sin(angle) * 6));
        p.setXYZ(n * 2, at.x, at.y, at.z);
        p.setXYZ(n * 2 + 1, next.x, next.y, next.z);
        n++;
        if (rand() < 0.22 && steps > 3) branch(next, angle + (rand() - 0.5) * 2, steps / 2, drop);
        at.copy(next);
      }
    };
    const heading = rand() * Math.PI * 2;
    branch(strikeAt, heading, 10, 1.6);
    branch(strikeAt, heading + Math.PI, 7, 1.6);
    boltGeometry.setDrawRange(0, n * 2);
    p.needsUpdate = true;
  };

  // --- Rainbow: a soft arc opposite the sun after the rain (only while the sun is low enough). --
  const RAINBOW = 120;
  const rainbowMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { opacity: { value: 0 } },
    vertexShader: `
      varying float band;
      varying float rise;
      void main() {
        band = (length(position.xy) - ${(RAINBOW * Math.tan((38.6 * Math.PI) / 180)).toFixed(2)}) / ${(
          RAINBOW *
          (Math.tan((44.2 * Math.PI) / 180) - Math.tan((38.6 * Math.PI) / 180))
        ).toFixed(2)};
        rise = position.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float opacity;
      varying float band;
      varying float rise;
      void main() {
        // Violet inside to red outside, pastel, with a wide soft glow on both edges.
        float t = clamp(band, 0.0, 1.0);
        vec3 c = clamp(abs(mod(vec3(0.0, 4.0, 2.0) + (1.0 - t) * 4.6, 6.0) - 3.0) - 1.0, 0.0, 1.0);
        c = mix(vec3(1.0), c, 0.5);
        float edge = smoothstep(0.0, 0.32, band) * (1.0 - smoothstep(0.68, 1.0, band));
        // Both ends melt away into the air long before they reach the ground.
        float ends = smoothstep(4.0, 55.0, rise);
        float a = pow(edge, 1.4) * opacity * ends;
        gl_FragColor = vec4(c, a * 0.34);
      }`,
  });
  const rainbow = new THREE.Mesh(
    new THREE.RingGeometry(
      RAINBOW * Math.tan((38.6 * Math.PI) / 180),
      RAINBOW * Math.tan((44.2 * Math.PI) / 180),
      96,
      1,
    ),
    rainbowMaterial,
  );
  rainbow.frustumCulled = false;
  rainbow.visible = false;
  rainbow.renderOrder = 1;
  group.add(rainbow);
  const antiSun = new THREE.Vector3();

  const state: WeatherState = {
    rain: 0,
    overcast: 0,
    flash: 0,
    after: 0,
    stage: 'cerah',
    strikes: 0,
    strikePoint: new THREE.Vector3(),
  };
  const spell = {
    step: 0,
    started: 0,
    length: 70 + rand() * 90,
    from: { rain: 0, overcast: 0, after: 0 },
    /** Sometimes it only drizzles: the downpour steps are skipped. */
    light: false,
    forced: null as boolean | null,
  };
  let fall = 0;
  const goTo = (step: number, time: number) => {
    spell.step = step % SPELL.length;
    if (spell.step === 2 && !spell.forced) spell.light = rand() < 0.3;
    if (spell.light && (spell.step === 3 || spell.step === 4)) spell.step = 5;
    const s = SPELL[spell.step];
    spell.started = time;
    spell.length = s.length[0] + rand() * (s.length[1] - s.length[0]);
    spell.from = { rain: state.rain, overcast: state.overcast, after: state.after };
    state.stage = s.name;
  };
  const strike = { next: 0, at: -10, pulses: [] as number[] };

  return {
    group,
    state,
    /** Dev/test: force rain on or off, or `null` to let the weather change by itself. */
    force(on: boolean | null) {
      spell.forced = on;
      // No rain: start easing off now (if raining). Rain: see update (starts clouding over).
      if (on === false && spell.step >= 1 && spell.step <= 4) {
        spell.step = 4;
        spell.length = 0;
      }
    },
    /** Dev/test: the next frame in a downpour brings lightning. */
    strikeNow() {
      strike.next = 0;
    },
    /**
     * Call each frame. `night` 0–1 darkens the storm clouds; `sun` (unit vector) and `daylight`
     * place the rainbow.
     */
    update(
      camera: THREE.Camera,
      time: number,
      dt: number,
      night: number,
      reduced: boolean,
      sun?: THREE.Vector3,
      daylight = 1,
    ) {
      // Step through the spell; forced rain holds in the downpour, forced dry holds clear.
      if (spell.forced === true && spell.step === 0) spell.length = 0;
      const elapsed = time - spell.started;
      const holds =
        (spell.forced === true && spell.step === 4) || (spell.forced === false && spell.step === 0);
      if (elapsed > spell.length && !holds) goTo(spell.step + 1, time);
      const s = SPELL[spell.step],
        k = THREE.MathUtils.smoothstep(
          Math.min(1, (time - spell.started) / Math.max(0.01, s.ease ?? spell.length)),
          0,
          1,
        );
      state.rain = THREE.MathUtils.lerp(spell.from.rain, s.rain, k);
      state.overcast = THREE.MathUtils.lerp(spell.from.overcast, s.overcast, k);
      state.after = THREE.MathUtils.lerp(spell.from.after, s.after, k);

      // Lightning: every few seconds in a proper downpour, a quick double or triple flicker.
      if (state.rain > 0.6 && time > strike.next) {
        strike.next = time + 4 + rand() * 9;
        strike.at = time;
        strike.pulses = [0, 0.09 + rand() * 0.06, rand() < 0.5 ? 0.3 + rand() * 0.15 : -1];
        state.strikes++;
        // Mostly somewhere ahead of the camera, so it is seen.
        camera.getWorldDirection(look);
        const a = Math.atan2(look.z, look.x) + (rand() - 0.5) * (rand() < 0.75 ? 1.6 : 6),
          r = 30 + rand() * 110;
        strikeAt.set(
          camera.position.x + Math.cos(a) * r,
          clouds.position.y - 0.5,
          camera.position.z + Math.sin(a) * r,
        );
        state.strikePoint.copy(strikeAt);
        drawBolt();
      }
      const since = time - strike.at;
      let flash = 0;
      for (const p of strike.pulses)
        if (p >= 0 && since >= p) flash = Math.max(flash, Math.exp(-(since - p) * 9));
      // Calmer for reduced motion: a soft glow instead of a flicker.
      state.flash = reduced ? flash * 0.3 : flash;

      rain.visible = state.rain > 0.01;
      // Drizzle: few, short, slow drops. Downpour: all of them, long and fast.
      const heavy = THREE.MathUtils.smoothstep(state.rain, 0.25, 1);
      fall += dt * (reduced ? 4 : 8 + 8 * heavy);
      rainMaterial.uniforms.fall.value = fall % 10000;
      rainMaterial.uniforms.density.value = Math.min(1, state.rain * 0.7 + heavy * 0.4);
      rainMaterial.uniforms.streak.value = 0.22 + 0.4 * heavy;
      rainMaterial.uniforms.centre.value.copy(camera.position);
      rainMaterial.uniforms.opacity.value = Math.min(1, 0.55 + state.rain * 0.6);
      rainMaterial.uniforms.flash.value = state.flash;

      clouds.visible = state.overcast > 0.01;
      clouds.position.x = camera.position.x;
      clouds.position.z = camera.position.z;
      const u = cloudMaterial.uniforms;
      u.time.value = reduced ? 0 : time;
      u.overcast.value = state.overcast;
      u.night.value = night;
      u.flash.value = state.flash;
      u.flashAt.value.set(strikeAt.x, strikeAt.z);

      bolt.visible = state.flash > 0.05 && !reduced;
      boltMaterial.opacity = Math.min(1, state.flash * 1.3);

      // Rainbow: opposite the sun, by day, while the sun is below about 40°.
      const sunUp = sun ? Math.asin(THREE.MathUtils.clamp(sun.y, -1, 1)) : 0;
      const show =
        state.after *
        daylight *
        THREE.MathUtils.smoothstep(sunUp, -0.02, 0.08) *
        (1 - THREE.MathUtils.smoothstep(sunUp, 0.55, 0.7));
      rainbow.visible = !!sun && show > 0.01;
      if (rainbow.visible && sun) {
        antiSun.copy(sun).negate();
        rainbow.position.copy(camera.position).addScaledVector(antiSun, RAINBOW);
        rainbow.lookAt(camera.position);
        rainbowMaterial.uniforms.opacity.value = show;
      }
    },
    dispose() {
      rainGeometry.dispose();
      rainMaterial.dispose();
      clouds.geometry.dispose();
      cloudMaterial.dispose();
      boltGeometry.dispose();
      boltMaterial.dispose();
      rainbow.geometry.dispose();
      rainbowMaterial.dispose();
      group.removeFromParent();
    },
  };
}
