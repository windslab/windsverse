'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { businessDay } from '@/lib/model';
import {
  GAME_DAILY_CAP,
  GAME_MIN_GAP_MS,
  dailyMissions,
  type GameActivity,
} from '@/lib/game-points';
import { TOKEN_KEY } from './member/member-card';

type Progress = { counts: Partial<Record<GameActivity, number>>; claimed: string[] };
const progressKey = (day: string) => 'windstopia-missions-' + day;

function readProgress(day: string): Progress {
  try {
    const saved = JSON.parse(localStorage.getItem(progressKey(day)) || 'null');
    if (saved?.counts && Array.isArray(saved.claimed)) return saved;
  } catch {
    /* Storage blocked or damaged: start the day fresh. */
  }
  return { counts: {}, claimed: [] };
}
function cardToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

/**
 * Windstopia points for the player's saved member card: each activity sends one point, the day's
 * missions add one each when finished, and a short note says what was earned.
 */
export function useGamePoints() {
  const [day, setDay] = useState(() => businessDay()),
    [progress, setProgress] = useState<Progress>(() => readProgress(businessDay())),
    [today, setToday] = useState<number | null>(null),
    [note, setNote] = useState(''),
    [hasCard, setHasCard] = useState(() => !!cardToken());
  const last = useRef(0),
    queue = useRef<string[]>([]),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    noted = useRef({ noCard: false, full: false });
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
      const token = cardToken();
      setHasCard(!!token);
      if (!token) return;
      try {
        const r = await fetch('/api/public', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'game.point', token, activity }),
        });
        const data: { counted: boolean; today: number; cap: number } = await r.json();
        if (r.ok) {
          setToday(data.today);
          if (data.counted)
            say(
              `+1 poin member${activity.startsWith('mission:') ? ' · misi selesai' : ''} · ${data.today}/${data.cap} hari ini`,
            );
          else if (data.today >= data.cap && !noted.current.full) {
            noted.current.full = true;
            say(`Poin game hari ini sudah penuh (${data.cap}/${data.cap})`);
          }
        }
      } catch {
        /* Offline: this point is skipped. */
      }
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
      if (!cardToken()) {
        setHasCard(false);
        if (!noted.current.noCard) {
          noted.current.noCard = true;
          say('Simpan kartu member (tombol kartu) untuk mengumpulkan poin');
        }
        return;
      }
      const counts = { ...p.counts, [activity]: (p.counts[activity] || 0) + 1 };
      const finished = dailyMissions(now).filter(
        (m) => !p.claimed.includes(m.id) && (counts[m.activity] || 0) >= m.count,
      );
      save({ counts, claimed: [...p.claimed, ...finished.map((m) => m.id)] }, now);
      if ((today ?? 0) >= GAME_DAILY_CAP) return;
      queue.current.push(activity, ...finished.map((m) => 'mission:' + m.id));
      if (!timer.current) void send.current();
    },
    [progress, day, today, say],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return {
    earn,
    note,
    today,
    cap: GAME_DAILY_CAP,
    hasCard,
    missions: missions.map((m) => ({
      ...m,
      progress: Math.min(m.count, progress.counts[m.activity] || 0),
      done: progress.claimed.includes(m.id),
    })),
  };
}
