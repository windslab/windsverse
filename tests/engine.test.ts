import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, validateTiers } from '../lib/engine';
import { initial, shiftTotals, type Actor } from '../lib/model';
const owner: Actor = {
  id: 'owner-identity',
  employeeId: 'owner',
  name: 'Pemilik',
  email: 'owner@test.example',
  role: 'admin',
};
const morning = new Date('2026-10-08T08:30:00+07:00');
const morningOut = new Date('2026-10-08T15:30:00+07:00');
function fixture() {
  const s = initial(owner);
  apply(s, owner, 'demo', {}, morning);
  const emp = apply(
    s,
    owner,
    'save',
    {
      kind: 'employees',
      data: {
        name: 'Barista',
        email: 'staff@test.example',
        role: 'karyawan',
        status: 'aktif',
        phone: '',
        joinedAt: '2026-10-08',
      },
    },
    morning,
  );
  const staff: Actor = {
    id: 'staff-identity',
    employeeId: emp.id,
    name: emp.name,
    email: emp.email,
    role: 'karyawan',
  };
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
        employeeIds: [staff.employeeId],
      },
    },
    morning,
  );
  apply(s, staff, 'attendance.in', { shiftId: shift.id }, morning);
  return { s, staff, shift };
}
function sell(f: ReturnType<typeof fixture>, quantity = 1) {
  return apply(
    f.s,
    f.staff,
    'order.create',
    {
      shiftId: f.shift.id,
      items: [{ productId: f.s.products[0].id, quantity }],
      discount: 0,
      taxEnabled: true,
      paymentMethod: 'tunai',
      cashPaid: 1e7,
      orderType: 'takeaway',
      paid: true,
    },
    morning,
  );
}
function finish(f: ReturnType<typeof fixture>, o: any) {
  for (const status of ['sedang_dibuat', 'siap_disajikan', 'selesai'])
    apply(f.s, f.staff, 'order.status', { id: o.id, status }, morning);
}
test('tier boundaries have no Rp200001–200999 gap', () => {
  const f = fixture();
  f.s.orders.push({
    id: 'test',
    shiftId: f.shift.id,
    paid: true,
    status: 'selesai',
    subtotal: 200001,
    discount: 0,
    hpp: 0,
    tax: 0,
  });
  assert.equal(shiftTotals(f.s, f.shift).wage, 25000);
  assert.throws(
    () =>
      validateTiers([
        { id: 'a', min: 0, max: 200000, wage: 20000 },
        { id: 'b', min: 201000, max: null, wage: 25000 },
      ]),
    /tanpa celah/,
  );
});
test('server prices, HPP, stock and tax determine sale', () => {
  const f = fixture();
  const o = sell(f, 2);
  assert.equal(o.subtotal, 50000);
  assert.equal(o.hpp, 7240 * 2);
  assert.equal(o.tax, 5000);
  assert.equal(f.s.ingredients[0].stock, 4964);
  assert.equal(o.shiftId, f.shift.id);
});
test('shift profit excludes tax and deducts HPP and allocated costs', () => {
  const f = fixture();
  sell(f, 10);
  apply(
    f.s,
    owner,
    'save',
    {
      kind: 'expenses',
      data: {
        title: 'Es tambahan',
        amount: 10000,
        category: 'operasional',
        date: '2026-10-08',
        shiftId: f.shift.id,
        notes: '',
      },
    },
    morning,
  );
  const t = shiftTotals(f.s, f.shift);
  assert.equal(t.profit, 250000 - 72400 - 10000);
  assert.equal(t.wage, 20000);
});
test('stock purchase is not double-counted as HPP expense', () => {
  const f = fixture();
  sell(f);
  apply(
    f.s,
    owner,
    'save',
    {
      kind: 'expenses',
      data: {
        title: 'Beli susu',
        amount: 100000,
        category: 'bahan_baku',
        date: '2026-10-08',
        shiftId: f.shift.id,
        notes: '',
      },
    },
    morning,
  );
  assert.equal(shiftTotals(f.s, f.shift).costs, 0);
});
test('staff cannot escalate privileges or edit costs', () => {
  const f = fixture();
  assert.throws(() => apply(f.s, f.staff, 'save', { kind: 'employees', data: {} }), /Hanya admin/);
  assert.throws(() => apply(f.s, f.staff, 'tiers.replace', { rows: [] }), /Hanya admin/);
});
test('staff can maintain recipes, ingredients, books and expense notes', () => {
  const f = fixture();
  const ingredient = apply(
    f.s,
    f.staff,
    'save',
    {
      kind: 'ingredients',
      data: { name: 'Cokelat', unit: 'gram', unitCost: 100, stock: 1000, minStock: 100 },
    },
    morning,
  );
  assert.equal(ingredient.name, 'Cokelat');
  const recipe = apply(
    f.s,
    f.staff,
    'save',
    {
      kind: 'recipes',
      data: {
        productId: f.s.products[0].id,
        ingredients: [{ ingredientId: ingredient.id, amount: 10 }],
      },
    },
    morning,
  );
  assert.equal(recipe.ingredients[0].amount, 10);
  const book = apply(
    f.s,
    f.staff,
    'save',
    {
      kind: 'books',
      data: {
        title: 'Manual Barista',
        author: 'Tim',
        category: 'panduan',
        shelfLocation: 'Rak A',
        totalCopies: 1,
        status: 'tersedia',
      },
    },
    morning,
  );
  assert.equal(book.title, 'Manual Barista');
  const expense = apply(
    f.s,
    f.staff,
    'save',
    {
      kind: 'expenses',
      data: {
        title: 'Beli es',
        amount: 5000,
        category: 'bahan_baku',
        date: '2026-10-08',
        shiftId: f.shift.id,
        notes: 'Struk kasir',
      },
    },
    morning,
  );
  assert.equal(expense.amount, 5000);
  assert.throws(
    () => apply(f.s, f.staff, 'delete', { kind: 'expenses', id: expense.id }, morning),
    /Hanya admin/,
  );
});
test('bulk roster rotates groups weekly and skips selected days off', () => {
  const s = initial(owner);
  const a = apply(
    s,
    owner,
    'save',
    {
      kind: 'employees',
      data: { name: 'A', role: 'karyawan', status: 'aktif', joinedAt: '2026-10-01' },
    },
    morning,
  );
  const b = apply(
    s,
    owner,
    'save',
    {
      kind: 'employees',
      data: { name: 'B', role: 'karyawan', status: 'aktif', joinedAt: '2026-10-01' },
    },
    morning,
  );
  const result = apply(
    s,
    owner,
    'roster.bulk',
    {
      mode: 'rotasi',
      startDate: '2026-10-05',
      endDate: '2026-10-18',
      employeeIds: [a.id],
      rotationEmployeeIds: [b.id],
      offDays: ['0'],
      shiftAName: 'Shift pagi',
      shiftAStart: '08:00',
      shiftAEnd: '16:00',
      shiftBName: 'Shift malam',
      shiftBStart: '16:00',
      shiftBEnd: '23:00',
    },
    morning,
  );
  assert.equal(result.count, 24);
  assert.equal(
    s.shifts.find((sh) => sh.date === '2026-10-05' && sh.name === 'Shift pagi')?.employeeIds[0],
    a.id,
  );
  assert.equal(
    s.shifts.find((sh) => sh.date === '2026-10-12' && sh.name === 'Shift pagi')?.employeeIds[0],
    b.id,
  );
  assert.equal(
    s.shifts.some((sh) => sh.date === '2026-10-11'),
    false,
  );
  assert.equal(
    s.shifts.some((sh) => sh.date === '2026-10-18'),
    false,
  );
});
test('overlapping roster is rejected', () => {
  const f = fixture();
  assert.throws(
    () =>
      apply(f.s, owner, 'save', {
        kind: 'shifts',
        data: {
          name: 'Bentrok',
          startAt: '2026-10-08T15:00:00+07:00',
          endAt: '2026-10-08T23:00:00+07:00',
          employeeIds: [f.staff.employeeId],
        },
      }),
    /bertumpang tindih/,
  );
});
test('duplicate attendance and insufficient stock rejected', () => {
  const f = fixture();
  assert.throws(
    () => apply(f.s, f.staff, 'attendance.in', { shiftId: f.shift.id }, morning),
    /sudah tercatat/,
  );
  f.s.ingredients[0].stock = 1;
  assert.throws(() => sell(f), /tidak cukup/);
});
test('staff checks in only on a shift today; admin may backfill and edit past attendance', () => {
  const f = fixture();
  const past = new Date('2026-10-10T12:00:00+02:00');
  const old = apply(
    f.s,
    owner,
    'save',
    {
      kind: 'shifts',
      data: {
        name: 'Shift lama',
        startAt: '2026-10-05T08:00:00+07:00',
        endAt: '2026-10-05T16:00:00+07:00',
        employeeIds: [f.staff.employeeId],
      },
    },
    morning,
  );
  assert.throws(() => apply(f.s, f.staff, 'attendance.in', { shiftId: old.id }, past), /hari ini/);
  const entry = apply(
    f.s,
    owner,
    'attendance.correct',
    {
      shiftId: old.id,
      employeeId: f.staff.employeeId,
      status: 'hadir',
      checkIn: '2026-10-05T08:05:00+07:00',
      checkOut: '2026-10-05T15:55:00+07:00',
      reason: 'Lupa check-in',
    },
    past,
  );
  const attendanceId = f.s.attendance.find(
    (x) => x.shiftId === old.id && x.employeeId === f.staff.employeeId,
  )?.id;
  assert.equal(
    f.s.attendance.find((x) => x.id === attendanceId)?.checkOut,
    '2026-10-05T15:55:00+07:00',
  );
  assert.equal(old.status, 'closed');
  apply(
    f.s,
    owner,
    'attendance.correct',
    {
      id: attendanceId,
      shiftId: old.id,
      employeeId: f.staff.employeeId,
      status: 'hadir',
      checkIn: '2026-10-05T08:10:00+07:00',
      checkOut: '2026-10-05T15:55:00+07:00',
      reason: 'Koreksi',
    },
    past,
  );
  assert.equal(
    f.s.attendance.find((x) => x.id === attendanceId)?.checkIn,
    '2026-10-05T08:10:00+07:00',
  );
  apply(f.s, owner, 'attendance.delete', { id: attendanceId, reason: 'Test' }, past);
  assert.equal(
    f.s.attendance.some((x) => x.id === attendanceId),
    false,
  );
});
test('current-day check-in automatically starts the shift and check-out automatically finishes it', () => {
  const s = initial(owner);
  apply(s, owner, 'demo', {}, morning);
  const emp = apply(
    s,
    owner,
    'save',
    {
      kind: 'employees',
      data: { name: 'Barista', role: 'karyawan', status: 'aktif', joinedAt: '2026-10-08' },
    },
    morning,
  );
  const staff: Actor = {
    id: 'staff-current',
    employeeId: emp.id,
    name: emp.name,
    email: '',
    role: 'karyawan',
  };
  const sh = apply(
    s,
    owner,
    'save',
    {
      kind: 'shifts',
      data: {
        name: 'Pagi',
        startAt: '2026-10-08T08:00:00+07:00',
        endAt: '2026-10-08T16:00:00+07:00',
        employeeIds: [emp.id],
      },
    },
    morning,
  );
  apply(s, staff, 'attendance.in', { shiftId: sh.id }, morning);
  assert.equal(sh.status, 'open');
  apply(s, staff, 'attendance.out', { id: s.attendance[0].id }, morningOut);
  assert.equal(sh.status, 'closed');
  assert.equal(s.attendance[0].checkOut, morningOut.toISOString());
});
test('unpaid orders cannot enter production or count as income', () => {
  const f = fixture();
  const o = apply(
    f.s,
    f.staff,
    'order.create',
    {
      shiftId: f.shift.id,
      items: [{ productId: f.s.products[0].id, quantity: 1 }],
      orderType: 'takeaway',
      paid: false,
    },
    morning,
  );
  assert.equal(shiftTotals(f.s, f.shift).revenue, 0);
  assert.throws(
    () => apply(f.s, f.staff, 'order.status', { id: o.id, status: 'sedang_dibuat' }),
    /tidak valid/,
  );
});
test('cancellation restores stock once and removes recognized income', () => {
  const f = fixture();
  const before = f.s.ingredients[0].stock;
  const o = sell(f);
  assert.throws(
    () => apply(f.s, owner, 'order.status', { id: o.id, status: 'dibatalkan', reason: 'Salah' }),
    /pengembalian/,
  );
  apply(
    f.s,
    owner,
    'order.status',
    { id: o.id, status: 'dibatalkan', reason: 'Salah', refundRecorded: true },
    morning,
  );
  assert.equal(f.s.ingredients[0].stock, before);
  assert.equal(shiftTotals(f.s, f.shift).revenue, 0);
  assert.throws(
    () =>
      apply(f.s, owner, 'order.status', {
        id: o.id,
        status: 'dibatalkan',
        reason: 'Ulang',
        refundRecorded: true,
      }),
    /tidak diperbolehkan/,
  );
});
test('closed shift preserves historic HPP and refreshes admin cost corrections', () => {
  const f = fixture();
  const o = sell(f);
  finish(f, o);
  assert.throws(() => apply(f.s, owner, 'shift.close', { id: f.shift.id }), /absen keluar/);
  apply(f.s, f.staff, 'attendance.out', { id: f.s.attendance[0].id }, morningOut);
  const snap = f.shift.snapshot.profit;
  f.s.ingredients[0].unitCost = 99999;
  assert.equal(f.shift.snapshot.profit, snap);
  assert.equal(f.shift.snapshot.employees[0].wage, 20000);
  apply(
    f.s,
    owner,
    'save',
    {
      kind: 'expenses',
      data: {
        title: 'Terlambat',
        amount: 1000,
        date: '2026-10-08',
        category: 'operasional',
        shiftId: f.shift.id,
      },
    },
    morning,
  );
  assert.equal(f.shift.snapshot.profit, snap - 1000);
});
test('overnight shift retains business date, morning revenue is separate', () => {
  const f = fixture();
  finish(f, sell(f));
  apply(f.s, f.staff, 'attendance.out', { id: f.s.attendance[0].id }, morningOut);
  const sh = apply(f.s, owner, 'save', {
    kind: 'shifts',
    data: {
      name: 'Malam',
      startAt: '2026-10-08T20:00:00+07:00',
      endAt: '2026-10-09T04:00:00+07:00',
      employeeIds: [f.staff.employeeId],
    },
  });
  const night = new Date('2026-10-09T00:30:00+07:00');
  apply(f.s, owner, 'shift.open', { id: sh.id }, night);
  apply(f.s, f.staff, 'attendance.in', { shiftId: sh.id }, night);
  const o = apply(
    f.s,
    f.staff,
    'order.create',
    {
      shiftId: sh.id,
      items: [{ productId: f.s.products[0].id, quantity: 13 }],
      orderType: 'takeaway',
      paid: true,
      paymentMethod: 'qris',
    },
    night,
  );
  assert.equal(o.date, '2026-10-08');
  assert.equal(shiftTotals(f.s, sh).wage, 25000);
  assert.equal(f.shift.snapshot.wage, 20000);
});
test('paid payroll cannot be regenerated', () => {
  const f = fixture();
  finish(f, sell(f));
  apply(f.s, f.staff, 'attendance.out', { id: f.s.attendance[0].id }, morningOut);
  apply(f.s, owner, 'payroll.generate', { period: '2026-10' });
  assert.equal(f.s.payrolls[0].base, 20000);
  assert.equal(f.s.payrolls[0].bonus, 0);
  apply(f.s, owner, 'payroll.pay', { id: f.s.payrolls[0].id });
  assert.throws(() => apply(f.s, owner, 'payroll.generate', { period: '2026-10' }), /dikunci/);
});
test('loan return cannot increase stock twice', () => {
  const f = fixture();
  const b = apply(f.s, owner, 'save', {
    kind: 'books',
    data: {
      title: 'Kopi',
      author: 'Penulis',
      category: 'kopi',
      shelfLocation: 'A1',
      totalCopies: 1,
    },
  });
  apply(
    f.s,
    f.staff,
    'book.borrow',
    {
      bookId: b.id,
      borrowerName: 'Tamu',
      borrowerContact: 'Meja 1',
      borrowerType: 'pengunjung',
      dueDate: '2026-10-10',
    },
    morning,
  );
  assert.throws(
    () =>
      apply(
        f.s,
        f.staff,
        'book.borrow',
        {
          bookId: b.id,
          borrowerName: 'Lain',
          borrowerContact: '2',
          borrowerType: 'pengunjung',
          dueDate: '2026-10-10',
        },
        morning,
      ),
    /tidak tersedia/,
  );
  apply(f.s, f.staff, 'book.return', { id: f.s.loans[0].id }, morning);
  assert.throws(
    () => apply(f.s, f.staff, 'book.return', { id: f.s.loans[0].id }, morning),
    /sudah dikembalikan/,
  );
});
test('full backup restores operational history into an empty cafe', () => {
  const f = fixture();
  finish(f, sell(f));
  apply(f.s, f.staff, 'attendance.out', { id: f.s.attendance[0].id }, morningOut);
  apply(f.s, owner, 'payroll.generate', { period: '2026-10' });
  const restored = initial(owner);
  apply(restored, owner, 'backup.restore', { backup: { format: 'winds-space-v1', data: f.s } });
  assert.equal(restored.orders.length, 1);
  assert.equal(restored.shifts[0].snapshot.profit, 17760);
  assert.equal(restored.payrolls[0].base, 20000);
  assert.equal(restored.employees.find((e) => e.id === 'owner')?.email, owner.email);
});
test('backup rejects tampered invoice totals and nonempty operational target', () => {
  const f = fixture();
  sell(f);
  const bad = structuredClone(f.s);
  bad.orders[0].total = 1;
  assert.throws(
    () =>
      apply(initial(owner), owner, 'backup.restore', {
        backup: { format: 'winds-space-v1', data: bad },
      }),
    /tidak cocok/,
  );
  assert.throws(
    () => apply(f.s, owner, 'backup.restore', { backup: { format: 'winds-space-v1', data: f.s } }),
    /sebelum operasional/,
  );
});
test('cost edits invalidate unpaid payroll', () => {
  const f = fixture();
  finish(f, sell(f));
  apply(f.s, f.staff, 'attendance.out', { id: f.s.attendance[0].id }, morningOut);
  apply(f.s, owner, 'payroll.generate', { period: '2026-10' });
  assert.equal(f.s.payrolls.length, 1);
  apply(f.s, owner, 'save', {
    kind: 'expenses',
    data: { title: 'Listrik', amount: 1000, category: 'utilitas', date: '2026-10-08', shiftId: '' },
  });
  assert.equal(f.s.payrolls.length, 0);
});
test('admin can delete a test shift together with its activity', () => {
  const f = fixture();
  const stockBeforeSale = f.s.ingredients[0].stock;
  const order = sell(f);
  finish(f, order);
  apply(
    f.s,
    owner,
    'save',
    {
      kind: 'expenses',
      data: {
        title: 'Biaya tes',
        amount: 1000,
        category: 'operasional',
        date: '2026-10-08',
        shiftId: f.shift.id,
        notes: '',
      },
    },
    morning,
  );
  assert.equal(f.s.orders.length, 1);
  assert.equal(f.s.attendance.length, 1);
  assert.equal(f.s.expenses.length, 1);
  apply(f.s, owner, 'delete', { kind: 'shifts', id: f.shift.id }, morning);
  assert.equal(f.s.shifts.length, 0);
  assert.equal(f.s.orders.length, 0);
  assert.equal(f.s.attendance.length, 0);
  assert.equal(f.s.expenses.length, 0);
  assert.equal(f.s.ingredients[0].stock, stockBeforeSale);
});
test('staff can record paid order on a past planned shift without opening it', () => {
  const s = initial(owner);
  apply(s, owner, 'demo', {}, morning);
  const emp = apply(
    s,
    owner,
    'save',
    {
      kind: 'employees',
      data: { name: 'Azwar', role: 'karyawan', status: 'aktif', joinedAt: '2026-10-01' },
    },
    morning,
  );
  const staff: Actor = {
    id: 'azwar-user',
    employeeId: emp.id,
    name: emp.name,
    email: '',
    role: 'karyawan',
  };
  const shift = apply(
    s,
    owner,
    'save',
    {
      kind: 'shifts',
      data: {
        name: 'Shift pagi',
        startAt: '2026-10-05T08:00:00+07:00',
        endAt: '2026-10-05T16:00:00+07:00',
        employeeIds: [emp.id],
      },
    },
    morning,
  );
  const order = apply(
    s,
    staff,
    'order.create',
    {
      shiftId: shift.id,
      items: [{ productId: s.products[0].id, quantity: 1 }],
      discount: 0,
      taxEnabled: true,
      paymentMethod: 'tunai',
      cashPaid: 100000,
      orderType: 'takeaway',
      paid: true,
    },
    new Date('2026-10-10T12:00:00+02:00'),
  );
  assert.equal(order.date, '2026-10-05');
  assert.equal(order.status, 'selesai');
  assert.equal(order.historicalEntry, true);
  assert.equal(shift.status, 'closed');
  assert.equal(shift.snapshot.revenue, 25000);
});
test('deleting a shift invalidates unpaid payroll but keeps paid periods locked', () => {
  const f = fixture();
  finish(f, sell(f));
  apply(f.s, f.staff, 'attendance.out', { id: f.s.attendance[0].id }, morningOut);
  apply(f.s, owner, 'payroll.generate', { period: '2026-10' }, morningOut);
  apply(f.s, owner, 'delete', { kind: 'shifts', id: f.shift.id }, morning);
  assert.equal(f.s.shifts.length, 0);
  assert.equal(f.s.payrolls.length, 0);
  const locked = fixture();
  finish(locked, sell(locked));
  apply(locked.s, locked.staff, 'attendance.out', { id: locked.s.attendance[0].id }, morningOut);
  apply(locked.s, owner, 'payroll.generate', { period: '2026-10' }, morning);
  apply(locked.s, owner, 'payroll.pay', { id: locked.s.payrolls[0].id }, morningOut);
  assert.throws(
    () => apply(locked.s, owner, 'delete', { kind: 'shifts', id: locked.shift.id }, morning),
    /dibayar dan dikunci/,
  );
  assert.equal(locked.s.shifts.length, 1);
});
test('employees without email survive backup restore', () => {
  const s = initial(owner);
  for (const name of ['Pagi', 'Malam'])
    apply(s, owner, 'save', {
      kind: 'employees',
      data: { name, role: 'karyawan', status: 'aktif', joinedAt: '2026-10-09' },
    });
  const restored = initial(owner);
  apply(restored, owner, 'backup.restore', { backup: { format: 'winds-space-v1', data: s } });
  assert.equal(restored.employees.length, 3);
  assert.equal(restored.employees.filter((e) => e.email === '').length, 2);
});
test('admin cannot disable or demote their own account', () => {
  const s = initial(owner);
  for (const change of [{ role: 'karyawan' }, { status: 'nonaktif' }])
    assert.throws(
      () =>
        apply(s, owner, 'save', {
          kind: 'employees',
          id: 'owner',
          data: { ...s.employees[0], ...change },
        }),
      /akunnya sendiri/,
    );
});
