import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hoursRange, openDays, openNow } from '../lib/hours';

// 2026-11-09 is a Monday; times below are WITA (UTC+8).
const at = (local: string) => new Date(local + '+08:00');

test('open within the day, closed outside it', () => {
  const h = { openTime: '10:00', closeTime: '22:00', closedDays: [] };
  assert.equal(openNow(h, at('2026-11-09T09:59:00')), false);
  assert.equal(openNow(h, at('2026-11-09T10:00:00')), true);
  assert.equal(openNow(h, at('2026-11-09T21:59:00')), true);
  assert.equal(openNow(h, at('2026-11-09T22:00:00')), false);
});

test('hours past midnight belong to the day they started', () => {
  const h = { openTime: '16:00', closeTime: '01:00', closedDays: ['senin'] };
  // Sunday night into Monday: still open after midnight.
  assert.equal(openNow(h, at('2026-11-09T00:30:00')), true);
  // Monday is closed, so Monday evening stays closed...
  assert.equal(openNow(h, at('2026-11-09T18:00:00')), false);
  // ...and so does the small hours of Tuesday.
  assert.equal(openNow(h, at('2026-11-10T00:30:00')), false);
  assert.equal(openNow(h, at('2026-11-10T18:00:00')), true);
});

test('no hours set means no status, and wording', () => {
  assert.equal(openNow({}), null);
  assert.equal(hoursRange({ openTime: '08:00', closeTime: '00:00' }), '08.00–24.00');
  assert.equal(openDays({ closedDays: [] }), 'Setiap hari');
  assert.equal(openDays({ closedDays: ['minggu', 'senin'] }), 'Tutup setiap Senin, Minggu');
});
