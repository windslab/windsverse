'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import DriveTV, { type TVProgram } from './drive-tv';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { BookOpen, Coffee, Gamepad2, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { createSceneAmbience, type SceneAmbience } from './scene-ambience';
import { cafePaths, type CafePathData } from '@/lib/cafe-paths';
import { prepareCafeBarWorkspace } from '@/lib/cafe-bar-workspace';
import { addCafeWalkSurfaces } from '@/lib/cafe-walk-surfaces';
import { placeCafePeople } from './scene-people';
import { EMPTY_CAFE_ACTIVITY, type CafeActivity, type CafeVisitor } from '@/lib/cafe-activity';
import ExploreMode, { type ExploreApi } from './explore-mode';
import { createToonOutline, toonGradient, toonify } from '@/lib/toon';
import { createCafeSky, SKY_PHASES, type SkyPhase } from '@/lib/cafe-sky';
import { createCafeWorld } from '@/lib/cafe-world';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function objectByModelName(root: THREE.Object3D, name: string) {
  return (
    root.getObjectByName(name) ||
    root.getObjectByName(name.replaceAll('.', '').replaceAll(' ', '_'))
  );
}

/** World boxes of the model's direct children whose names match (plants, tables…). */
function spotBoxes(root: THREE.Object3D, pattern: RegExp) {
  return root.children
    .filter((node) => pattern.test(node.name))
    .map((node) => ({ name: node.name, box: new THREE.Box3().setFromObject(node) }))
    .filter(({ box }) => !box.isEmpty());
}

const MAX_CAFE_DISTANCE = 14.5;
const UP = new THREE.Vector3(0, 1, 0);
/** First view: from the street side (the café front), low enough to show the sky. */
function frontDirection() {
  const az = (-82 * Math.PI) / 180,
    el = (16 * Math.PI) / 180;
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}
type FadingMaterial = { material: THREE.Material; opacity: number };
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
type TrafficCar = {
  model: THREE.Group;
  truck: boolean;
  /** Distance driven along the lane, current and cruising speed (world units / s). */
  s: number;
  v: number;
  cruise: number;
  active: boolean;
};
type TrafficLane = {
  start: THREE.Vector3;
  end: THREE.Vector3;
  direction: THREE.Vector3;
  length: number;
  headlight: THREE.PointLight;
  cars: TrafficCar[];
  audio?: VehicleSound;
  nextVehicleAt: number;
  hornAt: number;
};

export default function CafeScene({
  activity = EMPTY_CAFE_ACTIVITY,
  libraryRequest = 0,
  tvRequest = 0,
  tvExpandRequest = 0,
  telescopeRequest = 0,
  cafeReturnRequest = 0,
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
  /** Bumped when the telescope zooms into the Winds Space illustration to come back here. */
  cafeReturnRequest?: number;
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
      cafeReturnRequest,
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
  viewRef.current.cafeReturnRequest = cafeReturnRequest;
  viewRef.current.onTelescopeReady = onTelescopeReady;
  const host = useRef<HTMLDivElement>(null),
    modeRef = useRef<'morning' | 'night'>('morning'),
    phaseRef = useRef<SkyPhase>('live'),
    audioRef = useRef<AudioContext | null>(null),
    ambienceRef = useRef<SceneAmbience | null>(null),
    soundRef = useRef(false),
    [enteringScope, setEnteringScope] = useState(false),
    [modelReady, setModelReady] = useState(false),
    [mode, setMode] = useState<'morning' | 'night'>('morning'),
    [skyPhase, setSkyPhase] = useState<SkyPhase>('live'),
    [livePhase, setLivePhase] = useState<Exclude<SkyPhase, 'live'>>('siang'),
    [soundEnabled, setSoundEnabled] = useState(false),
    [exploring, setExploring] = useState(false),
    [exploreApi, setExploreApi] = useState<ExploreApi | null>(null);
  // Explore mode: the player drives Luna; the game supplies its own virtual guests.
  const exploreRef = useRef({
    on: false,
    stick: { x: 0, y: 0 },
    run: false,
    clock: null as Date | null,
    visitors: [] as CafeVisitor[],
    onToggle: (() => {}) as (on: boolean) => void,
  });
  const toggleExplore = (on: boolean) => {
    exploreRef.current.on = on;
    exploreRef.current.stick = { x: 0, y: 0 };
    if (!on) exploreRef.current.visitors = [];
    exploreApi?.setManual(on);
    exploreRef.current.onToggle(on);
    setExploring(on);
    if (!on) viewRef.current.reset += 1;
  };
  modeRef.current = mode;
  phaseRef.current = skyPhase;
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
    const leafMeshes: THREE.Mesh[] = [],
      windTime = { value: 0 };
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
      neonPanels: THREE.Mesh[] = [],
      neonBoxes: THREE.MeshToonMaterial[] = [];
    const trafficModels: THREE.Group[] = [],
      trafficLights: THREE.PointLight[] = [],
      activeSounds = new Set<VehicleSound>();
    const addedMaterials: THREE.Material[] = [],
      addedTargets: THREE.WebGLRenderTarget[] = [];
    const scene = new THREE.Scene();
    // Windstronout's sky (atmosphere, clouds, stars, moon) with fog toward its horizon colour.
    scene.background = new THREE.Color('#05070c');
    const sky = createCafeSky(220);
    /** Zebra crossing in front of the café: where cars stop for Luna. */
    let crossing: { center: THREE.Vector3; reach: number } | undefined;
    let world: ReturnType<typeof createCafeWorld> | undefined, siteBox: THREE.Box3 | undefined;
    const sunRay = new THREE.Raycaster();
    // Inside the bar box the view switches to a fixed wide "CCTV" in its upper corner.
    let cctv: { position: THREE.Vector3; target: THREE.Vector3 } | undefined,
      inCctv = false,
      cafeModel: THREE.Object3D | undefined;
    // Explore-mode photo camera (Story of Winds from Luna's hands).
    const photo = { on: false, facing: 'environment' as 'environment' | 'user', yaw: 0, pitch: 0 },
      photoDir = new THREE.Vector3(),
      photoScale = new THREE.Vector3();
    let photoSaved: { position: THREE.Vector3; target: THREE.Vector3; fov: number } | null = null;
    const cctvLook = { yaw: 0, pitch: 0 },
      cctvDrag = new Map<number, { x: number; y: number }>(),
      cctvDir = new THREE.Vector3();
    const followSaved = { offset: new THREE.Vector3(), fov: 0, limits: [0, 0, 0, 0] },
      lunaLocal = new THREE.Vector3();
    const followForward = new THREE.Vector3(),
      followRight = new THREE.Vector3(),
      followUp = new THREE.Vector3(0, 1, 0),
      followMove = new THREE.Vector3(),
      followTarget = new THREE.Vector3(),
      followOffset = new THREE.Vector3(),
      followDir = new THREE.Vector3(),
      followSpherical = new THREE.Spherical(),
      // Player's wish, collision-safe goal and what is shown (radius 0 = not following yet).
      followWish = new THREE.Spherical(),
      followGoal = new THREE.Spherical(),
      followShown = new THREE.Spherical(0),
      probeRay = new THREE.Raycaster();
    // Development only (?sceneStats): freeze the explore camera to inspect a spot.
    const debugCamera = { frozen: false };
    let occluders: THREE.Object3D[] | undefined,
      lastProbe = 0;
    // Entering/leaving explore mode changes how close the camera may come.
    exploreRef.current.onToggle = (on: boolean) => {
      followShown.radius = 0;
      if (on) {
        // Coming back from the telescope's zoomed lens too.
        camera.fov = 60;
        camera.updateProjectionMatrix();
      }
      controls!.minDistance = on ? 0.5 : 5;
      controls!.maxDistance = on ? 7 : debugPerf ? 90 : MAX_CAFE_DISTANCE;
      // Look down on Luna rather than through walls.
      controls!.minPolarAngle = on ? 0.35 : 0.2;
      controls!.maxPolarAngle = on ? 1.45 : Math.PI * 0.48;
      if (on) {
        libraryMode = tvMode = false;
        setLibraryActive(false);
        setTvActive(false);
        transition = undefined;
        // Start behind and above Luna, looking over her shoulder toward the café's centre.
        const luna = people?.baristaPosition();
        if (luna) {
          const back = luna.clone().sub(overviewTarget).setY(0);
          if (back.lengthSq() < 0.01) back.set(-1, 0, 0);
          back.setLength(2.6);
          controls!.target.copy(luna).add(new THREE.Vector3(0, 0.75, 0));
          camera.position
            .copy(controls!.target)
            .add(back)
            .add(new THREE.Vector3(0, 3.6, 0));
        }
      }
    };
    let lastSunCheck = 0,
      sunBlocked = false;
    scene.add(sky.group, sky.flareGroup);
    scene.fog = new THREE.Fog('#aeb39a', 50, 330);
    let lastShadowSun = new THREE.Vector3(),
      lastShadowAt = -Infinity,
      lastPhase = '';
    const sunColor = new THREE.Color(),
      skyTint = new THREE.Color(),
      groundTint = new THREE.Color(),
      gradeTint = new THREE.Vector3(),
      gradeLift = new THREE.Vector3();
    const SUN_DAY = new THREE.Color('#fff1d6'),
      SUN_GOLD = new THREE.Color('#ffa766'),
      SKY_DAY = new THREE.Color('#fff5e5'),
      SKY_DUSK = new THREE.Color('#ffc9a8'),
      SKY_NIGHT = new THREE.Color('#51627f'),
      GROUND_DAY = new THREE.Color('#9b8572'),
      GROUND_NIGHT = new THREE.Color('#1d2230');
    const camera = new THREE.PerspectiveCamera(60, 1, 0.03, 260),
      overviewTarget = new THREE.Vector3(-0.35, 1, 0.15),
      overviewCamera = overviewTarget
        .clone()
        .add(frontDirection().multiplyScalar(MAX_CAFE_DISTANCE));
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
      lastCafeReturn = 0,
      returnToFrontAt = 0,
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
      // No canvas MSAA: the outline pass antialiases its own render target and only draws a
      // full-screen quad here.
      renderer = new THREE.WebGLRenderer({
        antialias: false,
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
    // Toon look: cel-shaded materials (see toonify below) and thin outlines drawn in one pass.
    const toonOutline = createToonOutline(renderer);
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
    const dayGround = new THREE.Color('#e9ded0'),
      nightGround = new THREE.Color('#252b34');
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshToonMaterial({ color: '#e9ded0', gradientMap: toonGradient() }),
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
    // Development only (?sceneStats): let the camera back off to inspect the surrounding world.
    controls.maxDistance = debugPerf ? 90 : MAX_CAFE_DISTANCE;
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
      // CCTV in the bar box: drag to pan and tilt it where it hangs.
      if (inCctv && activePointers.size === 1) {
        const last = cctvDrag.get(event.pointerId) ?? previous;
        cctvLook.yaw += (event.clientX - last.x) * 0.006;
        cctvLook.pitch = THREE.MathUtils.clamp(
          cctvLook.pitch + (event.clientY - last.y) * 0.006,
          -1.35,
          0.6,
        );
        cctvDrag.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }
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
      cctvDrag.delete(event.pointerId);
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
    // The café GLB is meshopt-compressed (positions and UVs lossless); the decoder is bundled JS.
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    // Luna and the walk paths download alongside the café instead of after it.
    const characters = Promise.all([
      fetch('/models/cafe-navigation-v1.json').then((r) => {
        if (!r.ok) throw new Error('Navigation unavailable');
        return r.json() as Promise<CafePathData>;
      }),
      loader.loadAsync('/models/luna-ps1.glb?v=6'),
    ]);
    characters.catch(() => {});
    void loader
      .loadAsync('/models/winds-space-new.glb?v=3')
      .then(async (gltf) => {
        if (disposed) return;
        const model = gltf.scene;
        addedMaterials.push(...toonify(model));
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
          if (/leaves|daun|undergrowth|tree_base_plant/.test(label)) leafMeshes.push(mesh);
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
        // Wind: leaves sway in the vertex shader, each part with its own phase, so canopies
        // flutter instead of rocking as one piece and nothing needs a per-frame matrix update.
        const windMaterials = new Map<THREE.Material, THREE.Material>();
        for (const leaf of leafMeshes) {
          const amplitude = 0.018 / Math.max(leaf.getWorldScale(new THREE.Vector3()).x, 1e-4);
          const swap = (material: THREE.Material) => {
            const key = material;
            let windy = windMaterials.get(key);
            if (!windy) {
              windy = material.clone();
              windy.userData.windAmplitude = amplitude;
              windy.onBeforeCompile = (shader) => {
                shader.uniforms.windTime = windTime;
                shader.uniforms.windAmplitude = { value: windy!.userData.windAmplitude };
                shader.vertexShader = shader.vertexShader
                  .replace(
                    '#include <common>',
                    '#include <common>\nuniform float windTime;\nuniform float windAmplitude;',
                  )
                  .replace(
                    '#include <begin_vertex>',
                    `#include <begin_vertex>
                    vec4 windWorld = modelMatrix * vec4(transformed, 1.0);
                    float gust = 0.65 + 0.35 * sin(windTime * 0.35 + windWorld.x * 0.2);
                    float sway = sin(windTime * 1.7 + windWorld.x * 1.9 + windWorld.z * 1.3)
                      + 0.45 * sin(windTime * 3.3 + windWorld.y * 4.0 + windWorld.x * 2.7);
                    transformed.x += sway * windAmplitude * gust;
                    transformed.z += 0.6 * cos(windTime * 1.4 + windWorld.z * 2.1) * windAmplitude * gust;
                    transformed.y += 0.25 * sin(windTime * 2.6 + windWorld.x * 3.3) * windAmplitude;`,
                  );
              };
              windy.customProgramCacheKey = () => 'cafe-wind';
              windMaterials.set(key, windy);
              addedMaterials.push(windy);
            }
            return windy;
          };
          leaf.material = Array.isArray(leaf.material)
            ? leaf.material.map(swap)
            : swap(leaf.material);
        }
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
        // Pendant lamps: small, warm bulbs.
        addNightLight('Lampu gantung', 2.2, 4, -0.22);
        addNightLight('lampu gantung 2', 2.2, 4, -0.22);
        // Inside the bar box, under its roof.
        const barBox = objectByModelName(model, 'Area bar');
        if (barBox) {
          const box = new THREE.Box3().setFromObject(barBox);
          const light = new THREE.PointLight('#ffd19a', 0, 4.5, 2);
          light.position.set(
            (box.min.x + box.max.x) / 2,
            box.max.y - (box.max.y - box.min.y) * 0.18,
            (box.min.z + box.max.z) / 2,
          );
          light.userData.nightIntensity = 3.2;
          scene.add(light);
          nightLights.push(light);
        }
        // Reading corner: one main lamp over each of the two tables in front of the shelf.
        const overTable = (name: string, intensity: number, height: number) => {
          const table = objectByModelName(model, name);
          if (!table) return;
          const top = new THREE.Box3().setFromObject(table);
          const light = new THREE.PointLight('#ffd6a2', 0, 4.2, 2);
          light.position.set(
            (top.min.x + top.max.x) / 2,
            top.max.y + height,
            (top.min.z + top.max.z) / 2,
          );
          light.userData.nightIntensity = intensity;
          scene.add(light);
          nightLights.push(light);
        };
        overTable('meja 1', 2.8, 1.25);
        overTable('meja 2', 2.8, 1.25);
        // Upstairs indoor room: both tables.
        overTable('meja atas 1', 2.6, 1.1);
        overTable('meja atas 2', 2.6, 1.1);
        addNightLight('meja atas luar', 2.4, 5, 0.75);
        addNightLight('WS_Courtyard_Tree_Root', 1.4, 5, 1.5);
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
          // The neon box over the fence (the other logo sits on the freezer): light up the pale
          // faces of the box that holds this logo.
          if (name !== 'Untitled_Artwork.001') continue;
          const logoAt = sign.getWorldPosition(new THREE.Vector3()),
            logoSize = new THREE.Box3().setFromObject(sign).getSize(new THREE.Vector3()).length();
          model.traverse((node) => {
            const mesh = node as THREE.Mesh;
            if (!mesh.isMesh || mesh === sign) return;
            const box = new THREE.Box3().setFromObject(mesh);
            // Only the sign's own box, not a wall that happens to surround it.
            if (box.getSize(new THREE.Vector3()).length() > logoSize * 2.5) return;
            if (!box.expandByScalar(0.08).containsPoint(logoAt)) return;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            const lit = mats.map((m) => {
              const white = m as THREE.MeshToonMaterial;
              // Only lit materials have an emissive term; bright faces only.
              if (
                !(white as THREE.MeshToonMaterial).isMeshToonMaterial ||
                white.color.getHSL({ h: 0, s: 0, l: 0 }).l < 0.4
              )
                return m;
              const glow = white.clone();
              glow.emissive = new THREE.Color('#fff1d6');
              glow.emissiveIntensity = 0;
              neonBoxes.push(glow);
              addedMaterials.push(glow);
              return glow;
            });
            mesh.material = Array.isArray(mesh.material) ? lit : lit[0];
          });
        }
        const road = objectByModelName(model, 'jalan poros');
        let roadLayout:
          | {
              origin: THREE.Vector3;
              direction: THREE.Vector3;
              halfWidth: number;
              surfaceY: number;
            }
          | undefined;
        const trafficLanes: TrafficLane[] = [];
        if (road) {
          // The café model's own road is hidden: the world draws one hand-made road for the whole
          // scene (lib/cafe-world.ts). The model road still provides the lanes for traffic.
          road.traverse((object) => {
            if ((object as THREE.Mesh).isMesh) object.visible = false;
          });
          const left = road.localToWorld(new THREE.Vector3(-1, 0, 0));
          const right = road.localToWorld(new THREE.Vector3(1, 0, 0));
          roadLayout = {
            origin: road.localToWorld(new THREE.Vector3(0, 0, 0)),
            direction: road
              .localToWorld(new THREE.Vector3(0, 0, 1))
              .sub(road.localToWorld(new THREE.Vector3(0, 0, 0))),
            halfWidth: left.distanceTo(right) / 2,
            surfaceY: road.localToWorld(new THREE.Vector3(0, 0.02, 0)).y,
          };
          const vehicleScale = (left.distanceTo(right) * 0.3) / 0.82;
          for (const [index, laneX] of [-0.45, 0.45].entries()) {
            // Two-way traffic along the whole world road (300 long): cars come out of the distance
            // and drive on until they fade away near its far end.
            const mid = road.localToWorld(new THREE.Vector3(laneX, 0.025, 0)),
              along = road
                .localToWorld(new THREE.Vector3(laneX, 0.025, 0.98))
                .sub(road.localToWorld(new THREE.Vector3(laneX, 0.025, -0.98)))
                .normalize();
            const a = mid.clone().addScaledVector(along, -135),
              b = mid.clone().addScaledVector(along, 135);
            const start = index ? b : a,
              end = index ? a : b;
            const cars: TrafficCar[] = (['car', 'car', 'truck'] as const).map((kind) => {
              const vehicle = makeVehicle(kind);
              vehicle.scale.setScalar(vehicleScale);
              vehicle.rotation.y = Math.atan2(start.x - end.x, start.z - end.z);
              toonify(vehicle);
              scene.add(vehicle);
              trafficModels.push(vehicle);
              return {
                model: vehicle,
                truck: kind === 'truck',
                s: 0,
                v: 0,
                cruise: 5,
                active: false,
              };
            });
            // Keep one light per lane in the scene so passing cars do not change shader light counts.
            const headlight = new THREE.PointLight('#ffe4ae', 0, 2.8, 2);
            headlight.position.copy(start);
            scene.add(headlight);
            trafficLights.push(headlight);
            trafficLanes.push({
              start,
              end,
              direction: end.clone().sub(start).normalize(),
              length: start.distanceTo(end),
              headlight,
              cars,
              nextVehicleAt: 1.5 + index * 1.4,
              hornAt: 20 + Math.random() * 40,
            });
          }
        }
        // The library anchor uses the reading-corner shelf in the exported cafe.
        // The world from the Windstronout panorama replaces the plain floor: hills, river,
        // karst towers, trees and the observatory, all toon-shaded like the café.
        {
          // The café's whole site: everything in the model except the road.
          const site = new THREE.Box3(),
            part = new THREE.Box3();
          model.traverse((node) => {
            const mesh = node as THREE.Mesh;
            if (!mesh.isMesh || !mesh.visible) return;
            for (let up: THREE.Object3D | null = mesh; up; up = up.parent) if (up === road) return;
            site.union(part.setFromObject(mesh));
          });
          // Ground level = the café's concrete floor; cut the ground away over the floors,
          // pond and sidewalk so they always show.
          const concrete = objectByModelName(model, 'floor lantai 1');
          const level = concrete
            ? new THREE.Box3().setFromObject(concrete).max.y - 0.01
            : site.min.y;
          // Photograph the floors, pond and sidewalk from above once: the ground is cut away only
          // inside their real outlines (bounding boxes opened holes behind the café).
          const holeNames = ['floor lantai 1', 'floor lantai 1 area bar', 'Kolam ikan', 'trotoar'];
          const holeMeshes: THREE.Mesh[] = [];
          for (const name of holeNames)
            objectByModelName(model, name)?.traverse((n) => {
              if ((n as THREE.Mesh).isMesh) holeMeshes.push(n as THREE.Mesh);
            });
          let holeMask: { texture: THREE.Texture; rect: THREE.Vector4 } | undefined;
          if (holeMeshes.length) {
            const area = new THREE.Box3();
            holeMeshes.forEach((m) => area.union(new THREE.Box3().setFromObject(m)));
            area.expandByScalar(0.2);
            const w = area.max.x - area.min.x,
              d = area.max.z - area.min.z,
              cx = (area.min.x + area.max.x) / 2,
              cz = (area.min.z + area.max.z) / 2;
            const top = new THREE.OrthographicCamera(-w / 2, w / 2, d / 2, -d / 2, 0.01, 200);
            top.up.set(0, 0, -1);
            top.position.set(cx, area.max.y + 50, cz);
            top.lookAt(cx, area.min.y, cz);
            top.updateMatrixWorld();
            const maskTarget = new THREE.WebGLRenderTarget(
              Math.min(1024, Math.ceil(w * 48)),
              Math.min(1024, Math.ceil(d * 48)),
            );
            const maskScene = new THREE.Scene(),
              white = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide });
            maskScene.background = new THREE.Color('#000000');
            for (const m of holeMeshes) {
              const copy = new THREE.Mesh(m.geometry, white);
              copy.matrixAutoUpdate = false;
              copy.matrix.copy(m.matrixWorld);
              maskScene.add(copy);
            }
            const previousTarget = renderer!.getRenderTarget();
            renderer!.setRenderTarget(maskTarget);
            renderer!.render(maskScene, top);
            renderer!.setRenderTarget(previousTarget);
            white.dispose();
            addedTargets.push(maskTarget);
            holeMask = {
              texture: maskTarget.texture,
              rect: new THREE.Vector4(area.min.x, area.min.z, area.max.x, area.max.z),
            };
          }
          siteBox = site.clone();
          world = createCafeWorld(
            { bounds: site, groundY: level, road: roadLayout, holeMask },
            windTime,
          );
          scene.add(world.group);
          if (roadLayout) {
            // Zebra crossing straight out from the café's sidewalk (where explore mode steps out).
            const dir = roadLayout.direction.clone().setY(0).normalize(),
              door = model.localToWorld(new THREE.Vector3(-6.4, 0.5, 2.4)),
              along = door.clone().sub(roadLayout.origin).dot(dir),
              center = roadLayout.origin
                .clone()
                .addScaledVector(dir, along)
                .setY(roadLayout.surfaceY + 0.008);
            const width = roadLayout.halfWidth * 2,
              bars: THREE.BufferGeometry[] = [];
            for (let k = 0; k < 7; k++) {
              const bar = new THREE.PlaneGeometry(width / 14, 1.5);
              bar.rotateX(-Math.PI / 2);
              bar.translate((k - 3) * (width / 7.2), 0, 0);
              bars.push(bar);
            }
            const zebraGeometry = mergeGeometries(bars)!;
            bars.forEach((b) => b.dispose());
            zebraGeometry.rotateY(Math.atan2(dir.x, dir.z));
            const zebraMaterial = new THREE.MeshBasicMaterial({
              color: '#e9e6dc',
              transparent: true,
              opacity: 0.86,
              depthWrite: false,
              polygonOffset: true,
              polygonOffsetFactor: -2,
            });
            addedMaterials.push(zebraMaterial);
            const zebra = new THREE.Mesh(zebraGeometry, zebraMaterial);
            zebra.name = 'World_Zebra_Crossing';
            zebra.position.copy(center);
            world.group.add(zebra);
            crossing = { center, reach: roadLayout.halfWidth + 1.6 };
          }
          floor.visible = false;
        }
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
          const [navData, luna] = await characters;
          if (disposed) return;
          prepareCafeBarWorkspace(model);
          addCafeWalkSurfaces(model);
          people = placeCafePeople(model, cafePaths(model, navData), luna.scene);
          // Explore mode: beyond the sidewalk Luna walks on the surrounding world.
          if (world && siteBox) people.setOutdoors({ walk: world.walkHeight, site: siteBox });
          cafeModel = model;
          const crewForDebug = people;
          // Development only (?sceneStats): camera handle for checking views.
          if (debugPerf && process.env.NODE_ENV !== 'production')
            (window as unknown as { __scene: unknown }).__scene = {
              camera,
              controls,
              model,
              people: crewForDebug,
              world,
              freeze: (on: boolean) => {
                debugCamera.frozen = on;
              },
              visitors: (list: CafeVisitor[]) => {
                exploreRef.current.visitors = list;
              },
              set: (cctvPos: number[], cctvTarget: number[]) => {
                cctv = {
                  position: model.localToWorld(new THREE.Vector3(...cctvPos)),
                  target: model.localToWorld(new THREE.Vector3(...cctvTarget)),
                };
                inCctv = false;
              },
            };
          // CCTV in the bar box: at the top corner of the front window glass (Cube048, the
          // door side), looking across the counter to the cashier window. Drag to turn it.
          cctv = {
            position: model.localToWorld(new THREE.Vector3(-2.27, 1.86, 3.12)),
            target: model.localToWorld(new THREE.Vector3(-3.8, 0.75, 4.2)),
          };
          {
            const crew = people;
            const machine = objectByModelName(model, 'mesin kopi');
            setExploreApi({
              setManual: (on) => crew.setManual(on),
              setTask: (task) => crew.setManualTask(task),
              setStick: (x, y) => {
                exploreRef.current.stick = { x, y };
              },
              setVisitors: (visitors) => {
                exploreRef.current.visitors = visitors;
              },
              guests: () => crew.guests(),
              deliver: (key) => crew.deliver(key),
              walkTo: (point) => crew.walkTo(point),
              walking: () => crew.walking(),
              luna: () => crew.baristaPosition(),
              setClock: (date) => {
                exploreRef.current.clock = date;
              },
              setRun: (on) => {
                exploreRef.current.run = on;
              },
              marker: (key) => crew.setMarker(key),
              seatNear: () => crew.seatNear(),
              sit: (id) => crew.sit(id),
              stand: () => crew.stand(),
              sitting: () => crew.sitting(),
              chore: (kind, seconds, target) => crew.chore(kind, seconds, target),
              outdoors: () => crew.outdoorsNow(),
              spots: {
                plants: spotBoxes(model, /^WS_Garden_\d+_(Pot|Leaves)|Planter_\d+_Pot|Raised_Pot/),
                tables: spotBoxes(model, /^meja/),
                telescope: spotBoxes(model, /^WS_Telescope_Tripod$/)[0] ?? null,
              },
              telescope: () => viewRef.current.onTelescopeClick?.(),
              photo: {
                start: () => {
                  if (photo.on) return;
                  photoSaved = {
                    position: camera.position.clone(),
                    target: controls!.target.clone(),
                    fov: camera.fov,
                  };
                  Object.assign(photo, { on: true, facing: 'environment', yaw: 0, pitch: 0 });
                },
                stop: () => {
                  photo.on = false;
                  if (photoSaved) {
                    camera.position.copy(photoSaved.position);
                    controls!.target.copy(photoSaved.target);
                    camera.fov = photoSaved.fov;
                    camera.updateProjectionMatrix();
                  }
                },
                look: (dx, dy) => {
                  photo.yaw -= dx * 0.005;
                  photo.pitch = THREE.MathUtils.clamp(photo.pitch - dy * 0.005, -0.9, 0.9);
                },
                facing: (f) => {
                  photo.facing = f;
                  photo.yaw = 0;
                  photo.pitch = f === 'user' ? -0.05 : 0;
                },
                stream: () =>
                  'captureStream' in renderer!.domElement
                    ? renderer!.domElement.captureStream(30)
                    : null,
              },
              stations: {
                cashier: crew.stations.cashier.clone(),
                bar: crew.stations.bar.clone(),
                espresso: machine
                  ? machine.getWorldPosition(new THREE.Vector3())
                  : crew.stations.bar.clone(),
              },
            });
          }
          addedMaterials.push(...toonify(people.root));
          toonOutline.addHull(luna.scene);
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
        // Pond ripples and fish animate every frame, so they (and their parts) stay unfrozen.
        const moving = new Set<THREE.Object3D>();
        for (const item of [...ripples, ...fish]) item.traverse((n) => moving.add(n));
        model.traverse((node) => {
          if (!foliage.some((leaf) => leaf.node === node) && !moving.has(node)) {
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
            if (exploreRef.current.on && (telescopeMode || transition)) {
              // Back from Windstronout during explore mode: straight back behind Luna.
              telescopeMode = false;
              setEnteringScope(false);
              transition = undefined;
              controls!.enabled = true;
              exploreRef.current.onToggle(true);
            } else if (
              viewRef.current.cafeReturnRequest !== lastCafeReturn &&
              lensTarget &&
              lensNormal
            ) {
              // Back from the illustration: open on the telescope's own point of view, facing the
              // café, then glide to the front view.
              camera.position.copy(lensTarget).addScaledVector(lensNormal, 0.5);
              camera.position.y += 0.12;
              controls!.target.copy(overviewTarget);
              camera.fov = 46;
              camera.updateProjectionMatrix();
              telescopeMode = false;
              setEnteringScope(false);
              controls!.enabled = true;
              controls!.enableDamping = false;
              controls!.update();
              controls!.enableDamping = true;
              transition = undefined;
              returnToFrontAt = t + 1.3;
            } else if (telescopeMode) moveCamera('cafe');
            lastCafeReturn = viewRef.current.cafeReturnRequest;
          }
          if (returnToFrontAt && t >= returnToFrontAt) {
            returnToFrontAt = 0;
            moveCamera('cafe');
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
            !exploreRef.current.on &&
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
          // Light follows the sun: dawn, morning, noon, afternoon, dusk and night.
          // Is the sun hidden behind the café or the hills? (checked a few times a second)
          if (t - lastSunCheck > 0.2) {
            lastSunCheck = t;
            sunRay.set(camera.position, sky.state.sun);
            sunRay.far = 400;
            const blockers: THREE.Object3D[] = [];
            if (assetRoot) blockers.push(assetRoot);
            if (world) blockers.push(world.group);
            sunBlocked =
              sky.state.altitude > -1 && sunRay.intersectObjects(blockers, true).length > 0;
          }
          // Explore mode runs its own, faster day.
          const gameClock = exploreRef.current.on ? exploreRef.current.clock : null;
          sky.update(
            camera,
            gameClock ? 'live' : phaseRef.current,
            t,
            delta,
            reduced,
            sunBlocked,
            gameClock ?? undefined,
          );
          const sk = sky.state,
            lamps = 1 - THREE.MathUtils.smoothstep(sk.altitude, -3, 6),
            night = lamps > 0.5,
            blend = reduced ? 1 : 1 - Math.exp(-delta * 2.4);
          if (sk.phase !== lastPhase) {
            lastPhase = sk.phase;
            setLivePhase(sk.phase);
            setMode(night ? 'night' : 'morning');
          }
          sky.horizon((scene.fog as THREE.Fog).color);
          (floor.material as THREE.MeshToonMaterial).color.lerp(
            groundTint.copy(nightGround).lerp(dayGround, sk.daylight),
            blend,
          );
          const sunUp = THREE.MathUtils.smoothstep(sk.altitude, -2, 8);
          sun.position.copy(sk.sun).multiplyScalar(20);
          sun.color.copy(sunColor.copy(SUN_DAY).lerp(SUN_GOLD, sk.warm));
          sun.intensity = THREE.MathUtils.lerp(sun.intensity, 2.3 * sunUp, blend);
          // The moon takes over as the key light at night.
          moon.position.copy(sk.moon.y > 0 ? sk.moon : sk.sun.clone().negate()).multiplyScalar(20);
          moon.intensity = THREE.MathUtils.lerp(moon.intensity, 0.6 * sk.night, blend);
          ambient.color.lerp(
            skyTint.copy(SKY_NIGHT).lerp(SKY_DUSK, sk.twilight).lerp(SKY_DAY, sk.daylight),
            blend,
          );
          if (sk.warm > 0) ambient.color.lerp(SKY_DUSK, sk.warm * 0.4);
          ambient.groundColor.copy(GROUND_NIGHT).lerp(GROUND_DAY, sk.daylight);
          ambient.intensity = THREE.MathUtils.lerp(
            ambient.intensity,
            0.55 + 1.25 * sk.daylight - 0.25 * sk.warm,
            blend,
          );
          fill.intensity = THREE.MathUtils.lerp(fill.intensity, 0.18 + 0.52 * sk.daylight, blend);
          warmBar.intensity = THREE.MathUtils.lerp(warmBar.intensity, 1.4 + 0.9 * lamps, blend);
          renderer.toneMappingExposure = THREE.MathUtils.lerp(
            renderer.toneMappingExposure,
            0.98 + 0.15 * sk.daylight,
            blend,
          );
          // Soft, slightly lifted Ghibli-like grade: fresh by day, golden at the edges, blue at night.
          gradeTint
            .set(1.02, 1.0, 0.96)
            .lerp(new THREE.Vector3(1.09, 0.96, 0.84), sk.warm)
            .lerp(new THREE.Vector3(0.84, 0.92, 1.1), sk.night);
          gradeLift
            .set(0.03, 0.035, 0.04)
            .lerp(new THREE.Vector3(0.05, 0.03, 0.035), sk.warm)
            .lerp(new THREE.Vector3(0.012, 0.02, 0.045), sk.night);
          toonOutline.setGrade(gradeTint, gradeLift, 1.08 - 0.2 * sk.night);
          // Shadows are baked once per sun position; refresh when the sun has moved.
          if (
            sunUp > 0.01 &&
            sk.sun.angleTo(lastShadowSun) > 0.01 &&
            t - lastShadowAt > (sk.sun.angleTo(lastShadowSun) > 0.08 ? 0.25 : 4)
          ) {
            lastShadowSun = sk.sun.clone();
            lastShadowAt = t;
            renderer.shadowMap.needsUpdate = true;
          }
          nightLights.forEach((light) => {
            light.intensity = THREE.MathUtils.lerp(
              light.intensity,
              light.userData.nightIntensity * lamps,
              blend,
            );
          });
          bulbs.forEach((bulb) => {
            bulb.emissive.set('#ffd6a4');
            bulb.emissiveIntensity = THREE.MathUtils.lerp(
              bulb.emissiveIntensity,
              0.3 + 2.4 * lamps,
              blend,
            );
          });
          neonBoxes.forEach((box) => {
            box.emissiveIntensity = THREE.MathUtils.lerp(box.emissiveIntensity, 0.9 * lamps, blend);
          });
          neonPanels.forEach((panel) => {
            const material = panel.material as THREE.MeshBasicMaterial;
            panel.visible = lamps > 0.01 || material.opacity > 0.01;
            material.opacity = THREE.MathUtils.lerp(material.opacity, 0.95 * lamps, blend);
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
          const explore = exploreRef.current;
          people?.updateActivity(
            explore.on
              ? { ...EMPTY_CAFE_ACTIVITY, visitors: explore.visitors }
              : viewRef.current.activity,
          );
          if (explore.on && people) {
            // Stick → walk direction relative to the camera, then keep the camera following Luna.
            followForward.copy(controls!.target).sub(camera.position).setY(0).normalize();
            followRight.crossVectors(followForward, followUp);
            followMove
              .copy(followForward)
              .multiplyScalar(-explore.stick.y)
              .addScaledVector(followRight, explore.stick.x);
            people.drive(followMove.x, followMove.z);
            people.setRunning(explore.run);
            // A finger held down to run must not also turn the camera.
            controls!.enableRotate = !explore.run;
          }
          people?.update(delta, reduced);
          const exploreCamera =
            explore.on && !telescopeMode && !transition && !debugCamera.frozen && !photo.on;
          if (explore.on && photo.on && people) {
            // Story of Winds in explore mode: the view through Luna's pocket camera, or a selfie
            // held at arm's length in front of her.
            const heading = people.baristaHeading() + photo.yaw,
              eye = people.baristaPosition().clone();
            eye.y += 0.97 * (cafeModel?.getWorldScale(photoScale).x ?? 1);
            photoDir.setFromSphericalCoords(1, Math.PI / 2 - photo.pitch, heading);
            if (photo.facing === 'environment') {
              camera.position.copy(eye).addScaledVector(photoDir, 0.28);
              controls!.target.copy(camera.position).add(photoDir);
            } else {
              // Arm's length plus a little: face and shoulders in the frame.
              camera.position.copy(eye).addScaledVector(photoDir, 1.35);
              controls!.target.copy(eye).addScaledVector(UP, -0.12);
            }
            if (camera.fov !== 58) {
              camera.fov = 58;
              camera.updateProjectionMatrix();
            }
            camera.lookAt(controls!.target);
          }
          if (exploreCamera && people && assetRoot) {
            // Bar box (model units): staff floor between the counter and the back wall.
            lunaLocal.copy(people.baristaPosition());
            cafeModel?.worldToLocal(lunaLocal);
            const inBox =
              !!cctv &&
              lunaLocal.x > -4.6 &&
              lunaLocal.x < -2.05 &&
              lunaLocal.z > 2.9 &&
              lunaLocal.z < 5.05 &&
              lunaLocal.y > 0.45 &&
              lunaLocal.y < 1.5;
            if (inBox !== inCctv) {
              inCctv = inBox;
              controls!.enabled = !inBox;
              followShown.radius = 0;
              if (inBox && cctv) {
                followSaved.offset.copy(camera.position).sub(controls!.target);
                followSaved.fov = camera.fov;
                // The orbit limits would pull a camera this close back out of the box.
                followSaved.limits = [
                  controls!.minDistance,
                  controls!.maxDistance,
                  controls!.minPolarAngle,
                  controls!.maxPolarAngle,
                ];
                controls!.minDistance = 0;
                controls!.maxDistance = 100;
                controls!.minPolarAngle = 0;
                controls!.maxPolarAngle = Math.PI;
                camera.position.copy(cctv.position);
                cctvDir.copy(cctv.target).sub(cctv.position).normalize();
                cctvLook.yaw = Math.atan2(cctvDir.x, cctvDir.z);
                cctvLook.pitch = Math.asin(cctvDir.y);
              } else {
                [
                  controls!.minDistance,
                  controls!.maxDistance,
                  controls!.minPolarAngle,
                  controls!.maxPolarAngle,
                ] = followSaved.limits;
                camera.fov = followSaved.fov || camera.fov;
                controls!.target.copy(people.baristaPosition()).add(new THREE.Vector3(0, 0.75, 0));
                camera.position.copy(controls!.target).add(followSaved.offset);
              }
              camera.updateProjectionMatrix();
            }
            if (inCctv && cctv) {
              // Ultra-wide straight-line lens (the opposite of a fisheye's bulge: lines stay
              // straight and the edges stretch out): about 120° across, at most 120° tall.
              const fov = Math.min(
                120,
                THREE.MathUtils.radToDeg(
                  2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(60)) / camera.aspect),
                ),
              );
              if (Math.abs(camera.fov - fov) > 0.01) {
                camera.fov = fov;
                camera.updateProjectionMatrix();
              }
              cctvDir.setFromSphericalCoords(1, Math.PI / 2 - cctvLook.pitch, cctvLook.yaw);
              camera.position.copy(cctv.position);
              controls!.target.copy(cctv.position).add(cctvDir);
              camera.lookAt(controls!.target);
            }
          } else if (inCctv) {
            // Left explore mode from inside the box; onToggle already reset the orbit limits.
            inCctv = false;
            controls!.enabled = true;
            camera.fov = followSaved.fov || camera.fov;
            camera.updateProjectionMatrix();
          }
          if (exploreCamera && people && !inCctv) {
            followTarget.copy(people.baristaPosition());
            followTarget.y += 0.75;
            // What the player asked for (drag/zoom since last frame) versus where we put it.
            followSpherical.setFromVector3(
              followOffset.copy(camera.position).sub(controls!.target),
            );
            if (followShown.radius > 0) {
              followWish.radius *= followSpherical.radius / followShown.radius;
              followWish.phi += followSpherical.phi - followShown.phi;
            } else {
              followWish.radius = followSpherical.radius;
              followWish.phi = followSpherical.phi;
              followGoal.radius = followShown.radius = followSpherical.radius;
              followGoal.phi = followShown.phi = followSpherical.phi;
            }
            followWish.radius = THREE.MathUtils.clamp(followWish.radius, 2.5, 7);
            followWish.phi = THREE.MathUtils.clamp(followWish.phi, 0.35, 1.05);
            controls!.target.lerp(followTarget, reduced ? 1 : 1 - Math.exp(-delta * 6));
            // Camera collision: when a roof or wall is in the way, drop lower and/or come
            // closer instead of hiding anything (a few probes per second).
            if (t - lastProbe > 0.08) {
              lastProbe = t;
              if (!occluders) {
                const list: THREE.Object3D[] = [];
                occluders = list;
                // The observatory too: Luna can walk into it and climb its stairs.
                world?.tower.traverse((node) => {
                  if ((node as THREE.Mesh).isMesh) list.push(node);
                });
                cafeModel?.traverse((node) => {
                  const mesh = node as THREE.Mesh;
                  if (
                    mesh.isMesh &&
                    !/leaf|leaves|undergrowth|cable|socket|bulb|daun|rumput|grass/i.test(
                      mesh.name + ' ' + (mesh.parent?.name ?? ''),
                    )
                  )
                    list.push(mesh);
                });
              }
              let best = { phi: followWish.phi, radius: 0.6 };
              for (let phi = followWish.phi; phi <= 1.42; phi += 0.12) {
                followDir.setFromSphericalCoords(1, phi, followSpherical.theta);
                probeRay.set(controls!.target, followDir);
                probeRay.far = followWish.radius + 0.3;
                const hit = probeRay.intersectObjects(occluders, false)[0];
                const clear = hit ? Math.max(0.6, hit.distance - 0.25) : followWish.radius;
                if (clear > best.radius + 0.05) best = { phi, radius: clear };
                if (clear >= Math.min(followWish.radius, 2.2)) {
                  best = { phi, radius: Math.min(clear, followWish.radius) };
                  break;
                }
              }
              followGoal.phi = best.phi;
              followGoal.radius = best.radius;
            }
            const k = reduced ? 1 : 1 - Math.exp(-delta * 5),
              closing = followGoal.radius < followShown.radius;
            followShown.phi += (followGoal.phi - followShown.phi) * k;
            followShown.radius +=
              (followGoal.radius - followShown.radius) *
              (closing ? (reduced ? 1 : 1 - Math.exp(-delta * 18)) : k);
            followShown.theta = followSpherical.theta;
            camera.position.copy(controls!.target).add(followOffset.setFromSpherical(followShown));
            // Out on the hills the camera stays above the grass.
            if (world && people.outdoorsNow()) {
              const land = world.heightAt(camera.position.x, camera.position.z) + 0.35;
              if (camera.position.y < land) camera.position.y = land;
            }
          } else if (followShown.radius > 0) {
            followShown.radius = 0;
          }
          foliage.forEach(({ node, x, z, phase, amplitude }) => {
            node.rotation.x = x + (reduced ? 0 : Math.sin(t * 0.7 + phase) * amplitude);
            node.rotation.z =
              z + (reduced ? 0 : Math.sin(t * 0.95 + phase * 1.3) * amplitude * 0.8);
          });
          windTime.value = reduced ? 0 : t;
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
          // Luna at the zebra crossing (explore mode): cars on both lanes brake before it.
          const lunaCrossing =
            !!crossing &&
            !!people &&
            exploreRef.current.on &&
            Math.hypot(
              people.baristaPosition().x - crossing.center.x,
              people.baristaPosition().z - crossing.center.z,
            ) < crossing.reach;
          const listener = controls!.target;
          for (const lane of trafficLanes) {
            if (lane.audio && !soundRef.current) {
              stopVehicleSound(lane.audio);
              activeSounds.delete(lane.audio);
              lane.audio = undefined;
            }
            if (reduced) {
              for (const car of lane.cars) {
                car.active = false;
                car.model.visible = false;
                (car.model.userData.roadGlow as THREE.Mesh).visible = false;
              }
              lane.headlight.intensity = 0;
              lane.nextVehicleAt = t + 2;
              if (lane.audio) {
                stopVehicleSound(lane.audio);
                activeSounds.delete(lane.audio);
                lane.audio = undefined;
              }
              continue;
            }
            const driving = lane.cars.filter((c) => c.active).sort((p, q) => q.s - p.s);
            if (t >= lane.nextVehicleAt) {
              const idle = lane.cars.find((c) => !c.active),
                lastStart = driving.length ? driving[driving.length - 1].s : Infinity;
              if (idle && lastStart > 14) {
                idle.active = true;
                idle.s = 0;
                idle.cruise = (1.45 + Math.random() * 0.55) * 1.1 * 1.38 * 2;
                idle.v = idle.cruise;
                if (!idle.truck) {
                  const palette = ['#a65b4a', '#4f6772', '#a6a58e', '#d4b58e', '#6f7d5a'];
                  (idle.model.userData.paint as THREE.MeshStandardMaterial).color.set(
                    palette[Math.floor(Math.random() * palette.length)],
                  );
                }
                setVehicleFade(idle.model, 0);
                driving.push(idle);
              }
              lane.nextVehicleAt = t + 3 + Math.random() * 8;
            }
            const crossingAt = crossing
              ? crossing.center.clone().sub(lane.start).dot(lane.direction)
              : Infinity;
            let nearest: TrafficCar | null = null,
              nearestDistance = Infinity;
            driving.forEach((car, k) => {
              let target = car.cruise;
              // Keep a gap to the car ahead in this lane.
              const ahead = k ? driving[k - 1] : null;
              if (ahead) {
                const gap = ahead.s - car.s;
                if (gap < 9)
                  target = Math.min(target, ahead.v * THREE.MathUtils.clamp((gap - 4) / 4, 0, 1));
              }
              // Stop before the zebra crossing while Luna is there.
              if (lunaCrossing) {
                const before = crossingAt - car.s - 3.2;
                if (before > -2.6 && before < 22)
                  target = Math.min(target, Math.max(0, before) * 0.8);
              }
              car.v += THREE.MathUtils.clamp(target - car.v, -8 * delta, 3 * delta);
              car.s += Math.max(0, car.v) * delta;
              const fade =
                THREE.MathUtils.smoothstep(car.s, 0, 10) *
                (1 - THREE.MathUtils.smoothstep(car.s, lane.length - 18, lane.length));
              car.model.position.copy(lane.start).addScaledVector(lane.direction, car.s);
              setVehicleFade(car.model, fade);
              car.model.visible = fade > 0.001;
              (car.model.userData.lamp as THREE.MeshBasicMaterial).opacity =
                (night ? 1 : 0.38) * fade;
              const roadGlow = car.model.userData.roadGlow as THREE.Mesh;
              roadGlow.visible = night && fade > 0.001;
              (roadGlow.material as THREE.MeshBasicMaterial).opacity = night ? 0.7 * fade : 0;
              const distance = car.model.position.distanceTo(listener);
              if (distance < nearestDistance) {
                nearestDistance = distance;
                nearest = car;
              }
              if (car.s >= lane.length) {
                car.active = false;
                car.model.visible = false;
                roadGlow.visible = false;
              }
            });
            // One headlight and one engine sound per lane, on the car nearest to the view.
            const near = nearest as TrafficCar | null;
            if (near && near.active) {
              const fade =
                THREE.MathUtils.smoothstep(near.s, 0, 10) *
                (1 - THREE.MathUtils.smoothstep(near.s, lane.length - 18, lane.length));
              lane.headlight.position
                .copy(near.model.position)
                .addScaledVector(lane.direction, near.model.scale.x * (near.truck ? 1.15 : 0.8));
              lane.headlight.position.y += near.model.scale.x * 0.42;
              lane.headlight.intensity = night ? 1.8 * fade : 0;
              const audioContext = audioRef.current;
              const loud = Math.max(0, 1 - nearestDistance / 28);
              if (
                soundRef.current &&
                audioContext?.state === 'running' &&
                !lane.audio &&
                loud > 0
              ) {
                lane.audio = startVehicleSound(audioContext, near.truck);
                activeSounds.add(lane.audio);
              }
              if (lane.audio && audioContext) {
                const at = audioContext.currentTime,
                  frequency =
                    lane.audio.basePitch * (0.8 + (near.v / Math.max(1, near.cruise)) * 0.3);
                lane.audio.engine.frequency.setTargetAtTime(frequency, at, 0.06);
                lane.audio.harmonic.frequency.setTargetAtTime(frequency * 1.52, at, 0.06);
                lane.audio.gain.gain.setTargetAtTime(
                  fade * loud * (near.truck ? 0.038 : 0.028),
                  at,
                  0.07,
                );
                const side = near.model.position.clone().sub(listener).dot(lane.direction);
                lane.audio.pan.pan.setTargetAtTime(
                  THREE.MathUtils.clamp(side / 12, -0.8, 0.8),
                  at,
                  0.05,
                );
              }
              if (t >= lane.hornAt && loud > 0.4) {
                if (soundRef.current && audioContext?.state === 'running' && t - lastHornAt > 12) {
                  playHonk(audioContext, 0);
                  lastHornAt = t;
                }
                lane.hornAt = t + 25 + Math.random() * 50;
              }
            } else {
              lane.headlight.intensity = 0;
              if (lane.audio) {
                stopVehicleSound(lane.audio);
                activeSounds.delete(lane.audio);
                lane.audio = undefined;
              }
            }
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
          toonOutline.render(scene, camera);
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
      toonOutline.dispose();
      sky.dispose();
      world?.dispose();
      addedTargets.forEach((target) => target.dispose());
      renderer?.dispose();
      renderer?.forceContextLoss();
      renderer?.domElement.remove();
    };
  }, []);
  return (
    <>
      <div className={'cafe-scene-shell' + (exploring ? ' exploring' : '')}>
        {enteringScope && <div className="scope-entry-veil" aria-hidden="true" />}
        <div
          className={'cafe-scene ' + (!modelReady ? 'scene-loading' : '')}
          ref={host}
          aria-label="Tampilan 3D kafe Winds Space dengan langit dan cahaya yang mengikuti waktu."
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
        {exploring && exploreApi && (
          <ExploreMode api={exploreApi} onExit={() => toggleExplore(false)} />
        )}
        {!exploring && exploreApi && (
          <button
            type="button"
            className="scene-explore-toggle"
            onClick={() => toggleExplore(true)}
          >
            <Gamepad2 size={14} />
            <span>Explore</span>
          </button>
        )}
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
            className="active"
            aria-label={
              'Waktu: ' +
              (skyPhase === 'live'
                ? 'mengikuti jam sekarang, ' + livePhase
                : SKY_PHASES.find((p) => p.id === skyPhase)?.label) +
              '. Ketuk untuk mengganti.'
            }
            onClick={() => {
              const i = SKY_PHASES.findIndex((p) => p.id === skyPhase);
              setSkyPhase(SKY_PHASES[(i + 1) % SKY_PHASES.length].id);
            }}
          >
            {(skyPhase === 'live' ? livePhase : skyPhase) === 'malam' ||
            (skyPhase === 'live' ? livePhase : skyPhase) === 'senja'
              ? '☾'
              : '☀'}{' '}
            {skyPhase === 'live'
              ? 'Live · ' + SKY_PHASES.find((p) => p.id === livePhase)?.label
              : SKY_PHASES.find((p) => p.id === skyPhase)?.label}
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
          <DialogTitle className="sr-only">Memoirs</DialogTitle>
          <DialogDescription className="sr-only">
            Slideshow foto pilihan dari kamera Story of Winds, dengan pilihan foto dan kontrol
            pemutaran.
          </DialogDescription>
          <DriveTV program={tvProgram} onProgramChange={setTvProgram} />
        </DialogContent>
      </Dialog>
    </>
  );
}
