// Little life around the café and the tower: fireflies after dark, butterflies in the morning.
// Each wanders around a home spot picked at random near the café or the tower, so they show up
// in different places every visit. Cheap: one Points draw for the fireflies, a few tiny meshes
// for the butterflies.
import * as THREE from 'three';

type Home = { centre: THREE.Vector3; radius: number };

export function createCritters(homes: Home[], groundAt: (x: number, z: number) => number) {
  const group = new THREE.Group();
  group.name = 'World_Critters';
  const rand = Math.random;
  const pickSpot = () => {
    const home = homes[Math.floor(rand() * homes.length)],
      a = rand() * Math.PI * 2,
      r = Math.sqrt(rand()) * home.radius;
    const x = home.centre.x + Math.cos(a) * r,
      z = home.centre.z + Math.sin(a) * r;
    return new THREE.Vector3(x, groundAt(x, z), z);
  };

  // --- Fireflies: soft yellow-green points that drift and blink. ---------------------------
  const FLIES = 70;
  const flyHome = Array.from({ length: FLIES }, pickSpot),
    flySeed = Float32Array.from({ length: FLIES }, () => rand() * 100);
  const flyGeometry = new THREE.BufferGeometry();
  flyGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FLIES * 3), 3));
  flyGeometry.setAttribute('seed', new THREE.BufferAttribute(flySeed, 1));
  const flyMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, visibility: { value: 0 }, scale: { value: 1 } },
    vertexShader: `
      attribute float seed;
      uniform float time, scale;
      varying float blink;
      void main() {
        blink = pow(max(0.0, sin(time * (0.9 + fract(seed) * 0.8) + seed * 6.28)), 3.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = min(18.0, (2.5 + 4.5 * blink) * scale * (6.0 / max(1.0, -mv.z)) + 1.5);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float visibility;
      varying float blink;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        float a = exp(-d * d * 3.5) * (0.25 + 0.75 * blink) * visibility;
        gl_FragColor = vec4(vec3(0.85, 1.0, 0.45), a);
      }`,
  });
  const flies = new THREE.Points(flyGeometry, flyMaterial);
  flies.frustumCulled = false;
  flies.visible = false;
  group.add(flies);

  // --- Butterflies: two flapping wings each, fluttering between spots. ---------------------
  const wingGeometry = new THREE.BufferGeometry();
  wingGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [0, 0, 0, 0.11, 0.02, 0.06, 0.09, 0, -0.07, 0, 0, 0, 0.09, 0, -0.07, 0.05, 0, -0.1],
      3,
    ),
  );
  wingGeometry.computeVertexNormals();
  const colours = ['#f2b45c', '#f6f1e4', '#9fc6e8', '#e98e8e', '#f3dc6b', '#c7a6e6'];
  const wingMaterials = colours.map(
    (color) => new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
  );
  type Butterfly = {
    body: THREE.Group;
    left: THREE.Mesh;
    right: THREE.Mesh;
    from: THREE.Vector3;
    to: THREE.Vector3;
    t: number;
    speed: number;
    phase: number;
  };
  const butterflies: Butterfly[] = Array.from({ length: 16 }, (_, i) => {
    const body = new THREE.Group(),
      material = wingMaterials[i % wingMaterials.length],
      left = new THREE.Mesh(wingGeometry, material),
      right = new THREE.Mesh(wingGeometry, material);
    right.scale.x = -1;
    // Small butterflies.
    left.scale.setScalar(0.75);
    right.scale.set(-0.75, 0.75, 0.75);
    body.add(left, right);
    body.visible = false;
    group.add(body);
    const from = pickSpot();
    return {
      body,
      left,
      right,
      from,
      to: pickSpot(),
      t: rand(),
      speed: 0.08 + rand() * 0.08,
      phase: rand() * 6,
    };
  });

  const scratch = new THREE.Vector3();
  return {
    group,
    /**
     * `night` 0–1 shows fireflies; `morning` 0–1 shows butterflies. Both fade in and out softly.
     */
    update(time: number, dt: number, night: number, morning: number, reduced: boolean) {
      flyMaterial.uniforms.time.value = reduced ? 0 : time;
      flyMaterial.uniforms.visibility.value = night;
      flyMaterial.uniforms.scale.value = Math.min(2, window.devicePixelRatio || 1);
      flies.visible = night > 0.01;
      if (flies.visible) {
        const p = flyGeometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < FLIES; i++) {
          const s = flySeed[i],
            h = flyHome[i],
            w = reduced ? 0 : time * 0.25;
          p.setXYZ(
            i,
            h.x + Math.sin(w + s) * 1.2 + Math.sin(w * 2.3 + s * 3) * 0.4,
            h.y + 0.5 + Math.sin(w * 1.7 + s * 2) * 0.35 + (s % 1) * 0.8,
            h.z + Math.cos(w * 0.8 + s * 1.3) * 1.2,
          );
        }
        p.needsUpdate = true;
        // Now and then a firefly wanders off to a new spot.
        if (!reduced && rand() < dt * 0.4) flyHome[Math.floor(rand() * FLIES)] = pickSpot();
      }
      for (const b of butterflies) {
        b.body.visible = morning > 0.05;
        if (!b.body.visible) continue;
        b.body.scale.setScalar(Math.min(1, morning * 1.5));
        if (!reduced) b.t += dt * b.speed;
        if (b.t >= 1) {
          b.t = 0;
          b.from.copy(b.to);
          b.to.copy(pickSpot());
        }
        const t = b.t,
          lift = 0.5 + Math.sin(t * Math.PI) * 1.1;
        scratch.copy(b.from).lerp(b.to, t);
        b.body.position.set(
          scratch.x + Math.sin(time * 1.3 + b.phase) * 0.25,
          scratch.y + lift + Math.sin(time * 3 + b.phase) * 0.12,
          scratch.z + Math.cos(time * 1.1 + b.phase) * 0.25,
        );
        b.body.rotation.y = Math.atan2(b.to.x - b.from.x, b.to.z - b.from.z);
        const flap = reduced ? 0.4 : Math.sin(time * 18 + b.phase) * 0.9;
        b.left.rotation.z = flap;
        b.right.rotation.z = -flap;
      }
    },
    dispose() {
      flyGeometry.dispose();
      flyMaterial.dispose();
      wingGeometry.dispose();
      wingMaterials.forEach((m) => m.dispose());
      group.removeFromParent();
    },
  };
}
