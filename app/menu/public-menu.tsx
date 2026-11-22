'use client';
import { useEffect, useState } from 'react';
import { Coffee } from 'lucide-react';
import { money, type Row } from '@/lib/model';
import LibraryCatalog from '../library-catalog';
import { BrandMark } from '@/components/brand-mark';
import ReviewButton, { reviewLink } from '../review-button';
import { Toaster } from '@/components/ui/sonner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
export default function PublicMenu() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(''),
    [q, setQ] = useState(''),
    [category, setCategory] = useState('all');
  useEffect(() => {
    const load = () =>
      fetch('/api/public')
        .then(async (r) => {
          const d: any = await r.json();
          if (!r.ok) throw Error(d.error);
          setData(d);
          setError('');
        })
        .catch((e) => setError(e.message));
    void load();
    const t = setInterval(() => {
      if (!document.hidden) void load();
    }, 10000);
    return () => clearInterval(t);
  }, []);
  return (
    <main className="public-menu">
      <Toaster />
      <header className="public-head">
        <BrandMark logo={data?.settings?.[0]?.logo} />
        <div>
          <h1>{data?.settings[0]?.name || 'Winds Space'}</h1>
          <p>{data?.settings[0]?.tagline || 'Coffee, Space & Conversation'}</p>
        </div>
        <a className="button" href="/login">
          Area staf
        </a>
      </header>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <Tabs defaultValue="menu">
        <TabsList>
          <TabsTrigger value="menu">Menu kafe</TabsTrigger>
          <TabsTrigger value="books">Rak buku</TabsTrigger>
          <TabsTrigger value="review">Ulasan</TabsTrigger>
        </TabsList>
        <input
          className="search"
          aria-label="Cari menu atau buku"
          placeholder="Cari menu atau buku…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <TabsContent value="menu">
          <div className="row wrap category-filters">
            {[{ id: 'all', name: 'Semua' }, ...(data?.categories || [])].map((c: Row) => (
              <button
                key={c.id}
                className={'button ' + (category === c.id ? 'primary' : '')}
                aria-pressed={category === c.id}
                onClick={() => setCategory(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
          <div className="product-grid">
            {data?.products
              .filter(
                (p: Row) =>
                  p.name.toLowerCase().includes(q.toLowerCase()) &&
                  (category === 'all' || p.category === category),
              )
              .map((p: Row) => (
                <article className="product-card" key={p.id}>
                  {p.image ? (
                    <img src={p.image} alt={p.name} />
                  ) : (
                    <div className="product-icon">
                      <Coffee size={44} />
                    </div>
                  )}
                  <span className="eyebrow">
                    {data?.categories?.find((c: Row) => c.id === p.category)?.name || p.category}
                  </span>
                  <h2>{p.name}</h2>
                  <p>{p.description}</p>
                  <div className="row between">
                    <strong>{money(p.price)}</strong>
                    <span className="badge">{p.status}</span>
                  </div>
                </article>
              ))}
          </div>
          {data?.products.length === 0 && <p className="empty">Menu belum tersedia.</p>}
        </TabsContent>
        <TabsContent value="books">
          <LibraryCatalog books={data?.books || []} query={q} />
        </TabsContent>
        <TabsContent value="review">
          <section className="panel review-panel">
            <h2>Suka dengan {data?.settings[0]?.name || 'Winds Space'}?</h2>
            <p>
              Ceritakan pengalamanmu di Google Maps. Ulasanmu membantu orang lain menemukan kami,
              dan kami membaca setiap ulasan.
            </p>
            {reviewLink(data?.settings?.[0]) ? (
              <ReviewButton profile={data?.settings?.[0]} className="button primary" />
            ) : (
              <p className="empty">Link ulasan belum tersedia.</p>
            )}
          </section>
        </TabsContent>
      </Tabs>
      <footer>
        {data?.settings[0]?.address}
        <p>{data?.settings[0]?.phone}</p>
      </footer>
    </main>
  );
}
