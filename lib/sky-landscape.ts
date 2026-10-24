import * as THREE from 'three';
import {
  PANORAMA_WIDTH,
  PANORAMA_HEIGHT,
  FOREGROUND_BASELINE,
  FOREGROUND_DISTANCE,
  minimumWideAltitude,
} from './sky-panorama';

// Illustrated 360° horizontal layers. Their virtual distances create a gentle
// perspective shift as the viewer moves around the telescope's mounting point.
export function createSkyLandscape() {
  const sourceWidth = PANORAMA_WIDTH,
    sourceHeight = PANORAMA_HEIGHT,
    center = 0.29,
    verticalSpan = (sourceHeight / sourceWidth) * 360;
  const observer = new THREE.Vector3(),
    targetObserver = new THREE.Vector3();
  let disposed = false;
  const geometry = new THREE.SphereGeometry(89, 64, 32);
  const lighting = {
    daylight: { value: 1 },
    warmth: { value: 0 },
    sunDirection: { value: new THREE.Vector3(0, 1, 0) },
    heatTime: { value: 0 },
    heatMotion: { value: 0 },
  };
  const lightingShader = `uniform float daylight;uniform float warmth;uniform vec3 sunDirection;uniform float heatTime;uniform float heatMotion;
 float sunFacing(vec3 d){vec2 sunXZ=normalize(sunDirection.xz+vec2(.0001));return .5+.5*dot(normalize(d.xz+vec2(.0001)),sunXZ);}
 vec3 lightPanorama(vec3 source,vec3 d,float farLayer){
  float facing=sunFacing(d),warm=warmth*(.35+.65*facing);
  vec3 tint=mix(vec3(1.02,1.02,.94),vec3(1.25,.82,.61),warm);
  vec3 day=clamp(pow(max(source,vec3(0.)),vec3(.85))*1.12*tint,0.,1.);
  float detail=dot(source,vec3(.2126,.7152,.0722));
  vec3 night=mix(vec3(.004,.006,.009),vec3(.009,.013,.019),detail)+source*.012;
  night=mix(night,vec3(.014,.019,.027)+source*.009,farLayer);
  day*=mix(1.,.65,farLayer);
  vec3 color=mix(night,day,daylight);
  vec3 haze=mix(vec3(.026,.034,.048),vec3(.62,.67,.59),daylight);
  haze=mix(haze,haze*vec3(1.22,.87,.72),warm);
  return mix(color,haze,farLayer*.035);
 }`;
  const setLighting = (sunDirection: THREE.Vector3, time = 0, reduced = false) => {
    const altitude = THREE.MathUtils.radToDeg(
      Math.asin(THREE.MathUtils.clamp(sunDirection.y, -1, 1)),
    );
    lighting.daylight.value = THREE.MathUtils.smoothstep(altitude, -12, 16);
    lighting.warmth.value =
      (1 - THREE.MathUtils.smoothstep(altitude, 4, 24)) *
      THREE.MathUtils.smoothstep(altitude, -14, -2);
    lighting.sunDirection.value.copy(sunDirection);
    lighting.heatTime.value = reduced ? 0 : time;
    lighting.heatMotion.value = reduced ? 0 : 1;
  };
  function layer(
    path: string,
    baseline: number,
    distance: number,
    ground: number[],
    order: number,
  ) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const c = canvas.getContext('2d')!;
    const groundColor = new THREE.Vector3(...(ground as [number, number, number]));
    let width = 1,
      height = 1,
      pixels = new Uint8ClampedArray(4);
    const heights = new Float32Array(4096);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.NoColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    const ready = new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        try {
          if (disposed) {
            resolve();
            return;
          }
          width = 4096;
          height = Math.round((width * sourceHeight) / sourceWidth);
          canvas.width = width;
          canvas.height = height;
          c.drawImage(image, 0, 0, width, height);
          pixels = c.getImageData(0, 0, width, height).data;
          for (let col = 0; col < width; col++)
            for (let row = 0; row < height; row++)
              if (pixels[(row * width + col) * 4 + 3] > 127) {
                heights[col] = (baseline / sourceHeight - row / height) * verticalSpan;
                break;
              }
          // Extend the lower edge into the ground without a hard change in color.
          let red = 0,
            green = 0,
            blue = 0,
            total = 0;
          for (let col = 0; col < width; col++) {
            const index = ((height - 1) * width + col) * 4,
              alpha = pixels[index + 3] / 255;
            red += pixels[index] * alpha;
            green += pixels[index + 1] * alpha;
            blue += pixels[index + 2] * alpha;
            total += alpha;
          }
          if (total) groundColor.set(red / total / 255, green / total / 255, blue / total / 255);
          texture.needsUpdate = true;
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      image.onerror = () => reject(Error('Panorama horizon belum dapat dimuat'));
      image.src = path;
    });
    void ready.catch(() => {});
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        map: { value: texture },
        observer: { value: observer },
        distance: { value: distance },
        baseline: { value: baseline / sourceHeight },
        ground: { value: groundColor },
        farLayer: { value: distance > 100 ? 1 : 0 },
        ...lighting,
      },
      vertexShader:
        'varying vec3 horizontal;void main(){horizontal=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `uniform sampler2D map;uniform vec3 observer;uniform float distance;uniform float baseline;uniform vec3 ground;uniform float farLayer;varying vec3 horizontal;
  ${lightingShader}
  void main(){vec3 d=normalize(horizontal);float b=dot(observer,d);float t=-b+sqrt(max(0.,b*b+distance*distance-dot(observer,observer)));vec3 p=normalize(observer+t*d);float altitude=degrees(asin(clamp(p.y,-1.,1.)));float v=1.-baseline+altitude/(${sourceHeight.toFixed(1)}/${sourceWidth.toFixed(1)}*360.);if(v>1.)discard;float u=fract(atan(p.x,-p.z)/6.28318530718+.29);
   float heat=daylight*heatMotion*pow(sunFacing(d),4.)*exp(-pow(altitude/24.,2.));
   vec2 shimmer=vec2(sin(u*180.+heatTime*.75)*sin(v*100.-heatTime*.65),cos(u*145.-heatTime*.6))*.00055*heat;
   vec4 color=texture2D(map,vec2(u,max(v,.002))+shimmer);
   float seam=1.-smoothstep(0.,.012,min(u,1.-u));vec4 edge=.5*(texture2D(map,vec2(.001,max(v,.002)))+texture2D(map,vec2(.999,max(v,.002))));color=mix(color,edge,seam);
   if(v<0.){color.rgb=mix(color.rgb,ground,smoothstep(0.,.12,-v));color.a=1.;}
   if(color.a<.01)discard;gl_FragColor=vec4(lightPanorama(color.rgb,d,farLayer),color.a);
  }`,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    mesh.visible = false;
    const samplePoint = new THREE.Vector3(),
      ray = new THREE.Vector3();
    const coordinates = (az: number, alt: number) => {
      const a = (az * Math.PI) / 180,
        h = (alt * Math.PI) / 180;
      ray.set(Math.sin(a) * Math.cos(h), Math.sin(h), -Math.cos(a) * Math.cos(h));
      const b = observer.dot(ray),
        t = -b + Math.sqrt(Math.max(0, b * b + distance * distance - observer.lengthSq()));
      samplePoint.copy(ray).multiplyScalar(t).add(observer).normalize();
      return {
        u: (((Math.atan2(samplePoint.x, -samplePoint.z) / Math.PI / 2 + center) % 1) + 1) % 1,
        alt: (Math.asin(samplePoint.y) * 180) / Math.PI,
      };
    };
    const occludes = (az: number, alt: number) => {
      const point = coordinates(az, alt),
        row = Math.floor((baseline / sourceHeight - point.alt / verticalSpan) * height);
      if (row >= height) return true;
      if (row < 0) return false;
      return pixels[(row * width + Math.min(width - 1, Math.floor(point.u * width))) * 4 + 3] > 127;
    };
    const elevationAt = (az: number) => {
      const u = coordinates(az, 0).u;
      return heights[Math.floor(u * 4096) % 4096];
    };
    return { mesh, texture, material, ready, occludes, elevationAt };
  }
  const foreground = layer(
    '/sky/winds-panorama-foreground-v2.png',
    FOREGROUND_BASELINE,
    FOREGROUND_DISTANCE,
    [10 / 255, 10 / 255, 10 / 255],
    11,
  );
  const background = layer(
    '/sky/winds-panorama-karst-v2.png',
    1120,
    140,
    [23 / 255, 27 / 255, 37 / 255],
    10,
  );
  // Uniform altitude-only mist: no height-dependent rectangles around towers.
  const mistMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: { strength: { value: 1 }, ...lighting },
    vertexShader:
      'varying vec3 horizontal;void main(){horizontal=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `uniform float strength;varying vec3 horizontal;
 ${lightingShader}
 void main(){vec3 d=normalize(horizontal);float altitude=degrees(asin(clamp(d.y,-1.,1.)));if(altitude<0.||altitude>56.)discard;float glow=exp(-pow(altitude/40.,2.))*(1.-smoothstep(34.,56.,altitude));vec3 color=mix(vec3(.16,.21,.29),vec3(.66,.70,.62),daylight);
 color=mix(color,color*vec3(1.30,.86,.65),warmth*sunFacing(d));gl_FragColor=vec4(color,.45*glow*strength);}`,
  });
  const mist = new THREE.Mesh(geometry, mistMaterial);
  mist.renderOrder = 9;
  mist.frustumCulled = false;
  mist.visible = false;
  const ready = Promise.all([foreground.ready, background.ready]).then(() => {});
  void ready.catch(() => {});
  const update = (az: number, alt: number, dt: number, visible: boolean, reduced: boolean) => {
    foreground.mesh.visible = background.mesh.visible = mist.visible = visible;
    if (!visible || reduced) {
      observer.set(0, 0, 0);
      return;
    }
    const a = (az * Math.PI) / 180,
      h = (alt * Math.PI) / 180;
    // A bounded, periodic observer orbit prevents drift or jumps after a full turn.
    targetObserver.set(0.55 * Math.sin(a), 0.1 * Math.sin(h), 0.55 * (1 - Math.cos(a)));
    observer.lerp(targetObserver, 1 - Math.exp(-dt * 5));
  };
  return {
    mesh: foreground.mesh,
    backgroundMesh: background.mesh,
    mist,
    mistMaterial,
    texture: foreground.texture,
    backgroundTexture: background.texture,
    geometry,
    material: foreground.material,
    backgroundMaterial: background.material,
    ready,
    update,
    setLighting,
    minimumAltitude: (az: number, fov: number) => minimumWideAltitude(fov, az, observer),
    elevationAt: (az: number) => Math.max(foreground.elevationAt(az), background.elevationAt(az)),
    occludes: (az: number, alt: number) =>
      foreground.occludes(az, alt) || background.occludes(az, alt),
    dispose: () => {
      disposed = true;
    },
  };
}

export function createSkyAtmosphere() {
  // Clouds share the atmosphere's single draw call: no textures, particles or extra render passes.
  const geometry = new THREE.SphereGeometry(126, 48, 24),
    material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      uniforms: {
        sunDirection: { value: new THREE.Vector3(0, -1, 0) },
        strength: { value: 0 },
        daylight: { value: 0 },
        twilight: { value: 0 },
        cloudTime: { value: 0 },
        cloudVisibility: { value: 0 },
      },
      vertexShader:
        'varying vec3 horizontal;void main(){horizontal=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `uniform vec3 sunDirection;uniform float strength;uniform float daylight;uniform float twilight;uniform float cloudTime;uniform float cloudVisibility;varying vec3 horizontal;
 float hashCloud(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noiseCloud(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hashCloud(i),hashCloud(i+vec2(1.,0.)),f.x),mix(hashCloud(i+vec2(0.,1.)),hashCloud(i+vec2(1.)),f.x),f.y);}
 float cloudField(vec2 p){float n=0.,a=.55;for(int i=0;i<4;i++){n+=noiseCloud(p)*a;p=mat2(1.6,1.2,-1.2,1.6)*p+vec2(9.2,3.7);a*=.5;}return n;}
 void main(){vec3 d=normalize(horizontal);float h=clamp(d.y,0.,1.);float haze=pow(1.-h,4.);float sun=pow(max(0.,dot(d,sunDirection)),12.);vec3 day=mix(vec3(.30,.40,.43),vec3(.68,.70,.59),haze);day+=vec3(.22,.19,.12)*sun;vec3 night=mix(vec3(.004,.009,.022),vec3(.025,.035,.055),haze);vec3 dusk=mix(vec3(.12,.14,.19),vec3(.47,.30,.19),haze)*(.6+.4*sun);vec3 color=mix(night,dusk,twilight);color=mix(color,day,daylight);
  if(cloudVisibility>.001&&d.y>.025){
   // Project onto a high cloud deck; one continuous field remains stable across a full azimuth turn.
   vec2 p=d.xz/(d.y+.18)*1.7+vec2(cloudTime*.005,cloudTime*.002);
   float density=cloudField(p),coverage=smoothstep(.47,.76,density)*smoothstep(.025,.18,d.y);
   float warm=(1.-smoothstep(.05,.42,sunDirection.y))*(.55+.45*sun);
   vec3 cloudColor=mix(vec3(.77,.79,.73),vec3(.86,.59,.38),warm);
   cloudColor*=mix(.71,1.08,smoothstep(.48,.80,density));
   color=mix(color,cloudColor,coverage*.82*cloudVisibility);
  }
  float opacity=mix(.16,.9,twilight);opacity=mix(opacity,1.,daylight);gl_FragColor=vec4(color,opacity*strength);}`,
    });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return { mesh, geometry, material };
}
