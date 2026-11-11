import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../lib/engine';
import { initial, type Actor, type Row } from '../lib/model';
import { memberCard, memberRules } from '../lib/member';
import { isMemberCode, normalizeMemberCode } from '../lib/member-code';

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
  // Each sale lands on its own café day unless a test moves it: one stamp per day.
  let sales = 0;
  const sell = (
    items: [Row, number][],
    memberId: string,
    extra: Record<string, unknown> = {},
    now = morning,
  ) => {
    const order = apply(
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
    order.date = new Date(Date.UTC(2026, 9, 8 + sales++)).toISOString().slice(0, 10);
    return order;
  };
  return { s, coffee, matcha, tea, bread, sell, shift };
}
const join = (s: ReturnType<typeof fixture>['s'], phone = '0812 3456 7890') =>
  apply(s, owner, 'member.create', { name: 'Rina', phone }, morning) as { id: string };

test('members: phone numbers are normalised and unique', () => {
  const { s } = fixture();
  const m = join(s, '+62 812-3456-7890');
  assert.equal(s.members[0].phone, '081234567890');
  assert.ok(isMemberCode(s.members[0].code));
  assert.ok(m.id);
  assert.throws(() => join(s, '0812 3456 7890'), /sudah terdaftar/);
});

test('members: a stamp needs a paid drink or food of at least Rp15.000; points follow the menus', () => {
  const f = fixture();
  const m = join(f.s);
  f.sell([[f.tea, 1]], m.id); // drink under the minimum
  let card = memberCard(f.s, f.s.members[0]);
  assert.equal(card.stampCount, 0);
  assert.equal(card.points, 0);
  f.sell([[f.bread, 2]], m.id); // food only counts too
  f.sell(
    [
      [f.coffee, 2],
      [f.bread, 1],
    ],
    m.id,
  );
  card = memberCard(f.s, f.s.members[0]);
  assert.equal(card.stampCount, 2);
  assert.equal(card.points, 15 * 2 + 18 * 2 + 15);
  // Without food categories, food alone earns nothing.
  apply(f.s, owner, 'member.settings', { rules: { foodCategories: [] } }, morning);
  card = memberCard(f.s, f.s.members[0]);
  assert.equal(card.stampCount, 1);
  // A category is a drink or food, not both.
  assert.throws(
    () => apply(f.s, owner, 'member.settings', { rules: { foodCategories: ['kopi'] } }, morning),
    /sekaligus/,
  );
});

test('members: points are counted after a discount; menus can have their own points', () => {
  const f = fixture();
  const m = join(f.s);
  f.coffee.memberPoints = 30;
  f.sell([[f.coffee, 2]], m.id, { discount: 18000 }); // half price
  assert.equal(memberCard(f.s, f.s.members[0]).points, 30);
});

test('members: one stamp per day; later orders that day earn points only', () => {
  const f = fixture();
  const m = join(f.s);
  const first = f.sell([[f.coffee, 1]], m.id);
  const second = f.sell([[f.coffee, 1]], m.id);
  second.date = first.date;
  const third = f.sell([[f.tea, 1]], m.id); // under the minimum: nothing, as on any day
  third.date = first.date;
  let card = memberCard(f.s, f.s.members[0]);
  assert.equal(card.stampCount, 1);
  assert.equal(card.points, 36);
  assert.deepEqual(card.stampDays, [first.date]);
  // Cancelling the first order hands the day's stamp to the second.
  first.status = 'dibatalkan';
  card = memberCard(f.s, f.s.members[0]);
  assert.equal(card.stampCount, 1);
  assert.equal(card.points, 18);
  assert.equal(card.current.stamps[0].orderId, second.id);
  // The next day earns a stamp again.
  f.sell([[f.coffee, 1]], m.id);
  assert.equal(memberCard(f.s, f.s.members[0]).stampCount, 2);
});

test('members: stamp 5 takes money off, stamp 10 pays a drink up to the limit', () => {
  const f = fixture();
  const m = join(f.s);
  for (let i = 0; i < 5; i++) f.sell([[f.coffee, 1]], m.id);
  let card = memberCard(f.s, f.s.members[0]);
  const voucher = card.vouchers.find((v) => v.status === 'tersedia')!;
  assert.equal(voucher.type, 'potongan');
  // Rp5.000 off a paid order that still earns its stamp, with points after the discount.
  const before = card.points;
  const paid = f.sell([[f.coffee, 1]], m.id, {
    memberFree: { voucherId: voucher.id, code: f.s.members[0].code },
  });
  assert.equal(paid.discount, 5000);
  assert.equal(paid.total, 13000);
  card = memberCard(f.s, f.s.members[0]);
  assert.equal(card.stampCount, 6);
  assert.equal(card.points, before + Math.floor((18 * 13000) / 18000));
  assert.equal(card.vouchers[0].status, 'terpakai');
  assert.throws(
    () =>
      f.sell([[f.coffee, 1]], m.id, {
        memberFree: { voucherId: voucher.id, code: f.s.members[0].code },
      }),
    /sudah dipakai/,
  );
  for (let i = 0; i < 4; i++) f.sell([[f.coffee, 1]], m.id);
  card = memberCard(f.s, f.s.members[0]);
  assert.equal(card.fullCards, 1);
  assert.equal(card.current.no, 2);
  const drink = card.vouchers.at(-1)!;
  assert.equal(drink.type, 'minuman');
  // Not for food.
  assert.throws(
    () =>
      f.sell([[f.bread, 1]], m.id, {
        memberFree: { voucherId: drink.id, productId: f.bread.id, code: f.s.members[0].code },
      }),
    /menu minuman/,
  );
  // Any drink: a pricier one is paid up to the limit; the free drink earns nothing.
  const pricey = apply(
    f.s,
    owner,
    'save',
    {
      kind: 'products',
      data: { name: 'Mocktail', price: 23000, category: 'non_kopi', status: 'tersedia' },
    },
    morning,
  ) as Row;
  const stampsBefore = card.stampCount;
  const free = f.sell([[pricey, 1]], m.id, {
    memberFree: { voucherId: drink.id, productId: pricey.id, code: f.s.members[0].code },
  });
  assert.equal(free.discount, 20000);
  assert.equal(free.total, 3000);
  card = memberCard(f.s, f.s.members[0]);
  assert.equal(card.stampCount, stampsBefore);
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
  f.sell([[f.tea, 1]], m.id); // under the minimum
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
    /sudah ditukar/,
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

test('members: points lapse after 12 quiet months, stamp rewards after 6', () => {
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

test('members: a gift claimed on the card waits for staff, and can be cancelled', () => {
  const f = fixture();
  const m = join(f.s);
  apply(
    f.s,
    owner,
    'reward.save',
    { data: { year: 2026, type: 'stiker', name: 'Stiker', points: 50, minCards: 0 } },
    morning,
  );
  const reward = f.s.memberRewards[0];
  for (let i = 0; i < 3; i++) f.sell([[f.coffee, 1]], m.id); // 54 points
  const guest: Actor = {
    id: 'guest-y',
    employeeId: '',
    name: 'Pelanggan',
    email: '',
    role: 'karyawan',
  };
  const token = f.s.members[0].token;
  assert.throws(
    () =>
      apply(f.s, guest, 'member.request', { token: 'x'.repeat(24), rewardId: reward.id }, morning),
    /tidak ditemukan/,
  );
  const r = apply(f.s, guest, 'member.request', { token, rewardId: reward.id }, morning) as {
    id: string;
  };
  let card = memberCard(f.s, f.s.members[0], morning);
  assert.equal(card.points, 4);
  assert.equal(card.rewards[0].claimStatus, 'menunggu');
  assert.throws(
    () => apply(f.s, guest, 'member.request', { token, rewardId: reward.id }, morning),
    /sudah ditukar/,
  );
  apply(f.s, owner, 'member.unclaim', { id: r.id }, morning);
  card = memberCard(f.s, f.s.members[0], morning);
  assert.equal(card.points, 54);
  assert.equal(card.rewards[0].claimed, false);
  const again = apply(f.s, guest, 'member.request', { token, rewardId: reward.id }, morning) as {
    id: string;
  };
  // A cashier needs the whole card code; the admin hands over from the member list.
  const cashier: Actor = {
    ...owner,
    id: 'cashier-identity',
    employeeId: 'cashier',
    role: 'karyawan',
  };
  assert.throws(
    () => apply(f.s, cashier, 'member.handover', { id: again.id, code: '081234567890' }, morning),
    /kode kartu member lengkap/,
  );
  apply(f.s, owner, 'member.handover', { id: again.id }, morning);
  assert.equal(memberCard(f.s, f.s.members[0], morning).rewards[0].claimStatus, 'diserahkan');
  assert.throws(
    () => apply(f.s, owner, 'member.handover', { id: again.id }, morning),
    /sudah diserahkan/,
  );
});

test('members: the card design keeps safe colours and uploaded artwork only', () => {
  const { s } = fixture();
  apply(
    s,
    owner,
    'member.design',
    { design: { front: '/api/files/abc', inkColor: '#123456' } },
    morning,
  );
  assert.equal(s.settings[0].memberDesign.front, '/api/files/abc');
  assert.equal(s.settings[0].memberDesign.inkColor, '#123456');
  assert.equal(s.settings[0].memberDesign.textColor, '#f7efdf');
  assert.throws(() =>
    apply(s, owner, 'member.design', { design: { back: 'http://x.test/a.png' } }, morning),
  );
  assert.throws(() => apply(s, owner, 'member.design', { design: { inkColor: 'red' } }, morning));
});

test("members: drinks and coffee follow the café's own category names until the admin sets them", () => {
  const f = fixture();
  const cat = (name: string) =>
    apply(f.s, owner, 'save', { kind: 'categories', data: { name, sortOrder: 9 } }, morning) as Row;
  const ice = cat('Ice Coffee'),
    fresh = cat('Fresh Drink'),
    food = cat('Snack & Food');
  const rules = memberRules(f.s);
  assert.ok(rules.drinkCategories.includes(ice.id) && rules.drinkCategories.includes(fresh.id));
  assert.ok(!rules.drinkCategories.includes(food.id));
  assert.ok(rules.foodCategories.includes(food.id));
  assert.deepEqual(
    rules.coffeeCategories.filter((c) => [ice.id, fresh.id, food.id].includes(c)),
    [ice.id],
  );
  assert.ok(!rules.coffeeCategories.includes('non_kopi'));
  // A latte in a café category earns a stamp right away.
  const m = join(f.s);
  const latte = apply(
    f.s,
    owner,
    'save',
    {
      kind: 'products',
      data: { name: 'Es Kopi Susu', price: 20000, category: ice.id, status: 'tersedia' },
    },
    morning,
  ) as Row;
  f.sell([[latte, 1]], m.id);
  assert.equal(memberCard(f.s, f.s.members[0]).stampCount, 1);
});

test('members: saving the rules drops categories the café no longer has', () => {
  const f = fixture();
  const ice = apply(
    f.s,
    owner,
    'save',
    { kind: 'categories', data: { name: 'Ice Coffee', sortOrder: 9 } },
    morning,
  ) as Row;
  apply(
    f.s,
    owner,
    'member.settings',
    { rules: { drinkCategories: ['hilang', ice.id], coffeeCategories: ['hilang', ice.id] } },
    morning,
  );
  assert.deepEqual(f.s.settings[0].member.drinkCategories, [ice.id]);
  assert.deepEqual(memberRules(f.s).coffeeCategories, [ice.id]);
});

test('members: card codes are random, unique, and typed or scanned in any form', () => {
  const { s } = fixture();
  for (let i = 0; i < 40; i++) join(s, '0812' + String(10000000 + i));
  const codes = s.members.map((m) => m.code);
  assert.equal(new Set(codes).size, codes.length);
  assert.ok(codes.every(isMemberCode));
  assert.ok(codes.every((c) => !/[01IO]/.test(c.slice(4))));
  const code = codes[0];
  assert.equal(normalizeMemberCode(code.toLowerCase().replaceAll('-', ' ')), code);
  assert.equal(normalizeMemberCode(code.slice(4)), code);
  assert.equal(normalizeMemberCode('WSM-0001'), '');
  assert.equal(normalizeMemberCode('WSM-2345'), '');
  assert.ok(codes.every((c) => /^WSM-[A-Z2-9]{4}$/.test(c) && /[A-Z]/.test(c.slice(4))));
});

test('members: cards from before random codes get one, keeping their link', () => {
  const { s } = fixture();
  join(s);
  join(s, '0812 9999 0000');
  s.members[0].code = 'WSM-2345';
  const token = s.members[0].token;
  const system: Actor = { ...owner, role: 'system' };
  assert.throws(() => apply(s, owner, 'member.recode', {}, morning), /sistem/);
  const kept = s.members[1].code;
  apply(s, system, 'member.recode', {}, morning);
  assert.ok(isMemberCode(s.members[0].code));
  assert.equal(s.members[0].token, token);
  assert.equal(s.members[1].code, kept);
});

test('members: a gift at the till needs the whole card code', () => {
  const f = fixture();
  const m = join(f.s);
  for (let i = 0; i < 5; i++) f.sell([[f.coffee, 1]], m.id);
  const voucher = memberCard(f.s, f.s.members[0]).vouchers[0];
  for (const code of [undefined, '', '0812 3456 7890', 'WSM-0001'])
    assert.throws(
      () => f.sell([[f.coffee, 1]], m.id, { memberFree: { voucherId: voucher.id, code } }),
      /kode kartu member lengkap/,
    );
  const code = f.s.members[0].code.toLowerCase();
  assert.equal(
    f.sell([[f.coffee, 1]], m.id, { memberFree: { voucherId: voucher.id, code } }).discount,
    5000,
  );
});
