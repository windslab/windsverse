import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../lib/engine';
import { initial, type Actor, type Row } from '../lib/model';
import { memberCard, upcomingReward } from '../lib/member';
import { isInviteCode, normalizeInviteCode, REFERRAL_MONTHLY_CAP } from '../lib/referral';

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
    americano = product('Americano', 22000, 'kopi'),
    tea = product('Teh Tawar', 10000, 'non_kopi');
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
  // Every order lands on a new café day (the shift's date moves on), so each can earn a stamp.
  let day = 0;
  const sell = (items: [Row, number][], memberId: string, extra: Record<string, unknown> = {}) => {
    shift.date = new Date(Date.UTC(2026, 9, 8 + day++)).toISOString().slice(0, 10);
    return apply(
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
      morning,
    ) as Row;
  };
  const join = (name: string, phone: string, inviteCode = '') =>
    apply(s, owner, 'member.create', { name, phone, inviteCode }, morning) as {
      id: string;
      code: string;
    };
  const member = (id: string) => s.members.find((m) => m.id === id)!;
  const nextDay = () => new Date(Date.UTC(2026, 9, 8 + day)).toISOString().slice(0, 10);
  return { s, coffee, americano, tea, sell, join, member, nextDay, shift };
}

test('stamp rewards: stamp 5 comes off the very order that earns it', () => {
  const f = fixture();
  const m = f.join('Rina', '081200000001');
  for (let i = 0; i < 4; i++) f.sell([[f.coffee, 1]], m.id);
  const items = [{ productId: f.coffee.id, quantity: 1, price: 18000 }];
  const next = upcomingReward(f.s, f.member(m.id), items, f.nextDay());
  assert.deepEqual(next, { id: 'c1-5', type: 'potongan', slot: 5 });
  const o = f.sell([[f.coffee, 1]], m.id, {
    memberFree: { voucherId: 'c1-5', productId: '', code: m.code },
  });
  assert.equal(o.discount, 5000);
  assert.equal(o.total, 13000);
  const card = memberCard(f.s, f.member(m.id));
  assert.equal(card.stampCount, 5);
  assert.equal(card.vouchers.find((v) => v.id === 'c1-5')?.status, 'terpakai');
});

test('stamp rewards: stamp 10 makes the one drink of that order free, and still stamps it', () => {
  const f = fixture();
  const m = f.join('Rina', '081200000001');
  for (let i = 0; i < 9; i++) f.sell([[f.coffee, 1]], m.id);
  const o = f.sell([[f.americano, 1]], m.id, {
    memberFree: { voucherId: 'c1-10', productId: f.americano.id, code: m.code },
  });
  assert.equal(o.discount, 20000);
  assert.equal(o.total, 2000);
  const card = memberCard(f.s, f.member(m.id));
  assert.equal(card.stampCount, 10);
  assert.equal(card.fullCards, 1);
  assert.equal(card.vouchers.find((v) => v.id === 'c1-10')?.status, 'terpakai');
  // Stamp 5 of that card was used later, the old way: it is still there.
  assert.equal(card.vouchers.find((v) => v.id === 'c1-5')?.status, 'tersedia');
});

test('stamp rewards: no reward at once on a day that already has its stamp, nor twice', () => {
  const f = fixture();
  const m = f.join('Rina', '081200000001');
  for (let i = 0; i < 4; i++) f.sell([[f.coffee, 1]], m.id);
  const items = [{ productId: f.coffee.id, quantity: 1, price: 18000 }];
  const card = memberCard(f.s, f.member(m.id));
  assert.equal(upcomingReward(f.s, f.member(m.id), items, card.stampDays[0]), null);
  // Too cheap to earn a stamp: no reward either.
  assert.equal(
    upcomingReward(
      f.s,
      f.member(m.id),
      [{ productId: f.tea.id, quantity: 1, price: 10000 }],
      f.nextDay(),
    ),
    null,
  );
  // An unpaid order holding it: a second order cannot take it again.
  f.sell([[f.coffee, 1]], m.id, {
    paid: false,
    memberFree: { voucherId: 'c1-5', productId: '', code: m.code },
  });
  assert.equal(upcomingReward(f.s, f.member(m.id), items, f.nextDay()), null);
  assert.throws(
    () =>
      f.sell([[f.coffee, 1]], m.id, {
        memberFree: { voucherId: 'c1-5', productId: '', code: m.code },
      }),
    /sudah dipakai/,
  );
});

test('referrals: every card has an invite code apart from its card code', () => {
  const f = fixture();
  const a = f.join('Andi', '081200000001');
  const card = f.member(a.id);
  assert.ok(isInviteCode(card.inviteCode));
  assert.notEqual(card.inviteCode, card.code);
  assert.equal(
    normalizeInviteCode(' ajak ' + card.inviteCode.slice(5).toLowerCase()),
    card.inviteCode,
  );
  assert.throws(() => f.join('Budi', '081200000002', 'AJAK-ZZZZ'), /tidak ditemukan/);
  // Older cards get theirs from the system pass that also fixes old card codes.
  delete f.member(a.id).inviteCode;
  apply(f.s, { ...owner, role: 'system' }, 'member.recode', {}, morning);
  assert.ok(isInviteCode(f.member(a.id).inviteCode));
});

test('referrals: both get a bonus stamp once the friend pays an order that earns a stamp', () => {
  const f = fixture();
  const a = f.join('Andi', '081200000001');
  const b = f.join('Budi', '081200000002', f.member(a.id).inviteCode);
  assert.equal(f.s.referrals.length, 1);
  assert.equal(memberCard(f.s, f.member(a.id)).stampCount, 0);
  f.sell([[f.tea, 1]], b.id); // too cheap: does not count yet
  assert.equal(f.s.referrals[0].activatedAt, null);
  const first = f.sell([[f.coffee, 1]], b.id);
  assert.equal(f.s.referrals[0].orderId, first.id);
  assert.equal(memberCard(f.s, f.member(b.id)).stampCount, 2); // own stamp + bonus
  assert.equal(memberCard(f.s, f.member(a.id)).stampCount, 1);
  assert.equal(memberCard(f.s, f.member(a.id)).referral.active, 1);
  // Cancelling that order takes it back.
  apply(
    f.s,
    owner,
    'order.status',
    { id: first.id, status: 'dibatalkan', reason: 'uji', refundRecorded: true },
    morning,
  );
  assert.equal(f.s.referrals[0].activatedAt, null);
  assert.equal(memberCard(f.s, f.member(a.id)).stampCount, 0);
});

test('referrals: a free drink for every third friend, at most five rewarded friends a month', () => {
  const f = fixture();
  const a = f.join('Andi', '081200000001');
  const code = f.member(a.id).inviteCode;
  for (let i = 0; i < REFERRAL_MONTHLY_CAP + 1; i++) {
    const friend = f.join('Teman ' + i, '08130000000' + i, code);
    f.sell([[f.coffee, 1]], friend.id);
  }
  const card = memberCard(f.s, f.member(a.id));
  assert.equal(card.referral.active, REFERRAL_MONTHLY_CAP + 1);
  assert.equal(card.stampCount, REFERRAL_MONTHLY_CAP); // the sixth is past the cap
  assert.equal(f.s.referrals.filter((r) => r.rewarded).length, REFERRAL_MONTHLY_CAP);
  const drink = card.vouchers.find((v) => v.id === 'r1');
  assert.equal(drink?.status, 'tersedia');
  assert.equal(card.referral.title, 'Wind Caller');
  // The drink is used like any stamp reward.
  const o = f.sell([[f.americano, 1]], a.id, {
    memberFree: { voucherId: 'r1', productId: f.americano.id, code: f.member(a.id).code },
  });
  assert.equal(o.total, 2000);
  assert.equal(
    memberCard(f.s, f.member(a.id)).vouchers.find((v) => v.id === 'r1')?.status,
    'terpakai',
  );
});

test('staff see every member card as the admin does, without other shifts in their order list', async () => {
  const { visible } = await import('../lib/visible');
  const f = fixture();
  const m = f.join('Fajar', '081200000009');
  const staffActor: Actor = {
    id: 'employee:fayza',
    employeeId: 'fayza',
    name: 'Fayza',
    email: '',
    role: 'karyawan',
  };
  // Seven visits on shifts Fayza did not work, one of them with a stamp reward used.
  for (let i = 0; i < 7; i++) f.sell([[f.coffee, 1]], m.id);
  f.shift.status = 'closed';
  const seen = visible(f.s, staffActor);
  assert.equal(seen.orders.filter((o) => !o.memberOnly).length, 0);
  const asAdmin = memberCard(f.s, f.member(m.id));
  const asStaff = memberCard(seen, seen.members.find((x) => x.id === m.id)!);
  assert.equal(asStaff.stampCount, asAdmin.stampCount);
  assert.equal(asStaff.points, asAdmin.points);
  assert.deepEqual(asStaff.vouchers, asAdmin.vouchers);
  // Only what the card needs: no totals, payment or cashier.
  const o = seen.orders[0];
  assert.equal(o.total, undefined);
  assert.equal(o.paymentMethod, undefined);
  assert.equal(o.cashierId, undefined);
});
