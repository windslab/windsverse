import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { loadCafeGeometry } from '../scripts/cafe-model-source';
import { prepareCafeBarWorkspace } from '../lib/cafe-bar-workspace';
import { addCafeWalkSurfaces } from '../lib/cafe-walk-surfaces';
import { cafePaths, type CafePathData } from '../lib/cafe-paths';
import { placeCafePeople } from '../app/scene-people';
import { EMPTY_CAFE_ACTIVITY as empty, type CafeVisitor } from '../lib/cafe-activity';
import { sceneVisitors } from '../lib/cafe-visitors';
import { blank } from '../lib/model';
const data = JSON.parse(
  readFileSync('public/models/cafe-navigation-v1.json', 'utf8'),
) as CafePathData;
async function fixture() {
  const cafe = await loadCafeGeometry();
  prepareCafeBarWorkspace(cafe);
  addCafeWalkSurfaces(cafe);
  const paths = cafePaths(cafe, data),
    people = placeCafePeople(cafe, paths);
  const advance = (seconds: number) => {
    for (let i = 0; i < seconds * 60; i++) people.update(1 / 60, true);
  };
  return { cafe, paths, people, advance };
}
const order: CafeVisitor = {
  key: 'local-test-1',
  status: 'diproses',
  type: 'dine_in',
  tableNumber: 1,
  finishedAt: null,
};
test('navigation matches deployed cafe and routes upstairs through actual stair treads', async () => {
  assert.equal(
    data.modelSha,
    createHash('sha256').update(readFileSync('public/models/winds-space-new.glb')).digest('hex'),
  );
  const f = await fixture();
  const path = f.paths.path(
    new THREE.Vector3(-6.05, 0.505, 4.4),
    new THREE.Vector3(-3, 2.447, 3.6),
  );
  assert.ok(path);
  assert.ok(
    path.some((p) => p.y > 0.8 && p.y < 1.9 && p.x > 1.1 && p.x < 2.6 && p.z > 1 && p.z < 2.6),
  );
  assert.ok(path.every((p, i) => !i || Math.abs(p.y - path[i - 1].y) < 0.46));
  f.people.dispose();
});
test('POS alone has no customers; new order comes from sidewalk and waits outside bar', async () => {
  const f = await fixture();
  f.people.updateActivity({ ...empty, posActive: true, visitors: [] });
  f.advance(3);
  assert.ok(
    f.people
      .inspect()
      .people.slice(1)
      .every((p) => !p.visible),
  );
  f.people.updateActivity({ ...empty, active: 1, queued: 1, visitors: [order] });
  let guest = f.people.inspect().people[1];
  assert.ok(guest.position.x < -5.8);
  f.advance(15);
  guest = f.people.inspect().people[1];
  assert.equal(guest.phase, 'queue');
  assert.ok(guest.position.x < -5.1);
  assert.ok(guest.position.y > 0.49);
  f.people.dispose();
});
test('making sends customer to a seat; completed order is delivered and customer lingers then exits', async () => {
  const f = await fixture();
  f.people.updateActivity({ ...empty, active: 1, queued: 1, visitors: [order] });
  f.advance(15);
  f.people.updateActivity({
    ...empty,
    active: 1,
    making: 1,
    visitors: [{ ...order, status: 'sedang_dibuat' }],
  });
  f.advance(65);
  let guest = f.people.inspect().people[1];
  assert.equal(guest.phase, 'sitting');
  assert.ok(guest.seat);
  assert.ok(Math.abs(guest.visual.y + 0.445 - guest.seat.y) < 0.001);
  const completed = { ...order, status: 'selesai' as const, finishedAt: Date.now() };
  f.people.updateActivity({ ...empty, visitors: [completed] });
  f.advance(70);
  guest = f.people.inspect().people[1];
  assert.equal(guest.delivered, true);
  assert.equal(guest.visible, true);
  f.advance(150);
  assert.ok(
    f.people
      .inspect()
      .people.slice(1)
      .every((p) => !p.visible),
  );
  f.people.updateActivity({ ...empty, visitors: [completed, { ...order, key: 'other' }] });
  assert.ok(!f.people.inspect().people.some((p) => p.key === order.key));
  f.people.dispose();
});
test('moving feet follow raised bar floor and indoor floor without fixed height', async () => {
  const f = await fixture();
  f.people.updateActivity({
    ...empty,
    active: 1,
    making: 1,
    visitors: [{ ...order, status: 'sedang_dibuat' }],
  });
  for (let i = 0; i < 3600; i++) {
    f.people.update(1 / 60, true);
    if (i % 30) continue;
    const state = f.people.inspect();
    for (const [index, p] of state.people.entries()) {
      if (!p.visible || p.phase === 'sitting') continue;
      const visual = f.people.root.getObjectByName(
        index ? 'Cafe_Customer_' + index : 'Cafe_Barista',
      )!;
      visual.updateWorldMatrix(true, true);
      let bottom = Infinity;
      visual.traverse((n) => {
        if (n instanceof THREE.Mesh && n.geometry.type === 'BoxGeometry' && n.position.y < -0.2)
          bottom = Math.min(bottom, new THREE.Box3().setFromObject(n).min.y);
      });
      if (Number.isFinite(bottom)) assert.ok(bottom >= f.paths.ground(p.position) - 0.001);
    }
  }
  f.people.dispose();
});
test('public visual feed excludes unpaid, historical and cancelled orders and exposes no receipt/customer details', async () => {
  const state = blank();
  state.orders = [
    {
      id: 'private-id',
      no: 'SECRET-RECEIPT',
      createdAt: new Date().toISOString(),
      paid: true,
      status: 'diproses',
      orderType: 'dine_in',
      customerName: 'Private Name',
      items: [{ name: 'Private Item' }],
    },
    { id: 'unpaid', paid: false, status: 'diproses' },
    { id: 'history', paid: true, historicalEntry: true, status: 'selesai' },
    { id: 'cancel', paid: true, status: 'dibatalkan' },
  ];
  const visitors = await sceneVisitors(state);
  assert.equal(visitors.length, 1);
  assert.equal(visitors[0].status, 'diproses');
  const json = JSON.stringify(visitors);
  for (const privateText of ['private-id', 'SECRET-RECEIPT', 'Private Name', 'Private Item'])
    assert.ok(!json.includes(privateText));
});
test('detailed Luna reaches the interior cashier and coffee machine with shoes above the bar floor', async () => {
  const cafe = await loadCafeGeometry();
  prepareCafeBarWorkspace(cafe);
  addCafeWalkSurfaces(cafe);
  const paths = cafePaths(cafe, data),
    luna = await loadCafeGeometry('public/models/luna-chibi.glb'),
    people = placeCafePeople(cafe, paths, luna);
  people.updateActivity({ ...empty, active: 1, queued: 1, visitors: [order] });
  for (let i = 0; i < 3600; i++) people.update(1 / 60, true);
  let barista = people.inspect().people[0];
  assert.ok(barista.position.x > -4.25 && barista.position.x < -2.14);
  assert.ok(barista.position.z > 3.65 && barista.position.z < 4.22);
  people.updateActivity({
    ...empty,
    active: 1,
    making: 1,
    visitors: [{ ...order, status: 'sedang_dibuat' }],
  });
  for (let i = 0; i < 1200; i++) people.update(1 / 60, false);
  barista = people.inspect().people[0];
  assert.ok(Math.abs(barista.position.x + 3) < 0.2);
  const visual = people.root.getObjectByName('Cafe_Barista')!;
  visual.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(visual);
  assert.ok(bounds.min.y >= paths.ground(barista.position) - 0.01);
  people.dispose();
});
test('several customers reserve different seats and never take the staff aisle', async () => {
  const f = await fixture();
  const visitors = Array.from({ length: 4 }, (_, i) => ({
    ...order,
    key: 'guest-' + i,
    status: 'sedang_dibuat' as const,
  }));
  f.people.updateActivity({ ...empty, active: 4, making: 4, visitors });
  f.advance(110);
  const guests = f.people
    .inspect()
    .people.slice(1)
    .filter((p) => p.key);
  assert.equal(guests.length, 4);
  assert.ok(guests.every((p) => p.phase === 'sitting'));
  const seats = guests.map((p) => p.seat!.toArray().join(','));
  assert.equal(new Set(seats).size, 4);
  for (const guest of guests)
    for (const p of guest.waypoints)
      assert.ok(!(p.y < 1.5 && p.x > -4.53 && p.x < -2.14 && p.z > 2.94 && p.z < 4.96));
  f.people.dispose();
});
test('one order with several drinks brings a group that sits together and is served in one trip', async () => {
  const state = blank();
  state.categories = [
    { id: 'kopi', name: 'kopi', sortOrder: 0 },
    { id: 'makanan', name: 'makanan', sortOrder: 1 },
  ];
  state.products = [
    { id: 'latte', category: 'kopi' },
    { id: 'toast', category: 'makanan' },
  ] as any;
  state.orders = [
    {
      id: 'group-order',
      createdAt: new Date().toISOString(),
      paid: true,
      status: 'sedang_dibuat',
      orderType: 'dine_in',
      tableId: '',
      items: [
        { productId: 'latte', quantity: 3 },
        { productId: 'toast', quantity: 2 },
      ],
    },
  ] as any;
  const visitors = await sceneVisitors(state);
  assert.equal(visitors.length, 3);
  assert.equal(new Set(visitors.map((v) => v.group)).size, 1);
  const f = await fixture();
  f.people.updateActivity({ ...empty, active: 1, making: 1, visitors });
  f.advance(110);
  let guests = f.people
    .inspect()
    .people.slice(1)
    .filter((p) => p.key);
  assert.equal(guests.length, 3);
  assert.ok(guests.every((p) => p.phase === 'sitting'));
  for (const a of guests) for (const b of guests) assert.ok(a.seat!.distanceTo(b.seat!) < 3);
  const done = visitors.map((v) => ({ ...v, status: 'selesai' as const, finishedAt: Date.now() }));
  f.people.updateActivity({ ...empty, visitors: done });
  f.advance(70);
  guests = f.people
    .inspect()
    .people.slice(1)
    .filter((p) => p.key);
  assert.ok(guests.every((p) => p.delivered));
  f.people.dispose();
});
/** Explore mode: steer Luna toward each point with small free steps (like holding the stick). */
function freeWalk(f: Awaited<ReturnType<typeof fixture>>, goals: number[][]) {
  const luna = () => f.people.baristaPosition();
  f.people.setManual(true);
  const reached: boolean[] = [];
  for (const g of goals) {
    const goal = f.cafe.localToWorld(new THREE.Vector3(g[0], g[1], g[2]));
    let ok = false;
    for (let i = 0; i < 60 * 12 && !ok; i++) {
      const d = goal.clone().sub(luna());
      d.y = 0;
      if (d.length() < 0.08) ok = true;
      else {
        d.normalize();
        f.people.drive(d.x, d.z);
        f.people.update(1 / 60, true);
      }
    }
    reached.push(ok);
  }
  f.people.drive(0, 0);
  return reached;
}
test('explore mode: Luna climbs both staircases and stays out of the pond', async () => {
  const f = await fixture();
  // Courtyard → spiral stairs around the tree → upstairs indoor floor, then back down.
  f.people.setManual(true);
  f.people.walkTo(f.cafe.localToWorld(new THREE.Vector3(0.3, 0, 1.15)));
  for (let i = 0; i < 60 * 20 && f.people.walking(); i++) f.people.update(1 / 60, true);
  const up = freeWalk(f, [
    [1.0, 0, 1.15],
    [2.2, 1.0, 1.2],
    [2.4, 1.0, 2.3],
    [1.1, 2.07, 2.3],
    [0.5, 2.07, 2.8],
  ]);
  assert.deepEqual(up, [true, true, true, true, true]);
  assert.ok(Math.abs(f.paths.local(f.people.baristaPosition()).y - 2.07) < 0.05);
  const down = freeWalk(f, [
    [1.1, 2.07, 2.3],
    [2.4, 1.0, 2.3],
    [2.2, 1.0, 1.2],
    [1.0, 0, 1.15],
  ]);
  assert.deepEqual(down, [true, true, true, true]);
  // Bar box steps from the courtyard up to its raised floor.
  const bar = freeWalk(f, [
    [-2.0, 0, 1.5],
    [-2.6, 0.19, 1.5],
    [-2.8, 0.39, 1.5],
    [-3.1, 0.58, 1.9],
  ]);
  assert.deepEqual(bar, [true, true, true, true]);
  assert.ok(Math.abs(f.paths.local(f.people.baristaPosition()).y - 0.585) < 0.05);
  // The pond: walking straight at it stops on the rim.
  freeWalk(f, [
    [-2.0, 0, 1.5],
    [-3.8, 0, -3.0],
    [-3.8, 0, -4.8],
  ]);
  assert.ok(f.paths.local(f.people.baristaPosition()).y > -0.05);
  f.people.dispose();
});
test('queue lines up from the cashier window backwards and moves up', async () => {
  const f = await fixture();
  const visitors = [1, 2, 3].map((n) => ({ ...order, key: 'q' + n }));
  f.people.updateActivity({ ...empty, active: 3, visitors });
  f.advance(25);
  const spots = () =>
    f.people
      .inspect()
      .people.filter((p) => p.key.startsWith('q') && p.phase === 'queue')
      .map((p) => ({ key: p.key, at: f.paths.local(p.position) }));
  const line = spots();
  assert.equal(line.length, 3);
  // Front of the line right outside the window (box wall at x = -4.93), the rest behind it.
  const first = line.find((p) => p.key === 'q1')!.at;
  assert.ok(first.x > -5.4 && first.x < -4.95 && Math.abs(first.z - 3.93) < 0.2);
  // Each next guest stands further back from the window.
  const window = new THREE.Vector3(-4.93, first.y, 3.93),
    gaps = ['q1', 'q2', 'q3'].map((k) => line.find((p) => p.key === k)!.at.distanceTo(window));
  assert.ok(gaps[0] < gaps[1] && gaps[1] < gaps[2]);
  // First guest ordered: the next one steps up to the window.
  f.people.updateActivity({
    ...empty,
    active: 3,
    visitors: [{ ...visitors[0], status: 'sedang_dibuat' }, visitors[1], visitors[2]],
  });
  f.advance(10);
  const next = spots().find((p) => p.key === 'q2')!.at;
  assert.ok(next.x > -5.4 && Math.abs(next.z - 3.93) < 0.2);
  f.people.dispose();
});
test('upstairs lesehan guests sit cross-legged on the floor', async () => {
  const f = await fixture();
  const seats = (await import('../lib/cafe-seats')).findCafeSeats(f.cafe).filter((s) => s.floor);
  assert.equal(seats.length, 12);
  for (const s of seats) {
    const local = f.paths.local(s.surface);
    assert.ok(local.y > 1.95 && local.y < 2.1);
    assert.ok(f.paths.snap(s.surface, 0.85));
  }
  // A guest for "meja atas 1" climbs the stairs and sits on the floor beside that low table.
  f.people.updateActivity({
    ...empty,
    active: 1,
    making: 1,
    visitors: [{ ...order, key: 'lesehan', tableNumber: 'atas 1', status: 'sedang_dibuat' }],
  });
  f.advance(60);
  const guest = f.people.inspect().people.find((p) => p.key === 'lesehan')!;
  assert.equal(guest.phase, 'sitting');
  assert.ok(Math.abs(f.paths.local(guest.seat!).y - 2.07) < 0.03);
  f.people.dispose();
});
test('explore mode: guests still reach their seats when Luna is parked in the passage', async () => {
  const f = await fixture();
  f.people.setManual(true);
  const visitors = ['atas 1', '3', '1', '4'].map((t, i) => ({
    ...order,
    key: 'park' + i,
    group: 'park' + i,
    tableNumber: t,
    status: 'sedang_dibuat' as const,
  }));
  f.people.updateActivity({ ...empty, active: 4, making: 4, visitors });
  f.advance(120);
  const phases = f.people
    .inspect()
    .people.filter((p) => p.key.startsWith('park'))
    .map((p) => p.phase);
  assert.deepEqual(phases, ['sitting', 'sitting', 'sitting', 'sitting']);
  f.people.dispose();
});
