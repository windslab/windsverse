'use client';
import { useCallback, useEffect, useState } from 'react';
import { BookOpen, LoaderCircle } from 'lucide-react';
import LibraryCatalog from './library-catalog';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { PublicBook } from '@/lib/public-books';

export default function PublicLibrary({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [books, setBooks] = useState<PublicBook[]>([]),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    let alive = true,
      controller: AbortController | undefined;
    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch('/api/public?books=1', {
            cache: 'no-store',
            signal: controller.signal,
          }),
          data: any = await response.json();
        if (!response.ok) throw Error(data.error || 'Koleksi buku belum dapat dimuat.');
        if (alive) {
          setBooks(data.books || []);
          setLoaded(true);
          setError('');
        }
      } catch (e) {
        if (alive && (e as Error).name !== 'AbortError')
          setError((e as Error).message || 'Koleksi buku belum dapat dimuat.');
      }
    };
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 15000);
    return () => {
      alive = false;
      controller?.abort();
      clearInterval(timer);
    };
  }, [open, retry]);
  const changeOpen = useCallback(
    (next: boolean) => {
      onOpenChange(next);
    },
    [onOpenChange],
  );
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="public-library-dialog">
        <div className="library-heading">
          <span className="landing-kicker">
            <BookOpen size={15} /> PERPUSTAKAAN WINDS SPACE
          </span>
          <DialogTitle>Kopi, ruang, dan sebuah cerita.</DialogTitle>
          <DialogDescription>
            Buku di rak kami bisa dibaca di kafe. Untuk meminjam, tanyakan ke kasir.
          </DialogDescription>
        </div>
        {error && (
          <div className="catalog-error" role="alert">
            <p>{error}</p>
            <button className="button" onClick={() => setRetry((value) => value + 1)}>
              Coba lagi
            </button>
          </div>
        )}
        {!loaded && !error ? (
          <p className="catalog-empty" role="status">
            <LoaderCircle size={19} className="spin" /> Memuat koleksi buku…
          </p>
        ) : (
          loaded && <LibraryCatalog books={books} />
        )}
      </DialogContent>
    </Dialog>
  );
}
