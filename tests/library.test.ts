import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookCopies, daysLate, libraryTotals } from '../lib/library';
import { publicBooks } from '../lib/public-books';
import { blank } from '../lib/model';

const book = (id: string, totalCopies: number, status = 'tersedia') => ({
  id,
  title: id,
  author: 'A',
  category: 'Novel',
  shelfLocation: 'Rak A',
  totalCopies,
  status,
});
const loan = (bookId: string, returnDate: string | null = null, dueDate = '2026-11-05') => ({
  id: bookId + Math.random(),
  bookId,
  borrowerName: 'Rina',
  borrowerContact: '0812',
  dueDate,
  returnDate,
});

test('copies on loan and on the shelf', () => {
  const loans = [loan('a'), loan('a', '2026-11-04'), loan('b')];
  assert.deepEqual(bookCopies(book('a', 2), loans), {
    total: 2,
    borrowed: 1,
    available: 1,
    availability: 'tersedia',
  });
  assert.equal(bookCopies(book('b', 1), loans).availability, 'dipinjam');
  assert.equal(bookCopies(book('c', 1, 'pemeliharaan'), loans).available, 0);
  assert.equal(bookCopies(book('c', 1, 'hilang'), loans).availability, 'hilang');
});

test('catalogue totals count copies, and lost or maintained copies apart', () => {
  const s = blank();
  s.books = [book('a', 2), book('b', 1), book('c', 1, 'pemeliharaan')] as any;
  s.loans = [loan('a'), loan('b')] as any;
  const t = libraryTotals(publicBooks(s));
  assert.deepEqual(t, { titles: 3, copies: 4, available: 1, borrowed: 2, away: 1 });
});

test('public books never carry who borrowed them', () => {
  const s = blank();
  s.books = [book('a', 1)] as any;
  s.loans = [loan('a')] as any;
  const json = JSON.stringify(publicBooks(s));
  assert.ok(!json.includes('Rina') && !json.includes('0812'));
});

test('days late', () => {
  assert.equal(daysLate(loan('a', null, '2026-11-03'), '2026-11-06'), 3);
  assert.equal(daysLate(loan('a', null, '2026-11-06'), '2026-11-06'), 0);
  assert.equal(daysLate(loan('a', '2026-11-05', '2026-11-03'), '2026-11-06'), 0);
});
