'use client';
import { useState } from 'react';
import styles from './explore-mode.module.css';
import { rupiah } from '@/lib/barista-game';
import type { RedeemCard, useGamePoints } from './use-game-points';

/** The poin panel: the wallet, redeeming it onto a member card by code, and today's missions. */
export function PointsPanel({
  game,
  onClose,
}: {
  game: ReturnType<typeof useGamePoints>;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'code' | 'confirm' | 'done'>('code'),
    [code, setCode] = useState(() => game.lastCode()),
    [card, setCard] = useState<RedeemCard | null>(null),
    [moved, setMoved] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [swapNote, setSwapNote] = useState('');
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };
  const amount = card ? Math.min(game.balance, card.room) : 0;
  const swapLeft = Math.max(0, game.cashCap - game.exchanged),
    swappable = Math.min(Math.floor(game.cash / game.cashPerPoint), swapLeft);
  return (
    <aside className={styles.missions} aria-label="Poin Windstopia">
      <header>
        <strong>Poin Windstopia</strong>
        <button onClick={onClose} aria-label="Tutup poin">
          ×
        </button>
      </header>
      <div className={styles.wallet}>
        <b>{game.balance}</b>
        <span>
          poin siap di-redeem
          <small>
            {game.today}/{game.cap} poin didapat hari ini
          </small>
        </span>
      </div>
      <div className={styles.exchange}>
        <span>
          Rupiah dari kasir <b>{rupiah(game.cash)}</b>
          <small>
            {rupiah(game.cashPerPoint)} = 1 poin · ditukar {game.exchanged}/{game.cashCap} poin hari
            ini
          </small>
        </span>
        <button
          className={styles.redeem}
          disabled={busy || !swappable}
          onClick={() =>
            void run(async () => {
              const gained = await game.exchange();
              setSwapNote(gained ? `✓ ${gained} poin ditambahkan` : 'Belum ada yang bisa ditukar.');
            })
          }
        >
          {swappable ? `Tukar jadi ${swappable} poin` : 'Tukar'}
        </button>
        {swapNote && <small className={styles.missionDone}>{swapNote}</small>}
        {!swapLeft && !swapNote && (
          <small>Batas tukar hari ini sudah penuh. Coba lagi besok.</small>
        )}
      </div>
      {step === 'code' && (
        <form
          className={styles.redeemForm}
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              setCard(await game.checkCard(code));
              setStep('confirm');
            });
          }}
        >
          <label htmlFor="redeem-code">Redeem ke kartu member · masukkan kodenya</label>
          <input
            id="redeem-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="WSM-0001"
            autoComplete="off"
            maxLength={12}
          />
          <div>
            <button className={styles.redeem} disabled={busy || !code.trim() || !game.balance}>
              {busy ? 'Mencari…' : 'Cek kartu'}
            </button>
          </div>
        </form>
      )}
      {step === 'confirm' && card && (
        <div className={styles.redeemForm}>
          <p>
            Kartu <b>{card.code}</b> · {card.name}
          </p>
          {amount ? (
            <p>
              {amount} poin akan dipindahkan.
              {amount < game.balance &&
                ` Kartu ini bisa menerima ${card.room} poin game lagi hari ini; sisanya tetap tersimpan di sini.`}
            </p>
          ) : (
            <p>Kartu ini sudah menerima {game.cap} poin game hari ini. Coba lagi besok.</p>
          )}
          <div>
            <button type="button" onClick={() => setStep('code')}>
              ganti kode
            </button>
            <button
              className={styles.redeem}
              disabled={busy || !amount}
              onClick={() =>
                void run(async () => {
                  const r = await game.redeem(card.code);
                  setMoved(r.moved);
                  setStep('done');
                })
              }
            >
              {busy ? 'Memindahkan…' : `Redeem ${amount} poin`}
            </button>
          </div>
        </div>
      )}
      {step === 'done' && card && (
        <div className={styles.redeemForm}>
          <p className={styles.missionDone}>
            {moved
              ? `✓ ${moved} poin masuk ke kartu ${card.code}.`
              : 'Belum ada poin yang dipindahkan. Coba lagi nanti.'}
          </p>
          <button className={styles.redeem} onClick={() => setStep('code')}>
            selesai
          </button>
        </div>
      )}
      {error && (
        <p className={styles.redeemError} role="alert">
          {error}
        </p>
      )}
      <strong className={styles.missionsTitle}>Misi hari ini</strong>
      <ul>
        {game.missions.map((m) => (
          <li key={m.id} className={m.done ? styles.missionDone : ''}>
            <span>{m.done ? '✓' : '○'}</span>
            {m.label}
            <small>
              {m.progress}/{m.count}
            </small>
          </li>
        ))}
      </ul>
      <p>
        Setiap kegiatan dan misi = 1 poin, maks. {game.cap} per hari. Rupiah dari kasir bisa ditukar
        maks. {game.cashCap} poin per hari. Satu kartu member bisa menerima {game.cap} poin game per
        hari. Kartu tidak perlu tersimpan di perangkat ini: cukup kodenya.
      </p>
    </aside>
  );
}
