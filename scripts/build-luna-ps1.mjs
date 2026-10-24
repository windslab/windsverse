// Builds public/models/luna-ps1.glb and luna-ps1-preview.webp from scripts/luna-ps1/model.js.
// Development tool only (not used by the Sites build). Requires Playwright with Chromium:
//   npx -y playwright@1 install chromium   (once)
//   node scripts/build-luna-ps1.mjs
// The model is deterministic: rerunning without editing model.js produces the same geometry.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright not found. Run: npm i --no-save playwright && npx playwright install chromium');
  process.exit(1);
}

const page = `<!doctype html><meta charset="utf-8">
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildLuna } from '/luna/model.js';
try {
  const glb = await new GLTFExporter().parseAsync(buildLuna(), { binary: true });
  // Preview: three-quarter view on the studio's warm background.
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  r.setSize(1000, 1120);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e9e1d6');
  scene.add(new THREE.HemisphereLight('#fff6ea', '#b9a58f', 1.6));
  const key = new THREE.DirectionalLight('#fff1dd', 2.2);
  key.position.set(1.5, 3, 2.5);
  key.castShadow = true;
  scene.add(key);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.18 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const luna = buildLuna();
  luna.rotation.y = 0.55;
  scene.add(luna);
  const cam = new THREE.PerspectiveCamera(22, 1000 / 1120, 0.01, 50);
  cam.position.set(0, 0.56, 2.75);
  cam.lookAt(0, 0.45, 0);
  r.render(scene, cam);
  const webp = r.domElement.toDataURL('image/webp', 0.9);
  const bytes = new Uint8Array(glb);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  window.__result = { glb: btoa(binary), webp };
} catch (e) {
  window.__result = { error: String(e.stack || e) };
}
</script>`;

const server = http
  .createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = url.startsWith('/three/')
      ? path.join(root, 'node_modules', url)
      : url === '/luna/model.js'
        ? path.join(root, 'scripts/luna-ps1/model.js')
        : null;
    if (url === '/') return res.end(page);
    if (!file || !fs.existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': 'text/javascript' }).end(fs.readFileSync(file));
  })
  .listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const tab = await browser.newPage();
  await tab.goto(`http://127.0.0.1:${server.address().port}/`);
  await tab.waitForFunction(() => window.__result, null, { timeout: 120000 });
  const result = await tab.evaluate(() => window.__result);
  if (result.error) throw new Error(result.error);
  const glbPath = path.join(root, 'public/models/luna-ps1.glb');
  const webpPath = path.join(root, 'public/models/luna-ps1-preview.webp');
  fs.writeFileSync(glbPath, Buffer.from(result.glb, 'base64'));
  fs.writeFileSync(webpPath, Buffer.from(result.webp.split(',')[1], 'base64'));
  console.log('Wrote', path.relative(root, glbPath), fs.statSync(glbPath).size, 'bytes');
  console.log('Wrote', path.relative(root, webpPath), fs.statSync(webpPath).size, 'bytes');
} finally {
  await browser.close();
  server.close();
}
