'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import styles from './studio.module.css';
import { createLunaAnimation } from './animation';

function disposeModel(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
      materials.add(material);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

export default function LunaViewer({
  moving,
  wave,
  reset,
}: {
  moving: boolean;
  wave: number;
  reset: number;
}) {
  const host = useRef<HTMLDivElement>(null),
    values = useRef({ moving, wave, reset });
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  values.current = { moving, wave, reset };
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let disposed = false,
      frame = 0,
      model: THREE.Group | undefined;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#e9e0d4');
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
    const defaultCamera = new THREE.Vector3(2.6, 2.3, 5.4);
    camera.position.copy(defaultCamera);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    } catch {
      setState('error');
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute(
      'aria-label',
      'Model 3D Luna. Seret untuk memutar, scroll atau cubit untuk zoom.',
    );
    renderer.domElement.tabIndex = 0;
    container.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.25, 0);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.minDistance = 3.3;
    controls.maxDistance = 9;
    controls.minPolarAngle = 0.3;
    controls.maxPolarAngle = Math.PI * 0.52;
    controls.listenToKeyEvents(renderer.domElement);
    controls.update();
    scene.add(new THREE.HemisphereLight('#fff2df', '#b59e8b', 2.1));
    const key = new THREE.DirectionalLight('#ffe8d0', 2.4);
    key.position.set(-3, 6, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -2;
    key.shadow.camera.right = 2;
    key.shadow.camera.top = 3;
    key.shadow.camera.bottom = -1;
    key.shadow.bias = -0.0003;
    key.shadow.normalBias = 0.015;
    scene.add(key);
    const fill = new THREE.DirectionalLight('#e4edff', 1.3);
    fill.position.set(4, 3, 2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight('#ffe7c4', 1.8);
    rim.position.set(0, 4, -3);
    scene.add(rim);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({ color: '#826e5b', opacity: 0.16 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.017;
    floor.receiveShadow = true;
    scene.add(floor);
    const resize = new ResizeObserver(() => {
      const w = container.clientWidth,
        h = container.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resize.observe(container);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    void new GLTFLoader()
      .loadAsync('/models/luna-ps1.glb?v=1')
      .then((gltf) => {
        if (disposed) {
          disposeModel(gltf.scene);
          return;
        }
        model = gltf.scene;
        // The studio camera is framed for a 2.5-unit character standing on y = 0.
        const bounds = new THREE.Box3().setFromObject(model);
        model.scale.setScalar(2.5 / Math.max(bounds.max.y - bounds.min.y, 0.01));
        model.position.y = -bounds.min.y * model.scale.y;
        scene.add(model);
        model.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });
        const animation = createLunaAnimation(model);
        let lastWave = values.current.wave,
          lastReset = values.current.reset;
        const clock = new THREE.Clock();
        setState('ready');
        const animate = () => {
          if (disposed) return;
          frame = requestAnimationFrame(animate);
          const delta = Math.min(clock.getDelta(), 0.05);
          if (document.hidden) return;
          if (values.current.reset !== lastReset) {
            lastReset = values.current.reset;
            camera.position.copy(defaultCamera);
            controls.target.set(0, 1.25, 0);
          }
          if (values.current.wave !== lastWave) {
            lastWave = values.current.wave;
            animation.greet();
          }
          animation.update(delta, values.current.moving, reduced.matches);
          controls.update();
          renderer.render(scene, camera);
        };
        animate();
      })
      .catch(() => {
        if (!disposed) setState('error');
      });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      controls.dispose();
      if (model) disposeModel(model);
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      key.shadow.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return (
    <>
      <div className={styles.canvasHost} ref={host} />
      {state !== 'ready' && (
        <>
          <img
            className={styles.poster}
            src="/models/luna-ps1-preview.webp?v=1"
            alt="Luna mengenakan kaus pink, rompi abu-abu, cargo, dan sneakers krem"
          />
          <div className={styles.status} role="status">
            {state === 'loading' ? (
              'Menyiapkan Luna…'
            ) : (
              <>
                Pratinjau 3D belum tersedia di perangkat ini.
                <br />
                <a href="/models/luna-ps1.glb?v=1" download>
                  Unduh model Luna
                </a>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
