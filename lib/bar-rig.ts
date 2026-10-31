// Windstopia bar station in 3D: the props on the café's real counter (syrup pumps, powder jars,
// a bean jar, plastic and paper cup stacks, milk, a grinder, a portafilter, a tamper and a knock
// box), placed beside the café's own espresso machine, freezer and fridge. Everything is built
// from simple shapes in the café model's own units (metres) and animated like the real thing:
// the portafilter goes into the grinder fork, gets tamped, rises under the group head turned to
// the left and twists right until it locks, and the shot runs until the player stops it.
//
// The rig knows nothing about orders: it reports what went into the cup through callbacks and
// shows the drink it is given.
import * as THREE from 'three';

export type BarSound =
  | 'pump'
  | 'scoop'
  | 'ice'
  | 'lock'
  | 'knock'
  | 'cup'
  | 'pour'
  | 'tamp'
  | 'grind-start'
  | 'grind-stop'
  | 'brew-start'
  | 'brew-stop'
  | 'click';
export type BarCup = 'gelas-es' | 'cangkir';
export type BarReadout = { dose: number; doseTarget: number; time: number; yield: number };
export type BarHandlers = {
  sound: (name: BarSound) => void;
  /** An ingredient went into the cup (amount in its own unit). */
  add: (id: string, amount: number) => void;
  cup: (cup: BarCup) => void;
  /** A shot is done: quality 0–1. */
  shot: (quality: number, seconds: number, ml: number) => void;
  ice: () => void;
  hint: (text: string) => void;
  readout: (r: BarReadout | null) => void;
  /** Long press on a syrup bottle: choose what it holds. */
  swap: (slot: number) => void;
};
export type BarDrink = { cup: BarCup | 'cup-takeaway' | null; amounts: Record<string, number> };

const Y = 1.25; // counter top
const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const SPOT = {
  work: P(-3.62, Y, 3.5),
  machineTray: P(-3.0, Y + 0.02, 3.43),
  bottle: (i: number) => P(-3.46 + i * 0.1, Y, 3.4),
  jar: (i: number) => P(-4.3 + i * 0.11, Y, 3.45),
  milk: P(-3.96, Y, 3.52),
  skm: P(-3.85, Y, 3.52),
  plastic: P(-4.36, Y, 3.56),
  paper: P(-4.24, Y, 3.56),
  grinder: P(-2.62, Y, 3.36),
  beans: P(-2.43, Y, 3.5),
  rest: P(-2.8, Y + 0.012, 3.56),
  fork: P(-2.62, Y + 0.105, 3.47),
  mat: P(-2.6, Y + 0.03, 3.56),
  groupLow: P(-3.0, Y + 0.13, 3.5),
  group: P(-3.0, Y + 0.165, 3.5),
  knock: P(-2.38, Y + 0.09, 3.56),
  freezer: P(-2.65, 1.3, 4.6),
};
/** Fixed views for Luna's eyes (model units): the counter, and turned round to the freezer. */
export const BAR_VIEWS = {
  counter: { eye: P(-3.3, 1.66, 4.08), target: P(-3.3, 1.22, 3.42) },
  freezer: { eye: P(-2.66, 1.62, 3.95), target: P(-2.66, 1.12, 4.62) },
};
const COLORS: Record<string, number> = {
  espresso: 0x4a2a18,
  fullcream: 0xf6f1e7,
  skm: 0xf0e0bd,
  gula: 0xf4e6b6,
  aren: 0x8b4a1c,
  vanila: 0xf2dfb3,
  karamel: 0xc27a36,
  cokelat: 0x5b3221,
  matcha: 0x8fb65a,
  taro: 0xab8ccb,
  teh: 0xa8542a,
  air: 0xdce8ee,
};
const TINT: Record<string, number> = {
  espresso: 3,
  cokelat: 5,
  matcha: 5,
  taro: 5,
  aren: 1.6,
  karamel: 1.4,
};
const STEP: Record<string, number> = {
  gula: 10,
  aren: 10,
  vanila: 10,
  karamel: 10,
  cokelat: 5,
  matcha: 3,
  taro: 5,
  fullcream: 30,
  skm: 10,
};
const ease = {
  inOut: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  out: (t: number) => 1 - (1 - t) ** 3,
  back: (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2,
  linear: (t: number) => t,
};

export function createBarRig(model: THREE.Object3D, on: BarHandlers) {
  const group = new THREE.Group();
  group.name = 'Bar_Rig';
  model.add(group);
  const disposables: { dispose: () => void }[] = [];
  const mat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra });
    disposables.push(m);
    return m;
  };
  const clear = (color = 0xdff0f8, opacity = 0.35) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity,
      roughness: 0.1,
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
  const metal = mat(0xb9b6b0, { metalness: 0.6, roughness: 0.3 });
  const black = mat(0x232323);
  const wood = mat(0x6b4a2f);

  // Syrup bottles with pumps
  let slots = ['gula', 'aren', 'vanila'];
  const bottles = [0, 1, 2].map((i) => {
    const g = new THREE.Group();
    g.position.copy(SPOT.bottle(i));
    const syrup = new THREE.MeshStandardMaterial({ color: COLORS[slots[i]], roughness: 0.3 });
    disposables.push(syrup);
    const fill = mesh(cyl(0.031, 0.031, 0.13), syrup, P(0, 0.07, 0));
    const glass = mesh(cyl(0.035, 0.035, 0.18), clear(0xffffff, 0.28), P(0, 0.09, 0));
    const neck = mesh(cyl(0.008, 0.008, 0.06, 12), black, P(0, 0.2, 0));
    const head = new THREE.Group();
    head.position.set(0, 0.235, 0);
    head.add(mesh(new THREE.BoxGeometry(0.05, 0.016, 0.03), black));
    head.add(mesh(cyl(0.005, 0.005, 0.05, 8), black, P(0, -0.004, 0.035)).rotateX(Math.PI / 2));
    g.add(fill, glass, neck, head);
    hit(g, 'syrup:' + i);
    group.add(g);
    return { g, head, syrup };
  });
  const setSlots = (next: string[]) => {
    slots = next;
    bottles.forEach((b, i) => b.syrup.color.setHex(COLORS[slots[i]] ?? 0xf0e0b0));
  };

  // Powder jars and the bean jar
  const powders = ['cokelat', 'matcha', 'taro'];
  const jars = powders.map((id, i) => {
    const g = new THREE.Group();
    g.position.copy(SPOT.jar(i));
    g.add(mesh(cyl(0.038, 0.038, 0.055), mat(COLORS[id]), P(0, 0.03, 0)));
    g.add(mesh(cyl(0.044, 0.044, 0.1), clear(0xffffff, 0.3), P(0, 0.05, 0)));
    const lid = new THREE.Group();
    lid.position.set(0, 0.105, 0);
    lid.add(mesh(cyl(0.047, 0.047, 0.014), mat(0xc9a273)));
    g.add(lid);
    hit(g, 'powder:' + id);
    group.add(g);
    return { g, lid };
  });
  const beanJar = new THREE.Group();
  beanJar.position.copy(SPOT.beans);
  beanJar.add(mesh(cyl(0.04, 0.04, 0.085), mat(0x3a2214), P(0, 0.045, 0)));
  beanJar.add(mesh(cyl(0.046, 0.046, 0.12), clear(0xffffff, 0.3), P(0, 0.06, 0)));
  const beanLid = mesh(cyl(0.049, 0.049, 0.014), mat(0xc9a273), P(0, 0.126, 0));
  beanJar.add(beanLid);
  hit(beanJar, 'beans');
  group.add(beanJar);

  // Milk carton and condensed milk can
  const milk = new THREE.Group();
  milk.position.copy(SPOT.milk);
  milk.add(mesh(new THREE.BoxGeometry(0.06, 0.12, 0.06), mat(0xfafafa), P(0, 0.06, 0)));
  milk.add(mesh(new THREE.BoxGeometry(0.061, 0.025, 0.061), mat(0x7fb7e6), P(0, 0.08, 0)));
  milk.add(
    mesh(new THREE.ConeGeometry(0.045, 0.03, 4), mat(0xfafafa), P(0, 0.135, 0)).rotateY(
      Math.PI / 4,
    ),
  );
  hit(milk, 'pour:fullcream');
  group.add(milk);
  const skm = mesh(cyl(0.034, 0.034, 0.08), mat(0xe7b04a, { metalness: 0.3 }), SPOT.skm.clone());
  skm.position.y += 0.04;
  hit(skm, 'pour:skm');
  group.add(skm);

  // Cup stacks: clear plastic for cold drinks, paper for hot ones
  const plasticMat = clear(0xe6f4fb, 0.42),
    paperMat = mat(0xe9d3b3),
    sleeveMat = mat(0xb98a5c);
  const plasticGeo = geo(cyl(0.045, 0.032, 0.13, 28)),
    paperGeo = geo(cyl(0.04, 0.03, 0.11, 28));
  const stack = (spot: THREE.Vector3, cup: BarCup) => {
    const g = new THREE.Group();
    g.position.copy(spot);
    for (let k = 0; k < 5; k++) {
      const c = new THREE.Mesh(
        cup === 'gelas-es' ? plasticGeo : paperGeo,
        cup === 'gelas-es' ? plasticMat : paperMat,
      );
      c.position.y = (cup === 'gelas-es' ? 0.065 : 0.055) + k * 0.014;
      g.add(c);
    }
    hit(g, 'cup:' + cup);
    group.add(g);
    return g;
  };
  stack(SPOT.plastic, 'gelas-es');
  stack(SPOT.paper, 'cangkir');

  // The cup being made: shell, liquid, crema, ice
  const cup = new THREE.Group();
  cup.visible = false;
  group.add(cup);
  const cupShell = new THREE.Mesh(plasticGeo, plasticMat);
  const liquidMat = new THREE.MeshStandardMaterial({ color: 0x4a2a18, roughness: 0.35 });
  disposables.push(liquidMat);
  const liquid = mesh(cyl(1, 0.72, 1, 28), liquidMat);
  const crema = mesh(cyl(1, 1, 0.004, 28), mat(0xd9a66c));
  const sleeve = mesh(cyl(0.0405, 0.035, 0.035, 28), sleeveMat);
  const ice = new THREE.Group();
  const iceMat = clear(0xffffff, 0.7);
  const iceGeo = geo(new THREE.BoxGeometry(0.018, 0.018, 0.018));
  for (let k = 0; k < 7; k++) {
    const c = new THREE.Mesh(iceGeo, iceMat);
    c.position.set(Math.cos(k * 2.1) * 0.017, 0.03 + (k % 3) * 0.02, Math.sin(k * 2.1) * 0.017);
    c.rotation.set(k, k * 0.7, k * 1.3);
    ice.add(c);
  }
  cup.add(liquid, crema, ice, sleeve, cupShell);
  let cupKind: BarDrink['cup'] = null;

  // Grinder: base, body, hopper with beans, spout and the portafilter fork
  const grinder = new THREE.Group();
  grinder.position.copy(SPOT.grinder);
  grinder.add(mesh(new THREE.BoxGeometry(0.12, 0.02, 0.16), black, P(0, 0.01, 0.01)));
  const grinderBody = mesh(new THREE.BoxGeometry(0.1, 0.2, 0.12), mat(0x2e2e2e), P(0, 0.2, -0.02));
  grinder.add(grinderBody);
  grinder.add(mesh(cyl(0.045, 0.02, 0.1), clear(0xf2f8fb, 0.35), P(0, 0.35, -0.02)));
  const beansInHopper = mesh(cyl(0.038, 0.02, 0.07), mat(0x3a2214), P(0, 0.335, -0.02));
  grinder.add(beansInHopper);
  grinder.add(mesh(new THREE.BoxGeometry(0.03, 0.03, 0.03), black, P(0, 0.135, 0.06)));
  grinder.add(mesh(new THREE.BoxGeometry(0.07, 0.008, 0.03), metal, P(0, 0.095, 0.1)));
  const grindButton = mesh(cyl(0.012, 0.012, 0.01, 16), mat(0xe8c47c), P(0.035, 0.24, 0.041));
  grindButton.rotation.x = Math.PI / 2;
  grinder.add(grindButton);
  const groundsStream = mesh(cyl(0.004, 0.004, 1, 8), mat(0x4b2c18), P(0, 0.11, 0.075));
  groundsStream.visible = false;
  grinder.add(groundsStream);
  hit(grinder, 'grinder');
  group.add(grinder);

  // Tamping mat and tamper
  group.add(
    mesh(new THREE.BoxGeometry(0.11, 0.012, 0.09), black, SPOT.mat.clone().setY(Y + 0.006)),
  );
  const tamper = new THREE.Group();
  const tamperHome = P(-2.5, Y + 0.012, 3.58);
  tamper.position.copy(tamperHome);
  tamper.add(mesh(cyl(0.029, 0.029, 0.012), metal, P(0, 0.006, 0)));
  tamper.add(mesh(cyl(0.013, 0.02, 0.06), wood, P(0, 0.045, 0)));
  tamper.add(mesh(new THREE.SphereGeometry(0.02, 16, 12), wood, P(0, 0.08, 0)));
  hit(tamper, 'tamper');
  group.add(tamper);

  // Knock box
  const knockBox = new THREE.Group();
  knockBox.position.copy(SPOT.knock).setY(Y);
  knockBox.add(mesh(new THREE.BoxGeometry(0.1, 0.07, 0.09), black, P(0, 0.035, 0)));
  knockBox.add(mesh(cyl(0.004, 0.004, 0.09, 8), metal, P(0, 0.075, 0)).rotateZ(Math.PI / 2));
  group.add(knockBox);

  // Portafilter: basket with grounds, two spouts and a wooden handle pointing along +Z
  const portafilter = new THREE.Group();
  const basket = mesh(cyl(0.031, 0.026, 0.024, 28), metal);
  const puck = mesh(cyl(0.027, 0.027, 1, 24), mat(0x4b2c18));
  puck.visible = false;
  const spout = mesh(cyl(0.004, 0.002, 0.015, 8), metal, P(0, -0.018, 0));
  const handle = mesh(cyl(0.008, 0.01, 0.12, 12), wood, P(0, 0, 0.09));
  handle.rotation.x = Math.PI / 2;
  portafilter.add(basket, puck, spout, handle);
  portafilter.position.copy(SPOT.rest);
  hit(portafilter, 'portafilter');
  group.add(portafilter);

  // Espresso stream and the machine's tap target
  const espressoStream = mesh(cyl(0.0025, 0.0018, 1, 8), mat(0x6b3a1c), P(0, 0, 0));
  espressoStream.visible = false;
  group.add(espressoStream);
  const machineHit = mesh(
    new THREE.BoxGeometry(0.26, 0.3, 0.33),
    new THREE.MeshBasicMaterial({ visible: false }),
    P(-3.0, Y + 0.15, 3.35),
  );
  hit(machineHit, 'machine');
  group.add(machineHit);
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
  const scoopIce = new THREE.Group();
  for (let k = 0; k < 5; k++) {
    const c = new THREE.Mesh(iceGeo, iceMat);
    c.position.set((k - 2) * 0.012, 0.008, (k % 2) * 0.01);
    scoopIce.add(c);
  }
  scoop.add(scoopIce);
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
  const moveTo = (o: THREE.Object3D, to: THREE.Vector3, dur: number, lift = 0, e = ease.inOut) => {
    const from = o.position.clone();
    return play(
      dur,
      (k) => {
        o.position.lerpVectors(from, to, k);
        o.position.y += Math.sin(Math.PI * k) * lift;
      },
      e,
    );
  };
  const wait = (s: number) => play(s, () => {});

  // Station state
  const state = {
    busy: false,
    pf: 'rest' as 'rest' | 'fork' | 'mat' | 'group' | 'locked',
    dose: 0,
    doseTarget: 18,
    tamped: false,
    spent: false,
    beans: 1,
    grinding: false,
    brewing: false,
    brewTime: 0,
    brewMl: 0,
    yaw: -0.8,
    view: 'counter' as 'counter' | 'freezer',
    cupAt: SPOT.work.clone(),
  };
  const drinkState: BarDrink = { cup: null, amounts: {} };
  const report = () =>
    on.readout(
      state.grinding || state.pf !== 'rest' || state.brewing || state.brewTime
        ? {
            dose: state.dose,
            doseTarget: state.doseTarget,
            time: state.brewTime,
            yield: state.brewMl,
          }
        : null,
    );
  const showPuck = () => {
    puck.visible = state.dose > 0.5;
    const h = Math.min(0.022, (state.dose / 20) * (state.tamped ? 0.016 : 0.024));
    puck.scale.y = Math.max(0.001, h);
    puck.position.y = 0.012 - h / 2 + (state.tamped ? 0 : 0.004);
    (puck.material as THREE.MeshStandardMaterial).color.setHex(state.spent ? 0x2c1a0f : 0x4b2c18);
  };

  const needCup = () => {
    if (drinkState.cup) return false;
    on.hint('Ambil cup dulu: plastik untuk dingin, paper cup untuk panas.');
    return true;
  };
  const cupTo = (to: THREE.Vector3, dur = 0.45) => {
    state.cupAt.copy(to);
    return moveTo(cup, to, dur, 0.03);
  };

  const actions: Record<string, () => Promise<void> | void> = {
    async 'cup:gelas-es'() {
      await takeCup('gelas-es');
    },
    async 'cup:cangkir'() {
      await takeCup('cangkir');
    },
    async beans() {
      if (state.beans > 0.9) return on.hint('Hopper grinder masih penuh.');
      on.sound('scoop');
      await play(0.25, (k) => (beanLid.position.y = 0.126 + k * 0.05), ease.out);
      state.beans = 1;
      beansInHopper.scale.y = 1;
      await play(0.3, (k) => (beanLid.position.y = 0.176 - k * 0.05), ease.back);
    },
    async freezer() {
      if (needCup()) return;
      if (drinkState.amounts.es) return on.hint('Esnya sudah cukup untuk satu gelas.');
      state.view = 'freezer';
      await wait(0.55);
      scoop.visible = true;
      scoop.position.copy(SPOT.freezer).add(P(0, -0.12, 0));
      on.sound('ice');
      await moveTo(scoop, SPOT.freezer.clone().add(P(0, 0.12, -0.05)), 0.5, 0, ease.out);
      state.view = 'counter';
      scoop.visible = false;
      await wait(0.45);
      scoop.visible = true;
      scoop.position.copy(state.cupAt).add(P(0, 0.25, 0.04));
      await moveTo(scoop, state.cupAt.clone().add(P(0, 0.17, 0)), 0.3, 0, ease.out);
      await play(0.25, (k) => (scoop.rotation.x = -k * 1.4));
      on.sound('ice');
      on.ice();
      await wait(0.2);
      scoop.visible = false;
      scoop.rotation.x = 0;
    },
    grinder() {
      if (state.pf !== 'fork')
        return on.hint('Taruh portafilter di garpu grinder dulu (ketuk portafilter).');
      if (state.grinding) return;
      if (state.dose >= state.doseTarget - 0.2)
        return on.hint('Sudah penuh. Ketuk portafilter untuk tamping.');
      if (state.beans <= 0.05) return on.hint('Biji kopi habis. Ketuk toples biji kopi.');
      state.grinding = true;
      on.sound('grind-start');
      grindButton.position.z = 0.037;
    },
    async tamper() {
      if (state.pf !== 'mat') return on.hint('Taruh portafilter di alas tamping dulu.');
      if (state.tamped) return on.hint('Sudah dipadatkan. Ketuk portafilter untuk memasang.');
      state.busy = true;
      const above = SPOT.mat.clone().add(P(0, 0.04, 0));
      await moveTo(tamper, above, 0.4, 0.05);
      await play(0.22, (k) => (tamper.position.y = above.y - k * 0.022), ease.inOut);
      on.sound('tamp');
      state.tamped = true;
      showPuck();
      // A little polish twist, then lift away.
      await play(0.3, (k) => (tamper.rotation.y = Math.sin(k * Math.PI) * 0.6));
      await play(0.2, (k) => (tamper.position.y = above.y - 0.022 + k * 0.022), ease.out);
      await moveTo(tamper, tamperHome, 0.4, 0.05);
      state.busy = false;
      on.hint('Ketuk portafilter untuk memasangnya ke mesin.');
    },
    async portafilter() {
      if (state.pf === 'rest') {
        if (state.spent) return;
        state.busy = true;
        await moveTo(portafilter, SPOT.fork, 0.55, 0.05);
        state.pf = 'fork';
        state.busy = false;
        report();
        on.hint(`Ketuk grinder untuk menggiling ${state.doseTarget} g.`);
      } else if (state.pf === 'fork') {
        if (state.grinding) return;
        if (state.dose < state.doseTarget - 1) return on.hint('Giling dulu sampai takarannya pas.');
        state.busy = true;
        await moveTo(portafilter, SPOT.mat, 0.5, 0.04);
        state.pf = 'mat';
        state.busy = false;
        on.hint('Ketuk tamper untuk memadatkan.');
      } else if (state.pf === 'mat') {
        if (!state.tamped) return on.hint('Tamp dulu: ketuk tamper.');
        state.busy = true;
        // Under the group head, turned to the left, then up into it.
        await play(0.35, (k) => (portafilter.rotation.y = -0.8 * k));
        await moveTo(portafilter, SPOT.groupLow, 0.55, 0.06);
        await moveTo(portafilter, SPOT.group, 0.25, 0, ease.out);
        state.pf = 'group';
        state.yaw = -0.8;
        state.busy = false;
        on.hint('Geser ke kanan untuk memutar portafilter sampai terkunci.');
      } else if (state.pf === 'locked' && state.spent && !state.brewing) {
        state.busy = true;
        await play(0.3, (k) => (portafilter.rotation.y = -0.8 * k));
        on.sound('click');
        await moveTo(portafilter, SPOT.groupLow, 0.2);
        await play(0.25, (k) => (portafilter.rotation.y = -0.8 * (1 - k)));
        await moveTo(portafilter, SPOT.knock, 0.5, 0.06);
        for (let i = 0; i < 2; i++) {
          await play(0.08, (k) => (portafilter.position.y = SPOT.knock.y - k * 0.02));
          on.sound('knock');
          await play(
            0.12,
            (k) => (portafilter.position.y = SPOT.knock.y - 0.02 + k * 0.02),
            ease.out,
          );
        }
        state.dose = 0;
        state.tamped = false;
        state.spent = false;
        state.brewTime = 0;
        state.brewMl = 0;
        showPuck();
        await moveTo(portafilter, SPOT.rest, 0.45, 0.04);
        state.pf = 'rest';
        state.busy = false;
        report();
        on.hint('Bersih. Mau shot lagi? Ketuk portafilter.');
      }
    },
    machine() {
      if (state.brewing) return stopBrew();
      if (state.pf !== 'locked') return on.hint('Pasang dan kunci portafilter di mesin dulu.');
      if (state.spent) return on.hint('Buang ampasnya dulu: ketuk portafilter.');
      if (needCup()) return;
      void startBrew();
    },
  };
  for (const id of powders) actions['powder:' + id] = () => spoonPowder(id);
  for (const id of ['fullcream', 'skm']) actions['pour:' + id] = () => pour(id);
  for (const i of [0, 1, 2]) actions['syrup:' + i] = () => pump(i);

  async function takeCup(kind: BarCup) {
    if (drinkState.cup) return on.hint('Sudah ada cup di meja.');
    on.sound('cup');
    cupKind = kind;
    styleCup();
    cup.visible = true;
    const from = (kind === 'gelas-es' ? SPOT.plastic : SPOT.paper).clone().add(P(0, 0.1, 0));
    cup.position.copy(from);
    on.cup(kind);
    await cupTo(SPOT.work, 0.55);
  }
  async function pump(i: number) {
    const id = slots[i];
    if (needCup()) return;
    const b = bottles[i];
    const under = SPOT.bottle(i)
      .clone()
      .add(P(0, 0, 0.065));
    await cupTo(under, 0.4);
    on.sound('pump');
    await play(0.12, (k) => (b.head.position.y = 0.235 - k * 0.018), ease.inOut);
    on.add(id, STEP[id]);
    await play(0.35, (k) => (b.head.position.y = 0.217 + k * 0.018), ease.back);
    await cupTo(SPOT.work, 0.4);
  }
  async function spoonPowder(id: string) {
    if (needCup()) return;
    const jar = jars[powders.indexOf(id)];
    on.sound('scoop');
    await play(
      0.22,
      (k) => {
        jar.lid.position.y = 0.105 + k * 0.05;
        jar.lid.rotation.z = k * 0.5;
      },
      ease.out,
    );
    (spoonLoad.material as THREE.MeshStandardMaterial).color.setHex(COLORS[id]);
    spoon.visible = true;
    spoon.rotation.set(0, 0, 0);
    spoon.position.copy(jar.g.position).add(P(0, 0.06, 0));
    spoonLoad.visible = true;
    await moveTo(spoon, state.cupAt.clone().add(P(0, 0.17, 0)), 0.5, 0.06);
    await play(0.22, (k) => (spoon.rotation.z = k * 1.8));
    spoonLoad.visible = false;
    on.add(id, STEP[id]);
    await wait(0.1);
    spoon.visible = false;
    await play(
      0.25,
      (k) => {
        jar.lid.position.y = 0.155 - k * 0.05;
        jar.lid.rotation.z = 0.5 * (1 - k);
      },
      ease.back,
    );
  }
  async function pour(id: string) {
    if (needCup()) return;
    const box = id === 'skm' ? skm : milk;
    const home = box.position.clone(),
      above = state.cupAt.clone().add(P(0.05, 0.12, 0));
    await moveTo(box, above, 0.45, 0.05);
    on.sound('pour');
    await play(0.3, (k) => (box.rotation.z = k * 1.2));
    on.add(id, STEP[id]);
    await wait(0.25);
    await play(0.25, (k) => (box.rotation.z = 1.2 * (1 - k)));
    await moveTo(box, home, 0.45, 0.05);
  }
  async function startBrew() {
    state.busy = true;
    await cupTo(SPOT.machineTray, 0.5);
    state.busy = false;
    on.sound('brew-start');
    state.brewing = true;
    state.brewTime = 0;
    state.brewMl = 0;
    on.hint('Hentikan saat volume pas (ketuk mesin). Target sekitar 25–30 detik.');
  }
  function stopBrew() {
    state.brewing = false;
    espressoStream.visible = false;
    on.sound('brew-stop');
    state.spent = true;
    showPuck();
    const t = state.brewTime,
      target = state.doseTarget * 2;
    // Good shots: 24–31 s and close to a 1:2 ratio.
    const timeScore = 1 - Math.max(0, Math.abs(t - 27.5) - 3.5) / 12,
      ratioScore = 1 - Math.max(0, Math.abs(state.brewMl - target) - 6) / 30;
    const quality = Math.max(0.2, Math.min(1, timeScore * 0.6 + ratioScore * 0.4));
    on.shot(quality, t, state.brewMl);
    on.hint(
      quality > 0.85
        ? `Shot sempurna: ${Math.round(t)} dtk, ${Math.round(state.brewMl)} ml.`
        : t > 31
          ? `Kelamaan (${Math.round(t)} dtk), agak pahit.`
          : `Kecepetan (${Math.round(t)} dtk), agak asam.`,
    );
    void cupTo(SPOT.work, 0.55);
    report();
  }

  // Twisting into the group head: drag sideways while the portafilter hangs there.
  let twist: { x: number; yaw: number } | null = null;
  let press: { action: string; at: number; x: number; y: number } | null = null;

  function styleCup() {
    const plastic = cupKind === 'gelas-es';
    cupShell.geometry = plastic ? plasticGeo : paperGeo;
    cupShell.material = plastic ? plasticMat : paperMat;
    cupShell.position.y = plastic ? 0.065 : 0.055;
    sleeve.visible = !plastic;
    sleeve.position.y = 0.06;
  }
  function showDrink() {
    const a = drinkState.amounts;
    let volume = 0,
      r = 0,
      g = 0,
      b = 0,
      total = 0;
    for (const [id, amount] of Object.entries(a)) {
      if (!amount || id === 'es') continue;
      const ml =
        id === 'espresso'
          ? amount * 30
          : ['cokelat', 'matcha', 'taro'].includes(id)
            ? amount * 2
            : amount;
      volume += ml;
      const c = new THREE.Color(COLORS[id] ?? 0xdddddd);
      const w = ml * (TINT[id] ?? 1);
      r += c.r * w;
      g += c.g * w;
      b += c.b * w;
      total += w;
    }
    // Shot in progress: what has run so far.
    if (state.brewing) {
      const c = new THREE.Color(COLORS.espresso),
        w = state.brewMl * 3;
      volume += state.brewMl;
      r += c.r * w;
      g += c.g * w;
      b += c.b * w;
      total += w;
    }
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
    crema.visible = !!a.espresso || state.brewing;
    crema.scale.set(rTop * 0.98, 1, rTop * 0.98);
    crema.position.y = 0.004 + h + 0.002;
    ice.visible = !!a.es;
  }

  return {
    group,
    hits,
    views: BAR_VIEWS,
    view: () => state.view,
    state,
    setSlots,
    setDose(g: number) {
      state.doseTarget = g;
      report();
    },
    /** The drink as the game sees it (cup kind and amounts), for the cup's look. */
    setDrink(d: BarDrink) {
      drinkState.cup = d.cup;
      drinkState.amounts = d.amounts;
      if (!d.cup) {
        cup.visible = false;
        cupKind = null;
      } else if (d.cup !== cupKind) {
        cupKind = d.cup === 'cup-takeaway' ? 'cangkir' : d.cup;
        styleCup();
        cup.visible = true;
        cup.position.copy(state.cupAt);
      }
      showDrink();
    },
    /** Where the finish button goes (world position above the cup). */
    cupAnchor: (out: THREE.Vector3) => cup.localToWorld(out.set(0, 0.17, 0)),
    pointerDown(action: string | null, x: number, y: number) {
      if (state.pf === 'group' && (action === 'portafilter' || action === null)) {
        twist = { x, yaw: state.yaw };
        return;
      }
      if (action) press = { action, at: performance.now(), x, y };
    },
    pointerMove(x: number, _y: number, width: number) {
      if (!twist) return;
      state.yaw = Math.min(0, Math.max(-0.8, twist.yaw + ((x - twist.x) / width) * 2.4));
      portafilter.rotation.y = state.yaw;
      if (state.yaw > -0.05) lock();
    },
    pointerUp() {
      if (twist) {
        twist = null;
        // Let go close to the middle and it clicks home by itself.
        if (state.pf === 'group' && state.yaw > -0.25) lock();
        return;
      }
      const p = press;
      press = null;
      if (!p || state.busy) return;
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
      if (state.grinding) {
        // About 3.5 g a second, like a quick on-demand grinder.
        state.dose = Math.min(state.doseTarget, state.dose + dt * 3.5);
        state.beans = Math.max(0, state.beans - dt * 0.05);
        beansInHopper.scale.y = Math.max(0.05, state.beans);
        grinderBody.position.x = Math.sin(performance.now() * 0.09) * 0.0008;
        groundsStream.visible = true;
        groundsStream.scale.y = 0.03;
        groundsStream.position.y = 0.095;
        showPuck();
        report();
        if (state.dose >= state.doseTarget || state.beans <= 0) {
          state.grinding = false;
          groundsStream.visible = false;
          grindButton.position.z = 0.041;
          on.sound('grind-stop');
          on.hint(
            state.beans <= 0
              ? 'Biji kopi habis. Ketuk toples biji kopi.'
              : `${state.doseTarget} g siap. Ketuk portafilter untuk tamping.`,
          );
        }
      }
      if (state.brewing) {
        // Game speed: a 27-second shot takes about 4.5 real seconds.
        state.brewTime += dt * 6;
        const flow = state.brewTime < 5 ? 0 : 1.35 + Math.sin(state.brewTime * 0.4) * 0.1;
        state.brewMl += flow * dt * 6 * 0.95;
        espressoStream.visible = flow > 0;
        const top = SPOT.group.clone().add(P(0, -0.02, 0)),
          bottom = state.cupAt.clone().add(P(0, 0.03, 0));
        espressoStream.position.lerpVectors(top, bottom, 0.5);
        espressoStream.scale.set(1, top.y - bottom.y, 1);
        showDrink();
        report();
        if (state.brewTime > 60) stopBrew();
      }
    },
    dispose() {
      model.remove(group);
      disposables.forEach((d) => d.dispose());
    },
  };

  function lock() {
    if (state.pf !== 'group') return;
    twist = null;
    state.yaw = 0;
    portafilter.rotation.y = 0;
    state.pf = 'locked';
    on.sound('lock');
    on.hint('Terkunci! Ketuk mesin untuk mulai brew.');
    void play(
      0.2,
      (k) => (portafilter.position.y = SPOT.group.y + Math.sin(k * Math.PI) * 0.004),
      ease.out,
    );
  }
}
export type BarRig = ReturnType<typeof createBarRig>;
