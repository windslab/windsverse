import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeItem,
  drinkMenu,
  newCustomer,
  review,
  tasteOf,
  type Order,
} from '../lib/barista-game';

const latte: Order = {
  item: { id: 'x', name: 'Es Kopi Susu Aren', price: 22000, category: 'kopi' },
  line: '',
  coffee: true,
  iced: true,
  takeaway: false,
  flavor: 'aren',
  target: { sweet: 0.5, milky: 0.6, coffee: 0.45, flavor: 0.6 },
  paid: 50000,
};
const good = {
  cup: 'gelas-es' as const,
  amounts: { espresso: 1, fullcream: 150, aren: 25, es: 2 },
  espressoQuality: 1,
};

test('a well-made drink with the right change earns high stars', () => {
  const r = review(latte, good, { given: 28000, due: 28000 }, 40);
  assert.ok(r.stars >= 4, JSON.stringify(r));
});

test('short change and a slow wait cost stars', () => {
  const fair = review(latte, good, { given: 28000, due: 28000 }, 40).stars;
  const bad = review(latte, good, { given: 20000, due: 28000 }, 200).stars;
  assert.ok(bad < fair);
});

test('coffee without coffee and the wrong cup score low', () => {
  const r = review(
    latte,
    { cup: 'cangkir', amounts: { fullcream: 150, aren: 25 }, espressoQuality: 1 },
    { given: 28000, due: 28000 },
    30,
  );
  assert.ok(r.stars <= 2, JSON.stringify(r));
});

test('more milk dilutes the coffee', () => {
  const small = tasteOf({
    cup: 'cangkir',
    amounts: { espresso: 2, fullcream: 60 },
    espressoQuality: 1,
  }).taste.coffee;
  const big = tasteOf({
    cup: 'cangkir',
    amounts: { espresso: 2, fullcream: 240, air: 150 },
    espressoQuality: 1,
  }).taste.coffee;
  assert.ok(big < small);
});

test('menu: drinks only, demo menu when empty, customers pay enough', () => {
  const menu = drinkMenu([
    { id: 'a', name: 'Kopi Susu', price: 20000, category: 'kopi' },
    { id: 'b', name: 'Roti Bakar', price: 15000, category: 'makanan' },
  ]);
  assert.deepEqual(
    menu.map((m) => m.id),
    ['a'],
  );
  assert.ok(drinkMenu([]).length > 0);
  for (let i = 0; i < 50; i++) {
    const { order } = newCustomer(menu);
    assert.ok(order.paid >= order.item.price);
  }
  assert.equal(
    describeItem({ id: 'c', name: 'Es Matcha Latte', price: 1, category: 'non_kopi' }).flavor,
    'matcha',
  );
});
