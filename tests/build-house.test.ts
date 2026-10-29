import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  CATALOGUE,
  canPlace,
  createHouseBuilder,
  edit,
  emptyHouse,
  sanitize,
} from '../lib/build-house';

const lot = { cols: 16, rows: 12 };

test('sanitize keeps good data and drops anything invalid or out of the lot', () => {
  const clean = sanitize(
    {
      floors: { '1,1': 0, '99,1': 0, 'x,y': 0, '2,2': 99 },
      h: { '1,1': { m: 2, o: 'window' }, '1,99': { m: 0 }, '3,3': { m: 50, o: 'rocket' } },
      w: { '4,4': { m: 1 } },
      items: [
        { id: 'a', t: 'sofa', x: 3.2, z: 4.9, r: 1, c: 2 },
        { id: 'b', t: 'unknown', x: 1, z: 1, r: 0, c: 0 },
        { id: 'c', t: 'kasur', x: 'far', z: 1, r: 0, c: 0 },
      ],
      roof: { kind: 'gable', c: 99 },
    },
    lot.cols,
    lot.rows,
  );
  assert.deepEqual(Object.keys(clean.floors), ['1,1']);
  assert.deepEqual(clean.h['1,1'], { m: 2, o: 'window' });
  assert.equal(clean.h['1,99'], undefined);
  assert.deepEqual(clean.h['3,3'], { m: 0 });
  assert.equal(clean.items.length, 1);
  assert.equal(clean.items[0].x, 3);
  assert.equal(clean.items[0].z, 5);
  assert.equal(clean.roof.c, 0);
  assert.deepEqual(sanitize('nonsense', lot.cols, lot.rows), emptyHouse(lot.cols, lot.rows));
});

test('a room gets four walls and a floor, and edits never change the old house', () => {
  const empty = emptyHouse(lot.cols, lot.rows);
  const room = edit.room(empty, { x: 2, z: 2 }, { x: 6, z: 5 }, 1, 0);
  assert.equal(Object.keys(room.h).length, 8);
  assert.equal(Object.keys(room.w).length, 6);
  assert.equal(Object.keys(room.floors).length, 12);
  assert.equal(Object.keys(empty.h).length, 0);
  // Doors and windows toggle on a wall edge, and only where a wall exists.
  const door = edit.opening(room, 'h', 3, 2, 'door');
  assert.equal(door.h['3,2'].o, 'door');
  assert.equal(edit.opening(door, 'h', 3, 2, 'door').h['3,2'].o, undefined);
  assert.equal(edit.opening(room, 'h', 9, 9, 'door').h['9,9'], undefined);
  // Walls stay inside the lot.
  const wide = edit.walls(empty, { x: 10, z: 3 }, { x: 40, z: 3 }, 0);
  assert.equal(Object.keys(wide.h).length, 6);
});

test('furniture must fit: inside the lot, not overlapping, not through a wall', () => {
  let house = edit.room(emptyHouse(lot.cols, lot.rows), { x: 2, z: 2 }, { x: 8, z: 6 }, 0, 0);
  const bed = { t: 'kasur', x: 4, z: 3.75, r: 0 as const };
  assert.ok(canPlace(house, bed));
  house = edit.addItem(house, { ...bed, c: 0 });
  assert.equal(canPlace(house, { t: 'sofa', x: 4, z: 3.8, r: 0 }), false, 'overlaps the bed');
  assert.ok(canPlace(house, { t: 'sofa', x: 6.5, z: 5.5, r: 0 }));
  assert.equal(canPlace(house, { t: 'sofa', x: 8, z: 4, r: 0 }), false, 'across the east wall');
  assert.equal(canPlace(house, { t: 'sofa', x: 0.5, z: 0.5, r: 0 }), false, 'off the lot');
  // A rug goes under the bed.
  assert.ok(canPlace(house, { t: 'karpet', x: 4, z: 3.75, r: 0 }));
  assert.ok(CATALOGUE.length >= 12);
});

test('walls and furniture block walking, doorways and floors do not', () => {
  const origin = new THREE.Vector3(10, 0, 20);
  const builder = createHouseBuilder({
    origin,
    xAxis: new THREE.Vector3(1, 0, 0),
    zAxis: new THREE.Vector3(0, 0, 1),
    cols: lot.cols,
    rows: lot.rows,
    y: 1,
  });
  let house = edit.room(emptyHouse(lot.cols, lot.rows), { x: 2, z: 2 }, { x: 8, z: 6 }, 0, 0);
  house = edit.opening(house, 'h', 4, 6, 'door');
  house = edit.addItem(house, { t: 'sofa', x: 5, z: 3, r: 0, c: 0 });
  builder.setData(house);
  const at = (x: number, z: number) => [origin.x + x, origin.z + z] as const;
  assert.equal(builder.collide(...at(5, 2)), true, 'wall');
  assert.equal(builder.collide(...at(4.5, 6)), false, 'doorway');
  assert.equal(builder.collide(...at(4.2, 6)), false, 'doorway edge');
  assert.equal(builder.collide(...at(6.5, 6)), true, 'wall next to the door');
  assert.equal(builder.collide(...at(5, 3)), true, 'sofa');
  assert.equal(builder.collide(...at(6.5, 4.5)), false, 'open floor');
  assert.equal(builder.floorAt(...at(6.5, 4.5)), 1.1);
  assert.equal(builder.floorAt(...at(12, 4.5)), null);
  assert.equal(builder.spots().length, 1, 'the sofa is somewhere to sit');
  builder.dispose();
});
