import type { State } from './model';

export type PublicBook = {
  id: string;
  title: string;
  author: string;
  category: string;
  shelfLocation: string;
  totalCopies: number;
  available: number;
  publisher: string;
  year: string;
  synopsis: string;
  image: string;
  status: string;
};

// Only the catalogue and an aggregate availability count are public.
export function publicBooks(state: State): PublicBook[] {
  const borrowed = new Map<string, number>();
  for (const loan of state.loans)
    if (!loan.returnDate) borrowed.set(loan.bookId, (borrowed.get(loan.bookId) || 0) + 1);
  return state.books
    .map((book) => ({
      id: book.id,
      title: book.title,
      author: book.author,
      category: book.category,
      shelfLocation: book.shelfLocation,
      totalCopies: book.totalCopies,
      available:
        book.status === 'tersedia'
          ? Math.max(0, book.totalCopies - (borrowed.get(book.id) || 0))
          : 0,
      publisher: book.publisher || '',
      year: book.year || '',
      synopsis: book.synopsis || '',
      image: book.image || '',
      status: book.status,
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'id'));
}
