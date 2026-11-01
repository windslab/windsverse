import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../lib/engine';
import { initial, type Actor, type Row } from '../lib/model';
import { memberCard } from '../lib/member';

const owner: Actor = {
  id: 'owner-identity',
  employeeId: 'owner',
  name: 'Pemilik',
  email: 'owner@test.example',
  role: 'admin',
};
const morning = new Date('2026-10-08T08:30:00+07:00');

function fixture() {
  const s = initial(owner);
  const product = (name: string, price: number, category: string) =>
    apply(
      s,
      owner,
      'save',
      { kind: 'products', data: { name, price, category, status: 'tersedia' } },
      morning,
    ) as Row;
  const coffee = product('Winds Coffee', 18000, 'kopi'),
    matcha = product('Matcha Latte', 21000, 'non_kopi'),
    tea = product('Teh Tawar', 10000, 'non_kopi'),
    bread = product('Roti', 15000, 'makanan');
  const shift = apply(
    s,
    owner,
    'save',
    {
      kind: 'shifts',
      data: {
        name: 'Pagi',
        startAt: '2026-10-08T08:00:00+07:00',
        endAt: '2026-10-08T16:00:00+07:00',
        employeeIds: ['owner'],
      },
    },
    morning,
  ) as Row;
  apply(s, owner, 'shift.open', { id: shift.id }, morning);
  const sell = (
    items: [Row, number][],
    memberId: string,
    extra: Record<string, unknown> = {},
    now = morning,
  ) =>
    apply(
      s,
      owner,
      'order.create',
      {
        shiftId: shift.id,
        items: items.map(([p, quantity]) => ({ productId: p.id, quantity })),
        discount: 0,
        taxEnabled: false,
        paymentMethod: 'qris',
        orderType: 'takeaway',
        paid: true,
        memberId,
        ...extra,
      },
      now,
    ) as Row;
  return { s, coffee, matcha, tea, bread, sell, shift };
}
const join = (s: ReturnType<typeof fixture>['s'], phone = '0812 3456 7890') =>
  apply(s, owner, 'member.create', { name: 'Rina', phone }, morning) as { id: string };

test('members: phone numbers are normalised and unique', () => {
  const { s } = fixture();
  const m = join(s, '+62 812-3456-7890');
  assert.equal(s.members[0].phone, '081234567890');
  assert.equal(s.members[0].code, 'WSM-0001');
  assert.ok(m.id);
  assert.throws(() => join(s, '0812 3456 7890'), /sudah terdaftar/);
});

test('members: a stamp needs a paid drink of at least Rp15.000; points follow the menus', () => {
  const f = fixture();
  const m = join(f.s);
  f.sell([[f.bread, 2]], m.id); // food only
  f.sell([[f.tea, 1]], m.id); // drink under the minimum
  let card = memberCard(f.s, f.s.members[0]);
  assert.equal(card.stampCount, 0);
  assert.equal(card.points, 0);
  f.sell(
    [
      [f.coffee, 2],
      [f.bread, 1],
    ],
    m.id,
  );
  card = memberCard(f.s, f.s.members[0]);
  assert.equal(card.stampCount, 1);
  assert.equal(card.points, 18 * 2 + 15);
});

test('members: points are counted after a discount; menus can have their own points', () => {
  const f = fixture();
  const m = join(f.s);
  f.coffee.memberPoints = 30;
  f.sell([[f.coffee, 2]], m.id, { discount: 18000 }); // half price
  assert.equal(memberCard(f.s, f.s.members[0]).points, 30);
});

test('members: stamp 5 gives a non-coffee drink, stamp 10 a coffee; used ones count nothing', () => {
  const f = fixture();
  const m = join(f.s);
  for (let i = 0; i < 5; i++) f.sell([[f.coffee, 1]], m.id);
  let card = memberCard(f.s, f.s.members[0]);
  const voucher = card.vouchers.find((v) => v.status === 'tersedia')!;
  assert.equal(voucher.type, 'nonkopi');
  // Not for a coffee.
  assert.throws(
    () =>
      f.sell([[f.coffee, 1]], m.id, {
        memberFree: { voucherId: voucher.id, productId: f.coffee.id },
      }),
    /non-kopi/,
  );
  // A free matcha alone: no stamp, no points, matcha comes off the bill.
  const o = f.sell([[f.matcha, 1]], m.id, {
    memberFree: { voucherId: voucher.id, productId: f.matcha.id },
  });
  assert.equal(o.discount, 21000);
  assert.equal(o.total, 0);
  card = memberCard(f.s, f.s.members[0]);
  assert.equal(card.stampCount, 5);
  assert.equal(card.vouchers[0].status, 'terpakai');
  assert.throws(
    () =>
      f.sell([[f.matcha, 1]], m.id, {
        memberFree: { voucherId: voucher.id, productId: f.matcha.id },
      }),
    /sudah dipakai/,
  );
  for (let i = 0; i < 5; i++) f.sell([[f.coffee, 1]], m.id);
  card = memberCard(f.s, f.s.members[0]);
  assert.equal(card.fullCards, 1);
  assert.equal(card.current.no, 2);
  assert.equal(card.vouchers.at(-1)!.type, 'kopi');
});

test('members: a signed-up card waits for its first qualifying order', () => {
  const f = fixture();
  const guest: Actor = {
    id: 'guest-x',
    employeeId: '',
    name: 'Pelanggan',
    email: '',
    role: 'karyawan',
  };
  const r = apply(
    f.s,
    guest,
    'member.signup',
    { name: 'Bayu', phone: '0813 1111 2222' },
    morning,
  ) as {
    token: string;
  };
  assert.ok(r.token.length >= 20);
  const m = f.s.members[0];
  assert.equal(m.status, 'menunggu');
  f.sell([[f.bread, 1]], m.id);
  assert.equal(m.status, 'menunggu');
  f.sell([[f.coffee, 1]], m.id);
  assert.equal(m.status, 'aktif');
});

test('members: gifts need points and full cards, once a year, and cost their points', () => {
  const f = fixture();
  const m = join(f.s);
  apply(
    f.s,
    owner,
    'reward.save',
    {
      data: {
        year: 2026,
        type: 'tshirt',
        name: 'T-shirt WINDS LAB',
        image: '',
        points: 300,
        minCards: 2,
      },
    },
    morning,
  );
  const reward = f.s.memberRewards[0];
  for (let i = 0; i < 10; i++) f.sell([[f.coffee, 2]], m.id); // 360 points, 1 card
  assert.throws(
    () => apply(f.s, owner, 'member.claim', { memberId: m.id, rewardId: reward.id }, morning),
    /Kartu penuh kurang 1/,
  );
  for (let i = 0; i < 10; i++) f.sell([[f.coffee, 1]], m.id); // 2 cards
  apply(f.s, owner, 'member.claim', { memberId: m.id, rewardId: reward.id }, morning);
  const card = memberCard(f.s, f.s.members[0], morning);
  assert.equal(card.points, 360 + 180 - 300);
  assert.equal(card.rewards[0].claimed, true);
  assert.throws(
    () => apply(f.s, owner, 'member.claim', { memberId: m.id, rewardId: reward.id }, morning),
    /sudah menukar/,
  );
});

test('members: a cancelled order takes its stamp back', () => {
  const f = fixture();
  const m = join(f.s);
  const o = f.sell([[f.coffee, 1]], m.id);
  assert.equal(memberCard(f.s, f.s.members[0]).stampCount, 1);
  apply(
    f.s,
    owner,
    'order.status',
    { id: o.id, status: 'dibatalkan', reason: 'salah', refundRecorded: true },
    morning,
  );
  assert.equal(memberCard(f.s, f.s.members[0]).stampCount, 0);
});

test('members: points lapse after 12 quiet months, free drinks after 6', () => {
  const f = fixture();
  const m = join(f.s);
  for (let i = 0; i < 5; i++) f.sell([[f.coffee, 1]], m.id);
  const later = new Date('2027-05-01T08:00:00+08:00');
  let card = memberCard(f.s, f.s.members[0], later);
  assert.equal(card.points, 90);
  assert.equal(card.vouchers[0].status, 'hangus');
  card = memberCard(f.s, f.s.members[0], new Date('2027-11-01T08:00:00+08:00'));
  assert.equal(card.points, 0);
});
