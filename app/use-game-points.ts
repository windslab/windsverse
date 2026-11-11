'use client';
import { useCallback, useEffect, useState } from 'react';
import { GAME_DAILY_CAP, type GameActivity } from '@/lib/game-points';

export type RedeemCard = { code: string; name: string; room: number };
export type GameWallet = {
  balance: number;
  today: number;
  done: Record<GameActivity, boolean>;
};
const PLAYER_KEY = 'windstopia-player',
  CODE_KEY = 'windstopia-redeem-code';

/** This device's game wallet id: random, made once and kept. */
export function playerId() {
  try {
    const saved = localStorage.getItem(PLAYER_KEY);
    if (saved) return saved;
    const bytes = crypto.getRandomValues(new Uint8Array(18));
    const id = btoa(String.fromCharCode(...bytes))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '');
    localStorage.setItem(PLAYER_KEY, id);
    return id;
  } catch {
    return '';
  }
}
async function call<T>(body: object): Promise<T> {
  const r = await fetch('/api/public', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data: any = await r.json();
  if (!r.ok) throw Error(data.error || 'Belum bisa terhubung. Coba lagi.');
  return data;
}

/**
 * Windstopia points: opening the café, a photo put up on Memoirs and a whole game day played each
 * add one point a day to this device's game wallet, which is redeemed onto a member card by its
 * code.
 */
export function useGamePoints() {
  const [wallet, setWallet] = useState<GameWallet>({
      balance: 0,
      today: 0,
      done: { open: false, photo: false, day: false },
    }),
    [note, setNote] = useState('');

  const say = useCallback((text: string) => {
    setNote(text);
    setTimeout(() => setNote((n) => (n === text ? '' : n)), 2600);
  }, []);

  // The wallet as it stands when the game opens; this also starts today's game-day timer.
  useEffect(() => {
    const player = playerId();
    if (!player) return;
    call<GameWallet>({ action: 'game.wallet', player })
      .then(setWallet)
      .catch(() => {});
  }, []);

  /** Shows a wallet the server sent back after a point, with a note if the point counted. */
  const counted = useCallback(
    (r: GameWallet & { counted: boolean }, label: string) => {
      setWallet(r);
      if (r.counted) say(`+1 poin · ${label}`);
    },
    [say],
  );

  /** The café was opened, or a whole game day played; true once today's point for it is in. */
  const earn = useCallback(
    async (activity: 'open' | 'day') => {
      const player = playerId();
      if (!player) return false;
      try {
        const r = await call<GameWallet & { counted: boolean }>({
          action: 'game.point',
          player,
          activity,
        });
        counted(r, activity === 'open' ? 'kafe dibuka' : 'satu hari di Windstopia');
        return r.done[activity];
      } catch {
        return false;
      }
    },
    [counted],
  );

  /** Looks a card up by its code, to show whose it is before redeeming. */
  const checkCard = useCallback(async (code: string) => {
    const r = await call<{ card: RedeemCard; balance: number }>({
      action: 'game.redeem',
      player: playerId(),
      code,
    });
    setWallet((w) => ({ ...w, balance: r.balance }));
    return r.card;
  }, []);
  /** Moves the wallet onto the card; returns how many points went across. */
  const redeem = useCallback(async (code: string) => {
    const r = await call<{ card: RedeemCard; moved: number; balance: number }>({
      action: 'game.redeem',
      player: playerId(),
      code,
      confirm: true,
    });
    setWallet((w) => ({ ...w, balance: r.balance }));
    try {
      localStorage.setItem(CODE_KEY, r.card.code);
    } catch {
      /* Only the remembered code is lost. */
    }
    return r;
  }, []);
  const lastCode = () => {
    try {
      return localStorage.getItem(CODE_KEY) || '';
    } catch {
      return '';
    }
  };

  return {
    ...wallet,
    note,
    cap: GAME_DAILY_CAP,
    counted,
    earn,
    checkCard,
    redeem,
    lastCode,
  };
}
