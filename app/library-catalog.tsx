'use client';
import { useState } from 'react';
import { BookOpen, Search } from 'lucide-react';
import type { PublicBook } from '@/lib/public-books';
import { availabilityText, libraryTotals } from '@/lib/library';

type Filter = 'semua' | 'tersedia' | 'dipinjam';

/** The cafe library as guests see it: totals, filters and the shelf. Read only. */
export default function LibraryCatalog({ books, query }: { books: PublicBook[]; query?: string }) {
  const [own, setOwn] = useState(''),
    [category, setCategory] = useState('semua'),
    [filter, setFilter] = useState<Filter>('semua');
  const totals = libraryTotals(books);
  const categories = [...new Set(books.map((b) => b.category).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'id'),
  );
  const term = (query ?? own).trim().toLocaleLowerCase('id');
  const shown = books.filter(
    (b) =>
      (category === 'semua' || b.category === category) &&
      (filter === 'semua' ||
        (filter === 'tersedia' ? b.availability === 'tersedia' : b.borrowed > 0)) &&
      [b.title, b.author, b.category, b.shelfLocation].some((v) =>
        v?.toLocaleLowerCase('id').includes(term),
      ),
  );
  return (
    <div className="library">
      <dl className="library-stats">
        <div>
          <dt>Judul buku</dt>
          <dd>{totals.titles}</dd>
        </div>
        <div>
          <dt>Total eksemplar</dt>
          <dd>{totals.copies}</dd>
        </div>
        <div>
          <dt>Tersedia</dt>
          <dd>{totals.available}</dd>
        </div>
        <div>
          <dt>Sedang dipinjam</dt>
          <dd>{totals.borrowed}</dd>
        </div>
      </dl>
      {query === undefined && (
        <label className="catalog-search">
          <Search size={17} />
          <span className="sr-only">Cari buku, penulis, kategori, atau rak</span>
          <input
            placeholder="Cari judul, penulis, atau kategori…"
            value={own}
            onChange={(e) => setOwn(e.target.value)}
          />
        </label>
      )}
      <div className="library-filters">
        <div className="library-chips" aria-label="Ketersediaan">
          {(
            [
              ['semua', 'Semua'],
              ['tersedia', 'Tersedia'],
              ['dipinjam', 'Sedang dipinjam'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {categories.length > 1 && (
          <select
            aria-label="Kategori buku"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="semua">Semua kategori</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="library-count" aria-live="polite">
        {shown.length === books.length
          ? `${books.length} judul`
          : `${shown.length} dari ${books.length} judul`}
      </p>
      <div className="library-list">
        {shown.map((book) => (
          <article className="library-book" key={book.id}>
            <div className="library-cover">
              {book.image ? (
                <img src={book.image} alt={'Sampul ' + book.title} loading="lazy" />
              ) : (
                <BookOpen size={32} />
              )}
            </div>
            <div className="library-book-copy">
              <span className="catalog-category">{book.category}</span>
              <h3>{book.title}</h3>
              <p className="library-author">{book.author}</p>
              <div className="library-meta">
                <span>{book.shelfLocation || 'Rak kafe'}</span>
                {book.publisher && (
                  <span>
                    {book.publisher}
                    {book.year ? ' · ' + book.year : ''}
                  </span>
                )}
              </div>
              {book.synopsis && <p className="library-synopsis">{book.synopsis}</p>}
              <span
                className={
                  'library-availability ' +
                  (book.availability === 'tersedia' ? 'available' : 'unavailable')
                }
              >
                {availabilityText(book)}
              </span>
            </div>
          </article>
        ))}
      </div>
      {!shown.length && (
        <p className="catalog-empty">
          {books.length
            ? 'Tidak ada buku yang cocok. Coba kata kunci atau pilihan lain.'
            : 'Koleksi buku belum ditambahkan. Mampir lagi nanti, ya.'}
        </p>
      )}
    </div>
  );
}
