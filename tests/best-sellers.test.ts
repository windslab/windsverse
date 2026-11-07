import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekDays, weeklyBestSellers } from '../lib/best-sellers';

const product = (id: string, name = id) => ({
  id,
  name,
  price: 20000,
  category: 'c',
  status: 'tersedia',
});
const order = (date: string, items: [string, number][], extra: object = {}) => ({
  id: date + Math.random(),
  date,
  paid: true,
  status: 'selesai',
  items: items.map(([productId, quantity]) => ({ productId, quantity })),
  ...extra,
});

test('a week is today and the six days before it', () => {
  assert.deepEqual(weekDays('2026-11-07'), [
    '2026-11-07',
    '2026-11-06',
    '2026-11-05',
    '2026-11-04',
    '2026-11-03',
    '2026-11-02',
    '2026-11-01',
  ]);
});

test('ranks by quantity sold this week, top five only', () => {
  const products = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => product(id));
  const orders = [
    order('2026-11-07', [
      ['a', 1],
      ['b', 3],
    ]),
    order('2026-11-03', [
      ['c', 5],
      ['d', 2],
      ['e', 4],
      ['f', 1],
    ]),
    order('2026-11-01', [['a', 1]]),
  ];
  const top = weeklyBestSellers({ orders, products }, '2026-11-07');
  assert.deepEqual(
    top.map((p) => [p.rank, p.id]),
    [
      [1, 'c'],
      [2, 'e'],
      [3, 'b'],
      [4, 'a'],
      [5, 'd'],
    ],
  );
  assert.equal('sold' in top[0], false);
});

test('older, unpaid, cancelled and removed items do not count', () => {
  const products = [product('a'), product('b')];
  const orders = [
    order('2026-10-31', [['b', 9]]),
    order('2026-11-07', [['b', 9]], { paid: false }),
    order('2026-11-07', [['b', 9]], { status: 'dibatalkan' }),
    order('2026-11-07', [
      ['gone', 9],
      ['a', 1],
    ]),
  ];
  assert.deepEqual(
    weeklyBestSellers({ orders, products }, '2026-11-07').map((p) => p.id),
    ['a'],
  );
});

test('bottled water is never ranked', () => {
  const products = [product('w', 'Air Mineral'), product('a')];
  const orders = [
    order('2026-11-07', [
      ['w', 20],
      ['a', 1],
    ]),
  ];
  assert.deepEqual(
    weeklyBestSellers({ orders, products }, '2026-11-07').map((p) => p.id),
    ['a'],
  );
});
