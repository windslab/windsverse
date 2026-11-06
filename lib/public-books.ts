import type { State } from './model';
import { bookCopies, type Availability } from './library';

export type PublicBook = {
  id: string;
  title: string;
  author: string;
  category: string;
  shelfLocation: string;
  totalCopies: number;
  available: number;
  borrowed: number;
  availability: Availability;
  publisher: string;
  year: string;
  synopsis: string;
  image: string;
  status: string;
};

// Only the catalogue and aggregate counts are public; who borrowed a book never leaves the cafe.
export function publicBooks(state: State): PublicBook[] {
  return state.books
    .map((book) => {
      const copies = bookCopies(book, state.loans);
      return {
        id: book.id,
        title: book.title,
        author: book.author,
        category: book.category,
        shelfLocation: book.shelfLocation,
        totalCopies: copies.total,
        available: copies.available,
        borrowed: copies.borrowed,
        availability: copies.availability,
        publisher: book.publisher || '',
        year: book.year || '',
        synopsis: book.synopsis || '',
        image: book.image || '',
        status: book.status,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'id'));
}
