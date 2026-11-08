// Windstopia points: things done in the game earn member-card points, one each, up to a daily
// cap. They are stored apart from the café's records (see earnGamePoint) so a player earning
// points never makes a cashier's screen reload.
import { businessDay, type Row, type State } from './model';

export const GAME_DAILY_CAP = 10;
/** Shortest time between two points for one card; every activity takes longer than this. */
export const GAME_MIN_GAP_MS = 8000;
export const GAME_ACTIVITIES = ['serve', 'water', 'wipe', 'sweep', 'photo'] as const;
export type GameActivity = (typeof GAME_ACTIVITIES)[number];
export type Mission = { id: string; activity: GameActivity; count: number; label: string };

const MISSION_POOL: { activity: GameActivity; counts: number[]; label: (n: number) => string }[] = [
  { activity: 'serve', counts: [2, 3, 4], label: (n) => `Layani ${n} pelanggan` },
  { activity: 'water', counts: [1, 2, 3], label: (n) => `Siram ${n} tanaman` },
  { activity: 'wipe', counts: [1, 2, 3], label: (n) => `Lap ${n} meja` },
  {
    activity: 'sweep',
    counts: [1, 2],
    label: (n) => (n > 1 ? `Sapu lantai ${n} kali` : 'Sapu lantai'),
  },
  { activity: 'photo', counts: [1, 2], label: (n) => (n > 1 ? `Ambil ${n} foto` : 'Ambil 1 foto') },
];

/** A small repeatable number from a string, so every player gets the same missions each day. */
function seed(text: string) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** The day's three missions, each a different activity, the same for everyone. */
export function dailyMissions(day: string): Mission[] {
  const random = seed('windstopia-' + day);
  const pool = [...MISSION_POOL];
  const picked: Mission[] = [];
  while (picked.length < 3) {
    const [m] = pool.splice(Math.floor(random() * pool.length), 1);
    const count = m.counts[Math.floor(random() * m.counts.length)];
    picked.push({
      id: `${m.activity}-${count}`,
      activity: m.activity,
      count,
      label: m.label(count),
    });
  }
  return picked;
}

/** Whether something sent by the game can earn a point today. */
export function validActivity(activity: string, day: string) {
  if ((GAME_ACTIVITIES as readonly string[]).includes(activity)) return true;
  return (
    activity.startsWith('mission:') &&
    dailyMissions(day).some((m) => 'mission:' + m.id === activity)
  );
}

/** One record per card per month holds its points by day. */
export const gameRecordId = (memberId: string, day: string) => `gp-${memberId}-${day.slice(0, 7)}`;

/** Points a card earned in the game on a café day. */
export function gamePointsOn(s: Pick<State, 'gamePoints'>, memberId: string, day: string) {
  const record = s.gamePoints.find((g) => g.id === gameRecordId(memberId, day));
  return Number(record?.days?.[day]) || 0;
}

/** Every game day of a card as a points event, timed at noon WITA of that day. */
export function gameEvents(s: Pick<State, 'gamePoints'>, memberId: string) {
  return s.gamePoints
    .filter((g) => g.memberId === memberId)
    .flatMap((g: Row) =>
      Object.entries((g.days || {}) as Record<string, number>).map(([day, points]) => ({
        at: new Date(day + 'T12:00:00+08:00').toISOString(),
        points: Number(points) || 0,
      })),
    );
}

type Db = {
  prepare: (sql: string) => {
    bind: (...values: unknown[]) => {
      run: () => Promise<{ meta: { changes?: number } }>;
      first: <T>() => Promise<T | null>;
    };
  };
};

/**
 * Adds one point to a card for an activity, in a single statement that also enforces the daily
 * cap, the gap between points and one point per mission. Returns whether it counted and the
 * card's points for the day.
 */
export async function earnGamePoint(db: Db, memberId: string, activity: string, now = new Date()) {
  const day = businessDay(now);
  if (!validActivity(activity, day)) return { counted: false, today: 0, reason: 'unknown' };
  const id = gameRecordId(memberId, day),
    dayPath = `$.days."${day}"`,
    mission = activity.startsWith('mission:') ? `$.missions."${day}|${activity.slice(8)}"` : '',
    at = now.toISOString(),
    cutoff = new Date(now.getTime() - GAME_MIN_GAP_MS).toISOString();
  const fresh = JSON.stringify({
    id,
    memberId,
    month: day.slice(0, 7),
    days: { [day]: 1 },
    missions: mission ? { [`${day}|${activity.slice(8)}`]: 1 } : {},
    last: at,
  });
  const result = await db
    .prepare(
      `INSERT INTO records(id,kind,data) VALUES(?1,'gamePoints',?2)
       ON CONFLICT(id) DO UPDATE SET data=json_set(data,?3,coalesce(json_extract(data,?3),0)+1,'$.last',?4${mission ? ',?6,1' : ''})
       WHERE kind='gamePoints' AND coalesce(json_extract(data,?3),0)<?5 AND coalesce(json_extract(data,'$.last'),'')<?7${mission ? ' AND json_extract(data,?6) IS NULL' : ''}`,
    )
    .bind(id, fresh, dayPath, at, GAME_DAILY_CAP, mission || null, cutoff)
    .run();
  const row = await db
    .prepare('SELECT json_extract(data,?2) AS today FROM records WHERE id=?1')
    .bind(id, dayPath)
    .first<{ today: number }>();
  return { counted: (result.meta.changes || 0) > 0, today: Number(row?.today) || 0 };
}
