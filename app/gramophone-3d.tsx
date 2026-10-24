'use client';
// A cute vintage gramophone built from primitives, drawn with the same toon shading and outlines
// as the café (lib/toon.ts). The record spins and the tonearm drops while music plays, and music
// notes float out of the horn.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createToonOutline, toonGradient } from '@/lib/toon';

const NOTE_GLYPHS = ['♪', '♫', '♬', '♩'],
  NOTE_COLORS = ['#ffd27a', '#ff9fb2', '#fff4dc', '#9fd6c9'];

/** Note sprite texture: a filled glyph with a dark-brown outline to match the toon lines. */
function noteTexture(glyph: string, color: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.font = 'bold 104px Georgia, "Times New Roman", serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineJoin = 'round';
  x.lineWidth = 12;
  x.strokeStyle = '#3b2a20';
  x.strokeText(glyph, 64, 70);
  x.fillStyle = color;
  x.fillText(glyph, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Record face: fine grooves, a soft sheen and a pink label. */
function vinylTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d')!;
  x.fillStyle = '#1e1a20';
  x.fillRect(0, 0, 512, 512);
  for (let r = 250; r > 96; r -= 4) {
    x.strokeStyle = r % 12 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)';
    x.lineWidth = 1.5;
    x.beginPath();
    x.arc(256, 256, r, 0, Math.PI * 2);
    x.stroke();
  }
  const sheen = x.createConicGradient(0.6, 256, 256);
  sheen.addColorStop(0, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.08, 'rgba(255,255,255,0.18)');
  sheen.addColorStop(0.16, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.58, 'rgba(255,255,255,0.14)');
  sheen.addColorStop(0.66, 'rgba(255,255,255,0)');
  x.fillStyle = sheen;
  x.beginPath();
  x.arc(256, 256, 250, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#f08aa0';
  x.beginPath();
  x.arc(256, 256, 92, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#fff1d6';
  x.font = 'italic bold 30px Georgia, serif';
  x.textAlign = 'center';
  x.fillText('Noisegasm', 256, 236);
  x.font = 'bold 16px Georgia, serif';
  x.fillText('WINDS SPACE · 33⅓', 256, 290);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Flower-shaped horn: a lathe whose rim is scalloped into petals. */
function hornGeometry() {
  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    points.push(new THREE.Vector2(0.05 + Math.pow(t, 2.4) * 0.6, t * 0.85));
  }
  const g = new THREE.LatheGeometry(points, 48);
  const pos = g.attributes.position,
    v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = v.y / 0.85,
      a = Math.atan2(v.z, v.x),
      petal = 1 + Math.pow(t, 3) * 0.1 * Math.cos(a * 8);
    pos.setXYZ(i, v.x * petal, v.y + Math.pow(t, 4) * 0.05 * Math.cos(a * 8), v.z * petal);
  }
  g.computeVertexNormals();
  return g;
}

export default function Gramophone3D({ playing }: { playing: boolean }) {
  const host = useRef<HTMLDivElement>(null),
    playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
    } catch {
      container.dataset.error = '1';
      return;
    }
    const coarse = matchMedia('(pointer: coarse)').matches,
      reduced = matchMedia('(prefers-reduced-motion: reduce)');
    renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    const outline = createToonOutline(renderer, { hullWidth: 1.4 });

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f6e7cf');
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 30);
    camera.position.set(3.3, 2.7, 4.6);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(-0.1, 1.0, 0);
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableDamping = true;
    controls.minPolarAngle = 0.7;
    controls.maxPolarAngle = 1.35;
    controls.minAzimuthAngle = -0.2;
    controls.maxAzimuthAngle = 1.4;
    controls.update();
    scene.add(new THREE.HemisphereLight('#fff6e6', '#c9a27c', 1.6));
    const key = new THREE.DirectionalLight('#fff0d8', 2.2);
    key.position.set(3, 5, 4);
    scene.add(key);

    const geometries: THREE.BufferGeometry[] = [],
      materials: THREE.Material[] = [],
      textures: THREE.Texture[] = [];
    const toon = (color: string, extra: THREE.MeshToonMaterialParameters = {}) => {
      const m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...extra });
      materials.push(m);
      return m;
    };
    const mesh = (
      parent: THREE.Object3D,
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      at: [number, number, number] = [0, 0, 0],
    ) => {
      geometries.push(geometry);
      const m = new THREE.Mesh(geometry, material);
      m.position.set(...at);
      parent.add(m);
      return m;
    };
    const wood = toon('#9a5a32'),
      darkWood = toon('#6b3a1e'),
      brass = toon('#e9b44c'),
      brassInside = toon('#b9772c', { side: THREE.BackSide }),
      cream = toon('#fbeed6'),
      pink = toon('#f08aa0');

    // Everything that bobs to the music lives under `body`.
    const body = new THREE.Group();
    scene.add(body);
    // Soft contact shadow (no depth, so the outline pass ignores it).
    const shadowMat = new THREE.MeshBasicMaterial({
      color: '#c9a885',
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    materials.push(shadowMat);
    const shadow = mesh(scene, new THREE.CircleGeometry(1.25, 40), shadowMat, [0, 0.001, 0]);
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(1.15, 0.9, 1);

    // Cabinet: chunky rounded box with a pink trim band and a cream name plate.
    const cabinet = new THREE.Group();
    body.add(cabinet);
    mesh(cabinet, new RoundedBoxGeometry(1.7, 0.5, 1.4, 4, 0.12), wood, [0, 0.4, 0]);
    mesh(cabinet, new RoundedBoxGeometry(1.76, 0.08, 1.46, 3, 0.04), pink, [0, 0.62, 0]);
    mesh(cabinet, new RoundedBoxGeometry(0.62, 0.16, 0.04, 2, 0.03), cream, [0, 0.4, 0.71]);
    for (const [x, z] of [
      [-0.68, -0.54],
      [0.68, -0.54],
      [-0.68, 0.54],
      [0.68, 0.54],
    ]) {
      const foot = mesh(cabinet, new THREE.SphereGeometry(0.13, 16, 10), darkWood, [x, 0.12, z]);
      foot.scale.y = 0.75;
    }
    // Crank on the right side.
    const crank = new THREE.Group();
    crank.position.set(0.88, 0.42, 0.1);
    cabinet.add(crank);
    mesh(crank, new THREE.CylinderGeometry(0.04, 0.04, 0.14, 12), brass).rotation.z = Math.PI / 2;
    const crankArm = new THREE.Group();
    crankArm.position.x = 0.08;
    crank.add(crankArm);
    mesh(crankArm, new RoundedBoxGeometry(0.05, 0.3, 0.05, 2, 0.02), brass, [0, -0.12, 0]);
    mesh(crankArm, new THREE.SphereGeometry(0.06, 14, 10), cream, [0.05, -0.26, 0]);

    // Turntable: brass platter, spinning record, spindle.
    mesh(cabinet, new THREE.CylinderGeometry(0.64, 0.64, 0.05, 48), brass, [0.08, 0.68, 0.05]);
    const record = new THREE.Group();
    record.position.set(0.08, 0.72, 0.05);
    cabinet.add(record);
    const vinylMap = vinylTexture();
    textures.push(vinylMap);
    const vinylTop = toon('#ffffff', { map: vinylMap }),
      vinylEdge = toon('#1e1a20');
    mesh(record, new THREE.CylinderGeometry(0.6, 0.6, 0.025, 64), [
      vinylEdge,
      vinylTop,
      vinylEdge,
    ] as unknown as THREE.Material);
    mesh(record, new THREE.CylinderGeometry(0.025, 0.025, 0.07, 10), brass, [0, 0.03, 0]);

    // Tonearm: pivots on a post at the back right and swings onto the record.
    const armPivot = new THREE.Group();
    armPivot.position.set(0.68, 0.7, -0.5);
    cabinet.add(armPivot);
    mesh(armPivot, new THREE.CylinderGeometry(0.08, 0.1, 0.16, 16), brass, [0, 0.06, 0]);
    const arm = new THREE.Group();
    arm.position.y = 0.14;
    armPivot.add(arm);
    const armPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(-0.18, 0.02, 0.28),
      new THREE.Vector3(-0.42, 0, 0.56),
    ]);
    mesh(arm, new THREE.TubeGeometry(armPath, 16, 0.025, 8), brass);
    mesh(arm, new RoundedBoxGeometry(0.12, 0.06, 0.18, 2, 0.02), cream, [-0.44, -0.02, 0.62]);

    // Horn: a curved brass neck from the back left, ending in a petal bell facing the viewer.
    const neckCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.6, 0.65, -0.5),
      new THREE.Vector3(-0.66, 1.0, -0.55),
      new THREE.Vector3(-0.5, 1.3, -0.4),
      new THREE.Vector3(-0.3, 1.42, -0.18),
    ]);
    const neck = new THREE.Group();
    body.add(neck);
    mesh(neck, new THREE.TubeGeometry(neckCurve, 24, 0.055, 12), brass);
    mesh(neck, new THREE.SphereGeometry(0.1, 16, 12), brass, [-0.6, 0.66, -0.5]);
    const horn = new THREE.Group();
    horn.position.set(-0.3, 1.42, -0.18);
    // Open toward the front left and up, so the petal rim and the neck both read from the camera.
    horn.lookAt(new THREE.Vector3(-1.1, 2.5, 1.5));
    horn.rotateX(Math.PI / 2);
    horn.scale.setScalar(0.78);
    body.add(horn);
    const bell = hornGeometry();
    mesh(horn, bell, brass);
    mesh(horn, bell.clone(), brassInside).scale.setScalar(0.97);
    geometries.push(bell);

    // Hull outlines only on closed shapes: looking into the open horn would show its inside hull.
    outline.addHull(cabinet);
    outline.addHull(neck);

    // Music notes rising from the horn.
    const noteTextures = NOTE_GLYPHS.flatMap((g, i) => {
      const t = noteTexture(g, NOTE_COLORS[i % NOTE_COLORS.length]);
      textures.push(t);
      return [t];
    });
    const mouth = new THREE.Vector3(0, 0.9, 0),
      out = new THREE.Vector3();
    horn.updateMatrixWorld(true);
    const notes = Array.from({ length: 14 }, () => {
      const material = new THREE.SpriteMaterial({
        map: noteTextures[0],
        transparent: true,
        depthWrite: false,
      });
      materials.push(material);
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      scene.add(sprite);
      return { sprite, age: 0, life: 0, velocity: new THREE.Vector3(), phase: 0, size: 0.2 };
    });
    let spawnIn = 0,
      noteIndex = 0;
    const spawn = () => {
      const n = notes[noteIndex++ % notes.length];
      horn.localToWorld(out.copy(mouth));
      n.sprite.position
        .copy(out)
        .add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3));
      const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(
        horn.getWorldQuaternion(new THREE.Quaternion()),
      );
      n.velocity
        .copy(dir)
        .multiplyScalar(0.35)
        .add(new THREE.Vector3(0, 0.25, 0));
      (n.sprite.material as THREE.SpriteMaterial).map =
        noteTextures[Math.floor(Math.random() * noteTextures.length)];
      (n.sprite.material as THREE.SpriteMaterial).rotation = (Math.random() - 0.5) * 0.6;
      n.age = 0;
      n.life = 2.2 + Math.random() * 0.8;
      n.phase = Math.random() * Math.PI * 2;
      n.size = 0.16 + Math.random() * 0.1;
      n.sprite.visible = true;
    };

    const resize = new ResizeObserver(() => {
      const w = container.clientWidth,
        h = container.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resize.observe(container);

    let frame = 0,
      spin = 0,
      armT = 0,
      time = 0;
    const clock = new THREE.Clock();
    const REST = 0.55,
      PLAY = -0.05;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05),
        on = playingRef.current,
        still = reduced.matches;
      time += dt;
      // Platter spins up and coasts down like a real motor; the arm follows.
      spin += ((on ? 3.5 : 0) - spin) * Math.min(1, dt * (on ? 1.6 : 0.8));
      record.rotation.y -= spin * dt;
      armT += ((on ? 1 : 0) - armT) * Math.min(1, dt * 3);
      arm.rotation.y = REST + (PLAY - REST) * armT;
      arm.rotation.x = (1 - armT) * -0.08;
      crankArm.rotation.x -= spin * dt * 0.35;
      // A small bounce to the beat while playing.
      const bob = on && !still ? Math.sin(time * 6.3) : 0;
      body.scale.set(1 - bob * 0.012, 1 + bob * 0.02, 1 - bob * 0.012);
      horn.scale.setScalar(0.78 * (1 + Math.max(0, bob) * 0.03));
      if (on && !still) {
        spawnIn -= dt;
        if (spawnIn <= 0) {
          spawn();
          spawnIn = 0.38 + Math.random() * 0.3;
        }
      }
      for (const n of notes) {
        if (!n.sprite.visible) continue;
        n.age += dt;
        if (n.age >= n.life) {
          n.sprite.visible = false;
          continue;
        }
        const t = n.age / n.life;
        n.sprite.position.addScaledVector(n.velocity, dt);
        n.sprite.position.x += Math.sin(time * 3 + n.phase) * dt * 0.25;
        n.velocity.multiplyScalar(1 - dt * 0.25);
        const grow = Math.min(1, t * 6);
        n.sprite.scale.setScalar(n.size * (0.6 + grow * 0.4));
        (n.sprite.material as THREE.SpriteMaterial).opacity = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
      }
      controls.update();
      outline.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      controls.dispose();
      outline.dispose();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={host} style={{ width: '100%', height: '100%' }} />;
}
