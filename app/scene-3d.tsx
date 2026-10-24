'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import DriveTV, { type TVProgram } from './drive-tv';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { BookOpen, Coffee, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { createSceneAmbience, type SceneAmbience } from './scene-ambience';
import { cafePaths, type CafePathData } from '@/lib/cafe-paths';
import { prepareCafeBarWorkspace } from '@/lib/cafe-bar-workspace';
import { addCafeWalkSurfaces } from '@/lib/cafe-walk-surfaces';
import { placeCafePeople } from './scene-people';
import { EMPTY_CAFE_ACTIVITY, type CafeActivity } from '@/lib/cafe-activity';

function objectByModelName(root: THREE.Object3D, name: string) {
  return (
    root.getObjectByName(name) ||
    root.getObjectByName(name.replaceAll('.', '').replaceAll(' ', '_'))
  );
}

const MAX_CAFE_DISTANCE = 14.5;
type FadingMaterial = { material: THREE.Material; opacity: number };
function trafficVisibility(progress: number) {
  return (
    THREE.MathUtils.smoothstep(progress, 0, 0.16) *
    (1 - THREE.MathUtils.smoothstep(progress, 0.84, 1))
  );
}
function setVehicleFade(vehicle: THREE.Group, fade: number) {
  for (const { material, opacity } of vehicle.userData.fadeMaterials as FadingMaterial[])
    material.opacity = opacity * fade;
}

function makeVehicle(kind: 'car' | 'truck') {
  const truck = kind === 'truck',
    vehicle = new THREE.Group();
  vehicle.name = truck ? 'Truk lewat' : 'Mobil lewat';
  const paint = new THREE.MeshStandardMaterial({
    color: truck ? '#d4bb94' : '#a65b4a',
    metalness: 0.08,
    roughness: 0.47,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: '#292c30',
    metalness: 0.15,
    roughness: 0.65,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#a8bfca',
    metalness: 0.08,
    roughness: 0.12,
    transparent: true,
    opacity: 0.75,
  });
  const lamp = new THREE.MeshBasicMaterial({ color: '#fff1ca', transparent: true, opacity: 0.38 }),
    tail = new THREE.MeshBasicMaterial({ color: '#ba3930' });
  const box = (
    width: number,
    height: number,
    length: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, length), material);
    mesh.position.set(x, y, z);
    vehicle.add(mesh);
    return mesh;
  };
  if (truck) {
    box(0.82, 0.28, 2.15, 0, 0.33, 0, trim);
    box(0.76, 0.55, 0.7, 0, 0.69, -0.72, paint);
    box(0.77, 0.74, 1.24, 0, 0.77, 0.4, paint);
    box(0.58, 0.22, 0.02, 0, 0.76, -1.08, glass);
  } else {
    box(0.75, 0.3, 1.45, 0, 0.34, 0, paint);
    box(0.61, 0.27, 0.71, 0, 0.61, 0.02, glass);
    box(0.65, 0.06, 0.4, 0, 0.77, 0.08, paint);
  }
  const axles = truck ? [-0.76, 0.67] : [-0.48, 0.47];
  for (const z of axles)
    for (const side of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 12), trim);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 0.39, 0.16, z);
      vehicle.add(wheel);
    }
  const nose = truck ? -1.1 : -0.74,
    back = truck ? 1.1 : 0.74;
  for (const side of [-1, 1]) {
    box(0.13, 0.09, 0.025, side * 0.26, 0.38, nose, lamp);
    box(0.12, 0.08, 0.025, side * 0.26, 0.38, back, tail);
  }
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 128;
  const context = glowCanvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 7, 64, 64, 62);
    gradient.addColorStop(0, 'rgba(255,246,204,0.65)');
    gradient.addColorStop(0.5, 'rgba(255,225,155,0.28)');
    gradient.addColorStop(1, 'rgba(255,210,130,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  }
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  const glowMaterial = new THREE.MeshBasicMaterial({
    map: glowTexture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const roadGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 2.5), glowMaterial);
  roadGlow.rotation.x = -Math.PI / 2;
  roadGlow.position.set(0, 0.027, nose - 1.25);
  roadGlow.visible = false;
  vehicle.add(roadGlow);
  const fadeMaterials = [paint, trim, glass, tail].map((material) => ({
    material,
    opacity: material.opacity,
  }));
  // Keep render flags fixed so fading never recompiles a passing vehicle's shaders.
  fadeMaterials.forEach(({ material }) => {
    material.transparent = true;
    material.opacity = 0;
  });
  vehicle.userData = { paint, lamp, roadGlow, glowTexture, fadeMaterials };
  vehicle.visible = false;
  return vehicle;
}

type VehicleSound = {
  engine: OscillatorNode;
  harmonic: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  pan: StereoPannerNode;
  basePitch: number;
};
function startVehicleSound(context: AudioContext, truck: boolean): VehicleSound {
  const engine = context.createOscillator(),
    harmonic = context.createOscillator(),
    filter = context.createBiquadFilter(),
    gain = context.createGain(),
    pan = context.createStereoPanner();
  const basePitch = truck ? 67 : 104;
  engine.type = 'sawtooth';
  engine.frequency.value = basePitch;
  harmonic.type = 'triangle';
  harmonic.frequency.value = basePitch * 1.52;
  filter.type = 'lowpass';
  filter.frequency.value = truck ? 280 : 390;
  gain.gain.value = 0;
  engine.connect(filter);
  harmonic.connect(filter);
  filter.connect(gain);
  gain.connect(pan);
  pan.connect(context.destination);
  engine.start();
  harmonic.start();
  return { engine, harmonic, filter, gain, pan, basePitch };
}
function stopVehicleSound(sound: VehicleSound) {
  const at = sound.engine.context.currentTime;
  sound.gain.gain.cancelScheduledValues(at);
  sound.gain.gain.setTargetAtTime(0, at, 0.025);
  sound.engine.stop(at + 0.14);
  sound.harmonic.stop(at + 0.14);
  sound.engine.onended = () => {
    sound.engine.disconnect();
    sound.harmonic.disconnect();
    sound.filter.disconnect();
    sound.gain.disconnect();
    sound.pan.disconnect();
  };
}
function playHonk(context: AudioContext, panValue: number) {
  const at = context.currentTime,
    gain = context.createGain(),
    pan = context.createStereoPanner();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(0.055, at + 0.035);
  gain.gain.setValueAtTime(0.055, at + 0.18);
  gain.gain.exponentialRampToValueAtTime(0.001, at + 0.34);
  pan.pan.value = panValue;
  gain.connect(pan);
  pan.connect(context.destination);
  for (const frequency of [370, 465]) {
    const tone = context.createOscillator();
    tone.type = 'sine';
    tone.frequency.value = frequency;
    tone.connect(gain);
    tone.start(at);
    tone.stop(at + 0.36);
    tone.onended = () => tone.disconnect();
  }
}
type TrafficLane = {
  start: THREE.Vector3;
  end: THREE.Vector3;
  direction: THREE.Vector3;
  headlight: THREE.PointLight;
  car: THREE.Group;
  truck: THREE.Group;
  active?: THREE.Group;
  audio?: VehicleSound;
  driveStartedAt: number;
  driveDuration: number;
  nextVehicleAt: number;
  hornAt: number;
  hornPlayed: boolean;
};

export default function CafeScene({
  activity = EMPTY_CAFE_ACTIVITY,
  libraryRequest = 0,
  tvRequest = 0,
  tvExpandRequest = 0,
  telescopeRequest = 0,
  paused = false,
  onTelescopeReady,
  onTelescopeClick,
  onBookshelfClick,
}: {
  activity?: CafeActivity;
  libraryRequest?: number;
  tvRequest?: number;
  tvExpandRequest?: number;
  paused?: boolean;
  telescopeRequest?: number;
  onTelescopeReady?: () => void;
  onTelescopeClick?: () => void;
  onBookshelfClick?: () => void;
} = {}) {
  const [tvProgram, setTvProgram] = useState<TVProgram>({ photoId: '', playing: true });
  const [tvMount, setTvMount] = useState<HTMLDivElement | null>(null),
    [tvActive, setTvActive] = useState(false),
    [tvExpanded, setTvExpanded] = useState(false),
    [tvVisible, setTvVisible] = useState(false);
  const lastExternalTV = useRef(0),
    lastExpandTV = useRef(0);
  const viewRef = useRef({
      activity,
      libraryRequest,
      reset: 0,
      tv: 0,
      telescopeRequest,
      paused,
      onTelescopeReady,
      onTelescopeClick,
      onBookshelfClick,
    }),
    shelfMarker = useRef<HTMLButtonElement>(null),
    [libraryActive, setLibraryActive] = useState(false);
  useEffect(() => {
    if (tvRequest !== lastExternalTV.current) {
      lastExternalTV.current = tvRequest;
      viewRef.current.tv += 1;
    }
  }, [tvRequest]);
  useEffect(() => {
    if (tvExpandRequest !== lastExpandTV.current) {
      lastExpandTV.current = tvExpandRequest;
      setTvExpanded(true);
    }
  }, [tvExpandRequest]);
  viewRef.current.activity = activity;
  viewRef.current.libraryRequest = libraryRequest;
  viewRef.current.onBookshelfClick = onBookshelfClick;
  viewRef.current.onTelescopeClick = onTelescopeClick;
  viewRef.current.paused = paused;
  viewRef.current.telescopeRequest = telescopeRequest;
  viewRef.current.onTelescopeReady = onTelescopeReady;
  const host = useRef<HTMLDivElement>(null),
    modeRef = useRef<'morning' | 'night'>('morning'),
    audioRef = useRef<AudioContext | null>(null),
    ambienceRef = useRef<SceneAmbience | null>(null),
    soundRef = useRef(false),
    [enteringScope, setEnteringScope] = useState(false),
    [modelReady, setModelReady] = useState(false),
    [mode, setMode] = useState<'morning' | 'night'>('morning'),
    [soundEnabled, setSoundEnabled] = useState(false);
  modeRef.current = mode;
  soundRef.current = soundEnabled;
  useEffect(() => {
    ambienceRef.current?.setMode(mode);
  }, [mode]);
  const toggleSound = async () => {
    if (soundEnabled) {
      ambienceRef.current?.setEnabled(false);
      soundRef.current = false;
      setSoundEnabled(false);
      return;
    }
    try {
      if (!audioRef.current || audioRef.current.state === 'closed')
        audioRef.current = new AudioContext();
      await audioRef.current.resume();
      if (!ambienceRef.current) ambienceRef.current = createSceneAmbience(audioRef.current);
      ambienceRef.current.setMode(modeRef.current);
      ambienceRef.current.setEnabled(true);
      soundRef.current = true;
      setSoundEnabled(true);
    } catch {
      soundRef.current = false;
      setSoundEnabled(false);
    }
  };
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const debugPerf =
      process.env.NODE_ENV !== 'production' &&
      new URLSearchParams(window.location.search).has('sceneStats');
    let perfAt = performance.now(),
      perfFrames = 0,
      perfCpu = 0,
      perfCalls = 0,
      perfTriangles = 0;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)'),
      compact = window.matchMedia('(pointer: coarse)').matches;
    let inViewport = true,
      suspended = false,
      visibleTV = false,
      lastReflectionAt = 0,
      reflectionBusy = false,
      reflectionIndex = 0,
      qualityAt = 0,
      qualityFrames = 0,
      pixelScale = 1;
    const frustum = new THREE.Frustum(),
      viewMatrix = new THREE.Matrix4(),
      mirrorBasis = new THREE.Matrix4(),
      mirrorFacing = new THREE.Vector3(),
      mirrorRight = new THREE.Vector3(),
      mirrorView = new THREE.Vector3(),
      tvProjected = new THREE.Vector3();
    let disposed = false,
      frame = 0,
      renderer: THREE.WebGLRenderer | undefined,
      controls: OrbitControls | undefined,
      resize: ResizeObserver | undefined,
      assetRoot: THREE.Group | undefined,
      cssRenderer: CSS3DRenderer | undefined,
      tvSurface: THREE.Mesh | undefined;
    let people: ReturnType<typeof placeCafePeople> | undefined;
    const cssScene = new THREE.Scene();
    let tvLayer: CSS3DObject | undefined,
      tvObject: THREE.Object3D | undefined,
      tvTarget: THREE.Vector3 | undefined,
      tvCamera: THREE.Vector3 | undefined,
      lastTvRequest = 0,
      tvMode = false,
      lastTvVisibilityAt = 0;
    const tvNormal = new THREE.Vector3(-1, 0, 0),
      tvSight = new THREE.Raycaster(),
      tvDirection = new THREE.Vector3();
    const ripples: THREE.Mesh[] = [];
    const fish: THREE.Group[] = [];
    const mirrors: {
      mesh: Reflector;
      front: THREE.Vector3;
      back: THREE.Vector3;
      right: THREE.Vector3;
      up: THREE.Vector3;
      normal: THREE.Vector3;
    }[] = [];
    const foliage: {
      node: THREE.Object3D;
      x: number;
      z: number;
      phase: number;
      amplitude: number;
    }[] = [];
    const bulbs = new Set<THREE.MeshStandardMaterial>(),
      nightLights: THREE.PointLight[] = [],
      neonPanels: THREE.Mesh[] = [];
    const trafficModels: THREE.Group[] = [],
      trafficLights: THREE.PointLight[] = [],
      activeSounds = new Set<VehicleSound>();
    const addedMaterials: THREE.Material[] = [];
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#e9ded0');
    const camera = new THREE.PerspectiveCamera(60, 1, 0.03, 100),
      overviewTarget = new THREE.Vector3(-0.35, 1, 0.15),
      overviewCamera = overviewTarget
        .clone()
        .add(new THREE.Vector3(1, 0.64, 1).normalize().multiplyScalar(MAX_CAFE_DISTANCE));
    camera.position.copy(overviewCamera);
    const shelfParts = new Set<THREE.Object3D>();
    let shelf: THREE.Object3D | undefined,
      shelfTarget: THREE.Vector3 | undefined,
      shelfCamera: THREE.Vector3 | undefined,
      libraryMode = false,
      lastLibraryRequest = 0,
      lastReset = 0;
    let lensTarget: THREE.Vector3 | undefined,
      lensNormal: THREE.Vector3 | undefined,
      lastTelescopeRequest = 0,
      telescopeMode = false,
      wasPaused = false;
    let transition:
      | {
          scope?: boolean;
          fromCamera: THREE.Vector3;
          fromTarget: THREE.Vector3;
          toCamera: THREE.Vector3;
          toTarget: THREE.Vector3;
          fromFov: number;
          toFov: number;
          age: number;
        }
      | undefined;
    const raycaster = new THREE.Raycaster(),
      pointer = new THREE.Vector2(),
      markerPosition = new THREE.Vector3();
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch {
      container.dataset.error = 'unsupported';
      setModelReady(true);
      return;
    }
    if (debugPerf) renderer.info.autoReset = false;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.13;
    const applyResolution = () => {
      if (!renderer) return;
      const area = Math.max(1, container.clientWidth * container.clientHeight),
        budget = compact ? 700_000 : 1_100_000;
      renderer.setPixelRatio(
        Math.max(
          0.75,
          Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 1.5, Math.sqrt(budget / area)) *
            pixelScale,
        ),
      );
    };
    applyResolution();
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.domElement.setAttribute(
      'aria-label',
      'Model 3D kafe Winds Space. Seret untuk memutar dan cubit untuk memperbesar.',
    );
    renderer.domElement.tabIndex = 0;
    container.appendChild(renderer.domElement);
    const ambient = new THREE.HemisphereLight('#fff5e5', '#9b8572', 1.8);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight('#ffe5bb', 2.1);
    sun.position.set(7, 13, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    sun.shadow.radius = 4;
    scene.add(sun);
    const fill = new THREE.DirectionalLight('#fff4e6', 0.7);
    fill.position.set(-8, 7, -6);
    scene.add(fill);
    const moon = new THREE.DirectionalLight('#aabbd2', 0);
    moon.position.set(-5, 9, -4);
    scene.add(moon);
    const daySky = new THREE.Color('#e9ded0'),
      nightSky = new THREE.Color('#1a2330'),
      dayGround = new THREE.Color('#e9ded0'),
      nightGround = new THREE.Color('#252b34');
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: '#e9ded0', roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.08;
    floor.receiveShadow = true;
    scene.add(floor);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 5;
    controls.maxDistance = MAX_CAFE_DISTANCE;
    controls.enablePan = false;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.minPolarAngle = 0.2;
    controls.autoRotateSpeed = 0.45;
    controls.update();
    let lastInteractionAt = performance.now(),
      cameraGestureActive = false;
    const activePointers = new Map<number, { x: number; y: number }>();
    const markInteraction = () => {
      if (telescopeMode) return;
      lastInteractionAt = performance.now();
      transition = undefined;
      if (controls) controls.autoRotate = false;
    };
    const onPointerDown = (event: PointerEvent) => {
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    };
    const onPointerMove = (event: PointerEvent) => {
      const previous = activePointers.get(event.pointerId);
      if (!previous) return;
      if (telescopeMode) return;
      if (
        cameraGestureActive ||
        Math.hypot(event.clientX - previous.x, event.clientY - previous.y) > 3
      ) {
        cameraGestureActive = true;
        markInteraction();
      }
    };
    const onPointerEnd = (event: PointerEvent) => {
      const start = activePointers.get(event.pointerId);
      const tapped =
        event.type === 'pointerup' &&
        !!start &&
        !cameraGestureActive &&
        activePointers.size === 1 &&
        Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6;
      activePointers.delete(event.pointerId);
      if (!activePointers.size && cameraGestureActive) {
        cameraGestureActive = false;
        markInteraction();
      }
      if (tapped && assetRoot && renderer) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.set(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          (-(event.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObject(assetRoot, true).find(({ object }) => {
          const mesh = object as THREE.Mesh;
          return (
            mesh.isMesh &&
            mesh.visible &&
            !(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).every(
              (material) => material.transparent && material.opacity < 0.3,
            )
          );
        });
        if (hit) {
          let node: THREE.Object3D | null = hit.object;
          while (node) {
            if (/telescope|teleskop/i.test(node.name)) {
              viewRef.current.onTelescopeClick?.();
              break;
            }
            if (node === tvObject) {
              viewRef.current.tv += 1;
              break;
            }
            if (shelfParts.has(node)) {
              viewRef.current.onBookshelfClick?.();
              break;
            }
            node = node.parent;
          }
        }
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerEnd);
    renderer.domElement.addEventListener('pointercancel', onPointerEnd);
    renderer.domElement.addEventListener('lostpointercapture', onPointerEnd);
    renderer.domElement.addEventListener('wheel', markInteraction, { passive: true });
    const visibility = new IntersectionObserver(
      (entries) => {
        inViewport = entries[0]?.isIntersecting ?? true;
      },
      { rootMargin: '100px' },
    );
    visibility.observe(container);
    const loader = new GLTFLoader();
    void loader
      .loadAsync('/models/winds-space-new.glb?v=1')
      .then(async (gltf) => {
        if (disposed) return;
        const model = gltf.scene;
        model.updateMatrixWorld(true);
        const fitObjects = [
          'floor lantai 1',
          'floor lantai 2',
          'Area bar',
          'mesin kopi',
          'kursi take away',
          'kursi indoor 1',
        ]
          .map((name) => objectByModelName(model, name))
          .filter((o): o is THREE.Object3D => !!o);
        const bounds = new THREE.Box3();
        if (fitObjects.length)
          fitObjects.forEach((o) => bounds.union(new THREE.Box3().setFromObject(o)));
        else bounds.setFromObject(model);
        const center = bounds.getCenter(new THREE.Vector3()),
          size = bounds.getSize(new THREE.Vector3()),
          scale = 10 / Math.max(size.x, size.z, size.y, 1);
        assetRoot = new THREE.Group();
        model.scale.setScalar(scale);
        model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
        assetRoot.add(model);
        scene.add(assetRoot);
        assetRoot.updateMatrixWorld(true);
        const preparedTextures = new Set<THREE.Texture>();
        model.traverse((node) => {
          const mesh = node as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          const label = node.name.toLowerCase();
          if (/leaves|daun|undergrowth|tree_base_plant|pohon pasui/.test(label)) {
            if (label.includes('pasui - daun rindang')) {
              const phase = [...label].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 0.17;
              foliage.push({
                node,
                x: node.rotation.x,
                z: node.rotation.z,
                phase,
                amplitude: 0.008,
              });
            }
          }
          const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const material of meshMaterials)
            for (const value of Object.values(material)) {
              if (!(value instanceof THREE.Texture) || preparedTextures.has(value)) continue;
              preparedTextures.add(value);
              const image = value.image,
                limit = compact ? 1024 : 2048;
              if (image?.width > limit || image?.height > limit) {
                const ratio = limit / Math.max(image.width, image.height),
                  canvas = document.createElement('canvas');
                canvas.width = Math.round(image.width * ratio);
                canvas.height = Math.round(image.height * ratio);
                const context = canvas.getContext('2d');
                if (context) {
                  context.drawImage(image, 0, 0, canvas.width, canvas.height);
                  value.image = canvas;
                  value.needsUpdate = true;
                }
              }
            }
          meshMaterials.forEach((material) => {
            const physical = material as THREE.MeshPhysicalMaterial;
            if (physical.transmission > 0) {
              physical.transmission = 0;
              physical.transparent = true;
              physical.opacity = 0.22;
              physical.depthWrite = false;
              physical.needsUpdate = true;
            }
            if (material.name === 'WS_Warm_Bulb') bulbs.add(material as THREE.MeshStandardMaterial);
          });
          if (mesh.name.toLowerCase().startsWith('kaca')) {
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            mats.forEach((m) => {
              const glass = m as THREE.MeshPhysicalMaterial;
              glass.transparent = true;
              glass.opacity = 0.22;
              glass.transmission = 0;
              glass.roughness = 0.07;
              glass.metalness = 0;
              glass.depthWrite = false;
              glass.side = THREE.DoubleSide;
              glass.needsUpdate = true;
            });
            mesh.castShadow = false;
          }
        });
        // glTF PBR metal alone cannot reflect nearby walls. These two planar render targets do.
        for (const name of ['cermin1', 'cermin2']) {
          const surface = objectByModelName(model, name) as THREE.Mesh | undefined;
          if (!surface?.isMesh) continue;
          surface.geometry.computeBoundingBox();
          const box = surface.geometry.boundingBox;
          if (!box) continue;
          const dimensions = box.getSize(new THREE.Vector3()),
            worldScale = surface.getWorldScale(new THREE.Vector3());
          const reflection = new Reflector(
            new THREE.PlaneGeometry(dimensions.z * worldScale.z, dimensions.x * worldScale.x),
            {
              clipBias: 0.003,
              textureWidth: compact ? 256 : 384,
              textureHeight: compact ? 256 : 384,
              multisample: 0,
              color: 0xffffff,
            },
          );
          const middle = box.getCenter(new THREE.Vector3());
          const front = surface.localToWorld(new THREE.Vector3(middle.x, box.max.y, middle.z));
          const back = surface.localToWorld(new THREE.Vector3(middle.x, box.min.y, middle.z));
          const right = new THREE.Vector3(0, 0, 1).transformDirection(surface.matrixWorld);
          const up = new THREE.Vector3(1, 0, 0).transformDirection(surface.matrixWorld);
          const normal = new THREE.Vector3().crossVectors(right, up).normalize();
          // Keep a visible silver base even when the browser cannot allocate a reflection target.
          const silver = new THREE.MeshStandardMaterial({
            color: '#dce4e2',
            metalness: 0,
            roughness: 0.12,
            side: THREE.DoubleSide,
          });
          surface.material = silver;
          addedMaterials.push(silver);
          // Capture one mirror at a time, never from another mirror or a secondary render pass.
          const capture = reflection.onBeforeRender.bind(reflection);
          reflection.onBeforeRender = (r, world, view, ...args) => {
            if (
              view !== camera ||
              reflectionBusy ||
              performance.now() - lastReflectionAt < (compact ? 100 : 66)
            )
              return;
            const available = mirrors.filter((item) => frustum.intersectsObject(item.mesh));
            if (
              available.length &&
              available[reflectionIndex % available.length].mesh !== reflection
            )
              return;
            reflectionBusy = true;
            lastReflectionAt = performance.now();
            reflectionIndex++;
            try {
              capture(r, world, view, ...args);
            } finally {
              reflectionBusy = false;
            }
          };
          reflection.name = name + '_reflection';
          reflection.renderOrder = 5;
          scene.add(reflection);
          mirrors.push({ mesh: reflection, front, back, right, up, normal });
        }
        const pond = objectByModelName(model, 'Kolam ikan') as THREE.Mesh | undefined;
        if (pond?.isMesh) {
          const water = new THREE.MeshPhysicalMaterial({
            color: 0x72b4b4,
            metalness: 0.05,
            roughness: 0.13,
            transparent: true,
            opacity: 0.53,
            side: THREE.DoubleSide,
            clearcoat: 1,
            clearcoatRoughness: 0.06,
            depthWrite: false,
          });
          pond.material = water;
          addedMaterials.push(water);
          for (let i = 0; i < 6; i++) {
            const ringMaterial = new THREE.MeshBasicMaterial({
              color: 0xe8fff4,
              transparent: true,
              opacity: 0.42,
              side: THREE.DoubleSide,
              depthWrite: false,
            });
            addedMaterials.push(ringMaterial);
            const ring = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.125, 40), ringMaterial);
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(Math.sin(i * 2.4) * 0.45, 0.024, Math.cos(i * 2.4) * 0.42);
            ring.userData.phase = i / 6;
            pond.add(ring);
            ripples.push(ring);
          }
          for (let i = 0; i < 5; i++) {
            const swimmer = new THREE.Group(),
              color = ['#ef8c49', '#fff3db', '#e9a44e', '#454b55', '#f2c38c'][i];
            const fishMaterial = new THREE.MeshStandardMaterial({
              color,
              roughness: 0.45,
              emissive: color,
              emissiveIntensity: 0.09,
            });
            addedMaterials.push(fishMaterial);
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 10), fishMaterial);
            body.scale.set(1, 0.45, 0.55);
            swimmer.add(body);
            const tail = new THREE.Mesh(new THREE.ConeGeometry(0.072, 0.13, 3), fishMaterial);
            tail.rotation.z = Math.PI / 2;
            tail.position.x = -0.16;
            swimmer.add(tail);
            const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x272b2b });
            addedMaterials.push(eyeMaterial);
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 6), eyeMaterial);
            eye.position.set(0.07, 0.027, 0.047);
            swimmer.add(eye);
            swimmer.position.y = -0.025;
            pond.add(swimmer);
            fish.push(swimmer);
          }
        }
        const warmBar = new THREE.PointLight('#ffd5a5', 1.4, 6, 2);
        warmBar.position.set(0, 2.5, 0);
        scene.add(warmBar);
        const addNightLight = (name: string, intensity: number, distance: number, offsetY = 0) => {
          const anchor = objectByModelName(model, name);
          if (!anchor) return;
          const position = anchor.getWorldPosition(new THREE.Vector3());
          const light = new THREE.PointLight('#ffd19a', 0, distance, 2);
          light.position.copy(position).add(new THREE.Vector3(0, offsetY, 0));
          scene.add(light);
          nightLights.push(light);
          light.userData.nightIntensity = intensity;
        };
        addNightLight('Lampu gantung', 2.7, 4.5, -0.25);
        addNightLight('lampu gantung 2', 2.7, 4.5, -0.25);
        // Separate pools of light keep the bar, reading corner, and both upstairs zones visible.
        addNightLight('Area bar', 3.8, 6, 0.85);
        addNightLight('Rak buku', 2.4, 3.8, 0.35); // Rak buku lantai 1.
        addNightLight('meja atas 1', 4.6, 6, 1.05);
        addNightLight('meja atas luar', 2.8, 5, 0.75);
        addNightLight('WS_Courtyard_Tree_Root', 1.6, 5, 1.5);
        // These two exterior logo decals become warm, backlit panels after sunset.
        for (const name of ['Untitled_Artwork.001', 'Untitled_Artwork.002']) {
          const sign = objectByModelName(model, name) as THREE.Mesh | undefined;
          if (!sign?.isMesh) continue;
          sign.geometry.computeBoundingBox();
          const box = sign.geometry.boundingBox;
          if (!box) continue;
          const size = box.getSize(new THREE.Vector3()),
            center = box.getCenter(new THREE.Vector3());
          const panelMaterial = new THREE.MeshBasicMaterial({
            color: '#ffe2ac',
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
            depthWrite: false,
            toneMapped: false,
          });
          addedMaterials.push(panelMaterial);
          const panel = new THREE.Mesh(
            new THREE.PlaneGeometry(size.x + 0.065, size.z + 0.055),
            panelMaterial,
          );
          panel.rotation.x = -Math.PI / 2;
          panel.position.set(center.x, -0.018, center.z);
          panel.visible = false;
          sign.add(panel);
          neonPanels.push(panel);
        }
        const road = objectByModelName(model, 'jalan poros');
        const trafficLanes: TrafficLane[] = [];
        if (road) {
          // The road's geometry runs from -1 to +1 on its local Z axis.
          // Fade both asphalt and lane markings into the ground at the two ends.
          road.traverse((object) => {
            const roadMesh = object as THREE.Mesh;
            if (!roadMesh.isMesh) return;
            const originals = Array.isArray(roadMesh.material)
              ? roadMesh.material
              : [roadMesh.material];
            const softened = originals.map((original) => {
              const material = original.clone();
              material.transparent = true;
              material.depthWrite = false;
              material.onBeforeCompile = (shader) => {
                shader.vertexShader =
                  'varying float vRoadEndZ;\n' +
                  shader.vertexShader.replace(
                    '#include <begin_vertex>',
                    '#include <begin_vertex>\nvRoadEndZ = position.z;',
                  );
                shader.fragmentShader =
                  'varying float vRoadEndZ;\n' +
                  shader.fragmentShader.replace(
                    '#include <color_fragment>',
                    '#include <color_fragment>\ndiffuseColor.a *= 1.0 - smoothstep(0.72, 1.0, abs(vRoadEndZ));',
                  );
              };
              material.customProgramCacheKey = () => 'winds-road-ends-v1';
              return material;
            });
            roadMesh.material = Array.isArray(roadMesh.material) ? softened : softened[0];
            roadMesh.castShadow = false;
            addedMaterials.push(...originals);
          });
          const left = road.localToWorld(new THREE.Vector3(-1, 0, 0));
          const right = road.localToWorld(new THREE.Vector3(1, 0, 0));
          const vehicleScale = (left.distanceTo(right) * 0.3) / 0.82;
          for (const [index, laneX] of [-0.45, 0.45].entries()) {
            // Increasing local Z moves left across the dashboard's initial camera view.
            const start = road.localToWorld(new THREE.Vector3(laneX, 0.025, -0.98));
            const end = road.localToWorld(new THREE.Vector3(laneX, 0.025, 0.98));
            const car = makeVehicle('car'),
              truck = makeVehicle('truck');
            for (const vehicle of [car, truck]) {
              vehicle.scale.setScalar(vehicleScale);
              vehicle.rotation.y = Math.atan2(start.x - end.x, start.z - end.z);
              scene.add(vehicle);
              trafficModels.push(vehicle);
            }
            // Keep one light per lane in the scene so passing cars do not change shader light counts.
            const headlight = new THREE.PointLight('#ffe4ae', 0, 2.8, 2);
            headlight.position.copy(start);
            scene.add(headlight);
            trafficLights.push(headlight);
            trafficLanes.push({
              start,
              end,
              direction: end.clone().sub(start).normalize(),
              headlight,
              car,
              truck,
              driveStartedAt: 0,
              driveDuration: 1,
              nextVehicleAt: 1.5 + index * 1.4,
              hornAt: Infinity,
              hornPlayed: false,
            });
          }
        }
        // The library anchor uses the reading-corner shelf in the exported cafe.
        shelf = objectByModelName(model, 'Rak buku');
        const decorativeBooks = objectByModelName(model, 'WS_Decorative_Books');
        if (decorativeBooks) shelfParts.add(decorativeBooks);
        if (shelf) {
          shelfParts.add(shelf);
          const shelfContents = objectByModelName(model, 'Plane.012');
          if (shelfContents) shelfParts.add(shelfContents);
          const shelfBounds = new THREE.Box3().setFromObject(shelf);
          shelfTarget = shelfBounds.getCenter(new THREE.Vector3());
          // Approach the reading corner from the courtyard.
          shelfCamera = shelfTarget.clone().add(new THREE.Vector3(-3.7, 0.28, -0.08));
        }
        tvObject = objectByModelName(model, 'TV');
        if (tvObject) {
          const bounds = new THREE.Box3().setFromObject(tvObject),
            size = bounds.getSize(new THREE.Vector3());
          tvTarget = bounds.getCenter(new THREE.Vector3());
          tvTarget.x = bounds.min.x - 0.009;
          tvCamera = tvTarget.clone().add(new THREE.Vector3(-2.65, 0.12, 0.01));
          const canvas = document.createElement('canvas');
          canvas.width = 360;
          canvas.height = 640;
          const context = canvas.getContext('2d');
          if (context) {
            context.fillStyle = '#242a24';
            context.fillRect(0, 0, 360, 640);
            context.fillStyle = '#d7b6a3';
            context.font = '36px Georgia';
            context.textAlign = 'center';
            context.fillText('Winds Space', 180, 270);
            context.fillStyle = '#fff3df';
            context.font = '23px sans-serif';
            context.fillText('@winds_space', 180, 320);
            context.font = '15px sans-serif';
            context.fillText('FEED · REELS · HIGHLIGHT', 180, 365);
            context.fillText('Klik untuk menonton', 180, 405);
          }
          const texture = new THREE.CanvasTexture(canvas);
          texture.colorSpace = THREE.SRGBColorSpace;
          tvSurface = new THREE.Mesh(
            new THREE.PlaneGeometry(size.z * 0.96, size.y * 0.98),
            new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
          );
          tvSurface.position.copy(tvTarget);
          tvSurface.rotation.y = -Math.PI / 2;
          scene.add(tvSurface);
          const element = document.createElement('div');
          element.className = 'scene-tv-screen';
          element.style.width = '360px';
          element.style.height = '640px';
          tvLayer = new CSS3DObject(element);
          tvLayer.position.copy(tvTarget).addScaledVector(tvNormal, 0.002);
          tvLayer.rotation.y = -Math.PI / 2;
          tvLayer.scale.set((size.z * 0.96) / 360, (size.y * 0.98) / 640, 1);
          cssScene.add(tvLayer);
          cssRenderer = new CSS3DRenderer();
          cssRenderer.domElement.className = 'scene-tv-layer';
          cssRenderer.setSize(container.clientWidth, container.clientHeight);
          container.appendChild(cssRenderer.domElement);
          setTvMount(element);
        }
        const telescope = objectByModelName(model, 'WS_Telescope_Tripod');
        if (telescope) {
          // Side focuser: the outer end of the short +X ocular tube in this GLB,
          // separate from the large objective glass at the front (-Z).
          lensTarget = telescope.localToWorld(new THREE.Vector3(0.1611, -0.167, -0.2293));
          lensNormal = new THREE.Vector3(1, 0, 0).transformDirection(telescope.matrixWorld);
        }
        const moveCamera = (view: 'cafe' | 'library' | 'tv') => {
          telescopeMode = false;
          setEnteringScope(false);
          controls!.enabled = true;
          controls!.minPolarAngle = 0.2;
          controls!.maxPolarAngle = Math.PI * 0.48;
          libraryMode = view === 'library' && !!shelfTarget && !!shelfCamera;
          tvMode = view === 'tv' && !!tvTarget && !!tvCamera;
          setLibraryActive(libraryMode);
          setTvActive(tvMode);
          controls!.autoRotate = false;
          controls!.enableDamping = false;
          controls!.update();
          controls!.enableDamping = true;
          controls!.minDistance = libraryMode || tvMode ? 0.6 : 5;
          transition = {
            fromCamera: camera.position.clone(),
            fromTarget: controls!.target.clone(),
            toCamera: (libraryMode ? shelfCamera! : tvMode ? tvCamera! : overviewCamera).clone(),
            toTarget: (libraryMode ? shelfTarget! : tvMode ? tvTarget! : overviewTarget).clone(),
            fromFov: camera.fov,
            toFov: view === 'cafe' ? 60 : 34,
            age: 0,
          };
          lastInteractionAt = performance.now();
        };
        try {
          const [navData, luna] = await Promise.all([
            fetch('/models/cafe-navigation-v1.json').then((r) => {
              if (!r.ok) throw new Error('Navigation unavailable');
              return r.json() as Promise<CafePathData>;
            }),
            loader.loadAsync('/models/luna-chibi.glb?v=1'),
          ]);
          if (disposed) return;
          prepareCafeBarWorkspace(model);
          addCafeWalkSurfaces(model);
          people = placeCafePeople(model, cafePaths(model, navData), luna.scene);
          assetRoot!.add(people.root);
          assetRoot!.updateMatrixWorld(true);
          people.updateActivity(viewRef.current.activity);
        } catch (error) {
          console.warn('Cafe characters unavailable', error);
        }
        let lastHornAt = -Infinity;
        renderer!.shadowMap.needsUpdate = true;
        controls!.target.copy(overviewTarget);
        controls!.update();
        // All traffic variants and nighttime glows compile before the first car appears.
        neonPanels.forEach((panel) => {
          panel.visible = true;
        });
        for (const vehicle of trafficModels) {
          vehicle.visible = true;
          (vehicle.userData.roadGlow as THREE.Mesh).visible = true;
        }
        try {
          await renderer!.compileAsync(scene, camera);
        } catch {
          if (disposed) return;
        }
        neonPanels.forEach((panel) => {
          panel.visible = false;
        });
        for (const vehicle of trafficModels) {
          vehicle.visible = false;
          (vehicle.userData.roadGlow as THREE.Mesh).visible = false;
        }
        if (disposed) return;
        model.traverse((node) => {
          if (!foliage.some((leaf) => leaf.node === node)) {
            node.updateMatrix();
            node.matrixAutoUpdate = false;
          }
        });
        setModelReady(true);
        const clock = new THREE.Clock();
        const animate = () => {
          if (disposed || !renderer) return;
          frame = requestAnimationFrame(animate);
          if (viewRef.current.paused || document.hidden || !inViewport) {
            if (viewRef.current.paused) {
              lastTelescopeRequest = viewRef.current.telescopeRequest;
              wasPaused = true;
            }
            if (!suspended) {
              suspended = true;
              activeSounds.forEach(stopVehicleSound);
              activeSounds.clear();
              trafficLanes.forEach((lane) => {
                lane.audio = undefined;
              });
              ambienceRef.current?.setEnabled(false);
              if (visibleTV) {
                visibleTV = false;
                setTvVisible(false);
              }
            }
            clock.getDelta();
            return;
          }
          if (suspended) {
            suspended = false;
            clock.getDelta();
            ambienceRef.current?.setEnabled(soundRef.current);
            perfAt = performance.now();
            perfFrames = perfCpu = perfCalls = perfTriangles = 0;
            qualityAt = performance.now();
            qualityFrames = 0;
          }

          const perfStart = debugPerf ? performance.now() : 0;
          if (debugPerf) renderer.info.reset();
          const elapsed = Math.min(clock.getDelta(), 0.25),
            delta = Math.min(elapsed, 0.05),
            t = clock.elapsedTime,
            reduced = reducedMotion.matches;
          qualityFrames++;
          if (!qualityAt) qualityAt = performance.now();
          if (performance.now() - qualityAt > 4000) {
            const fps = (qualityFrames * 1000) / (performance.now() - qualityAt);
            const next =
              fps < 35
                ? Math.max(0.65, pixelScale - 0.1)
                : fps > 56
                  ? Math.min(1, pixelScale + 0.05)
                  : pixelScale;
            if (next !== pixelScale) {
              pixelScale = next;
              applyResolution();
            }
            qualityAt = performance.now();
            qualityFrames = 0;
          }
          if (wasPaused) {
            wasPaused = false;
            if (telescopeMode) moveCamera('cafe');
          }
          if (viewRef.current.telescopeRequest !== lastTelescopeRequest) {
            lastTelescopeRequest = viewRef.current.telescopeRequest;
            if (lensTarget && lensNormal) {
              libraryMode = tvMode = false;
              setLibraryActive(false);
              setTvActive(false);
              telescopeMode = true;
              setEnteringScope(true);
              controls!.autoRotate = false;
              controls!.enabled = false;
              controls!.enableDamping = false;
              controls!.update();
              controls!.enableDamping = true;
              transition = {
                scope: true,
                fromCamera: camera.position.clone(),
                fromTarget: controls!.target.clone(),
                toCamera: lensTarget.clone().addScaledVector(lensNormal, 0.055),
                toTarget: lensTarget.clone(),
                fromFov: camera.fov,
                toFov: 32,
                age: 0,
              };
            } else viewRef.current.onTelescopeReady?.();
          }
          if (viewRef.current.libraryRequest !== lastLibraryRequest) {
            lastLibraryRequest = viewRef.current.libraryRequest;
            moveCamera('library');
          }
          if (viewRef.current.tv !== lastTvRequest) {
            lastTvRequest = viewRef.current.tv;
            moveCamera('tv');
          }
          if (viewRef.current.reset !== lastReset) {
            lastReset = viewRef.current.reset;
            moveCamera('cafe');
          }
          if (transition) {
            transition.age += elapsed;
            const fraction = reduced
                ? 1
                : Math.min(1, transition.age / (transition.scope ? 2.6 : 1.8)),
              ease = fraction * fraction * (3 - 2 * fraction);
            camera.position.lerpVectors(transition.fromCamera, transition.toCamera, ease);
            controls!.target.lerpVectors(transition.fromTarget, transition.toTarget, ease);
            camera.fov = THREE.MathUtils.lerp(transition.fromFov, transition.toFov, ease);
            camera.updateProjectionMatrix();
            if (fraction >= 1) {
              const arrived = transition.scope;
              transition = undefined;
              lastInteractionAt = performance.now();
              if (arrived) {
                viewRef.current.onTelescopeReady?.();
              }
            }
          }
          controls!.autoRotate =
            !telescopeMode &&
            !libraryMode &&
            !tvMode &&
            !transition &&
            !reduced &&
            !document.hidden &&
            !cameraGestureActive &&
            performance.now() - lastInteractionAt >= 5000;
          if (!telescopeMode && !transition) controls!.update(delta);
          else camera.lookAt(controls!.target);
          if (shelfMarker.current && shelfTarget) {
            markerPosition.copy(shelfTarget);
            markerPosition.y += 0.31;
            markerPosition.project(camera);
            const visible =
              libraryMode &&
              !transition &&
              markerPosition.z > -1 &&
              markerPosition.z < 1 &&
              Math.abs(markerPosition.x) < 0.9 &&
              Math.abs(markerPosition.y) < 0.86;
            shelfMarker.current.hidden = !visible;
            if (visible) {
              shelfMarker.current.style.left = (markerPosition.x * 0.5 + 0.5) * 100 + '%';
              shelfMarker.current.style.top = (-markerPosition.y * 0.5 + 0.5) * 100 + '%';
            }
          }
          const night = modeRef.current === 'night',
            blend = reduced ? 1 : 1 - Math.exp(-delta * 2.4);
          (scene.background as THREE.Color).lerp(night ? nightSky : daySky, blend);
          (floor.material as THREE.MeshStandardMaterial).color.lerp(
            night ? nightGround : dayGround,
            blend,
          );
          ambient.intensity = THREE.MathUtils.lerp(ambient.intensity, night ? 0.48 : 1.8, blend);
          sun.intensity = THREE.MathUtils.lerp(sun.intensity, night ? 0.03 : 2.1, blend);
          fill.intensity = THREE.MathUtils.lerp(fill.intensity, night ? 0.18 : 0.7, blend);
          moon.intensity = THREE.MathUtils.lerp(moon.intensity, night ? 0.55 : 0, blend);
          warmBar.intensity = THREE.MathUtils.lerp(warmBar.intensity, night ? 2.3 : 1.4, blend);
          renderer.toneMappingExposure = THREE.MathUtils.lerp(
            renderer.toneMappingExposure,
            night ? 0.98 : 1.13,
            blend,
          );
          nightLights.forEach((light) => {
            light.intensity = THREE.MathUtils.lerp(
              light.intensity,
              night ? light.userData.nightIntensity : 0,
              blend,
            );
          });
          bulbs.forEach((bulb) => {
            bulb.emissive.set('#ffd6a4');
            bulb.emissiveIntensity = THREE.MathUtils.lerp(
              bulb.emissiveIntensity,
              night ? 2.7 : 0.3,
              blend,
            );
          });
          neonPanels.forEach((panel) => {
            const material = panel.material as THREE.MeshBasicMaterial;
            panel.visible = night || material.opacity > 0.01;
            material.opacity = THREE.MathUtils.lerp(material.opacity, night ? 0.95 : 0, blend);
          });
          mirrors.forEach(({ mesh, front, back, right, up, normal }) => {
            const cameraAtFront = normal.dot(mirrorView.subVectors(camera.position, front)) >= 0;
            mirrorFacing.copy(normal).multiplyScalar(cameraAtFront ? 1 : -1);
            mirrorRight.copy(right).multiplyScalar(cameraAtFront ? 1 : -1);
            mesh.position.copy(cameraAtFront ? front : back).addScaledVector(mirrorFacing, 0.012);
            mesh.quaternion.setFromRotationMatrix(
              mirrorBasis.makeBasis(mirrorRight, up, mirrorFacing),
            );
            mesh.updateMatrixWorld();
          });
          camera.updateMatrixWorld();
          frustum.setFromProjectionMatrix(
            viewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
          );
          people?.updateActivity(viewRef.current.activity);
          people?.update(delta, reduced);
          foliage.forEach(({ node, x, z, phase, amplitude }) => {
            node.rotation.x = x + (reduced ? 0 : Math.sin(t * 0.7 + phase) * amplitude);
            node.rotation.z =
              z + (reduced ? 0 : Math.sin(t * 0.95 + phase * 1.3) * amplitude * 0.8);
          });
          ripples.forEach((ring) => {
            const phase = reduced ? 0.38 : (t * 0.28 + ring.userData.phase) % 1;
            ring.scale.setScalar(0.45 + phase * 3.5);
            (ring.material as THREE.MeshBasicMaterial).opacity = reduced
              ? 0.25
              : (1 - phase) * 0.46;
          });
          fish.forEach((swimmer, i) => {
            const angle = reduced ? i * 1.26 : t * (0.38 + i * 0.045) + i * 1.26;
            swimmer.position.x = Math.cos(angle) * (0.27 + (i % 2) * 0.16);
            swimmer.position.z = Math.sin(angle) * (0.29 + (i % 2) * 0.11);
            swimmer.rotation.y = -angle - Math.PI / 2;
          });
          for (const lane of trafficLanes) {
            if (lane.audio && !soundRef.current) {
              stopVehicleSound(lane.audio);
              activeSounds.delete(lane.audio);
              lane.audio = undefined;
            }
            if (reduced) {
              if (lane.active) lane.active.visible = false;
              lane.active = undefined;
              lane.headlight.intensity = 0;
              lane.nextVehicleAt = t + 2;
              if (lane.audio) {
                stopVehicleSound(lane.audio);
                activeSounds.delete(lane.audio);
                lane.audio = undefined;
              }
            } else if (lane.active) {
              const progress = Math.min(1, (t - lane.driveStartedAt) / lane.driveDuration);
              const fade = trafficVisibility(progress);
              setVehicleFade(lane.active, fade);
              lane.active.visible = fade > 0.001;
              lane.active.position.lerpVectors(lane.start, lane.end, progress);
              const audioContext = audioRef.current;
              if (soundRef.current && audioContext?.state === 'running' && !lane.audio) {
                lane.audio = startVehicleSound(audioContext, lane.active === lane.truck);
                activeSounds.add(lane.audio);
              }
              if (lane.audio && audioContext) {
                const at = audioContext.currentTime,
                  frequency = lane.audio.basePitch * (0.93 + progress * 0.2);
                lane.audio.engine.frequency.setTargetAtTime(frequency, at, 0.06);
                lane.audio.harmonic.frequency.setTargetAtTime(frequency * 1.52, at, 0.06);
                lane.audio.gain.gain.setTargetAtTime(
                  fade *
                    Math.sin(Math.PI * progress) *
                    (lane.active === lane.truck ? 0.038 : 0.028),
                  at,
                  0.07,
                );
                lane.audio.pan.pan.setTargetAtTime(0.8 - progress * 1.6, at, 0.05);
              }
              if (!lane.hornPlayed && progress >= lane.hornAt) {
                if (soundRef.current && audioContext?.state === 'running' && t - lastHornAt > 12) {
                  playHonk(audioContext, 0.8 - progress * 1.6);
                  lastHornAt = t;
                }
                lane.hornPlayed = true;
              }
              lane.headlight.position
                .copy(lane.active.position)
                .addScaledVector(
                  lane.direction,
                  lane.active.scale.x * (lane.active === lane.truck ? 1.15 : 0.8),
                );
              lane.headlight.position.y += lane.active.scale.x * 0.42;
              lane.headlight.intensity = night ? 1.8 * fade : 0;
              (lane.active.userData.lamp as THREE.MeshBasicMaterial).opacity =
                (night ? 1 : 0.38) * fade;
              const roadGlow = lane.active.userData.roadGlow as THREE.Mesh;
              roadGlow.visible = night && fade > 0.001;
              (roadGlow.material as THREE.MeshBasicMaterial).opacity = night ? 0.7 * fade : 0;
              if (progress >= 1) {
                lane.active.visible = false;
                lane.active = undefined;
                lane.headlight.intensity = 0;
                lane.nextVehicleAt = t + 1.8 + Math.random() * 3.5;
                if (lane.audio) {
                  stopVehicleSound(lane.audio);
                  activeSounds.delete(lane.audio);
                  lane.audio = undefined;
                }
              }
            } else if (t >= lane.nextVehicleAt) {
              lane.active = Math.random() < 0.32 ? lane.truck : lane.car;
              if (lane.active === lane.car) {
                const palette = ['#a65b4a', '#4f6772', '#a6a58e', '#d4b58e'];
                (lane.car.userData.paint as THREE.MeshStandardMaterial).color.set(
                  palette[Math.floor(Math.random() * palette.length)],
                );
              }
              lane.active.position.copy(lane.start);
              setVehicleFade(lane.active, 0);
              lane.active.visible = false;
              lane.driveStartedAt = t;
              lane.driveDuration =
                lane.start.distanceTo(lane.end) / ((1.45 + Math.random() * 0.55) * 1.1 * 1.38 * 2);
              lane.hornAt = Math.random() < 0.22 ? 0.24 + Math.random() * 0.43 : Infinity;
              lane.hornPlayed = false;
            } else lane.headlight.intensity = 0;
          }
          if (tvLayer && tvTarget && cssRenderer) {
            if (t - lastTvVisibilityAt > 0.35) {
              lastTvVisibilityAt = t;
              tvDirection.subVectors(camera.position, tvTarget);
              tvProjected.copy(tvTarget).project(camera);
              let visible =
                tvNormal.dot(tvDirection) > 0.05 &&
                Math.abs(tvProjected.x) < 1.2 &&
                Math.abs(tvProjected.y) < 1.2 &&
                tvProjected.z > -1 &&
                tvProjected.z < 1;
              if (visible) {
                const distance = tvDirection.length();
                tvSight.set(camera.position, tvDirection.negate().normalize());
                tvSight.far = Math.max(0, distance - 0.025);
                visible = !tvSight.intersectObject(assetRoot!, true).some((hit) => {
                  const mesh = hit.object as THREE.Mesh;
                  return (
                    mesh.isMesh &&
                    mesh.visible &&
                    !(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).every(
                      (material) => material.transparent && material.opacity < 0.3,
                    )
                  );
                });
              }
              tvLayer.element.style.visibility = visible ? 'visible' : 'hidden';
              tvLayer.element.style.pointerEvents = visible ? 'auto' : 'none';
              if (visibleTV !== visible) {
                visibleTV = visible;
                setTvVisible(visible);
              }
            }
            if (visibleTV) cssRenderer.render(cssScene, camera);
          }
          renderer.render(scene, camera);
          if (debugPerf) {
            perfFrames++;
            perfCpu += performance.now() - perfStart;
            perfCalls += renderer.info.render.calls;
            perfTriangles += renderer.info.render.triangles;
            if (performance.now() - perfAt >= 2500) {
              console.info(
                'CAFE_PERF ' +
                  JSON.stringify({
                    fps: +((perfFrames * 1000) / (performance.now() - perfAt)).toFixed(1),
                    cpuMs: +(perfCpu / perfFrames).toFixed(1),
                    calls: Math.round(perfCalls / perfFrames),
                    triangles: Math.round(perfTriangles / perfFrames),
                    night,
                    view: tvMode ? 'tv' : transition ? 'transition' : 'cafe',
                    width: container.clientWidth,
                    height: container.clientHeight,
                    dpr: renderer.getPixelRatio(),
                  }),
              );
              perfAt = performance.now();
              perfFrames = perfCpu = perfCalls = perfTriangles = 0;
            }
          }
        };
        animate();
      })
      .catch(() => {
        if (!disposed && container) {
          container.dataset.error = 'load';
          setModelReady(true);
        }
      });
    resize = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box || !renderer) return;
      applyResolution();
      camera.aspect = box.width / Math.max(1, box.height);
      camera.updateProjectionMatrix();
      renderer.setSize(box.width, box.height);
      cssRenderer?.setSize(box.width, box.height);
    });
    resize.observe(container);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      people?.dispose();
      cssRenderer?.domElement.remove();
      if (tvSurface) {
        tvSurface.geometry.dispose();
        const material = tvSurface.material as THREE.MeshBasicMaterial;
        material.map?.dispose();
        material.dispose();
      }
      resize?.disconnect();
      visibility.disconnect();
      renderer?.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer?.domElement.removeEventListener('pointermove', onPointerMove);
      renderer?.domElement.removeEventListener('pointerup', onPointerEnd);
      renderer?.domElement.removeEventListener('pointercancel', onPointerEnd);
      renderer?.domElement.removeEventListener('lostpointercapture', onPointerEnd);
      renderer?.domElement.removeEventListener('wheel', markInteraction);
      controls?.dispose();
      activeSounds.forEach(stopVehicleSound);
      activeSounds.clear();
      ambienceRef.current?.dispose();
      ambienceRef.current = null;
      void audioRef.current?.close();
      audioRef.current = null;
      mirrors.forEach(({ mesh }) => {
        mesh.dispose();
        mesh.geometry.dispose();
        scene.remove(mesh);
      });
      trafficLights.forEach((light) => scene.remove(light));
      trafficModels.forEach((vehicle) => {
        vehicle.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            const mesh = o as THREE.Mesh;
            mesh.geometry.dispose();
            const material = mesh.material;
            if (Array.isArray(material)) material.forEach((m) => m.dispose());
            else material.dispose();
          }
        });
        (vehicle.userData.glowTexture as THREE.CanvasTexture).dispose();
        scene.remove(vehicle);
      });
      assetRoot?.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          (o as THREE.Mesh).geometry.dispose();
          const m = (o as THREE.Mesh).material;
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else m.dispose();
        }
      });
      const textures = new Set<THREE.Texture>();
      scene.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
          for (const value of Object.values(material))
            if (value instanceof THREE.Texture) textures.add(value);
      });
      textures.forEach((texture) => texture.dispose());
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      addedMaterials.forEach((m) => m.dispose());
      renderer?.dispose();
      renderer?.forceContextLoss();
      renderer?.domElement.remove();
    };
  }, []);
  return (
    <>
      <div className="cafe-scene-shell">
        {enteringScope && <div className="scope-entry-veil" aria-hidden="true" />}
        <div
          className={'cafe-scene ' + (!modelReady ? 'scene-loading' : '')}
          ref={host}
          aria-label="Tampilan 3D kafe Winds Space dengan mode pagi dan malam."
        >
          <div className="scene-loading-label" aria-hidden={modelReady}>
            <Coffee size={20} /> Menyiapkan kafe 3D…
          </div>
          <div className="scene-error-label">
            Pratinjau 3D tidak dapat dimuat di perangkat ini.
            {onBookshelfClick && (
              <button type="button" onClick={onBookshelfClick}>
                Lihat koleksi buku
              </button>
            )}
          </div>
        </div>
        {onBookshelfClick && (
          <button
            ref={shelfMarker}
            hidden
            type="button"
            className="scene-bookshelf-hotspot"
            onClick={onBookshelfClick}
            aria-label="Buka koleksi buku di rak"
          >
            <BookOpen size={16} />
            <span>
              Rak buku <small>Klik untuk lihat koleksi</small>
            </span>
          </button>
        )}
        {(libraryActive || tvActive) && (
          <button
            type="button"
            className="scene-return"
            onClick={() => {
              viewRef.current.reset += 1;
            }}
          >
            <RotateCcw size={14} />
            Kembali ke kafe
          </button>
        )}
        <div className="scene-header-caption">
          <span>
            WINDS SPACE ·{' '}
            {libraryActive ? 'SUDUT BACA' : tvActive ? 'STORY OF WINDS' : 'RUANG UNTUK BERCERITA'}
          </span>
          <span>
            {libraryActive
              ? 'Klik rak buku untuk menjelajahi koleksi'
              : tvActive
                ? 'Album foto Winds Space'
                : 'Seret untuk memutar · Cubit untuk zoom'}
          </span>
        </div>
        <button
          type="button"
          className="scene-sound-toggle"
          aria-pressed={soundEnabled}
          onClick={() => void toggleSound()}
        >
          {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          <span>{soundEnabled ? 'Suara aktif' : 'Aktifkan suara'}</span>
        </button>
        <div className="scene-time-switch" role="group" aria-label="Waktu tampilan kafe">
          <button
            type="button"
            className={mode === 'morning' ? 'active' : ''}
            aria-pressed={mode === 'morning'}
            onClick={() => setMode('morning')}
          >
            ☀ Pagi
          </button>
          <button
            type="button"
            className={mode === 'night' ? 'active' : ''}
            aria-pressed={mode === 'night'}
            onClick={() => setMode('night')}
          >
            ☾ Malam
          </button>
        </div>
      </div>
      {tvMount &&
        !tvExpanded &&
        createPortal(
          <DriveTV
            program={tvProgram}
            onProgramChange={setTvProgram}
            focused={tvActive}
            active={tvVisible && !paused}
            onFocus={() => {
              viewRef.current.tv += 1;
            }}
          />,
          tvMount,
        )}
      <Dialog open={tvExpanded} onOpenChange={setTvExpanded}>
        <DialogContent className="tv-expanded-dialog">
          <DialogTitle className="sr-only">Story of Winds</DialogTitle>
          <DialogDescription className="sr-only">
            Slideshow foto dari album Google Drive Winds Space, dengan pilihan foto dan kontrol
            pemutaran.
          </DialogDescription>
          <DriveTV program={tvProgram} onProgramChange={setTvProgram} />
        </DialogContent>
      </Dialog>
    </>
  );
}
