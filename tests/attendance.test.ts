import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blank } from '../lib/model';
import { monthAttendance, monthGrid, monthSummary, shiftMonth } from '../lib/attendance';

const shift = (id: string, date: string, employeeIds: string[], status = 'closed') => ({
  id,
  name: 'Pagi',
  date,
  startAt: date + 'T00:00:00Z',
  endAt: date + 'T07:00:00Z',
  employeeIds,
  status,
});

test('a month of attendance: present, sick, absent and still to come', () => {
  const s = blank();
  s.shifts = [
    shift('a', '2026-11-02', ['sari', 'budi']),
    shift('b', '2026-11-03', ['sari']),
    shift('c', '2026-11-20', ['sari'], 'planned'),
    shift('d', '2026-10-30', ['sari']),
  ] as any;
  s.attendance = [
    { id: '1', shiftId: 'a', employeeId: 'sari', status: 'hadir', checkIn: 'x' },
    { id: '2', shiftId: 'a', employeeId: 'budi', status: 'sakit' },
  ] as any;
  const days = monthAttendance(s, '2026-11', '2026-11-07');
  assert.deepEqual([...days.keys()], ['2026-11-02', '2026-11-03', '2026-11-20']);
  assert.deepEqual(
    days.get('2026-11-02')!.map((e) => [e.employeeId, e.status]),
    [
      ['sari', 'hadir'],
      ['budi', 'sakit'],
    ],
  );
  assert.equal(days.get('2026-11-03')![0].status, 'absen');
  assert.equal(days.get('2026-11-20')![0].status, 'terjadwal');
  const sum = monthSummary(days);
  assert.deepEqual(sum.get('sari'), {
    hadir: 1,
    sakit: 0,
    izin: 0,
    libur: 0,
    absen: 1,
    terjadwal: 1,
  });
  assert.equal(monthAttendance(s, '2026-11', '2026-11-07', 'budi').size, 1);
});

test('month grid starts on Monday and moves across years', () => {
  const g = monthGrid('2026-11'); // 1 Nov 2026 is a Sunday
  assert.equal(g.length % 7, 0);
  assert.equal(g.indexOf('2026-11-01'), 6);
  assert.equal(g.filter(Boolean).length, 30);
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
});
