'use client';
// A member's own card (windsverse.com/member/<secret>): the card in 3D with its stamps, points and
// free drinks, then this year's exclusive gifts to swipe through. A gift unlocks once there are
// enough points and full cards and can be claimed here; staff hand it over at the till.
import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Box,
  ChevronLeft,
  ChevronRight,
  Ticket,
  CupSoda,
  Gift,
  Lock,
  LockOpen,
  Sparkles,
} from 'lucide-react';
import type { CardDesign } from '@/lib/member';
import MemberCard3D from './card-3d';
import Gift3D from './gift-3d';
import styles from './member.module.css';

type Reward = {
  id: string;
  name: string;
  description: string;
  image: string;
  model: string;
  points: number;
  minCards: number;
  cardsSince: number;
  claimed: boolean;
  claimStatus: 'menunggu' | 'diserahkan' | null;
  stockLeft: number | null;
  missingPoints: number;
  missingCards: number;
  canClaim: boolean;
};
export type PublicCard = {
  member: { code: string; name: string; status: string; joinedAt: string };
  stampCount: number;
  current: { no: number; stamps: { at: string; points: number }[] };
  fullCards: number;
  vouchers: { id: string; type: 'potongan' | 'minuman'; expiresAt: string }[];
  points: number;
  pointsExpireAt: string | null;
  year: number;
  rewards: Reward[];
  history: { at: string; name: string; points: number; status: 'menunggu' | 'diserahkan' }[];
  rules: {
    minDrinkPrice: number;
    stampRule: string;
    voucherDiscount: number;
    freeDrinkMax: number;
    voucherMonths: number;
    pointsExpireMonths: number;
  };
  design: CardDesign;
};

/** The card opened last on this device, for the button in the 3D café. */
export const TOKEN_KEY = 'ws-member-token';
const storage = {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
};
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', {
    timeZone: 'Asia/Makassar',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

/** Loads a card by its secret link and keeps it fresh (a stamp shows up right after paying). */
export function useMemberCard(token: string) {
  const [card, setCard] = useState<PublicCard | null>(null),
    [error, setError] = useState(''),
    [fresh, setFresh] = useState(0);
  const load = useCallback(
    () =>
      fetch('/api/public?member=' + encodeURIComponent(token), { cache: 'no-store' })
        .then(async (r) => {
          const d = (await r.json()) as PublicCard & { error?: string };
          if (!r.ok) throw Error(d.error || 'Kartu tidak ditemukan.');
          // Stamps new since this device last saw the card land hard (at most the last three).
          const seenKey = 'ws-member-seen-' + d.member.code,
            seen = Number(storage.get(seenKey) ?? -1);
          setFresh((f) =>
            seen < 0
              ? Math.min(3, d.current.stamps.length)
              : d.stampCount > seen
                ? Math.min(d.current.stamps.length, d.stampCount - seen)
                : f,
          );
          storage.set(seenKey, String(d.stampCount));
          storage.set(TOKEN_KEY, token);
          setCard(d);
          setError('');
        })
        .catch((e) => setError(e.message)),
    [token],
  );
  useEffect(() => {
    void load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);
  return { card, error, fresh, reload: load };
}

export const cardFace = (card: PublicCard) => ({
  name: card.member.name,
  code: card.member.code,
  cardNo: card.current.no,
  stamps: card.current.stamps,
});

export default function MemberCard({ token }: { token: string }) {
  const { card, error, fresh, reload } = useMemberCard(token);
  const [qr, setQr] = useState('');
  useEffect(() => {
    if (!card) return;
    void QRCode.toDataURL(card.member.code, {
      margin: 1,
      width: 220,
      color: { dark: '#2f3a24', light: '#fffaf0' },
    }).then(setQr);
  }, [card]);

  if (error && !card)
    return (
      <main className={styles.page}>
        <p className={styles.error}>{error}</p>
      </main>
    );
  if (!card)
    return (
      <main className={styles.page}>
        <p className={styles.loading}>Membuka kartu…</p>
      </main>
    );
  return (
    <main className={styles.page}>
      <header className={styles.top}>
        <small>WINDS SPACE · MEMBER</small>
        <h1>Halo, {card.member.name.split(' ')[0]}</h1>
      </header>
      <MemberCard3D face={cardFace(card)} design={card.design} fresh={fresh} />
      {card.member.status === 'menunggu' && (
        <p className={styles.pending}>
          Kartumu aktif setelah transaksi pertama: sebutkan nomor HP atau tunjukkan QR di bawah ke
          kasir.
        </p>
      )}
      {card.member.status === 'nonaktif' && (
        <p className={styles.pending}>Kartu ini sedang dinonaktifkan. Hubungi kasir.</p>
      )}
      <div className={styles.stats}>
        <div>
          <b>{card.points.toLocaleString('id-ID')}</b>
          <small>poin</small>
        </div>
        <div>
          <b>
            {card.current.stamps.length}
            <i>/10</i>
          </b>
          <small>stamp kartu {card.current.no}</small>
        </div>
        <div>
          <b>{card.fullCards}</b>
          <small>kartu penuh</small>
        </div>
      </div>
      <p className={styles.fine}>
        {card.rules.stampRule}. Stamp ke-5: potongan Rp
        {card.rules.voucherDiscount.toLocaleString('id-ID')} · stamp ke-10: minuman gratis sampai Rp
        {card.rules.freeDrinkMax.toLocaleString('id-ID')}.
        {card.pointsExpireAt &&
          card.points > 0 &&
          ` Poin aman selama ada transaksi sebelum ${day(card.pointsExpireAt)}.`}
      </p>

      {card.vouchers.length > 0 && (
        <section className={styles.block}>
          <h2>
            <Sparkles size={16} /> Hadiah stamp siap dipakai
          </h2>
          <ul className={styles.vouchers}>
            {card.vouchers.map((v) => (
              <li key={v.id}>
                {v.type === 'potongan' ? <Ticket size={18} /> : <CupSoda size={18} />}
                <span>
                  <b>
                    {v.type === 'potongan'
                      ? `Potongan Rp${card.rules.voucherDiscount.toLocaleString('id-ID')}`
                      : `Minuman gratis sampai Rp${card.rules.freeDrinkMax.toLocaleString('id-ID')}`}
                  </b>
                  <small>berlaku sampai {day(v.expiresAt)}</small>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <GiftCatalog card={card} token={token} onClaimed={reload} />

      <section className={styles.block}>
        <h2>QR member</h2>
        <div className={styles.qr}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr && <img src={qr} alt={'QR kode member ' + card.member.code} />}
          <p>
            Tunjukkan ke kasir, atau sebutkan nomor HP-mu.
            <br />
            <small>Simpan halaman ini (tambahkan ke layar utama) agar mudah dibuka.</small>
          </p>
        </div>
      </section>

      {card.history.length > 0 && (
        <section className={styles.block}>
          <h2>Riwayat hadiah</h2>
          <ul className={styles.history}>
            {card.history.map((h, i) => (
              <li key={i}>
                <span>
                  {h.name}
                  {h.status === 'menunggu' && <em> · menunggu diambil</em>}
                </span>
                <small>
                  {day(h.at)} · −{h.points.toLocaleString('id-ID')} poin
                </small>
              </li>
            ))}
          </ul>
        </section>
      )}
      <footer className={styles.footer}>
        Member sejak {day(card.member.joinedAt)} ·{' '}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- plain links, like the rest of the site */}
        <a href="/">windsverse.com</a>
      </footer>
    </main>
  );
}

/** This year's gifts side by side: swipe left and right (or the arrows), one gift at a time. */
function GiftCatalog({
  card,
  token,
  onClaimed,
}: {
  card: PublicCard;
  token: string;
  onClaimed: () => Promise<unknown>;
}) {
  const track = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0),
    [asking, setAsking] = useState(''),
    [busy, setBusy] = useState(false),
    [problem, setProblem] = useState(''),
    [show3d, setShow3d] = useState(''),
    [unlocking, setUnlocking] = useState<string[]>([]);
  const rewards = card.rewards;
  // Gifts that unlocked since this device last looked open with a little ceremony.
  useEffect(() => {
    const key = 'ws-member-unlocked-' + card.member.code;
    let known: string[] = [];
    try {
      known = JSON.parse(localStorage.getItem(key) || '[]');
    } catch {}
    const open = rewards.filter((r) => r.canClaim).map((r) => r.id);
    const fresh = open.filter((id) => !known.includes(id));
    if (!fresh.length) return;
    try {
      localStorage.setItem(key, JSON.stringify([...known, ...fresh]));
    } catch {}
    queueMicrotask(() => setUnlocking(fresh));
    const t = setTimeout(() => setUnlocking([]), 2400);
    return () => clearTimeout(t);
  }, [rewards, card.member.code]);
  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    const slide = el.children[Math.max(0, Math.min(rewards.length - 1, i))] as HTMLElement;
    el.scrollTo({ left: slide.offsetLeft - 12, behavior: 'smooth' });
  };
  const claim = async (r: Reward) => {
    setBusy(true);
    setProblem('');
    try {
      const res = await fetch('/api/public', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'member.request', token, rewardId: r.id }),
      });
      const d = (await res.json()) as { error?: string };
      if (!res.ok) throw Error(d.error || 'Klaim belum berhasil.');
      setAsking('');
      await onClaimed();
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className={styles.catalog}
      aria-roledescription="carousel"
      aria-label="Hadiah eksklusif"
    >
      <header>
        <div>
          <small>KOLEKSI {card.year}</small>
          <h2>Hadiah eksklusif</h2>
        </div>
        {rewards.length > 1 && (
          <div className={styles.arrows}>
            <button
              type="button"
              aria-label="Hadiah sebelumnya"
              disabled={index === 0}
              onClick={() => go(index - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              aria-label="Hadiah berikutnya"
              disabled={index >= rewards.length - 1}
              onClick={() => go(index + 1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </header>
      {!rewards.length ? (
        <p className={styles.fine}>Koleksi hadiah tahun ini segera hadir.</p>
      ) : (
        <ul
          ref={track}
          className={styles.track}
          onScroll={(e) => {
            const el = e.currentTarget,
              first = el.children[0] as HTMLElement | undefined;
            if (!first) return;
            setIndex(Math.round(el.scrollLeft / (first.offsetWidth + 12)));
          }}
        >
          {rewards.map((r, i) => {
            const locked = !r.claimed && !r.canClaim;
            const pointPct = Math.min(100, ((r.points - r.missingPoints) / r.points) * 100),
              cardPct = r.minCards
                ? Math.min(100, ((r.minCards - r.missingCards) / r.minCards) * 100)
                : 100;
            return (
              <li
                key={r.id}
                className={styles.slide}
                aria-roledescription="slide"
                aria-label={`${i + 1} dari ${rewards.length}: ${r.name}`}
                data-locked={locked || undefined}
                data-ready={r.canClaim || undefined}
                data-unlocking={unlocking.includes(r.id) || undefined}
              >
                <div className={styles.mock}>
                  {show3d === r.id && r.model ? (
                    <Gift3D src={r.model} locked={locked} />
                  ) : r.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.image} alt={'Mockup ' + r.name} loading="lazy" draggable={false} />
                  ) : (
                    <span className={styles.mockEmpty}>
                      <Gift size={40} />
                      <small>Mockup segera hadir</small>
                    </span>
                  )}
                  {locked && (
                    <span className={styles.lock}>
                      <Lock size={22} />
                    </span>
                  )}
                  {unlocking.includes(r.id) && (
                    <span className={styles.lock} data-opening>
                      <LockOpen size={22} />
                    </span>
                  )}
                  {r.model && (
                    <button
                      type="button"
                      className={styles.view3d}
                      aria-pressed={show3d === r.id}
                      onClick={() => setShow3d(show3d === r.id ? '' : r.id)}
                    >
                      <Box size={14} /> {show3d === r.id ? 'Foto' : '3D'}
                    </button>
                  )}
                </div>
                <div className={styles.slideBody}>
                  <h3>{r.name}</h3>
                  {r.description && <p>{r.description}</p>}
                  <small className={styles.price}>
                    {r.points.toLocaleString('id-ID')} poin
                    {r.minCards ? ` + ${r.minCards} kartu penuh` : ''}
                    {r.stockLeft !== null && !r.claimed && ` · sisa ${r.stockLeft}`}
                  </small>
                  {r.claimStatus === 'diserahkan' ? (
                    <p className={styles.owned}>Sudah kamu miliki ✓</p>
                  ) : r.claimStatus === 'menunggu' ? (
                    <p className={styles.owned}>
                      Diklaim! Tunjukkan kartu ini ke kasir untuk mengambil hadiahmu.
                    </p>
                  ) : r.stockLeft === 0 ? (
                    <p className={styles.fine}>Stok habis</p>
                  ) : r.canClaim ? (
                    asking === r.id ? (
                      <div className={styles.confirm}>
                        <span>
                          Pakai {r.points.toLocaleString('id-ID')} poin untuk {r.name}?
                        </span>
                        <div>
                          <button
                            type="button"
                            className={styles.primary}
                            disabled={busy}
                            onClick={() => claim(r)}
                          >
                            {busy ? 'Mengklaim…' : 'Ya, klaim'}
                          </button>
                          <button
                            type="button"
                            className={styles.ghost}
                            onClick={() => setAsking('')}
                          >
                            Batal
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={styles.primary}
                        disabled={card.member.status !== 'aktif'}
                        onClick={() => {
                          setProblem('');
                          setAsking(r.id);
                        }}
                      >
                        <LockOpen size={15} /> Klaim hadiah
                      </button>
                    )
                  ) : (
                    <div className={styles.progress}>
                      <span className={styles.bar} aria-label="Poin">
                        <i style={{ width: pointPct + '%' }} />
                      </span>
                      <small>
                        {r.missingPoints
                          ? `kurang ${r.missingPoints.toLocaleString('id-ID')} poin`
                          : 'poin cukup ✓'}
                      </small>
                      {r.minCards > 0 && (
                        <>
                          <span className={styles.bar} data-cards aria-label="Kartu penuh">
                            <i style={{ width: cardPct + '%' }} />
                          </span>
                          <small>
                            {r.cardsSince}/{r.minCards} kartu penuh{r.missingCards ? '' : ' ✓'}
                          </small>
                        </>
                      )}
                    </div>
                  )}
                  {problem && asking === r.id && <p className={styles.error}>{problem}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {rewards.length > 1 && (
        <div className={styles.dots}>
          {rewards.map((r, i) => (
            <button
              key={r.id}
              type="button"
              aria-label={'Ke ' + r.name}
              aria-current={i === index || undefined}
              onClick={() => go(i)}
            />
          ))}
        </div>
      )}
      <p className={styles.fine}>
        Tiap hadiah bisa diklaim sekali per tahun. Poin hangus bila {card.rules.pointsExpireMonths}{' '}
        bulan tidak ada transaksi; hadiah stamp berlaku {card.rules.voucherMonths} bulan.
      </p>
    </section>
  );
}
