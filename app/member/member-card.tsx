'use client';
// A member's own card (windsverse.com/member/<secret>): ten stamps, free drinks ready to use,
// points, this year's gifts and how far each one is, and the member code as a QR for the till.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Coffee, CupSoda, Gift, Lock, Sparkles } from 'lucide-react';
import { money } from '@/lib/model';
import styles from './member.module.css';

type Card = {
  member: { code: string; name: string; status: string; joinedAt: string };
  stampCount: number;
  current: { no: number; stamps: { at: string; points: number }[] };
  fullCards: number;
  vouchers: { id: string; type: 'kopi' | 'nonkopi'; expiresAt: string }[];
  points: number;
  pointsExpireAt: string | null;
  year: number;
  rewards: {
    id: string;
    name: string;
    image: string;
    points: number;
    minCards: number;
    cardsSince: number;
    claimed: boolean;
    stockLeft: number | null;
    missingPoints: number;
    missingCards: number;
    canClaim: boolean;
  }[];
  history: { at: string; name: string; points: number }[];
  rules: { minDrinkPrice: number; voucherMonths: number; pointsExpireMonths: number };
};

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', {
    timeZone: 'Asia/Makassar',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

export default function MemberCard({ token }: { token: string }) {
  const [card, setCard] = useState<Card | null>(null),
    [error, setError] = useState(''),
    [qr, setQr] = useState('');
  useEffect(() => {
    const load = () =>
      fetch('/api/public?member=' + encodeURIComponent(token), { cache: 'no-store' })
        .then(async (r) => {
          const d = (await r.json()) as Card & { error?: string };
          if (!r.ok) throw Error(d.error || 'Kartu tidak ditemukan.');
          setCard(d);
          setError('');
        })
        .catch((e) => setError(e.message));
    void load();
    // Fresh while open at the till (a stamp appears right after paying).
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [token]);
  useEffect(() => {
    if (!card) return;
    void QRCode.toDataURL(card.member.code, {
      margin: 1,
      width: 220,
      color: { dark: '#2f3a24', light: '#fffaf0' },
    }).then(setQr);
  }, [card]);

  if (error)
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
  const slots = Array.from({ length: 10 }, (_, i) => card.current.stamps[i]);
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-label="Kartu member Winds Space">
        <header className={styles.cardHead}>
          <div>
            <small>WINDS SPACE · MEMBER</small>
            <h1>{card.member.name}</h1>
            <span className={styles.code}>{card.member.code}</span>
          </div>
          <span className={styles.cardNo}>Kartu {card.current.no}</span>
        </header>
        {card.member.status === 'menunggu' && (
          <p className={styles.pending}>
            Kartumu aktif setelah transaksi pertama: sebutkan nomor HP atau tunjukkan QR ini ke
            kasir.
          </p>
        )}
        {card.member.status === 'nonaktif' && (
          <p className={styles.pending}>Kartu ini sedang dinonaktifkan. Hubungi kasir.</p>
        )}
        <ol className={styles.stamps}>
          {slots.map((st, i) => {
            const gift = i === 4 ? 'nonkopi' : i === 9 ? 'kopi' : null;
            return (
              <li key={i} data-on={st ? '' : undefined} data-gift={gift || undefined}>
                {st ? (
                  <span className={styles.stamp} title={day(st.at)}>
                    W
                  </span>
                ) : gift === 'kopi' ? (
                  <Coffee size={18} />
                ) : gift === 'nonkopi' ? (
                  <CupSoda size={18} />
                ) : (
                  <span className={styles.num}>{i + 1}</span>
                )}
              </li>
            );
          })}
        </ol>
        <p className={styles.stampNote}>
          1 stamp tiap transaksi dengan minimal 1 minuman ≥ {money(card.rules.minDrinkPrice)}. Stamp
          ke-5: minuman non-kopi gratis · stamp ke-10: minuman kopi gratis.
        </p>
        <div className={styles.stats}>
          <div>
            <b>{card.points.toLocaleString('id-ID')}</b>
            <small>poin</small>
          </div>
          <div>
            <b>{card.fullCards}</b>
            <small>kartu penuh</small>
          </div>
          <div>
            <b>{card.stampCount}</b>
            <small>total stamp</small>
          </div>
        </div>
        {card.pointsExpireAt && card.points > 0 && (
          <p className={styles.fine}>
            Poin tetap aman selama ada transaksi sebelum {day(card.pointsExpireAt)}.
          </p>
        )}
      </section>

      {card.vouchers.length > 0 && (
        <section className={styles.block}>
          <h2>
            <Sparkles size={16} /> Minuman gratis siap dipakai
          </h2>
          <ul className={styles.vouchers}>
            {card.vouchers.map((v) => (
              <li key={v.id}>
                {v.type === 'kopi' ? <Coffee size={18} /> : <CupSoda size={18} />}
                <span>
                  <b>{v.type === 'kopi' ? 'Minuman kopi' : 'Minuman non-kopi'} gratis</b>
                  <small>berlaku sampai {day(v.expiresAt)}</small>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.block}>
        <h2>
          <Gift size={16} /> Hadiah {card.year}
        </h2>
        {card.rewards.length === 0 ? (
          <p className={styles.fine}>Koleksi hadiah tahun ini segera hadir.</p>
        ) : (
          <ul className={styles.rewards}>
            {card.rewards.map((r) => {
              const pointPct = Math.min(100, ((r.points - r.missingPoints) / r.points) * 100),
                cardPct = r.minCards
                  ? Math.min(100, ((r.minCards - r.missingCards) / r.minCards) * 100)
                  : 100;
              return (
                <li
                  key={r.id}
                  data-ready={r.canClaim || undefined}
                  data-done={r.claimed || undefined}
                >
                  {r.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.image} alt="" />
                  ) : (
                    <span className={styles.rewardIcon}>
                      <Gift size={20} />
                    </span>
                  )}
                  <div>
                    <b>{r.name}</b>
                    {r.claimed ? (
                      <small>Sudah kamu tukar tahun ini ✓</small>
                    ) : r.canClaim ? (
                      <small className={styles.ready}>
                        Bisa ditukar! Tunjukkan kartu ini ke kasir.
                      </small>
                    ) : r.stockLeft === 0 ? (
                      <small>Stok habis</small>
                    ) : (
                      <small>
                        <Lock size={11} /> {r.points.toLocaleString('id-ID')} poin
                        {r.minCards ? ` + ${r.minCards} kartu penuh` : ''}
                      </small>
                    )}
                    {!r.claimed && (
                      <>
                        <span className={styles.bar} aria-label="Poin">
                          <i style={{ width: pointPct + '%' }} />
                        </span>
                        <small className={styles.barNote}>
                          {r.missingPoints
                            ? `kurang ${r.missingPoints.toLocaleString('id-ID')} poin`
                            : 'poin cukup'}
                          {r.minCards > 0 &&
                            ` · ${r.cardsSince}/${r.minCards} kartu${r.missingCards ? '' : ' ✓'}`}
                        </small>
                        {r.minCards > 0 && (
                          <span className={styles.bar} data-cards aria-label="Kartu">
                            <i style={{ width: cardPct + '%' }} />
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className={styles.fine}>
          Setiap hadiah bisa ditukar sekali per tahun. Poin hangus bila{' '}
          {card.rules.pointsExpireMonths} bulan tidak ada transaksi; minuman gratis berlaku{' '}
          {card.rules.voucherMonths} bulan.
        </p>
      </section>

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
                <span>{h.name}</span>
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
