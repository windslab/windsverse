'use client';
// The member card as a real card in 3D: ATM-card size, glossy faces, a thin edge. Drag sideways to
// turn it (it settles on the nearest side), tap to flip. Stamps are pressed onto the back one by
// one when it opens; the newest ones land harder and shake the card.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RefreshCw } from 'lucide-react';
import type { CardDesign } from '@/lib/member';
import {
  CARD_RATIO,
  CORNER,
  TEXTURE_HEIGHT,
  TEXTURE_WIDTH,
  drawBack,
  drawFront,
  loadImage,
  type Face,
  type StampMotion,
} from './card-art';
import styles from './member.module.css';

const W = 8.56,
  H = W / CARD_RATIO,
  DEPTH = 0.08,
  RADIUS = W * CORNER;

function cardShape() {
  const s = new THREE.Shape(),
    x = -W / 2,
    y = -H / 2;
  s.moveTo(x + RADIUS, y);
  s.lineTo(x + W - RADIUS, y);
  s.quadraticCurveTo(x + W, y, x + W, y + RADIUS);
  s.lineTo(x + W, y + H - RADIUS);
  s.quadraticCurveTo(x + W, y + H, x + W - RADIUS, y + H);
  s.lineTo(x + RADIUS, y + H);
  s.quadraticCurveTo(x, y + H, x, y + H - RADIUS);
  s.lineTo(x, y + RADIUS);
  s.quadraticCurveTo(x, y, x + RADIUS, y);
  return s;
}
/** A flat face of the card with its texture spread over the whole card. */
function faceGeometry(shape: THREE.Shape) {
  const g = new THREE.ShapeGeometry(shape, 10),
    pos = g.attributes.position,
    uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++)
    uv.setXY(i, (pos.getX(i) + W / 2) / W, (pos.getY(i) + H / 2) / H);
  return g;
}

/** Timing of the stamps: earlier ones land quickly in a row, new ones one by one and harder. */
function schedule(count: number, fresh: number) {
  const plan: { slot: number; start: number; length: number; hard: boolean }[] = [];
  let t = 0;
  for (let i = 0; i < count; i++) {
    const hard = i >= count - fresh;
    plan.push({ slot: i, start: t, length: hard ? 0.55 : 0.34, hard });
    t += hard ? 0.62 : 0.13;
  }
  return plan;
}

export default function MemberCard3D({
  face,
  design,
  fresh = 0,
  play = true,
  className,
}: {
  face: Face;
  design: CardDesign;
  /** How many of the newest stamps are new since the member last looked. */
  fresh?: number;
  /** Press the stamps when it opens (false: show them pressed, e.g. a preview). */
  play?: boolean;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [fallback, setFallback] = useState<{ front: string; back: string } | null>(null),
    [side, setSide] = useState<'front' | 'back'>('front');
  const live = useRef({ flip: () => {} });
  const faceKey = JSON.stringify([face, design]);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let disposed = false,
      frame = 0,
      visible = true;
    const front = document.createElement('canvas'),
      back = document.createElement('canvas');
    front.width = back.width = TEXTURE_WIDTH;
    front.height = back.height = TEXTURE_HEIGHT;
    let frontArt: HTMLImageElement | null = null,
      backArt: HTMLImageElement | null = null;
    const plan = play ? schedule(face.stamps.length, fresh) : [];
    const motion = (t: number): StampMotion[] =>
      plan
        .filter((p) => t < p.start + p.length)
        .map((p) => ({ slot: p.slot, progress: Math.max(0, (t - p.start) / p.length) }));

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      void Promise.all([loadImage(design.front), loadImage(design.back)]).then(([f, b]) => {
        if (disposed) return;
        drawFront(front, face, design, f);
        drawBack(back, face, design, b);
        setFallback({ front: front.toDataURL(), back: back.toDataURL() });
      });
      return () => {
        disposed = true;
      };
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    scene.environment = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    scene.environmentIntensity = 0.6;
    const key = new THREE.DirectionalLight('#fff4e0', 1.5);
    key.position.set(-4, 6, 8);
    scene.add(key);
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);

    const textures = [front, back].map((c) => {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return t;
    });
    const faceMaterial = (map: THREE.Texture) =>
      new THREE.MeshPhysicalMaterial({
        map,
        roughness: 0.38,
        metalness: 0,
        clearcoat: 0.6,
        clearcoatRoughness: 0.18,
      });
    const shape = cardShape();
    const card = new THREE.Group();
    const edge = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, { depth: DEPTH, bevelEnabled: false, curveSegments: 10 }),
      [
        new THREE.MeshBasicMaterial({ visible: false }),
        new THREE.MeshPhysicalMaterial({ color: '#efe6d2', roughness: 0.4, clearcoat: 0.6 }),
      ],
    );
    edge.position.z = -DEPTH / 2;
    const frontMesh = new THREE.Mesh(faceGeometry(shape), faceMaterial(textures[0]));
    frontMesh.position.z = DEPTH / 2 + 0.001;
    const backMesh = new THREE.Mesh(faceGeometry(shape), faceMaterial(textures[1]));
    backMesh.rotation.y = Math.PI;
    backMesh.position.z = -DEPTH / 2 - 0.001;
    card.add(edge, frontMesh, backMesh);
    scene.add(card);

    const redraw = (t: number) => {
      drawFront(front, face, design, frontArt);
      drawBack(back, face, design, backArt, motion(t));
      textures[0].needsUpdate = textures[1].needsUpdate = true;
    };
    redraw(plan.length ? 0 : Infinity);

    // Turning: drag sideways, tap to flip; it settles on the nearest side.
    const state = {
      rotY: 0,
      rotX: 0,
      velocity: 0,
      target: 0,
      dragging: false,
      moved: 0,
      downAt: 0,
      lastX: 0,
      lastY: 0,
      kick: 0,
    };
    const flip = () => {
      state.target = Math.round(state.rotY / Math.PI) * Math.PI + Math.PI;
      state.velocity = 0;
    };
    live.current.flip = flip;
    const el = renderer.domElement;
    el.style.touchAction = 'pan-y';
    el.style.cursor = 'grab';
    const down = (e: PointerEvent) => {
      state.dragging = true;
      state.moved = 0;
      state.downAt = performance.now();
      state.lastX = e.clientX;
      state.lastY = e.clientY;
      state.velocity = 0;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = 'grabbing';
    };
    const move = (e: PointerEvent) => {
      if (!state.dragging) return;
      const dx = e.clientX - state.lastX,
        dy = e.clientY - state.lastY;
      state.lastX = e.clientX;
      state.lastY = e.clientY;
      state.moved += Math.abs(dx) + Math.abs(dy);
      state.rotY += dx * 0.012;
      state.velocity = dx * 0.012;
      if (e.pointerType === 'mouse')
        state.rotX = Math.max(-0.5, Math.min(0.5, state.rotX + dy * 0.006));
    };
    const up = () => {
      if (!state.dragging) return;
      state.dragging = false;
      el.style.cursor = 'grab';
      if (state.moved < 6 && performance.now() - state.downAt < 350) flip();
      else state.target = Math.round((state.rotY + state.velocity * 8) / Math.PI) * Math.PI;
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);

    const resize = () => {
      const w = container.clientWidth,
        h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // The card fills about 84 % of the width, or of the height on tall boxes.
      const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      camera.position.set(0, 0, Math.max(W / 0.84 / 2 / half / camera.aspect, H / 0.8 / 2 / half));
      camera.updateProjectionMatrix();
    };
    const sizer = new ResizeObserver(resize);
    sizer.observe(container);
    resize();
    const seen = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
    seen.observe(container);

    // Show the front, turn to the back, press the stamps.
    const startAt = performance.now();
    const turnAt = plan.length ? 0.7 : Infinity,
      stampsAt = turnAt + 0.75;
    let turned = false,
      animating = plan.length > 0,
      shown: 'front' | 'back' = 'front';
    const landed = new Set<number>();
    void Promise.all([loadImage(design.front), loadImage(design.back)]).then(([f, b]) => {
      if (disposed) return;
      frontArt = f;
      backArt = b;
      if (!animating) redraw(Infinity);
    });
    let last = performance.now();
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (!visible || document.hidden) return;
      const dt = Math.min(0.05, (now - last) / 1000),
        t = (now - startAt) / 1000;
      last = now;
      if (!turned && t > turnAt) {
        turned = true;
        if (Math.cos(state.rotY) > 0) flip();
      }
      if (animating) {
        const st = t - stampsAt;
        redraw(Math.max(0, st));
        for (const p of plan)
          if (p.hard && !landed.has(p.slot) && st >= p.start + p.length * 0.72) {
            landed.add(p.slot);
            state.kick = 1;
          }
        if (st > plan.at(-1)!.start + plan.at(-1)!.length) {
          animating = false;
          redraw(Infinity);
        }
      }
      if (!state.dragging) {
        state.rotY += state.velocity;
        state.velocity *= 0.9;
        if (Math.abs(state.velocity) < 0.004) {
          state.velocity = 0;
          state.rotY += (state.target - state.rotY) * Math.min(1, dt * 7);
        }
        state.rotX += (0 - state.rotX) * Math.min(1, dt * 4);
      }
      state.kick = Math.max(0, state.kick - dt * 4);
      const sway = Math.sin(t * 0.8) * 0.05,
        shake = state.kick * state.kick;
      card.rotation.set(
        state.rotX + Math.sin(t * 0.6) * 0.03 - shake * 0.08,
        state.rotY + sway,
        shake * Math.sin(t * 60) * 0.02,
      );
      card.position.set(0, Math.sin(t * 1.1) * 0.06, -shake * 0.35);
      const facing = Math.cos(card.rotation.y) >= 0 ? 'front' : 'back';
      if (facing !== shown) {
        shown = facing;
        setSide(facing);
      }
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      sizer.disconnect();
      seen.disconnect();
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      textures.forEach((t) => t.dispose());
      card.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
      });
      scene.environment?.dispose();
      pmrem.dispose();
      renderer.dispose();
      el.remove();
    };
    // The card is rebuilt when what it shows changes; `fresh` and `play` only matter at the start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faceKey]);

  return (
    <div className={[styles.card3d, className].filter(Boolean).join(' ')}>
      <div ref={host} className={styles.card3dStage} aria-hidden={!!fallback}>
        {fallback && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className={styles.card3dFlat}
            src={side === 'front' ? fallback.front : fallback.back}
            alt=""
            onClick={() => setSide(side === 'front' ? 'back' : 'front')}
          />
        )}
      </div>
      <button
        type="button"
        className={styles.flip}
        onClick={() =>
          fallback ? setSide(side === 'front' ? 'back' : 'front') : live.current.flip()
        }
      >
        <RefreshCw size={14} /> {side === 'front' ? 'Lihat stamp' : 'Lihat depan'}
      </button>
      <span
        className={styles.srOnly}
        role="img"
        aria-label={`Kartu member ${face.name}, ${face.stamps.length} dari 10 stamp`}
      />
    </div>
  );
}
