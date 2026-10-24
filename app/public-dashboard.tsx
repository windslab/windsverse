'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  ArrowRight,
  BookOpen,
  Coffee,
  ExternalLink,
  LoaderCircle,
  Search,
  ShoppingBag,
  Utensils,
  Tv,
  Telescope,
} from 'lucide-react';
import { BrandMark } from '@/components/brand-mark';
import PublicLibrary from './public-library';
import TelescopeView from './telescope';
import PublicMenuSection from './public-menu-section';
import type { Row } from '@/lib/model';
import { EMPTY_CAFE_ACTIVITY, type CafeActivity } from '@/lib/cafe-activity';
const CafeScene = dynamic(() => import('./scene-3d'), {
  ssr: false,
  loading: () => (
    <div className="cafe-scene-shell">
      <div className="cafe-scene scene-loading">
        <div className="scene-loading-label">
          <Coffee size={20} /> Menyiapkan kafe 3D…
        </div>
      </div>
    </div>
  ),
});

type Snapshot = CafeActivity;
const empty: Snapshot = EMPTY_CAFE_ACTIVITY;
const statusText: Record<string, string> = {
  menunggu_pembayaran: 'Menunggu konfirmasi',
  diproses: 'Pesanan diterima',
  sedang_dibuat: 'Sedang disiapkan',
  siap_disajikan: 'Siap disajikan',
  selesai: 'Pesanan selesai',
  dibatalkan: 'Pesanan dibatalkan',
};

export default function PublicDashboard() {
  const [profile, setProfile] = useState<any>(null),
    [snapshot, setSnapshot] = useState<Snapshot>(empty),
    [number, setNumber] = useState(''),
    [tracking, setTracking] = useState<any>(null),
    [searching, setSearching] = useState(false),
    [trackError, setTrackError] = useState(''),
    [connection, setConnection] = useState(true);
  const [catalog, setCatalog] = useState<{ categories: Row[]; products: Row[] } | null>(null),
    [catalogError, setCatalogError] = useState(''),
    [libraryOpen, setLibraryOpen] = useState(false),
    [libraryRequest, setLibraryRequest] = useState(0),
    [tvRequest, setTvRequest] = useState(0);
  const [telescopeOpen, setTelescopeOpen] = useState(false),
    [telescopeRequest, setTelescopeRequest] = useState(0),
    [telescopeEntering, setTelescopeEntering] = useState(false);
  const telescopeArrived = () => {
    setTelescopeEntering(false);
    setTelescopeOpen(true);
  };
  useEffect(() => {
    if (!telescopeEntering) return;
    const timer = setTimeout(telescopeArrived, 6500);
    return () => clearTimeout(timer);
  }, [telescopeEntering]);
  const sceneSection = useRef<HTMLElement>(null);
  const loadCatalog = useCallback(async () => {
    try {
      const response = await fetch('/api/public', { cache: 'no-store' }),
        data: any = await response.json();
      if (!response.ok) throw Error(data.error || 'Menu belum dapat dimuat.');
      setProfile(data.settings?.[0] || {});
      setCatalog({ categories: data.categories || [], products: data.products || [] });
      setCatalogError('');
    } catch (e) {
      setCatalogError((e as Error).message || 'Menu belum dapat dimuat.');
    }
  }, []);
  useEffect(() => {
    void loadCatalog();
    const timer = setInterval(() => {
      if (!document.hidden) void loadCatalog();
    }, 15000);
    return () => clearInterval(timer);
  }, [loadCatalog]);
  const visitLibrary = () => {
    setLibraryRequest((value) => value + 1);
    sceneSection.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
      block: 'start',
    });
  };
  const warmTelescope = () => {
    void import('./sky-viewer');
  };
  const visitTelescope = () => {
    if (telescopeEntering) return;
    warmTelescope();
    setTelescopeEntering(true);
    setTelescopeRequest((value) => value + 1);
    sceneSection.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
      block: 'start',
    });
  };
  const visitTV = () => {
    setTvRequest((value) => value + 1);
    sceneSection.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
      block: 'start',
    });
  };
  const refresh = useCallback(async () => {
    try {
      const scene = await fetch('/api/public?scene=1', { cache: 'no-store' });
      if (!scene.ok) throw Error();
      const data: any = await scene.json();
      setSnapshot({ ...empty, ...data });
      setConnection(true);
    } catch {
      setConnection(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3500);
    return () => clearInterval(timer);
  }, [refresh]);
  const lookup = useCallback(async (orderNo: string) => {
    if (!orderNo.trim()) return;
    setSearching(true);
    setTrackError('');
    try {
      const res = await fetch('/api/public?track=' + encodeURIComponent(orderNo.trim()), {
          cache: 'no-store',
        }),
        data: any = await res.json();
      if (!res.ok) throw Error(data.error || 'Status pesanan belum dapat dimuat.');
      setTracking(data.found ? data : null);
      if (!data.found)
        setTrackError(
          /^WS-/i.test(orderNo.trim())
            ? 'Nomor pesanan tidak ditemukan. Periksa kembali nomor pada struk.'
            : 'Belum ada pesanan hari ini dengan nama itu. Coba ejaan lain atau nomor struk.',
        );
    } catch (e: any) {
      setTrackError(e.message || 'Status pesanan belum dapat dimuat.');
    } finally {
      setSearching(false);
    }
  }, []);
  useEffect(() => {
    if (!tracking || !number.trim()) return;
    const t = setInterval(() => void lookup(number), 12000);
    return () => clearInterval(t);
  }, [tracking, number, lookup]);
  const title = profile?.name || 'Winds Space';
  return (
    <main className="landing">
      <header className="landing-header">
        <a href="/" className="landing-brand">
          <BrandMark logo={profile?.logo} />
          <span>
            <strong>{title}</strong>
            <small>{profile?.tagline || 'Coffee, Space & Conversation'}</small>
          </span>
        </a>
        <nav aria-label="Navigasi">
          <a href="/login" className="staff-link">
            Area staf <ArrowRight size={16} />
          </a>
        </nav>
      </header>
      <div className="landing-intro">
        <section className="landing-welcome" aria-label="Selamat datang di Winds Space">
          <div className="landing-welcome-copy">
            <span className="landing-kicker">
              <span className={'live-dot ' + (!connection ? 'offline' : '')} />
              {connection ? 'CAFE LIVE' : 'MENYAMBUNG…'} · WINDS SPACE
            </span>
            <h1>
              Ruang kecil, <em>cerita besar.</em>
            </h1>
            <p>
              {profile?.tagline ||
                'Kopi hangat, ruang untuk bernapas, dan waktu untuk berbagi cerita.'}
            </p>
          </div>
        </section>
        <div className="landing-scene-column">
          {' '}
          <section
            className="landing-scene-header"
            ref={sceneSection}
            id="kafe"
            aria-label="Jelajahi Winds Space dalam 3D"
          >
            <CafeScene
              activity={snapshot}
              paused={telescopeOpen}
              telescopeRequest={telescopeRequest}
              onTelescopeReady={telescopeArrived}
              onTelescopeClick={visitTelescope}
              tvRequest={tvRequest}
              libraryRequest={libraryRequest}
              onBookshelfClick={() => setLibraryOpen(true)}
            />
          </section>
          <div className="landing-destinations">
            <a href="#menu" className="button primary landing-cta">
              <Coffee size={18} />
              Jelajahi Menu <ArrowRight size={18} />
            </a>
            <button type="button" className="button landing-library-cta" onClick={visitLibrary}>
              <BookOpen size={18} />
              Menuju Perpustakaan <ArrowRight size={18} />
            </button>
            <div className="landing-tv-actions">
              <button type="button" className="button landing-library-cta" onClick={visitTV}>
                <Tv size={18} />
                Story of Winds <ArrowRight size={18} />
              </button>
            </div>
            <button
              type="button"
              className="button landing-library-cta landing-telescope-cta"
              disabled={telescopeEntering}
              onPointerEnter={warmTelescope}
              onFocus={warmTelescope}
              onClick={visitTelescope}
            >
              <Telescope size={18} />
              {telescopeEntering ? 'Menuju lensa…' : 'Windstronout'} <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </div>
      <div className="landing-content">
        <div className="landing-scene-details">
          <div className="landing-stats">
            <div>
              <strong>{snapshot.active}</strong>
              <span>pesanan aktif</span>
            </div>
            <i />
            <div>
              <strong>{snapshot.making}</strong>
              <span>sedang diracik</span>
            </div>
            <i />
            <div>
              <strong>{snapshot.ready}</strong>
              <span>siap disajikan</span>
            </div>
          </div>
        </div>
        <PublicMenuSection
          catalog={catalog}
          error={catalogError}
          onRetry={() => void loadCatalog()}
        />
        <section className="landing-below">
          <article className="track-card">
            <div className="track-icon">
              <ShoppingBag size={21} />
            </div>
            <div className="track-content">
              <span className="landing-kicker">PESANANMU</span>
              <h2>Sudah siap?</h2>
              <p>Ketik namamu atau nomor pesanan dari struk untuk melihat status terbaru.</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void lookup(number);
                }}
              >
                <label className="sr-only" htmlFor="tracking-number">
                  Nama atau nomor pesanan
                </label>
                <input
                  id="tracking-number"
                  autoComplete="off"
                  placeholder="Nama (mis. Rina) atau WS-20261010-A1B2C3D4"
                  value={number}
                  maxLength={40}
                  onChange={(e) => {
                    const v = e.target.value;
                    setNumber(/^ws-/i.test(v) ? v.toUpperCase() : v);
                    setTracking(null);
                    setTrackError('');
                  }}
                />
                <button
                  className="button primary"
                  disabled={searching || !number.trim()}
                  aria-label="Cari pesanan"
                >
                  {searching ? <LoaderCircle size={17} className="spin" /> : <Search size={17} />}
                  Lacak
                </button>
              </form>
              {trackError && (
                <p role="alert" className="track-error">
                  {trackError}
                </p>
              )}
              {tracking?.found &&
                tracking.matches?.map((m: any, i: number) => (
                  <div
                    key={i}
                    className={'track-result ' + (m.status === 'siap_disajikan' ? 'ready' : '')}
                  >
                    <span className="track-pulse" />
                    <div>
                      <strong>
                        {m.name} · {statusText[m.status] || 'Status diperbarui'}
                      </strong>
                      <small>
                        {m.queue ? 'Antrean ke-' + m.queue + ' · ' : ''}
                        {m.orderType === 'dine_in' ? 'Makan di tempat' : 'Bawa pulang'}
                      </small>
                    </div>
                    <span className="track-status">
                      {m.status === 'siap_disajikan' ? (
                        <Utensils size={18} />
                      ) : (
                        <Coffee size={18} />
                      )}
                    </span>
                  </div>
                ))}
              {tracking?.found && !tracking.matches && (
                <div
                  className={
                    'track-result ' + (tracking.status === 'siap_disajikan' ? 'ready' : '')
                  }
                >
                  <span className="track-pulse" />
                  <div>
                    <strong>{statusText[tracking.status] || 'Status diperbarui'}</strong>
                    <small>
                      {tracking.orderType === 'dine_in' ? 'Pesanan dine-in' : 'Pesanan take away'}
                    </small>
                  </div>
                  <span className="track-status">
                    {tracking.status === 'siap_disajikan' ? (
                      <Utensils size={18} />
                    ) : (
                      <Coffee size={18} />
                    )}
                  </span>
                </div>
              )}
            </div>
          </article>
          <article className="landing-note">
            <div className="note-top">
              <span className="landing-kicker">DARI BAR KAMI</span>
              <span className="note-star">✳</span>
            </div>
            <blockquote>“Kopi yang baik selalu punya cerita.”</blockquote>
            <p>Diseduh pelan-pelan, dinikmati tanpa terburu-buru.</p>
            <div className="note-bottom">
              <span>
                <Coffee size={16} /> Dibuat dengan hangat
              </span>
              <a href="/menu">
                Lihat menu <ExternalLink size={14} />
              </a>
            </div>
          </article>
        </section>
        <footer className="landing-footer">
          <span>
            © {new Date().getFullYear()} {title}
          </span>
          <span>Winds Space · Coffee, Space & Conversation</span>
          <a href="/login">Masuk staf</a>
        </footer>
      </div>
      <TelescopeView open={telescopeOpen} onOpenChange={setTelescopeOpen} />
      <PublicLibrary open={libraryOpen} onOpenChange={setLibraryOpen} />
    </main>
  );
}
