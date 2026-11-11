import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAMES, newCustomer } from '../lib/barista-game';
import { REGULARS, pickGuest, regularNamed, storiesOpen } from '../lib/regulars';

const menu = [
  { id: 'a', name: 'Americano', price: 18000, category: 'kopi' },
  { id: 'ea', name: 'Es Americano', price: 20000, category: 'kopi' },
  { id: 'l', name: 'Lemontea', price: 15000, category: 'non_kopi' },
  { id: 'c', name: 'Winds Chocolate', price: 18000, category: 'non_kopi' },
];
/** A fixed sequence of "random" numbers, repeated. */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

test('regulars come in their own hours; passing guests any time', () => {
  const seen = (hour: number) =>
    new Set(Array.from({ length: 400 }, (_, i) => pickGuest(hour, NAMES, [], seq(i / 400)).name));
  assert.ok(seen(21).has('Fajar'));
  assert.ok(!seen(9).has('Fajar'));
  assert.ok(seen(9).has('Fina'));
  assert.ok(seen(9).has('Ekki'));
});

test('a guest already in the café is not picked again', () => {
  const taken = REGULARS.map((r) => r.name).concat(NAMES.map((n) => n.name));
  taken.pop();
  const left = NAMES[NAMES.length - 1].name;
  assert.equal(pickGuest(21, NAMES, taken).name, left);
});

test('regulars mostly order their favourite, best match first', () => {
  const vira = newCustomer(menu, seq(0.1), [], { name: 'Vira', male: false });
  assert.equal(vira.order.item.name, 'Es Americano');
  const adit = newCustomer(menu, seq(0.1), [], { name: 'Adit', male: true });
  assert.equal(adit.order.item.name, 'Lemontea');
});

test('VVIP friends drink free and the owner treats the café', () => {
  const acca = newCustomer(menu, seq(0.1), [], { name: 'Acca', male: true });
  assert.equal(acca.order.pays, 'vvip');
  assert.equal(acca.order.paid, acca.order.item.price);
  assert.equal(newCustomer(menu, seq(0.1), [], { name: 'Bayu', male: true }).order.pays, 'treat');
  assert.equal(
    newCustomer(menu, seq(0.1), [], { name: 'Fajar', male: true }).order.pays,
    undefined,
  );
});

test('story pieces open with serves; friends from afar open faster', () => {
  const fajar = regularNamed('Fajar')!,
    acca = regularNamed('Acca')!;
  assert.deepEqual(
    [0, 1, 2, 3, 6, 10, 20].map((n) => storiesOpen(fajar, n)),
    [0, 1, 1, 2, 3, 4, 4],
  );
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((n) => storiesOpen(acca, n)),
    [0, 1, 2, 3, 4],
  );
  assert.ok(REGULARS.every((r) => r.stories.length === 4));
});
