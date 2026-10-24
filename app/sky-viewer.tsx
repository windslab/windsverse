'use client';
import { useEffect, useRef, type CSSProperties } from 'react';
import * as THREE from 'three';
import * as Astro from 'astronomy-engine';
import { createSkyLandscape, createSkyAtmosphere } from '@/lib/sky-landscape';
import { createSolarEffects } from '@/lib/sky-solar-effects';
import {
  fieldOfView,
  WIDE_FOV,
  clampWideFov,
  clampMountAltitude,
  MIN_MOUNT_ALT,
  focusBlur,
  type SkyOptics,
  type SkyObjectOption,
} from '@/lib/sky-optics';

export type SkyCommand = {
  seq: number;
  kind: 'direction' | 'moon' | 'reset' | 'clear' | 'point' | 'target' | 'photo';
  az?: number;
  alt?: number;
  id?: string;
};
export type SkyInfo = {
  horizonElevation?: number;
  obscured?: boolean;
  id: string;
  name: string;
  kind: string;
  description: string;
  altitude: number;
  azimuth: number;
  details: [string, string][];
};
type Star = [number, number, number, number, number, string, string];
const OBSERVER = new Astro.Observer(-4.8499, 119.5885, 10),
  D = Math.PI / 180;
const deepSky = [
  {
    id: 'MilkyWay',
    name: 'Bima Sakti',
    kind: 'Panorama galaksi',
    aliases: ['Milky Way', 'Bima Sakti', 'Galaksi', 'Galactic center'],
    description:
      'Arah pusat Bima Sakti. Panorama fotografis dipetakan ke langit untuk menjelajahi jalur galaksi; kecerahannya merupakan visualisasi, bukan kondisi cuaca atau kamera langsung.',
  },
  {
    id: 'M45',
    name: 'Pleiades',
    kind: 'Gugus bintang terbuka',
    aliases: ['M45', 'Pleiades', 'Seven Sisters', 'Gugus bintang', 'Bintang Tujuh'],
    description:
      'Gugus bintang Pleiades di rasi Taurus. Posisi bintang terang mengikuti katalog; gunakan wide untuk melihat lingkungan gugus di langit.',
  },
];
function deepVector(id: string) {
  const time = Astro.MakeTime(new Date('2000-01-01T12:00:00Z'));
  if (id === 'MilkyWay') {
    const v = Astro.RotateVector(Astro.Rotation_GAL_EQJ(), new Astro.Vector(1, 0, 0, time));
    return new THREE.Vector3(v.x, v.y, v.z);
  }
  const ra = 3.783333333 * 15 * D,
    dec = 24.116666667 * D;
  return new THREE.Vector3(
    Math.cos(dec) * Math.cos(ra),
    Math.cos(dec) * Math.sin(ra),
    Math.sin(dec),
  );
}
const surface: { [key: string]: { radius: number; texture: string } } = {
  Sun: { radius: 695700, texture: '2k_sun.jpg' },
  Moon: { radius: 1737.4, texture: '' },
  Mercury: { radius: 2439.5, texture: '2k_mercury.jpg' },
  Venus: { radius: 6052, texture: '2k_venus_atmosphere.jpg' },
  Mars: { radius: 3396, texture: '2k_mars.jpg' },
  Jupiter: { radius: 71492, texture: '2k_jupiter.jpg' },
  Saturn: { radius: 60268, texture: '2k_saturn.jpg' },
  Uranus: { radius: 25559, texture: '2k_uranus.jpg' },
  Neptune: { radius: 24764, texture: '2k_neptune.jpg' },
};
const planets = [
  {
    body: Astro.Body.Sun,
    name: 'Matahari',
    color: '#ffe6a1',
    description:
      'Bintang pusat Tata Surya. Simulasi menampilkan cahaya putih keemasan dengan silau dan flare optik.',
  },
  {
    body: Astro.Body.Moon,
    name: 'Bulan',
    color: '#eee9df',
    description:
      'Satelit alami Bumi. Fase dan posisinya dihitung untuk waktu pengamatan yang dipilih.',
  },
  {
    body: Astro.Body.Mercury,
    name: 'Merkurius',
    color: '#d2c3ac',
    description: 'Planet terdekat dengan Matahari.',
  },
  {
    body: Astro.Body.Venus,
    name: 'Venus',
    color: '#fff4ce',
    description:
      'Planet terang dengan atmosfer tebal, sering terlihat menjelang matahari terbit atau setelah terbenam.',
  },
  {
    body: Astro.Body.Mars,
    name: 'Mars',
    color: '#ef9f77',
    description: 'Planet berbatu yang tampak kemerahan.',
  },
  {
    body: Astro.Body.Jupiter,
    name: 'Jupiter',
    color: '#efd6b6',
    description: 'Planet terbesar dalam Tata Surya.',
  },
  {
    body: Astro.Body.Saturn,
    name: 'Saturnus',
    color: '#e1c795',
    description: 'Planet raksasa dengan sistem cincin.',
  },
  {
    body: Astro.Body.Uranus,
    name: 'Uranus',
    color: '#b1dedc',
    description: 'Planet raksasa es berwarna biru kehijauan.',
  },
  {
    body: Astro.Body.Neptune,
    name: 'Neptunus',
    color: '#86aaff',
    description: 'Planet terjauh dari Matahari dalam delapan planet utama.',
  },
];
function direction(az: number, alt: number) {
  return new THREE.Vector3(
    Math.sin(az * D) * Math.cos(alt * D),
    Math.sin(alt * D),
    -Math.cos(az * D) * Math.cos(alt * D),
  );
}
function bodyMaterial(map: THREE.Texture, unlit = false) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      map: { value: map },
      lightDirection: { value: new THREE.Vector3(1, 0, 0) },
      unlit: { value: unlit },
      visibility: { value: 1 },
    },
    vertexShader:
      'varying vec2 uvCoords; varying vec3 worldNormal; void main(){uvCoords=uv;worldNormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `uniform sampler2D map;uniform vec3 lightDirection;uniform bool unlit;uniform float visibility;varying vec2 uvCoords;varying vec3 worldNormal;
 void main(){vec4 color=texture2D(map,uvCoords);float light=.04+1.6*max(0.,dot(normalize(worldNormal),normalize(lightDirection)));
 vec3 lit=unlit?mix(color.rgb,vec3(1.,.91,.72),.78)*1.5:color.rgb*light;
 gl_FragColor=vec4(lit,color.a*visibility);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`,
  });
}

export default function SkyViewer(props: {
  simulationTime: number | null;
  command: SkyCommand;
  optics: SkyOptics;
  focus: number;
  onWideFov: (fov: number) => void;
  motion: { az: number; alt: number; mode: 'fine' | 'travel' };
  onPhoto: (blob: Blob, name: string) => void;
  onPhotoError: () => void;
  onCatalog: (objects: SkyObjectOption[]) => void;
  onDetail: (loading: boolean) => void;
  onSelect: (info: SkyInfo | null) => void;
  onReady: () => void;
  onError: () => void;
  onTracking: (tracking: string | null) => void;
  onView: (view: { az: number; alt: number; fov: number; minAltitude: number }) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    selectionMarker = useRef<HTMLDivElement>(null),
    latest = useRef(props);
  latest.current = props;
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let disposed = false,
      raf = 0,
      renderer: THREE.WebGLRenderer | undefined,
      resize: ResizeObserver | undefined,
      stars: THREE.Points | undefined,
      catalog: Star[] = [],
      starPositions: THREE.Vector3[] = [],
      selected: string | null = null,
      tracking: string | null = null,
      lastCommand = -1,
      lastUpdate = 0,
      lastFrame = 0,
      lastView = 0,
      lastInfo = 0,
      lastDetail = 0,
      az = 0,
      alt = 45,
      targetAz = 0,
      targetAlt = 45,
      velocityAz = 0,
      velocityAlt = 0,
      fov = fieldOfView(latest.current.optics);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#020711');
    const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 200);
    camera.position.set(0, 0, 0);
    const sprites: THREE.Mesh[] = [],
      resources: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];
    const abort = new AbortController(),
      pointers = new Map<
        number,
        { x: number; y: number; startX: number; startY: number; moved: boolean }
      >();
    let detailLoads = 0;
    const loadedDetails = new Set<number>();
    let moonHigh = false;
    const textureRetry = new Map<string, number>();
    const loader = new THREE.TextureLoader();
    const landscape = createSkyLandscape(),
      atmosphere = createSkyAtmosphere();
    scene.add(landscape.mesh, landscape.backgroundMesh, landscape.mist, atmosphere.mesh);
    resources.push(
      landscape.texture,
      landscape.backgroundTexture,
      landscape.geometry,
      landscape.material,
      landscape.backgroundMaterial,
      landscape.mistMaterial,
      atmosphere.geometry,
      atmosphere.material,
    );
    const minimumAltitude = () =>
      latest.current.optics.wide ? landscape.minimumAltitude(az, fov) : MIN_MOUNT_ALT;
    const clampAltitude = (value: number) => clampMountAltitude(value, minimumAltitude());
    const solar = createSolarEffects();
    scene.add(solar.mesh);
    resources.push(solar.geometry, solar.material);
    const selectedPosition = new THREE.Vector3(),
      selectedProjection = new THREE.Vector3();
    // Draw the selection in WebGL itself so mobile compositors cannot hide it behind the canvas.
    const markerCanvas = document.createElement('canvas');
    markerCanvas.width = 256;
    markerCanvas.height = 128;
    const markerTexture = new THREE.CanvasTexture(markerCanvas);
    markerTexture.colorSpace = THREE.SRGBColorSpace;
    const markerMaterial = new THREE.SpriteMaterial({
      map: markerTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      sizeAttenuation: false,
    });
    const markerSprite = new THREE.Sprite(markerMaterial);
    markerSprite.center.set(0.5, 0.625);
    markerSprite.renderOrder = 1000;
    markerSprite.frustumCulled = false;
    markerSprite.visible = false;
    scene.add(markerSprite);
    resources.push(markerTexture, markerMaterial);
    function drawSelection(name: string) {
      const ctx = markerCanvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, 256, 128);
      const brackets = () => {
        ctx.beginPath();
        for (const [x, y, sx, sy] of [
          [96, 18, 1, 1],
          [160, 18, -1, 1],
          [96, 78, 1, -1],
          [160, 78, -1, -1],
        ]) {
          ctx.moveTo(x + sx * 16, y);
          ctx.lineTo(x, y);
          ctx.lineTo(x, y + sy * 16);
        }
        ctx.stroke();
      };
      ctx.strokeStyle = '#08101a';
      ctx.lineWidth = 9;
      brackets();
      ctx.strokeStyle = '#ffe1a0';
      ctx.lineWidth = 4;
      brackets();
      let size = 25;
      ctx.font = '600 ' + size + 'px sans-serif';
      while (ctx.measureText(name).width > 230 && size > 16) {
        size--;
        ctx.font = '600 ' + size + 'px sans-serif';
      }
      const width = Math.min(250, ctx.measureText(name).width + 18);
      ctx.fillStyle = '#09121ee8';
      ctx.fillRect((256 - width) / 2, 88, width, 36);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffe7b4';
      ctx.fillText(name, 128, 106);
      markerTexture.needsUpdate = true;
    }
    let pinch: { distance: number; fov: number } | undefined;
    let photoPending = false,
      milkyway: THREE.Mesh | undefined,
      milkywayLoading = false,
      milkywayRetryAt = 0;
    const observationDate = () => new Date(latest.current.simulationTime ?? Date.now());
    let lastSimulationTime: number | null | undefined;
    const stopTracking = () => {
      if (tracking) {
        tracking = null;
        latest.current.onTracking(null);
      }
    };
    function objectInfo(id: string): SkyInfo | null {
      const deep = deepSky.find((item) => item.id === id);
      if (deep && stars) {
        const v = deepVector(id).applyMatrix4(stars.matrix).normalize();
        return {
          id,
          name: deep.name,
          kind: deep.kind,
          description: deep.description,
          altitude: Math.asin(v.y) / D,
          azimuth: (Math.atan2(v.x, -v.z) / D + 360) % 360,
          details: [],
        };
      }
      const bodyIndex = planets.findIndex((item) => item.body === id);
      if (bodyIndex >= 0) {
        const item = planets[bodyIndex],
          now = observationDate(),
          eq = Astro.Equator(item.body, now, OBSERVER, true, true),
          hor = Astro.Horizon(now, OBSERVER, eq.ra, eq.dec);
        const details: [string, string][] = [
          [
            'Jarak',
            item.body === Astro.Body.Moon
              ? Math.round(eq.dist * 149597870.7).toLocaleString('id-ID') + ' km'
              : eq.dist.toFixed(3) + ' AU',
          ],
        ];
        if (item.body === Astro.Body.Moon)
          details.push([
            'Cahaya Bulan',
            (50 * (1 - Math.cos(Astro.MoonPhase(now) * D))).toFixed(1) + '%',
          ]);
        return {
          id,
          name: item.name,
          kind:
            item.body === Astro.Body.Moon
              ? 'Satelit alami'
              : item.body === Astro.Body.Sun
                ? 'Bintang'
                : 'Planet',
          description: item.description,
          altitude: hor.altitude,
          azimuth: hor.azimuth,
          details,
        };
      }
      const index = catalog.findIndex((row) => 'HIP' + row[0] === id);
      if (index < 0 || !stars) return null;
      const star = catalog[index],
        v = starPositions[index].clone().applyMatrix4(stars.matrix).normalize();
      return {
        id,
        name: star[5],
        kind: 'Bintang · HIP ' + star[0],
        description:
          'Bintang dari katalog Hipparcos. Magnitudo yang lebih kecil menunjukkan bintang yang tampak lebih terang.',
        altitude: Math.asin(v.y) / D,
        azimuth: (Math.atan2(v.x, -v.z) / D + 360) % 360,
        details: [
          ['Magnitudo', star[3].toFixed(2)],
          ['Rasi', star[6] || '—'],
          ['Asensio rekta (J2000)', (star[1] / 15).toFixed(3) + ' jam'],
          ['Deklinasi (J2000)', star[2].toFixed(3) + '°'],
        ],
      };
    }
    const reportInfo = (id: string | null) => {
      const info = id ? objectInfo(id) : null;
      if (info && latest.current.optics.wide) {
        info.horizonElevation = landscape.elevationAt(info.azimuth);
        info.obscured = landscape.occludes(info.azimuth, info.altitude);
      }
      latest.current.onSelect(info);
    };
    const choose = (id: string | null) => {
      selected = id;
      drawSelection(id ? objectInfo(id)?.name || id : '');
      if (selectionMarker.current) {
        selectionMarker.current.hidden = !id;
        selectionMarker.current.setAttribute(
          'aria-label',
          id ? 'Objek terpilih: ' + (objectInfo(id)?.name || id) : 'Objek terpilih',
        );
      }
      reportInfo(id);
    };
    const pick = (x: number, y: number) => {
      if (!stars || !renderer) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(
          ((x - rect.left) / rect.width) * 2 - 1,
          (-(y - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      if (latest.current.optics.wide) {
        const d = ray.ray.direction,
          a = (Math.atan2(d.x, -d.z) / D + 360) % 360;
        if (landscape.occludes(a, Math.asin(d.y) / D)) {
          choose(null);
          return;
        }
      }
      const hit = ray.intersectObjects(sprites, true)[0];
      if (hit) {
        let object: THREE.Object3D = hit.object;
        while (object.parent && !sprites.includes(object as THREE.Mesh)) object = object.parent;
        const index = sprites.indexOf(object as THREE.Mesh);
        if (index >= 0) {
          choose(planets[index].body);
          return;
        }
      }
      let best: string | null = null,
        distance = 17;
      const check = (v: THREE.Vector3, id: string) => {
        const p = v.clone().project(camera);
        if (p.z < 0 || p.z > 1) return;
        const d = Math.hypot(
          rect.left + ((p.x + 1) * rect.width) / 2 - x,
          rect.top + ((1 - p.y) * rect.height) / 2 - y,
        );
        if (d < distance) {
          distance = d;
          best = id;
        }
      };
      for (let i = 0; i < sprites.length; i++) check(sprites[i].position, planets[i].body);
      if (!best)
        for (let i = 0; i < catalog.length; i++)
          check(starPositions[i].clone().applyMatrix4(stars.matrix), 'HIP' + catalog[i][0]);
      choose(best);
    };
    const touchDistance = () => {
      const points = [...pointers.values()];
      return points.length === 2
        ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
        : 0;
    };
    const down = (e: PointerEvent) => {
      renderer!.domElement.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
        startX: e.clientX,
        startY: e.clientY,
        moved: pointers.size > 0,
      });
      if (pointers.size > 1) {
        pointers.forEach((p) => (p.moved = true));
        const distance = touchDistance();
        if (latest.current.optics.wide && distance > 0)
          pinch = { distance, fov: fieldOfView(latest.current.optics) };
      }
    };
    const move = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > 5) p.moved = true;
      p.x = e.clientX;
      p.y = e.clientY;
      if (latest.current.optics.wide && pinch && pointers.size === 2) {
        e.preventDefault();
        const distance = touchDistance();
        if (distance > 8) {
          pointers.forEach((point) => (point.moved = true));
          latest.current.onWideFov(
            clampWideFov(
              (2 * Math.atan((Math.tan((pinch.fov * D) / 2) * pinch.distance) / distance)) / D,
            ),
          );
        }
      }
    };
    const up = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      if (e.type === 'pointerup' && p && !p.moved && pointers.size === 1)
        pick(e.clientX, e.clientY);
      pointers.delete(e.pointerId);
      if (pointers.size !== 2) pinch = undefined;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (latest.current.optics.wide) {
        const current = fieldOfView(latest.current.optics),
          scale = Math.exp(THREE.MathUtils.clamp(e.deltaY, -100, 100) * 0.004);
        latest.current.onWideFov(
          clampWideFov((2 * Math.atan(Math.tan((current * D) / 2) * scale)) / D),
        );
      }
    };
    function configureTexture(texture: THREE.Texture) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.anisotropy = Math.min(8, renderer!.capabilities.getMaxAnisotropy());
      texture.wrapS = THREE.RepeatWrapping;
      return texture;
    }
    function loadDetail(index: number, high = false) {
      const key = index + ':' + high;
      if (Date.now() < (textureRetry.get(key) || 0) || (high ? moonHigh : loadedDetails.has(index)))
        return;
      if (high) moonHigh = true;
      else loadedDetails.add(index);
      const path = high
        ? `/sky/moon-lroc-${renderer!.capabilities.maxTextureSize >= 8192 && !window.matchMedia('(pointer: coarse)').matches ? '8k' : '4k'}.jpg`
        : '/sky/planets/' + surface[planets[index].body].texture;
      detailLoads++;
      latest.current.onDetail(true);
      void loader
        .loadAsync(path)
        .then((texture) => {
          if (disposed) {
            texture.dispose();
            return;
          }
          configureTexture(texture);
          resources.push(texture);
          const material = sprites[index].material as THREE.ShaderMaterial;
          const old = material.uniforms.map.value as THREE.Texture;
          material.uniforms.map.value = texture;
          old.dispose();
        })
        .catch(() => {
          if (!disposed) {
            textureRetry.set(key, Date.now() + 30_000);
            if (high) moonHigh = false;
            else loadedDetails.delete(index);
          }
        })
        .finally(() => {
          detailLoads--;
          if (!disposed) latest.current.onDetail(detailLoads > 0);
        });
    }
    function loadMilkyWay() {
      if (milkyway || milkywayLoading || Date.now() < milkywayRetryAt) return;
      milkywayLoading = true;
      detailLoads++;
      latest.current.onDetail(true);
      void loader
        .loadAsync('/sky/milkyway-eso.jpg')
        .then((texture) => {
          if (disposed) {
            texture.dispose();
            return;
          }
          texture.colorSpace = THREE.NoColorSpace;
          texture.magFilter = THREE.LinearFilter;
          texture.minFilter = THREE.LinearMipmapLinearFilter;
          texture.wrapS = THREE.RepeatWrapping;
          const geometry = new THREE.SphereGeometry(130, 64, 32),
            material = new THREE.ShaderMaterial({
              side: THREE.BackSide,
              depthWrite: false,
              uniforms: { map: { value: texture }, visibility: { value: 1 } },
              vertexShader:
                'varying vec3 gal;void main(){gal=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
              fragmentShader:
                'uniform sampler2D map;uniform float visibility;varying vec3 gal;void main(){vec3 d=normalize(gal);vec2 uv=vec2(.5-atan(d.y,d.x)/6.28318530718,.5+asin(clamp(d.z,-1.0,1.0))/3.14159265359);gl_FragColor=vec4(texture2D(map,uv).rgb*.65*visibility,1.0);}',
            });
          milkyway = new THREE.Mesh(geometry, material);
          milkyway.matrixAutoUpdate = false;
          milkyway.frustumCulled = false;
          milkyway.renderOrder = -2;
          scene.add(milkyway);
          resources.push(texture, geometry, material);
        })
        .catch(() => {
          milkywayRetryAt = Date.now() + 30000;
        })
        .finally(() => {
          milkywayLoading = false;
          detailLoads--;
          if (!disposed) latest.current.onDetail(detailLoads > 0);
        });
    }
    function photograph(now: Date) {
      try {
        const output = document.createElement('canvas'),
          side = Math.min(2048, renderer!.domElement.width),
          margin = Math.round(side * 0.04),
          footer = Math.round(side * 0.28);
        output.width = side;
        output.height = side + footer;
        const ctx = output.getContext('2d');
        if (!ctx) throw Error('canvas');
        ctx.fillStyle = '#080c14';
        ctx.fillRect(0, 0, output.width, output.height);
        ctx.save();
        ctx.beginPath();
        ctx.arc(side / 2, side / 2, side / 2 - margin, 0, Math.PI * 2);
        ctx.clip();
        const input = renderer!.domElement,
          size = Math.min(input.width, input.height);
        ctx.filter =
          'blur(' +
          (focusBlur(latest.current.focus) * side) / Math.max(1, container!.clientWidth) +
          'px)';
        ctx.drawImage(
          input,
          (input.width - size) / 2,
          (input.height - size) / 2,
          size,
          size,
          margin,
          margin,
          side - 2 * margin,
          side - 2 * margin,
        );
        ctx.restore();
        ctx.strokeStyle = '#8b7855';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(side / 2, side / 2, side / 2 - margin, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#e9d5a7';
        ctx.font = `600 ${Math.round(side * 0.027)}px sans-serif`;
        ctx.fillText('WINDS SPACE · WINDSTRONOUT', margin, side + footer * 0.17);
        ctx.fillStyle = '#d9e2ed';
        ctx.font = `${Math.round(side * 0.021)}px sans-serif`;
        const optics = latest.current.optics;
        ctx.fillText(
          (tracking ? objectInfo(tracking)?.name + ' · ' : 'Langit Pangkep · ') +
            (optics.wide
              ? 'Wide ' + fov.toFixed(1) + '°'
              : optics.eyepiece +
                ' mm · Barlow ' +
                optics.barlow +
                '× · ' +
                ((optics.telescopeFocalLength / optics.eyepiece) * optics.barlow).toFixed(1) +
                '×'),
          margin,
          side + footer * 0.35,
        );
        ctx.fillText(
          'Pangkep · ' + now.toLocaleString('id-ID', { timeZone: 'Asia/Makassar' }) + ' WITA',
          margin,
          side + footer * 0.51,
        );
        ctx.fillText(
          'Az ' +
            az.toFixed(2) +
            '° · Alt ' +
            alt.toFixed(2) +
            '° · FOV ' +
            fov.toFixed(3) +
            '° · ' +
            (optics.wide ? 'Atmosfer wide' : 'Langit gelap'),
          margin,
          side + footer * 0.67,
        );
        ctx.fillStyle = '#94a3b8';
        ctx.font = `${Math.round(side * 0.017)}px sans-serif`;
        ctx.fillText(
          'Simulasi astronomi · ' +
            (optics.wide
              ? 'Panorama: ESO/S. Brunier · CC BY 4.0'
              : 'Permukaan: NASA / Solar System Scope'),
          margin,
          side + footer * 0.82,
        );
        ctx.fillText(
          'Sumber & lisensi: windsverse.com/sky/CREDITS.txt',
          margin,
          side + footer * 0.94,
        );
        output.toBlob((blob) => {
          if (disposed) return;
          if (blob)
            latest.current.onPhoto(
              blob,
              'winds-langit-' + now.toISOString().replace(/[:.]/g, '-') + '.png',
            );
          else latest.current.onPhotoError();
        }, 'image/png');
      } catch {
        latest.current.onPhotoError();
      }
    }
    async function start() {
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
        renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        container!.appendChild(renderer.domElement);
        renderer.domElement.tabIndex = 0;
        renderer.domElement.setAttribute(
          'aria-label',
          'Langit Pangkep melalui teleskop. Tahan slider arah dan pilih eyepiece di panel kontrol. Ketuk objek untuk informasi.',
        );
        resize = new ResizeObserver(() => {
          if (!renderer) return;
          const w = container!.clientWidth,
            h = container!.clientHeight;
          renderer.setSize(w, h);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        });
        resize.observe(container!);
        for (const [name, listener] of [
          ['pointerdown', down],
          ['pointermove', move],
          ['pointerup', up],
          ['pointercancel', up],
          ['lostpointercapture', up],
        ] as const)
          renderer.domElement.addEventListener(name, listener as EventListener);
        renderer.domElement.addEventListener('wheel', wheel, { passive: false });
        const response = await fetch('/sky/stars.json', { signal: abort.signal });
        if (!response.ok) throw Error('catalog');
        catalog = await response.json();
        if (disposed) return;
        latest.current.onCatalog([
          ...deepSky.map(({ id, name, kind, aliases }) => ({ id, name, kind, aliases })),
          ...planets.map((item) => ({
            id: item.body,
            name: item.name,
            kind:
              item.body === Astro.Body.Moon
                ? 'Bulan'
                : item.body === Astro.Body.Sun
                  ? 'Matahari'
                  : 'Planet',
            aliases: [item.body, item.name],
          })),
          ...catalog.map((star) => ({
            id: 'HIP' + star[0],
            name: star[5],
            kind: 'Bintang',
            aliases: [star[5], 'HIP ' + star[0], 'HIP' + star[0], star[6]],
          })),
        ]);
        const positions: number[] = [],
          colors: number[] = [],
          sizes: number[] = [];
        for (const star of catalog) {
          const ra = star[1] * D,
            dec = star[2] * D,
            v = new THREE.Vector3(
              Math.cos(dec) * Math.cos(ra),
              Math.cos(dec) * Math.sin(ra),
              Math.sin(dec),
            ).multiplyScalar(100);
          starPositions.push(v);
          positions.push(v.x, v.y, v.z);
          const color = new THREE.Color(
            star[4] < 0.1 ? '#b7d5ff' : star[4] > 0.9 ? '#ffcb9d' : '#fff4df',
          );
          colors.push(color.r, color.g, color.b);
          sizes.push(THREE.MathUtils.clamp(1.4 + (6 - star[3]) * 0.65, 1.5, 7));
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
        const material = new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          uniforms: { scale: { value: 1 }, visibility: { value: 1 } },
          vertexShader:
            'attribute float size; attribute vec3 color; varying vec3 tint; uniform float scale; void main(){tint=color;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_PointSize=size*scale;}',
          fragmentShader:
            'uniform float visibility;varying vec3 tint;void main(){float d=length(gl_PointCoord-0.5)*2.0;if(d>1.0)discard;float a=exp(-d*d*4.0)*(1.0-smoothstep(.65,1.0,d));vec3 stellar=mix(vec3(1.),tint,.35);gl_FragColor=vec4(stellar,a*visibility);\n#include <colorspace_fragment>\n}',
        });
        resources.push(geometry, material);
        stars = new THREE.Points(geometry, material);
        stars.matrixAutoUpdate = false;
        stars.frustumCulled = false;
        scene.add(stars);
        const moonMap = await loader.loadAsync('/sky/moon-lroc-2k.jpg');
        if (disposed) {
          moonMap.dispose();
          return;
        }
        configureTexture(moonMap);
        resources.push(moonMap);
        for (const item of planets) {
          const geometry = new THREE.SphereGeometry(
            0.5,
            item.body === Astro.Body.Moon ? 128 : 64,
            item.body === Astro.Body.Moon ? 96 : 48,
          );
          geometry.rotateY(-Math.PI / 2);
          let texture = moonMap;
          if (item.body !== Astro.Body.Moon) {
            const color = new THREE.Color(item.color);
            texture = new THREE.DataTexture(
              new Uint8Array([
                Math.round(color.r * 255),
                Math.round(color.g * 255),
                Math.round(color.b * 255),
                255,
              ]),
              1,
              1,
            );
            texture.needsUpdate = true;
            resources.push(texture);
          }
          const material = bodyMaterial(texture, item.body === Astro.Body.Sun),
            object = new THREE.Mesh(geometry, material);
          object.renderOrder = 2;
          sprites.push(object);
          scene.add(object);
          resources.push(geometry, material);
        }
        void loader
          .loadAsync('/sky/planets/2k_saturn_ring_alpha.png')
          .then((texture) => {
            if (disposed) {
              texture.dispose();
              return;
            }
            configureTexture(texture);
            const geometry = new THREE.RingGeometry(0.62, 1.17, 128);
            const pos = geometry.attributes.position,
              uv = geometry.attributes.uv;
            for (let i = 0; i < pos.count; i++) {
              const radius = Math.hypot(pos.getX(i), pos.getY(i));
              uv.setXY(i, (radius - 0.62) / (1.17 - 0.62), 0.5);
            }
            geometry.rotateX(-Math.PI / 2);
            const material = new THREE.MeshBasicMaterial({
              map: texture,
              side: THREE.DoubleSide,
              transparent: true,
              depthWrite: false,
            });
            const ring = new THREE.Mesh(geometry, material);
            sprites[6].add(ring);
            resources.push(texture, geometry, material);
          })
          .catch(() => {});
        const horizon = new THREE.BufferGeometry().setFromPoints(
          Array.from({ length: 129 }, (_, i) => direction((i / 128) * 360, 0).multiplyScalar(100)),
        );
        const horizonMaterial = new THREE.LineBasicMaterial({
          color: '#607a91',
          transparent: true,
          opacity: 0.3,
        });
        resources.push(horizon, horizonMaterial);
        scene.add(new THREE.Line(horizon, horizonMaterial));
        await landscape.ready;
        if (disposed) return;
        latest.current.onReady();
        const render = (time: number) => {
          if (disposed) return;
          raf = requestAnimationFrame(render);
          const dt = Math.min((time - lastFrame) / 1000, 0.05);
          lastFrame = time;
          if (document.hidden) return;
          const now = observationDate();
          if (latest.current.simulationTime !== lastSimulationTime) {
            lastSimulationTime = latest.current.simulationTime;
            lastUpdate = 0;
            lastInfo = 0;
          }
          const requestedFov = fieldOfView(latest.current.optics);
          fov = latest.current.optics.wide
            ? THREE.MathUtils.lerp(fov, requestedFov, 1 - Math.exp(-dt * 16))
            : requestedFov;
          if (!latest.current.optics.wide) pinch = undefined;
          if (time - lastUpdate > 100 || lastUpdate === 0) {
            const rotation = Astro.Rotation_EQJ_HOR(now, OBSERVER),
              toWorld = (v: Astro.Vector) => {
                const h = Astro.RotateVector(rotation, v);
                return new THREE.Vector3(-h.y, h.z, -h.x);
              };
            const basis = [
              [1, 0, 0],
              [0, 1, 0],
              [0, 0, 1],
            ].map((v) => toWorld(new Astro.Vector(v[0], v[1], v[2], Astro.MakeTime(now))));
            stars!.matrix.makeBasis(basis[0], basis[1], basis[2]);
            lastUpdate = time;
            const sunEq = Astro.Equator(Astro.Body.Sun, now, OBSERVER, false, true);
            for (let i = 0; i < planets.length; i++) {
              const item = planets[i],
                eq = Astro.Equator(item.body, now, OBSERVER, false, true),
                world = toWorld(eq.vec),
                diameter = 2 * Math.atan(surface[item.body].radius / (eq.dist * 149597870.7));
              sprites[i].position.copy(world.normalize().multiplyScalar(99));
              sprites[i].scale.setScalar(99 * diameter);
              const light = new Astro.Vector(
                sunEq.vec.x - eq.vec.x,
                sunEq.vec.y - eq.vec.y,
                sunEq.vec.z - eq.vec.z,
                Astro.MakeTime(now),
              );
              (sprites[i].material as THREE.ShaderMaterial).uniforms.lightDirection.value.copy(
                toWorld(light).normalize(),
              );
              const axis = toWorld(Astro.RotationAxis(item.body, now).north).normalize(),
                towardObserver = sprites[i].position.clone().negate().normalize(),
                zAxis = towardObserver.addScaledVector(axis, -towardObserver.dot(axis)).normalize(),
                xAxis = new THREE.Vector3().crossVectors(axis, zAxis).normalize();
              sprites[i].quaternion.setFromRotationMatrix(
                new THREE.Matrix4().makeBasis(xAxis, axis, zAxis),
              );
            }
            if (milkyway) {
              const gal = Astro.Rotation_GAL_EQJ(),
                galBasis = [
                  [1, 0, 0],
                  [0, 1, 0],
                  [0, 0, 1],
                ].map((v) =>
                  toWorld(
                    Astro.RotateVector(
                      gal,
                      new Astro.Vector(v[0], v[1], v[2], Astro.MakeTime(now)),
                    ),
                  ),
                );
              milkyway.matrix.makeBasis(galBasis[0], galBasis[1], galBasis[2]);
            }
          }
          const command = latest.current.command;
          if (command.seq !== lastCommand) {
            lastCommand = command.seq;
            if (command.kind === 'photo') {
              photoPending = true;
            } else if (command.kind === 'clear') choose(null);
            else if (command.kind === 'moon' || command.kind === 'target') {
              const target = command.kind === 'moon' ? Astro.Body.Moon : command.id!;
              if (
                deepSky.some((item) => item.id === target) ||
                planets.some((item) => item.body === target) ||
                catalog.some((row) => 'HIP' + row[0] === target)
              ) {
                tracking = target;
                latest.current.onTracking(target);
                choose(target);
              }
            } else {
              stopTracking();
              az = THREE.MathUtils.clamp(command.az ?? 0, 0, 360);
              alt = clampAltitude(command.alt ?? 45);
              targetAz = az;
              targetAlt = alt;
              velocityAz = velocityAlt = 0;
              if (command.kind !== 'point') choose(null);
            }
          }
          const motion = latest.current.motion,
            reduced = reducedMotion.matches;
          if (motion.az || motion.alt) stopTracking();
          if (!tracking) {
            const speed = motion.mode === 'fine' ? Math.max(0.006, fov * 0.35) : 12;
            const response = 1 - Math.exp(-dt / Math.max(0.08, reduced ? 0.08 : 0.24));
            const rate = (value: number) =>
              Math.sign(value) * Math.pow(Math.abs(value) / 100, 1.7) * speed;
            velocityAz = THREE.MathUtils.lerp(velocityAz, rate(motion.az), response);
            velocityAlt = THREE.MathUtils.lerp(velocityAlt, rate(motion.alt), response);
            targetAz = (targetAz + velocityAz * dt + 360) % 360;
            targetAlt = clampAltitude(targetAlt + velocityAlt * dt);
            az = targetAz;
            alt = targetAlt;
          }
          if (tracking) {
            const bodyIndex = planets.findIndex((item) => item.body === tracking),
              starIndex = catalog.findIndex((row) => 'HIP' + row[0] === tracking);
            const v = deepSky.some((item) => item.id === tracking)
              ? deepVector(tracking).applyMatrix4(stars!.matrix).normalize()
              : bodyIndex >= 0
                ? sprites[bodyIndex].position.clone().normalize()
                : starIndex >= 0
                  ? starPositions[starIndex].clone().applyMatrix4(stars!.matrix).normalize()
                  : null;
            if (v) {
              az = (Math.atan2(v.x, -v.z) / D + 360) % 360;
              alt = clampAltitude(Math.asin(v.y) / D);
            }
          }
          if (tracking) {
            targetAz = az;
            targetAlt = alt;
            velocityAz = velocityAlt = 0;
          }
          if (selected && time - lastInfo > 1000) {
            lastInfo = time;
            reportInfo(selected);
          }
          landscape.update(az, alt, dt, !!latest.current.optics.wide, reduced);
          // Reapply after zoom, azimuth and parallax changes so the bottom rim never
          // exposes the extended ground beyond the original foreground image.
          alt = clampAltitude(alt);
          targetAlt = clampAltitude(targetAlt);
          if (alt <= minimumAltitude() + 0.00001 && velocityAlt < 0) velocityAlt = 0;
          if (camera.fov !== fov) {
            camera.fov = fov;
            camera.updateProjectionMatrix();
          }
          camera.lookAt(direction(az, alt));
          material.uniforms.scale.value = renderer!.getPixelRatio() * 1.15;
          if (time - lastDetail > 400) {
            lastDetail = time;
            for (let i = 0; i < sprites.length; i++) {
              const projected = sprites[i].position.clone().project(camera),
                pixels =
                  (sprites[i].scale.x / 99 / (fov * D)) *
                  container!.clientHeight *
                  renderer!.getPixelRatio();
              if (
                projected.z > 0 &&
                projected.z < 1 &&
                Math.abs(projected.x) < 1 + pixels / container!.clientWidth &&
                Math.abs(projected.y) < 1 + pixels / container!.clientHeight
              ) {
                if (i === 1) {
                  if (pixels > 450) loadDetail(i, true);
                } else if (pixels > 2) loadDetail(i);
              }
            }
          }
          horizonMaterial.visible = !latest.current.optics.wide;
          const atmosphereBlend = latest.current.optics.wide ? 1 : 0;
          const sunDirection = sprites[0].position.clone().normalize(),
            sunAltitude = Math.asin(sunDirection.y) / D,
            daylight = THREE.MathUtils.smoothstep(sunAltitude, -6, 6),
            twilight =
              THREE.MathUtils.smoothstep(sunAltitude, -18, -3) *
              (1 - THREE.MathUtils.smoothstep(sunAltitude, 0, 8)),
            nightVisibility = 1 - THREE.MathUtils.smoothstep(sunAltitude, -14, -1),
            starVisibility = THREE.MathUtils.lerp(1, nightVisibility, atmosphereBlend);
          landscape.setLighting(sunDirection, time / 1000, reduced);
          landscape.mistMaterial.uniforms.strength.value = 1 - atmosphereBlend * daylight * 0.85;
          atmosphere.material.uniforms.cloudTime.value = reduced ? 0 : time / 1000;
          // Fade after the complete solar disc sets; fully clear the sky by early twilight.
          atmosphere.material.uniforms.cloudVisibility.value = THREE.MathUtils.smoothstep(
            sunAltitude,
            -6,
            -0.833,
          );
          atmosphere.material.uniforms.sunDirection.value.copy(sunDirection);
          atmosphere.material.uniforms.strength.value = atmosphereBlend;
          atmosphere.material.uniforms.daylight.value = daylight;
          atmosphere.material.uniforms.twilight.value = twilight;
          atmosphere.mesh.visible = atmosphereBlend > 0.001;
          material.uniforms.visibility.value = starVisibility;
          for (let i = 0; i < sprites.length; i++)
            (sprites[i].material as THREE.ShaderMaterial).uniforms.visibility.value =
              i === 0
                ? 1
                : i === 1
                  ? THREE.MathUtils.lerp(1, 0.55 + 0.45 * nightVisibility, atmosphereBlend)
                  : starVisibility;
          sprites[6].children.forEach((child) => {
            if (child instanceof THREE.Mesh)
              (child.material as THREE.MeshBasicMaterial).opacity = starVisibility;
          });
          if (latest.current.optics.wide) loadMilkyWay();
          if (milkyway) {
            (milkyway.material as THREE.ShaderMaterial).uniforms.visibility.value = starVisibility;
            milkyway.visible = !!latest.current.optics.wide;
          }
          if (selectionMarker.current) {
            let visible = false;
            if (selected && stars) {
              const bodyIndex = planets.findIndex((item) => item.body === selected),
                starIndex = catalog.findIndex((row) => 'HIP' + row[0] === selected);
              const deep = deepSky.some((item) => item.id === selected);
              if (deep)
                selectedPosition
                  .copy(deepVector(selected))
                  .applyMatrix4(stars.matrix)
                  .normalize()
                  .multiplyScalar(99);
              else if (bodyIndex >= 0) selectedPosition.copy(sprites[bodyIndex].position);
              else if (starIndex >= 0)
                selectedPosition.copy(starPositions[starIndex]).applyMatrix4(stars.matrix);
              camera.updateMatrixWorld();
              selectedProjection.copy(selectedPosition).project(camera);
              visible =
                (deep || bodyIndex >= 0 || starIndex >= 0) &&
                selectedProjection.z > 0 &&
                selectedProjection.z < 1 &&
                Math.hypot(selectedProjection.x, selectedProjection.y) < 0.94;
              if (visible && latest.current.optics.wide) {
                const v = selectedPosition.clone().normalize(),
                  a = (Math.atan2(v.x, -v.z) / D + 360) % 360;
                visible = !landscape.occludes(a, Math.asin(v.y) / D);
              }
              if (visible) {
                markerSprite.position.copy(selectedPosition);
                const pixelScale =
                  (2 * Math.tan((fov * D) / 2)) / Math.max(1, container!.clientHeight);
                markerSprite.scale.set(128 * pixelScale, 64 * pixelScale, 1);
              }
            }
            markerSprite.visible = visible && !photoPending;
            selectionMarker.current.hidden = !visible;
          }
          const sunAz = (Math.atan2(sunDirection.x, -sunDirection.z) / D + 360) % 360;
          solar.update(
            sprites[0].position,
            camera,
            time / 1000,
            reduced,
            !!latest.current.optics.wide && landscape.occludes(sunAz, sunAltitude),
            sprites[0].scale.x / 99,
          );
          renderer!.render(scene, camera);
          if (photoPending) {
            photoPending = false;
            photograph(now);
          }
          if (time - lastView > 250) {
            lastView = time;
            latest.current.onView({ az, alt, fov, minAltitude: minimumAltitude() });
          }
        };
        raf = requestAnimationFrame(render);
      } catch (error) {
        if (!disposed) {
          console.error('Sky viewer unavailable', error);
          latest.current.onError();
        }
      }
    }
    void start();
    return () => {
      disposed = true;
      landscape.dispose();
      abort.abort();
      cancelAnimationFrame(raf);
      resize?.disconnect();
      resources.forEach((resource) => resource.dispose());
      renderer?.dispose();
      renderer?.forceContextLoss();
      renderer?.domElement.remove();
    };
  }, []);
  return (
    <div
      className="sky-canvas"
      ref={host}
      style={{ '--sky-defocus': focusBlur(props.focus) + 'px' } as CSSProperties}
    >
      <div
        ref={selectionMarker}
        className="sky-selection-announcement sr-only"
        role="img"
        aria-label="Objek terpilih"
        hidden
      >
        <i />
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}
