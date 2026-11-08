'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { businessDay } from '@/lib/model';
import {
  GAME_DAILY_CAP,
  GAME_MIN_GAP_MS,
  dailyMissions,
  type GameActivity,
} from '@/lib/game-points';

type Progress = { counts: Partial<Record<GameActivity, number>>; claimed: string[] };
export type RedeemCard = { code: string; name: string; room: number };
const progressKey = (day: string) => 'windstopia-missions-' + day;
const PLAYER_KEY = 'windstopia-player',
  CODE_KEY = 'windstopia-redeem-code';

function readProgress(day: string): Progress {
  try {
    const saved = JSON.parse(localStorage.getItem(progressKey(day)) || 'null');
    if (saved?.counts && Array.isArray(saved.claimed)) return saved;
  } catch {
    /* Storage blocked or damaged: start the day fresh. */
  }
  return { counts: {}, claimed: [] };
}
/** This device's game wallet id: random, made once and kept. */
function playerId() {
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
 * Windstopia points: each activity adds one point to this device's game wallet, the day's
 * missions add one each when finished, and the wallet is redeemed onto a member card by its code.
 */
export function useGamePoints() {
  const [day, setDay] = useState(() => businessDay()),
    [progress, setProgress] = useState<Progress>(() => readProgress(businessDay())),
    [balance, setBalance] = useState(0),
    [today, setToday] = useState(0),
    [note, setNote] = useState('');
  const last = useRef(0),
    queue = useRef<string[]>([]),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    notedFull = useRef(false);
  const missions = dailyMissions(day);

  const say = useCallback((text: string) => {
    setNote(text);
    setTimeout(() => setNote((n) => (n === text ? '' : n)), 2600);
  }, []);
  const save = (p: Progress, on: string) => {
    setProgress(p);
    try {
      localStorage.setItem(progressKey(on), JSON.stringify(p));
    } catch {
      /* Missions still work for this visit. */
    }
  };

  // The wallet as it stands when the game opens.
  useEffect(() => {
    const player = playerId();
    if (!player) return;
    call<{ balance: number; today: number }>({ action: 'game.wallet', player })
      .then((w) => {
        setBalance(w.balance);
        setToday(w.today);
      })
      .catch(() => {});
  }, []);

  // Points go to the server one at a time, spaced out like the server expects.
  const send = useRef(async () => {});
  useEffect(() => {
    send.current = async () => {
      timer.current = null;
      const activity = queue.current[0];
      if (!activity) return;
      const wait = last.current + GAME_MIN_GAP_MS + 300 - Date.now();
      if (wait > 0) {
        timer.current = setTimeout(() => void send.current(), wait);
        return;
      }
      queue.current.shift();
      last.current = Date.now();
      const player = playerId();
      if (player)
        try {
          const r = await call<{ counted: boolean; today: number; balance: number; cap: number }>({
            action: 'game.point',
            player,
            activity,
          });
          setBalance(r.balance);
          setToday(r.today);
          if (r.counted)
            say(
              `+1 poin${activity.startsWith('mission:') ? ' · misi selesai' : ''} · ${r.today}/${r.cap} hari ini`,
            );
          else if (r.today >= r.cap && !notedFull.current) {
            notedFull.current = true;
            say(`Poin game hari ini sudah penuh (${r.cap}/${r.cap})`);
          }
        } catch {
          /* Offline: this point is skipped. */
        }
      // The server times the gap from when it received the point, so count it from the reply.
      last.current = Date.now();
      if (queue.current.length && !timer.current)
        timer.current = setTimeout(() => void send.current(), GAME_MIN_GAP_MS + 300);
    };
  }, [say]);

  const earn = useCallback(
    (activity: GameActivity) => {
      const now = businessDay();
      let p = progress;
      if (now !== day) {
        setDay(now);
        p = readProgress(now);
      }
      const counts = { ...p.counts, [activity]: (p.counts[activity] || 0) + 1 };
      const finished = dailyMissions(now).filter(
        (m) => !p.claimed.includes(m.id) && (counts[m.activity] || 0) >= m.count,
      );
      save({ counts, claimed: [...p.claimed, ...finished.map((m) => m.id)] }, now);
      if (today >= GAME_DAILY_CAP && now === day) return;
      queue.current.push(activity, ...finished.map((m) => 'mission:' + m.id));
      if (!timer.current) void send.current();
    },
    [progress, day, today],
  );

  /** Looks a card up by its code, to show whose it is before redeeming. */
  const checkCard = useCallback(async (code: string) => {
    const r = await call<{ card: RedeemCard; balance: number }>({
      action: 'game.redeem',
      player: playerId(),
      code,
    });
    setBalance(r.balance);
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
    setBalance(r.balance);
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

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return {
    earn,
    note,
    balance,
    today,
    cap: GAME_DAILY_CAP,
    checkCard,
    redeem,
    lastCode,
    missions: missions.map((m) => ({
      ...m,
      progress: Math.min(m.count, progress.counts[m.activity] || 0),
      done: progress.claimed.includes(m.id),
    })),
  };
}
