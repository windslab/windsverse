// Windstopia bar station in 3D, on the café's real counter: an automatic espresso machine (it
// stands in for the café's own machine model, which is hidden while the game runs), three syrup
// pumps whose syrup can be swapped, chocolate and matcha jars, milk, a tea pot, plastic and paper
// cup stacks, and the café's own freezer for ice. Built from simple shapes in the café model's
// units (metres) and animated softly: cups slide, pumps press and spring back, spoons tip,
// the machine pours.
//
// The rig knows nothing about orders: it reports what went into the cup through callbacks and
// shows the drink it is given.
import * as THREE from 'three';

export type BarSound =
  | 'pump'
  | 'scoop'
  | 'ice'
  | 'cup'
  | 'pour'
  | 'brew-start'
  | 'brew-stop'
  | 'click';
export type BarCup = 'gelas-es' | 'cangkir';
export type ShotKind = 'ristretto' | 'espresso' | 'lungo';
export type BarHandlers = {
  sound: (name: BarSound) => void;
  /** An ingredient went into the cup (amount in its own unit). */
  add: (id: string, amount: number) => void;
  cup: (cup: BarCup) => void;
  ice: () => void;
  /** The machine was tapped: ask which shot to pull. */
  chooseShot: () => void;
  hint: (text: string) => void;
  /** Long press on a syrup bottle: choose what it holds. */
  swap: (slot: number) => void;
};
export type BarDrink = { cup: BarCup | 'cup-takeaway' | null; amounts: Record<string, number> };

const Y = 1.25; // counter top
const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const SPOT = {
  machine: P(-3.04, Y, 3.36),
  spout: P(-3.04, Y + 0.17, 3.47),
  tray: P(-3.04, Y + 0.012, 3.47),
  work: P(-3.3, Y, 3.5),
  bottle: (i: number) => P(-3.6 + i * 0.095, Y, 3.36),
  plastic: P(-3.6, Y, 3.55),
  paper: P(-3.48, Y, 3.55),
  cocoa: P(-2.76, Y, 3.33),
  matcha: P(-2.67, Y, 3.33),
  milk: P(-2.82, Y, 3.54),
  tea: P(-2.72, Y, 3.54),
  freezer: P(-2.65, 1.3, 4.6),
};
/** Fixed views for Luna's eyes (model units): the counter, and turned round to the freezer. */
export const BAR_VIEWS = {
  counter: { eye: P(-3.17, 2.18, 3.84), target: P(-3.17, 1.2, 3.32) },
  freezer: { eye: P(-2.66, 1.62, 3.95), target: P(-2.66, 1.12, 4.62) },
};
const COLORS: Record<string, number> = {
  espresso: 0x4a2a18,
  fullcream: 0xf6f1e7,
  gula: 0xf4e6b6,
  aren: 0x8b4a1c,
  lemon: 0xf3e06a,
  vanila: 0xf2dfb3,
  karamel: 0xc27a36,
  cokelat: 0x5b3221,
  matcha: 0x8fb65a,
  teh: 0xa8542a,
};
const TINT: Record<string, number> = { espresso: 3, cokelat: 5, matcha: 5, aren: 1.6, teh: 1.3 };
const STEP: Record<string, number> = {
  gula: 10,
  aren: 10,
  lemon: 10,
  vanila: 10,
  karamel: 10,
  cokelat: 5,
  matcha: 3,
  fullcream: 30,
  teh: 50,
};
/** Seconds each shot pours, and how much of a cup it fills (ml). */
const SHOTS: Record<ShotKind, { seconds: number; ml: number }> = {
  ristretto: { seconds: 2.2, ml: 20 },
  espresso: { seconds: 3, ml: 30 },
  lungo: { seconds: 4.4, ml: 60 },
};
const ease = {
  inOut: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  out: (t: number) => 1 - (1 - t) ** 3,
  back: (t: number) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2,
};

export function createBarRig(model: THREE.Object3D, on: BarHandlers) {
  const group = new THREE.Group();
  group.name = 'Bar_Rig';
  model.add(group);
  // The café's own machine makes way for the automatic one.
  const ownMachine = model.getObjectByName('mesin kopi') ?? model.getObjectByName('mesin_kopi');
  if (ownMachine) ownMachine.visible = false;
  const disposables: { dispose: () => void }[] = [];
  /** Materials the rig changes while playing: the scene keeps them as they are (no toon copy). */
  const live = <M extends THREE.Material>(m: M) => ((m.userData.live = true), m);
  const mat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra });
    disposables.push(m);
    return m;
  };
  const clear = (color: number, opacity: number) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity,
      roughness: 0.15,
      depthWrite: false,
    });
    disposables.push(m);
    return m;
  };
  const geo = <G extends THREE.BufferGeometry>(g: G) => (disposables.push(g), g);
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, at?: THREE.Vector3) => {
    const x = new THREE.Mesh(geo(g), m);
    if (at) x.position.copy(at);
    return x;
  };
  const cyl = (rt: number, rb: number, h: number, seg = 24) =>
    new THREE.CylinderGeometry(rt, rb, h, seg);
  const hits: THREE.Object3D[] = [];
  const hit = (o: THREE.Object3D, action: string) => {
    o.userData.bar = action;
    hits.push(o);
    return o;
  };
  const metal = mat(0xc4c1bb, { metalness: 0.5, roughness: 0.3 });
  const black = mat(0x262626);
  const white = mat(0xf7f5f0);

  // Automatic espresso machine: body, bean hopper, screen, spout and drip tray.
  const machine = new THREE.Group();
  machine.position.copy(SPOT.machine);
  machine.add(mesh(new THREE.BoxGeometry(0.22, 0.3, 0.26), mat(0xe9e4dc), P(0, 0.15, 0)));
  machine.add(mesh(new THREE.BoxGeometry(0.224, 0.04, 0.264), mat(0x8a7f72), P(0, 0.31, 0)));
  machine.add(mesh(cyl(0.05, 0.035, 0.06), clear(0x6b4a33, 0.6), P(0.05, 0.35, -0.05)));
  const screen = mesh(
    new THREE.BoxGeometry(0.12, 0.05, 0.004),
    mat(0x16201a, { emissive: 0x1f4a30, emissiveIntensity: 0.6 }),
    P(0, 0.235, 0.131),
  );
  machine.add(screen);
  for (const [i, color] of [0xe8c47c, 0xd9a066, 0x9c6b48].entries())
    machine.add(
      mesh(cyl(0.008, 0.008, 0.006, 16), mat(color), P(-0.03 + i * 0.03, 0.235, 0.135)).rotateX(
        Math.PI / 2,
      ),
    );
  machine.add(mesh(new THREE.BoxGeometry(0.07, 0.03, 0.07), black, P(0, 0.18, 0.14)));
  machine.add(mesh(cyl(0.005, 0.004, 0.02, 10), metal, P(-0.012, 0.155, 0.15)));
  machine.add(mesh(cyl(0.005, 0.004, 0.02, 10), metal, P(0.012, 0.155, 0.15)));
  machine.add(mesh(new THREE.BoxGeometry(0.16, 0.012, 0.09), metal, P(0, 0.006, 0.12)));
  hit(machine, 'machine');
  group.add(machine);

  // Syrup bottles with pumps
  let slots = ['gula', 'aren', 'lemon'];
  const bottles = [0, 1, 2].map((i) => {
    const g = new THREE.Group();
    g.position.copy(SPOT.bottle(i));
    const syrup = live(new THREE.MeshStandardMaterial({ color: COLORS[slots[i]], roughness: 0.3 }));
    disposables.push(syrup);
    const body = new THREE.Group();
    body.add(mesh(cyl(0.031, 0.031, 0.13), syrup, P(0, 0.07, 0)));
    body.add(mesh(cyl(0.035, 0.035, 0.18), clear(0xffffff, 0.3), P(0, 0.09, 0)));
    body.add(mesh(cyl(0.036, 0.036, 0.045), white, P(0, 0.1, 0)));
    g.add(body);
    g.add(mesh(cyl(0.008, 0.008, 0.06, 12), black, P(0, 0.2, 0)));
    const head = new THREE.Group();
    head.position.set(0, 0.24, 0);
    // Its own material so the head can light up while pressed (easy to see from above).
    const headMat = live(mat(0x262626, { emissive: 0xe3b66a, emissiveIntensity: 0 }));
    head.add(mesh(new THREE.BoxGeometry(0.055, 0.02, 0.035), headMat));
    head.add(mesh(cyl(0.006, 0.006, 0.06, 8), headMat, P(0, -0.004, 0.042)).rotateX(Math.PI / 2));
    g.add(head);
    const drip = mesh(cyl(0.003, 0.003, 1, 8), syrup, P(0, 0, 0.07));
    drip.visible = false;
    g.add(drip);
    hit(g, 'syrup:' + i);
    group.add(g);
    return { g, body, head, headMat, drip, syrup };
  });
  const setSlots = (next: string[]) => {
    slots = next;
    bottles.forEach((b, i) => b.syrup.color.setHex(COLORS[slots[i]] ?? 0xf0e0b0));
  };

  // Chocolate and matcha jars
  const jar = (id: string, at: THREE.Vector3) => {
    const g = new THREE.Group();
    g.position.copy(at);
    g.add(mesh(cyl(0.038, 0.038, 0.055), mat(COLORS[id]), P(0, 0.03, 0)));
    g.add(mesh(cyl(0.044, 0.044, 0.1), clear(0xffffff, 0.32), P(0, 0.05, 0)));
    const lid = new THREE.Group();
    lid.position.set(0, 0.105, 0);
    lid.add(mesh(cyl(0.047, 0.047, 0.014), mat(0xc9a273)));
    g.add(lid);
    hit(g, 'powder:' + id);
    group.add(g);
    return { g, lid };
  };
  const jars: Record<string, ReturnType<typeof jar>> = {
    cokelat: jar('cokelat', SPOT.cocoa),
    matcha: jar('matcha', SPOT.matcha),
  };

  // Milk carton and tea pot
  const milk = new THREE.Group();
  milk.position.copy(SPOT.milk);
  milk.add(mesh(new THREE.BoxGeometry(0.06, 0.12, 0.06), white, P(0, 0.06, 0)));
  milk.add(mesh(new THREE.BoxGeometry(0.061, 0.025, 0.061), mat(0x7fb7e6), P(0, 0.08, 0)));
  milk.add(
    mesh(new THREE.ConeGeometry(0.045, 0.03, 4), white, P(0, 0.135, 0)).rotateY(Math.PI / 4),
  );
  hit(milk, 'pour:fullcream');
  group.add(milk);
  const tea = new THREE.Group();
  tea.position.copy(SPOT.tea);
  tea.add(mesh(new THREE.SphereGeometry(0.05, 20, 14), mat(0xf1e6d6), P(0, 0.05, 0)));
  tea.add(mesh(cyl(0.004, 0.009, 0.06, 10), mat(0xf1e6d6), P(0.05, 0.06, 0)).rotateZ(-0.9));
  tea.add(
    mesh(
      new THREE.TorusGeometry(0.025, 0.006, 8, 16, Math.PI),
      mat(0xf1e6d6),
      P(-0.05, 0.06, 0),
    ).rotateZ(Math.PI / 2),
  );
  tea.add(mesh(cyl(0.02, 0.02, 0.012), mat(0xa8542a), P(0, 0.1, 0)));
  hit(tea, 'pour:teh');
  group.add(tea);

  // Cup stacks: clear plastic for cold drinks, paper for hot ones
  const plasticMat = clear(0xcfe6f2, 0.55),
    rimMat = white,
    paperMat = live(mat(0xe9d3b3, { side: THREE.DoubleSide })),
    sleeveMat = live(mat(0xb98a5c));
  const plasticGeo = geo(cyl(0.045, 0.032, 0.13, 28)),
    paperGeo = geo(cyl(0.04, 0.03, 0.11, 28)),
    // The cup in use is open at the top so the drink shows from Luna's eyes.
    openPlasticGeo = geo(new THREE.CylinderGeometry(0.045, 0.032, 0.13, 28, 1, true)),
    openPaperGeo = geo(new THREE.CylinderGeometry(0.04, 0.03, 0.11, 28, 1, true)),
    rimGeo = geo(new THREE.TorusGeometry(0.045, 0.003, 6, 28));
  const stack = (spot: THREE.Vector3, kind: BarCup) => {
    const g = new THREE.Group();
    g.position.copy(spot);
    const plastic = kind === 'gelas-es';
    for (let k = 0; k < 6; k++) {
      const c = new THREE.Mesh(plastic ? plasticGeo : paperGeo, plastic ? plasticMat : paperMat);
      c.position.y = (plastic ? 0.065 : 0.055) + k * 0.012;
      g.add(c);
    }
    const rim = new THREE.Mesh(rimGeo, plastic ? rimMat : sleeveMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = (plastic ? 0.13 : 0.11) + 5 * 0.012;
    if (!plastic) rim.scale.setScalar(0.9);
    g.add(rim);
    hit(g, 'cup:' + kind);
    group.add(g);
    return g;
  };
  const stacks = {
    'gelas-es': stack(SPOT.plastic, 'gelas-es'),
    cangkir: stack(SPOT.paper, 'cangkir'),
  };

  // The cup being made: shell, rim, liquid, crema, ice
  const cup = new THREE.Group();
  cup.visible = false;
  group.add(cup);
  const cupShell = new THREE.Mesh(openPlasticGeo, plasticMat);
  const cupRim = new THREE.Mesh(rimGeo, rimMat);
  cupRim.rotation.x = Math.PI / 2;
  const liquidMat = live(new THREE.MeshStandardMaterial({ color: 0x4a2a18, roughness: 0.35 }));
  disposables.push(liquidMat);
  const liquid = mesh(cyl(1, 0.72, 1, 28), liquidMat);
  const crema = mesh(cyl(1, 1, 0.004, 28), mat(0xd9a66c));
  const sleeve = mesh(cyl(0.0405, 0.035, 0.035, 28), sleeveMat);
  const ice = new THREE.Group();
  const iceMat = clear(0xffffff, 0.75);
  const iceGeo = geo(new THREE.BoxGeometry(0.018, 0.018, 0.018));
  for (let k = 0; k < 7; k++) {
    const c = new THREE.Mesh(iceGeo, iceMat);
    c.position.set(Math.cos(k * 2.1) * 0.017, 0.03 + (k % 3) * 0.022, Math.sin(k * 2.1) * 0.017);
    c.rotation.set(k, k * 0.7, k * 1.3);
    ice.add(c);
  }
  cup.add(liquid, crema, ice, sleeve, cupShell, cupRim);
  let cupKind: BarCup | null = null;

  // Streams (machine and syrup), the ice scoop and the powder spoon
  const stream = mesh(cyl(0.003, 0.002, 1, 8), mat(0x6b3a1c), P(0, 0, 0));
  stream.visible = false;
  group.add(stream);
  const freezerHit = mesh(
    new THREE.BoxGeometry(0.72, 0.74, 0.61),
    new THREE.MeshBasicMaterial({ visible: false }),
    P(-2.65, 0.94, 4.6),
  );
  hit(freezerHit, 'freezer');
  group.add(freezerHit);
  const scoop = new THREE.Group();
  scoop.add(
    mesh(new THREE.SphereGeometry(0.035, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), metal).rotateX(
      Math.PI,
    ),
  );
  scoop.add(mesh(cyl(0.006, 0.006, 0.1, 8), metal, P(0, 0, 0.06)).rotateX(Math.PI / 2));
  for (let k = 0; k < 5; k++) {
    const c = new THREE.Mesh(iceGeo, iceMat);
    c.position.set((k - 2) * 0.012, 0.008, (k % 2) * 0.01);
    scoop.add(c);
  }
  scoop.visible = false;
  group.add(scoop);
  const spoon = new THREE.Group();
  spoon.add(
    mesh(new THREE.SphereGeometry(0.013, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), metal).rotateX(
      Math.PI,
    ),
  );
  spoon.add(mesh(cyl(0.003, 0.003, 0.09, 6), metal, P(0, 0, 0.05)).rotateX(Math.PI / 2));
  const spoonLoad = mesh(new THREE.SphereGeometry(0.011, 10, 6), mat(0x5b3221), P(0, 0.002, 0));
  spoon.add(spoonLoad);
  spoon.visible = false;
  group.add(spoon);

  // Tweens: every move is eased; actions chain them with await.
  type Tween = {
    t: number;
    dur: number;
    step: (k: number) => void;
    ease: (t: number) => number;
    done: () => void;
  };
  const tweens: Tween[] = [];
  const play = (dur: number, step: (k: number) => void, e = ease.inOut) =>
    new Promise<void>((done) => tweens.push({ t: 0, dur, step, ease: e, done }));
  const moveTo = (o: THREE.Object3D, to: THREE.Vector3, dur: number, lift = 0) => {
    const from = o.position.clone();
    return play(dur, (k) => {
      o.position.lerpVectors(from, to, k);
      o.position.y += Math.sin(Math.PI * k) * lift;
    });
  };
  const wait = (s: number) => play(s, () => {});
  /** A little hop when something is tapped, so every touch feels answered. */
  const bounce = (o: THREE.Object3D) =>
    play(0.32, (k) => o.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.08), ease.out);
  const streamBetween = (top: THREE.Vector3, bottom: THREE.Vector3, color: number) => {
    (stream.material as THREE.MeshStandardMaterial).color.setHex(color);
    stream.position.lerpVectors(top, bottom, 0.5);
    stream.scale.set(1, Math.max(0.001, top.y - bottom.y), 1);
    stream.visible = true;
  };

  const state = {
    busy: false,
    view: 'counter' as 'counter' | 'freezer',
    cupAt: SPOT.work.clone(),
    pouring: 0,
  };
  const drink: BarDrink = { cup: null, amounts: {} };
  const needCup = () => {
    if (drink.cup) return false;
    on.hint('Ambil cup dulu di tumpukan cup, di depan kiri.');
    return true;
  };
  const cupTo = (to: THREE.Vector3, dur = 0.45) => {
    state.cupAt.copy(to);
    return moveTo(cup, to, dur, 0.03);
  };
  const run = async (task: () => Promise<void>) => {
    if (state.busy) return;
    state.busy = true;
    try {
      await task();
    } finally {
      state.busy = false;
    }
  };

  async function takeCup(kind: BarCup) {
    if (drink.cup) return on.hint('Cup sudah ada di tengah meja. Tekan "buang" kalau mau ganti.');
    void bounce(stacks[kind]);
    on.sound('cup');
    cupKind = kind;
    styleCup();
    cup.visible = true;
    cup.position.copy((kind === 'gelas-es' ? SPOT.plastic : SPOT.paper).clone().add(P(0, 0.12, 0)));
    on.cup(kind);
    await cupTo(SPOT.work, 0.55);
  }
  async function pump(i: number) {
    if (needCup()) return;
    const id = slots[i],
      b = bottles[i];
    await cupTo(
      SPOT.bottle(i)
        .clone()
        .add(P(0, 0, 0.075)),
      0.4,
    );
    on.sound('pump');
    // Press: the head sinks, the bottle squashes a touch, syrup runs into the cup.
    await play(0.2, (k) => {
      b.head.position.y = 0.24 - k * 0.05;
      b.head.scale.set(1 + k * 0.18, 1 - k * 0.3, 1 + k * 0.18);
      b.headMat.emissiveIntensity = k * 0.6;
      b.body.scale.set(1 + k * 0.04, 1 - k * 0.03, 1 + k * 0.04);
    });
    const nozzle = SPOT.bottle(i)
        .clone()
        .add(P(0, 0.185, 0.07)),
      mouth = state.cupAt.clone().add(P(0, 0.11, 0));
    streamBetween(nozzle, mouth, COLORS[id] ?? 0xf0e0b0);
    on.add(id, STEP[id]);
    await wait(0.28);
    stream.visible = false;
    await play(
      0.45,
      (k) => {
        b.head.position.y = 0.19 + k * 0.05;
        b.head.scale.set(1.18 - k * 0.18, 0.7 + k * 0.3, 1.18 - k * 0.18);
        b.headMat.emissiveIntensity = 0.6 * (1 - k);
        b.body.scale.set(1.04 - k * 0.04, 0.97 + k * 0.03, 1.04 - k * 0.04);
      },
      ease.back,
    );
    await cupTo(SPOT.work, 0.4);
  }
  async function spoonPowder(id: string) {
    if (needCup()) return;
    const j = jars[id];
    on.sound('scoop');
    await play(
      0.25,
      (k) => {
        j.lid.position.y = 0.105 + k * 0.06;
        j.lid.rotation.z = k * 0.6;
      },
      ease.out,
    );
    (spoonLoad.material as THREE.MeshStandardMaterial).color.setHex(COLORS[id]);
    spoon.visible = spoonLoad.visible = true;
    spoon.rotation.set(0, 0, 0);
    spoon.position.copy(j.g.position).add(P(0, 0.07, 0));
    await play(0.18, (k) => (spoon.position.y = j.g.position.y + 0.07 - k * 0.04));
    await moveTo(spoon, state.cupAt.clone().add(P(0, 0.17, 0)), 0.5, 0.06);
    await play(0.22, (k) => (spoon.rotation.z = k * 1.8));
    spoonLoad.visible = false;
    on.add(id, STEP[id]);
    await wait(0.12);
    spoon.visible = false;
    await play(
      0.3,
      (k) => {
        j.lid.position.y = 0.165 - k * 0.06;
        j.lid.rotation.z = 0.6 * (1 - k);
      },
      ease.back,
    );
  }
  async function pour(id: string) {
    if (needCup()) return;
    const box = id === 'teh' ? tea : milk,
      home = box.position.clone(),
      above = state.cupAt.clone().add(P(0.06, 0.13, 0));
    await moveTo(box, above, 0.45, 0.05);
    on.sound('pour');
    await play(0.3, (k) => (box.rotation.z = k * 1.1));
    streamBetween(
      above.clone().add(P(-0.04, -0.01, 0)),
      state.cupAt.clone().add(P(0, 0.1, 0)),
      COLORS[id],
    );
    on.add(id, STEP[id]);
    await wait(0.35);
    stream.visible = false;
    await play(0.25, (k) => (box.rotation.z = 1.1 * (1 - k)));
    await moveTo(box, home, 0.45, 0.05);
  }
  async function scoopIce() {
    if (needCup()) return;
    if (drink.amounts.es) return on.hint('Esnya sudah cukup untuk satu gelas.');
    state.view = 'freezer';
    await wait(0.6);
    scoop.visible = true;
    scoop.position.copy(SPOT.freezer).add(P(0, -0.12, 0));
    on.sound('ice');
    await moveTo(scoop, SPOT.freezer.clone().add(P(0, 0.12, -0.05)), 0.5);
    state.view = 'counter';
    scoop.visible = false;
    await wait(0.5);
    scoop.visible = true;
    scoop.position.copy(state.cupAt).add(P(0, 0.26, 0.04));
    await moveTo(scoop, state.cupAt.clone().add(P(0, 0.17, 0)), 0.3);
    await play(0.25, (k) => (scoop.rotation.x = -k * 1.4));
    on.sound('ice');
    on.ice();
    await wait(0.2);
    scoop.visible = false;
    scoop.rotation.x = 0;
  }
  async function brew(kind: ShotKind) {
    if (needCup()) return;
    const shot = SHOTS[kind];
    await cupTo(SPOT.tray, 0.5);
    on.sound('brew-start');
    (screen.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.4;
    state.pouring = 0;
    const start = drink.amounts.espresso ?? 0;
    await play(
      shot.seconds,
      (k) => {
        state.pouring = k * shot.ml;
        const flow = k < 0.12 ? 0 : 1;
        if (flow) streamBetween(SPOT.spout, state.cupAt.clone().add(P(0, 0.03, 0)), 0x6b3a1c);
        showDrink();
      },
      (t) => t,
    );
    stream.visible = false;
    state.pouring = 0;
    (screen.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6;
    on.sound('brew-stop');
    on.add('espresso', 1);
    on.hint(`${kind[0].toUpperCase() + kind.slice(1)} siap (${start + 1} shot di cup).`);
    await wait(0.3);
    await cupTo(SPOT.work, 0.5);
  }

  function styleCup() {
    const plastic = cupKind !== 'cangkir';
    cupShell.geometry = plastic ? openPlasticGeo : openPaperGeo;
    cupShell.material = plastic ? plasticMat : paperMat;
    cupShell.position.y = plastic ? 0.065 : 0.055;
    cupRim.position.y = plastic ? 0.13 : 0.11;
    cupRim.material = plastic ? rimMat : sleeveMat;
    cupRim.scale.setScalar(plastic ? 1 : 0.9);
    sleeve.visible = !plastic;
    sleeve.position.y = 0.06;
  }
  function showDrink() {
    const a = drink.amounts;
    let volume = 0,
      r = 0,
      g = 0,
      b = 0,
      total = 0;
    const take = (id: string, ml: number) => {
      const c = new THREE.Color(COLORS[id] ?? 0xdddddd),
        w = ml * (TINT[id] ?? 1);
      volume += ml;
      r += c.r * w;
      g += c.g * w;
      b += c.b * w;
      total += w;
    };
    for (const [id, amount] of Object.entries(a)) {
      if (!amount || id === 'es') continue;
      take(
        id,
        id === 'espresso' ? amount * 30 : id === 'cokelat' || id === 'matcha' ? amount * 2 : amount,
      );
    }
    if (state.pouring) take('espresso', state.pouring);
    const plastic = cupKind !== 'cangkir';
    const height = plastic ? 0.12 : 0.1,
      capacity = plastic ? 360 : 240,
      fill = Math.min(1, volume / capacity);
    liquid.visible = fill > 0.005;
    if (total) liquidMat.color.setRGB(r / total, g / total, b / total);
    const h = Math.max(0.001, fill * height),
      rBottom = plastic ? 0.03 : 0.028,
      rTop = rBottom + (plastic ? 0.012 : 0.01) * fill;
    liquid.scale.set(rTop, h, rTop);
    liquid.position.y = 0.004 + h / 2;
    crema.visible = !!a.espresso || !!state.pouring;
    crema.scale.set(rTop * 0.98, 1, rTop * 0.98);
    crema.position.y = 0.004 + h + 0.002;
    ice.visible = !!a.es;
  }

  const actions: Record<string, () => Promise<void> | void> = {
    'cup:gelas-es': () => run(() => takeCup('gelas-es')),
    'cup:cangkir': () => run(() => takeCup('cangkir')),
    'powder:cokelat': () => run(() => spoonPowder('cokelat')),
    'powder:matcha': () => run(() => spoonPowder('matcha')),
    'pour:fullcream': () => run(() => pour('fullcream')),
    'pour:teh': () => run(() => pour('teh')),
    freezer: () => run(scoopIce),
    machine: () => {
      if (state.busy) return;
      void bounce(machine);
      if (!needCup()) on.chooseShot();
    },
  };
  for (const i of [0, 1, 2]) actions['syrup:' + i] = () => run(() => pump(i));

  let press: { action: string; at: number } | null = null;
  return {
    group,
    hits,
    views: BAR_VIEWS,
    view: () => state.view,
    state,
    setSlots,
    /** The drink as the game sees it (cup kind and amounts), for the cup's look. */
    setDrink(d: BarDrink) {
      drink.cup = d.cup;
      drink.amounts = d.amounts;
      if (!d.cup) {
        cup.visible = false;
        cupKind = null;
      } else if ((d.cup === 'gelas-es' ? 'gelas-es' : 'cangkir') !== cupKind) {
        cupKind = d.cup === 'gelas-es' ? 'gelas-es' : 'cangkir';
        styleCup();
        cup.visible = true;
        cup.position.copy(state.cupAt);
      }
      showDrink();
    },
    /** Actions started from the screen: 'freezer', or a shot kind. */
    act(what: 'freezer' | ShotKind) {
      if (what === 'freezer') void actions.freezer();
      else void run(() => brew(what));
    },
    /** Where the finish button goes (world position above the cup). */
    cupAnchor: (out: THREE.Vector3) => cup.localToWorld(out.set(0, 0.17, 0)),
    machineAnchor: (out: THREE.Vector3) => machine.localToWorld(out.set(0, 0.4, 0.1)),
    pointerDown(action: string | null) {
      press = action ? { action, at: performance.now() } : null;
    },
    pointerUp() {
      const p = press;
      press = null;
      if (!p) return;
      if (p.action.startsWith('syrup:') && performance.now() - p.at > 450) {
        on.swap(Number(p.action.slice(6)));
        return;
      }
      void actions[p.action]?.();
    },
    update(dt: number) {
      for (let i = tweens.length - 1; i >= 0; i--) {
        const tw = tweens[i];
        tw.t = Math.min(1, tw.t + dt / tw.dur);
        tw.step(tw.ease(tw.t));
        if (tw.t >= 1) {
          tweens.splice(i, 1);
          tw.done();
        }
      }
    },
    dispose() {
      model.remove(group);
      if (ownMachine) ownMachine.visible = true;
      disposables.forEach((d) => d.dispose());
    },
  };
}
export type BarRig = ReturnType<typeof createBarRig>;
