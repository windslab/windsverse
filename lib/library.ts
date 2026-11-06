import type { Row } from './model';

export type Availability = 'tersedia' | 'dipinjam' | 'perawatan' | 'hilang';

/** Copies on the shelf and on loan for one book; lost or maintained books lend nothing. */
export function bookCopies(book: Row, loans: Row[]) {
  const total = Number(book.totalCopies) || 0;
  const borrowed = loans.filter((l) => l.bookId === book.id && !l.returnDate).length;
  const available = book.status === 'tersedia' ? Math.max(0, total - borrowed) : 0;
  const availability: Availability =
    book.status === 'pemeliharaan'
      ? 'perawatan'
      : book.status === 'hilang'
        ? 'hilang'
        : available > 0
          ? 'tersedia'
          : 'dipinjam';
  return { total, borrowed, available, availability };
}

/** Totals for a catalogue, counted in copies, plus how many titles it holds. */
export function libraryTotals(
  books: { totalCopies: number; borrowed: number; available: number; status: string }[],
) {
  let copies = 0,
    available = 0,
    borrowed = 0,
    away = 0;
  for (const b of books) {
    copies += b.totalCopies;
    available += b.available;
    borrowed += b.borrowed;
    if (b.status !== 'tersedia') away += Math.max(0, b.totalCopies - b.borrowed);
  }
  return { titles: books.length, copies, available, borrowed, away };
}

/** Whole days a loan is past its due date; 0 when on time or returned. */
export function daysLate(loan: Row, today: string) {
  if (loan.returnDate || loan.dueDate >= today) return 0;
  return Math.round(
    (new Date(today + 'T00:00:00Z').getTime() - new Date(loan.dueDate + 'T00:00:00Z').getTime()) /
      86400000,
  );
}

export const availabilityText = (b: {
  available: number;
  totalCopies: number;
  availability: Availability;
}) =>
  b.availability === 'tersedia'
    ? `${b.available} dari ${b.totalCopies} tersedia`
    : b.availability === 'perawatan'
      ? 'Dalam perawatan'
      : b.availability === 'hilang'
        ? 'Belum tersedia'
        : 'Sedang dipinjam';
