'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Coffee, LoaderCircle } from 'lucide-react';
import { money, type Row } from '@/lib/model';

export type BestSeller = {
  rank: number;
  id: string;
  name: string;
  image: string;
  price: number;
  category: string;
  status: string;
};

/** The week's five best-selling items as a ranked row; each card opens the menu page. */
export default function BestSellers({
  items,
  categories,
  error,
  onRetry,
}: {
  items: BestSeller[] | null;
  categories: Row[];
  error: string;
  onRetry: () => void;
}) {
  const section = useRef<HTMLElement>(null),
    track = useRef<HTMLOListElement>(null),
    [active, setActive] = useState(0),
    [shown, setShown] = useState(false);
  // The cards rise in rank order the first time the section scrolls into view.
  useEffect(() => {
    const el = section.current;
    if (!el || shown) return;
    const seen = new IntersectionObserver(([e]) => e.isIntersecting && setShown(true), {
      threshold: 0.25,
    });
    seen.observe(el);
    return () => seen.disconnect();
  }, [shown]);
  useEffect(() => {
    const list = track.current;
    if (!list) return;
    const cards = [...list.children] as HTMLElement[];
    const seen = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) setActive(cards.indexOf(e.target as HTMLElement));
      },
      { root: list, threshold: 0.6 },
    );
    cards.forEach((c) => seen.observe(c));
    return () => seen.disconnect();
  }, [items]);
  const go = (index: number) => {
    const list = track.current,
      card = list?.children[index] as HTMLElement | undefined;
    if (!list || !card) return;
    setActive(index);
    card.scrollIntoView({
      block: 'nearest',
      inline: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  };
  const count = items?.length || 0;
  return (
    <section
      ref={section}
      className={'best-sellers' + (shown ? ' shown' : '')}
      id="best-seller"
      aria-labelledby="best-sellers-title"
    >
      <div className="catalog-heading">
        <div>
          <span className="landing-kicker">TERLARIS MINGGU INI</span>
          <h2 id="best-sellers-title">Favorit para pengunjung.</h2>
          <p>Lima menu yang paling banyak dipesan dalam tujuh hari terakhir.</p>
        </div>
        <a href="/menu">
          Lihat semua menu <ArrowUpRight size={16} />
        </a>
      </div>
      {error && (
        <div role="alert" className="catalog-error">
          <p>{error}</p>
          <button className="button" onClick={onRetry}>
            Coba lagi
          </button>
        </div>
      )}
      {!items && !error ? (
        <p role="status" className="catalog-empty">
          <LoaderCircle size={19} className="spin" /> Memuat menu terlaris…
        </p>
      ) : count ? (
        <>
          <ol className="best-track" ref={track}>
            {items!.map((item, i) => (
              <li key={item.id} className={i === active ? 'active' : ''}>
                <a
                  href="/menu"
                  className="best-card"
                  aria-label={`Peringkat ${item.rank}: ${item.name}`}
                >
                  <div className="best-image">
                    {item.image ? (
                      <img src={item.image} alt="" loading="lazy" />
                    ) : (
                      <Coffee size={40} />
                    )}
                    <span className="best-rank" aria-hidden="true">
                      <small>#</small>
                      {item.rank}
                    </span>
                    {item.status === 'habis' && <span className="best-sold-out">Sedang habis</span>}
                  </div>
                  <div className="best-copy">
                    <span className="catalog-category">
                      {categories.find((c) => c.id === item.category)?.name || 'Menu kafe'}
                    </span>
                    <h3>{item.name}</h3>
                    <strong>{money(item.price)}</strong>
                  </div>
                </a>
              </li>
            ))}
          </ol>
          {count > 1 && (
            <div className="best-controls">
              <button
                type="button"
                className="button"
                aria-label="Peringkat sebelumnya"
                disabled={active === 0}
                onClick={() => go(active - 1)}
              >
                <ArrowLeft size={17} />
              </button>
              <div className="best-dots">
                {items!.map((item, i) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={'Peringkat ' + item.rank}
                    aria-current={i === active}
                    className={i === active ? 'active' : ''}
                    onClick={() => go(i)}
                  />
                ))}
              </div>
              <button
                type="button"
                className="button"
                aria-label="Peringkat berikutnya"
                disabled={active === count - 1}
                onClick={() => go(active + 1)}
              >
                <ArrowRight size={17} />
              </button>
            </div>
          )}
        </>
      ) : (
        !error && (
          <p className="catalog-empty">
            Belum ada penjualan minggu ini. <a href="/menu">Lihat menu kami</a>
          </p>
        )
      )}
    </section>
  );
}
