// Toon look for the café world and Luna: two-tone cel shading plus thin dark-brown outlines.
//
// Shading: lit materials (MeshStandard/MeshPhysical) are swapped for MeshToonMaterial with a
// two-step gradient, keeping their colour, textures, vertex colours and emissive glow. Glass,
// water and other see-through materials keep their original material.
//
// Outlines: the scene is rendered once into a render target with a depth texture, then one
// full-screen pass darkens pixels where the depth has a step (silhouettes) or a fold (creases).
// The test uses the second difference of 1/depth, which is zero on any flat surface whatever
// its angle, so floors and walls seen at grazing angles stay clean. No second scene pass is
// needed, which keeps the cost close to a plain render on phones.
import * as THREE from 'three';

export const TOON_OUTLINE_COLOR = '#3b2a20';

let gradient: THREE.DataTexture | undefined;
/** Two-step light ramp: the side turned away from a light gets one flat darker tone. */
export function toonGradient() {
  if (gradient) return gradient;
  gradient = new THREE.DataTexture(new Uint8Array([92, 178]), 2, 1, THREE.RedFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

type Lit = THREE.MeshStandardMaterial & Partial<THREE.MeshPhysicalMaterial>;

/**
 * Swaps lit materials under `root` for toon materials (shared materials stay shared).
 * Returns the new materials so the caller can dispose of them; old materials are left alone
 * because callers may still hold and dispose them.
 */
export function toonify(
  root: THREE.Object3D,
  keep?: (mesh: THREE.Mesh, material: THREE.Material) => boolean,
): THREE.MeshToonMaterial[] {
  const swapped = new Map<THREE.Material, THREE.MeshToonMaterial>();
  const convert = (mesh: THREE.Mesh, material: THREE.Material) => {
    const lit = material as Lit;
    if (!lit.isMeshStandardMaterial) return material;
    if ((lit.transmission ?? 0) > 0 || (lit.transparent && lit.opacity < 1)) return material;
    if (keep?.(mesh, material)) return material;
    let toon = swapped.get(material);
    if (!toon) {
      toon = new THREE.MeshToonMaterial({
        name: lit.name,
        color: lit.color,
        map: lit.map,
        gradientMap: toonGradient(),
        emissive: lit.emissive,
        emissiveMap: lit.emissiveMap,
        emissiveIntensity: lit.emissiveIntensity,
        normalMap: lit.normalMap,
        normalScale: lit.normalScale,
        aoMap: lit.aoMap,
        aoMapIntensity: lit.aoMapIntensity,
        lightMap: lit.lightMap,
        lightMapIntensity: lit.lightMapIntensity,
        alphaMap: lit.alphaMap,
        alphaTest: lit.alphaTest,
        transparent: lit.transparent,
        opacity: lit.opacity,
        side: lit.side,
        vertexColors: lit.vertexColors,
        depthWrite: lit.depthWrite,
        depthTest: lit.depthTest,
        visible: lit.visible,
        fog: lit.fog,
      });
      toon.userData = { ...lit.userData };
      swapped.set(material, toon);
    }
    return toon;
  };
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((m) => convert(mesh, m))
      : convert(mesh, mesh.material);
  });
  return [...swapped.values()];
}

const outlineShader = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tColor;
    uniform sampler2D tDepth;
    uniform vec2 texel;
    uniform float cameraNear;
    uniform float cameraFar;
    uniform float thickness;
    uniform vec3 lineColor;
    uniform float strength;
    varying vec2 vUv;
    // 1 / view distance: linear in screen space on any plane.
    float inv(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      return 1.0 / max(-perspectiveDepthToViewZ(d, cameraNear, cameraFar), 1e-4);
    }
    void main() {
      vec4 base = texture2D(tColor, vUv);
      vec2 o = texel * thickness;
      float w = inv(vUv);
      float l = inv(vUv - vec2(o.x, 0.0)), r = inv(vUv + vec2(o.x, 0.0));
      float d = inv(vUv - vec2(0.0, o.y)), u = inv(vUv + vec2(0.0, o.y));
      // Negative where this pixel is the near side of a depth step (an object in front of
      // whatever is behind it), so the line sits on the object, never on the background.
      float lap = (l + r + d + u - 4.0 * w) / w;
      // Fade lines out toward the far plane so the ground's distant edge never draws a horizon line.
      float far = smoothstep(cameraFar * 0.3, cameraFar * 0.55, 1.0 / w);
      float edge = smoothstep(0.003, 0.009, -lap) * strength * (1.0 - far);
      gl_FragColor = vec4(base.rgb, 1.0);
      // The background is a flat clear colour that the normal renderer never tone-maps.
      if (texture2D(tDepth, vUv).x < 1.0) {
        #include <tonemapping_fragment>
      }
      gl_FragColor.rgb = mix(gl_FragColor.rgb, lineColor, edge);
      #include <colorspace_fragment>
    }`,
};

/** Renders `scene` with toon outlines. Call `render` instead of `renderer.render`. */
export function createToonOutline(
  renderer: THREE.WebGLRenderer,
  { color = TOON_OUTLINE_COLOR, strength = 1, samples = 4 } = {},
) {
  const size = new THREE.Vector2();
  const depthTexture = new THREE.DepthTexture(1, 1);
  depthTexture.type = THREE.UnsignedIntType;
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    depthTexture,
    samples,
  });
  const lineColor = new THREE.Color(color);
  const material = new THREE.ShaderMaterial({
    ...outlineShader,
    uniforms: {
      tColor: { value: target.texture },
      tDepth: { value: depthTexture },
      texel: { value: new THREE.Vector2() },
      cameraNear: { value: 0.1 },
      cameraFar: { value: 100 },
      thickness: { value: 1 },
      // The line is mixed in after tone mapping, so it is given in the output's linear space.
      lineColor: { value: new THREE.Vector3(lineColor.r, lineColor.g, lineColor.b) },
      strength: { value: strength },
    },
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene();
  quadScene.add(quad);
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  return {
    render(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
      renderer.getDrawingBufferSize(size);
      if (target.width !== size.x || target.height !== size.y) target.setSize(size.x, size.y);
      const u = material.uniforms;
      u.texel.value.set(1 / size.x, 1 / size.y);
      u.cameraNear.value = camera.near;
      u.cameraFar.value = camera.far;
      // About 1.5 CSS pixels wide: thin, but readable on every screen density.
      u.thickness.value = Math.max(2, Math.round(renderer.getPixelRatio() * 1.5));
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(previous);
      renderer.render(quadScene, quadCamera);
    },
    dispose() {
      target.dispose();
      depthTexture.dispose();
      material.dispose();
      quad.geometry.dispose();
    },
  };
}
