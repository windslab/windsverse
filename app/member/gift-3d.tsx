'use client';
// A gift's 3D mockup (.glb uploaded by the admin), turning slowly; drag to look around it.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import styles from './member.module.css';

export default function Gift3D({ src, locked }: { src: string; locked: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let disposed = false,
      frame = 0;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      queueMicrotask(() => setState('error'));
      return;
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
    const light = new THREE.DirectionalLight('#fff4e0', 1.2);
    light.position.set(3, 5, 4);
    scene.add(light);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.6;
    let model: THREE.Object3D | null = null;
    new GLTFLoader().load(
      src,
      (gltf) => {
        if (disposed) return;
        model = gltf.scene;
        // Centre it and frame it whatever size it was made at.
        const box = new THREE.Box3().setFromObject(model),
          size = box.getSize(new THREE.Vector3()),
          centre = box.getCenter(new THREE.Vector3());
        model.position.sub(centre);
        scene.add(model);
        const radius = size.length() / 2 || 1;
        const distance = (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.05;
        camera.position.set(distance * 0.55, distance * 0.3, distance * 0.78);
        camera.near = distance / 100;
        camera.far = distance * 10;
        camera.updateProjectionMatrix();
        controls.minDistance = distance * 0.5;
        controls.maxDistance = distance * 2;
        controls.update();
        setState('ready');
      },
      undefined,
      () => !disposed && setState('error'),
    );
    const resize = () => {
      const w = container.clientWidth,
        h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const sizer = new ResizeObserver(resize);
    sizer.observe(container);
    resize();
    const tick = () => {
      frame = requestAnimationFrame(tick);
      if (document.hidden) return;
      controls.update();
      renderer.render(scene, camera);
    };
    tick();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      sizer.disconnect();
      controls.dispose();
      model?.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
      });
      scene.environment?.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [src]);
  return (
    <div ref={host} className={styles.gift3d} data-locked={locked || undefined}>
      {state === 'loading' && <span className={styles.gift3dNote}>Memuat 3D…</span>}
      {state === 'error' && <span className={styles.gift3dNote}>Model 3D belum bisa dibuka.</span>}
    </div>
  );
}
