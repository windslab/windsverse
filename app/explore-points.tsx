'use client';
import { useState } from 'react';
import styles from './explore-mode.module.css';
import type { RedeemCard, useGamePoints } from './use-game-points';

/** The poin panel: the wallet, redeeming it onto a member card by code, and today's two tasks. */
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
    [error, setError] = useState('');
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
            placeholder="WSM-XXXX-XXXX"
            autoComplete="off"
            maxLength={16}
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
      <strong className={styles.missionsTitle}>Poin hari ini</strong>
      <ul>
        {[
          { done: game.done.open, label: 'Buka kafe' },
          { done: game.done.photo, label: 'Foto Luna masuk Memoirs' },
          { done: game.done.day, label: 'Main sampai hari di Windstopia berganti' },
        ].map((t) => (
          <li key={t.label} className={t.done ? styles.missionDone : ''}>
            <span>{t.done ? '✓' : '○'}</span>
            {t.label}
            <small>{t.done ? 1 : 0}/1</small>
          </li>
        ))}
      </ul>
      <p>
        Masing-masing 1 poin per hari, jadi maks. {game.cap} poin sehari. Foto masuk Memoirs saat
        kamu menekan OK pada foto di kamera. Kartu tidak perlu tersimpan di perangkat ini: cukup
        kodenya.
      </p>
    </aside>
  );
}
