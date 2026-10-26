// Rainy spells over the café: now and then the sky clouds over, rain falls around the camera and
// lightning flickers inside the clouds. Cheap: one LineSegments draw for the rain, one plane for
// the storm clouds and a short zigzag line for the lightning.
import * as THREE from 'three';

export type WeatherState = {
  /** 0–1: how heavily it is raining (eases in and out). */
  rain: number;
  /** 0–1: how grey the sky is (comes a little before the rain and stays a little after). */
  overcast: number;
  /** 0–1: lightning brightness this frame. */
  flash: number;
};

const DROPS = 3200,
  SPREAD = 18,
  HEIGHT = 22;

export function createWeather(groundY: number) {
  const group = new THREE.Group();
  group.name = 'World_Weather';
  const rand = Math.random;

  // --- Rain: streaks that wrap around the camera so it always rains wherever you look. -------
  const base = new Float32Array(DROPS * 2 * 3),
    tip = new Float32Array(DROPS * 2);
  for (let i = 0; i < DROPS; i++) {
    const x = (rand() * 2 - 1) * SPREAD,
      y = rand() * HEIGHT,
      z = (rand() * 2 - 1) * SPREAD;
    for (let k = 0; k < 2; k++) {
      base.set([x, y, z], (i * 2 + k) * 3);
      tip[i * 2 + k] = k;
    }
  }
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute('position', new THREE.BufferAttribute(base, 3));
  rainGeometry.setAttribute('tip', new THREE.BufferAttribute(tip, 1));
  const rainMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      time: { value: 0 },
      centre: { value: new THREE.Vector3() },
      opacity: { value: 0 },
      flash: { value: 0 },
    },
    vertexShader: `
      attribute float tip;
      uniform float time;
      uniform vec3 centre;
      varying float fade;
      void main() {
        // World-fixed drops, wrapped into a box around the camera as it moves.
        vec3 p = position;
        float span = ${(SPREAD * 2).toFixed(1)}, h = ${HEIGHT.toFixed(1)};
        float x = centre.x + mod(p.x - centre.x + span * 0.5, span) - span * 0.5;
        float z = centre.z + mod(p.z - centre.z + span * 0.5, span) - span * 0.5;
        float y = centre.y - h * 0.45 + mod(p.y - time * 14.0 - centre.y, h);
        vec3 w = vec3(x + tip * 0.05, y + tip * 0.55, z + tip * 0.03);
        vec4 mv = viewMatrix * vec4(w, 1.0);
        fade = (1.0 - smoothstep(7.0, ${SPREAD.toFixed(1)}, length(w.xz - centre.xz))) *
          smoothstep(0.4, 2.0, -mv.z);
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

  const state: WeatherState = { rain: 0, overcast: 0, flash: 0 };
  // Rainy spells come and go: a few dry minutes, then a couple of rainy ones.
  const spell = { raining: false, until: 70 + rand() * 90, forced: null as boolean | null };
  const strike = { next: 0, at: -10, pulses: [] as number[] };

  return {
    group,
    state,
    /** Dev/test: force rain on or off, or `null` to let the weather change by itself. */
    force(on: boolean | null) {
      spell.forced = on;
    },
    /** Dev/test: the next frame in a downpour brings lightning. */
    strikeNow() {
      strike.next = 0;
    },
    /** Call each frame. `night` 0–1 darkens the storm clouds. */
    update(camera: THREE.Camera, time: number, dt: number, night: number, reduced: boolean) {
      if (spell.forced === null && time > spell.until) {
        spell.raining = !spell.raining;
        spell.until = time + (spell.raining ? 80 + rand() * 90 : 150 + rand() * 220);
      }
      const raining = spell.forced ?? spell.raining;
      // The sky greys first, then the rain comes; afterwards the rain stops before the sky clears.
      const ease = (value: number, target: number, rate: number) =>
        reduced ? target : value + (target - value) * (1 - Math.exp(-dt * rate));
      state.overcast = ease(state.overcast, raining ? 1 : 0, raining ? 0.35 : 0.18);
      state.rain = ease(state.rain, raining && state.overcast > 0.6 ? 1 : 0, 0.4);

      // Lightning: every few seconds in a proper downpour, a quick double or triple flicker.
      if (state.rain > 0.6 && time > strike.next) {
        strike.next = time + 4 + rand() * 9;
        strike.at = time;
        strike.pulses = [0, 0.09 + rand() * 0.06, rand() < 0.5 ? 0.3 + rand() * 0.15 : -1];
        // Mostly somewhere ahead of the camera, so it is seen.
        camera.getWorldDirection(look);
        const a = Math.atan2(look.z, look.x) + (rand() - 0.5) * (rand() < 0.75 ? 1.6 : 6),
          r = 30 + rand() * 110;
        strikeAt.set(
          camera.position.x + Math.cos(a) * r,
          clouds.position.y - 0.5,
          camera.position.z + Math.sin(a) * r,
        );
        drawBolt();
      }
      const since = time - strike.at;
      let flash = 0;
      for (const p of strike.pulses)
        if (p >= 0 && since >= p) flash = Math.max(flash, Math.exp(-(since - p) * 9));
      // Calmer for reduced motion: a soft glow instead of a flicker.
      state.flash = reduced ? flash * 0.3 : flash;

      rain.visible = state.rain > 0.01;
      rainMaterial.uniforms.time.value = reduced ? time * 0.35 : time;
      rainMaterial.uniforms.centre.value.copy(camera.position);
      rainMaterial.uniforms.opacity.value = state.rain;
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
    },
    dispose() {
      rainGeometry.dispose();
      rainMaterial.dispose();
      clouds.geometry.dispose();
      cloudMaterial.dispose();
      boltGeometry.dispose();
      boltMaterial.dispose();
      group.removeFromParent();
    },
  };
}
