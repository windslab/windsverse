// Windstopia points: things done in the game earn one point each into the player's game wallet,
// up to a daily cap, and the player redeems the wallet onto a member card by its code. A card
// takes in at most the same daily cap, so points gathered on many devices cannot pile onto one
// card. Rupiah earned at the in-game till is saved too and can be exchanged for points, with its
// own daily limit. Wallets and card totals are written apart from the café's revisioned records, so a
// player never makes a cashier's screen reload.
import { businessDay, type Row, type State } from './model';

export const GAME_DAILY_CAP = 10;
/** Shortest time between two points for one player; every activity takes longer than this. */
export const GAME_MIN_GAP_MS = 8000;
/** In-game rupiah from the till can be exchanged too: Rp100.000 for a point, 5 points a day. */
export const GAME_CASH_PER_POINT = 100_000;
export const GAME_CASH_DAILY_POINTS = 5;
/** The most one sale may add, and the shortest time between two sales of one player. */
export const GAME_SALE_MAX = 100_000;
export const GAME_SALE_GAP_MS = 4000;
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

/** One record per card per month holds the game points it received, by day. */
export const gameRecordId = (memberId: string, day: string) => `gp-${memberId}-${day.slice(0, 7)}`;

/** Game points a card received on a café day. */
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

type Statement = {
  run: () => Promise<{ meta: { changes?: number } }>;
  first: <T>() => Promise<T | null>;
};
type Db = { prepare: (sql: string) => { bind: (...values: unknown[]) => Statement } };

/** A player's wallet: one record per device, kept out of the state the café loads. */
const walletId = (player: string) => 'gw-' + player;
const WALLET_KIND = 'gameWallet';

/** Points waiting in a player's wallet, how many they earned today, and their saved rupiah. */
export async function gameWallet(db: Db, player: string, now = new Date()) {
  const day = businessDay(now);
  const row = await db
    .prepare(
      `SELECT json_extract(data,'$.balance') AS balance, json_extract(data,?2) AS today, json_extract(data,'$.cash') AS cash, json_extract(data,?3) AS exchanged FROM records WHERE id=?1 AND kind='${WALLET_KIND}'`,
    )
    .bind(walletId(player), `$.days."${day}"`, `$.cashDays."${day}"`)
    .first<{ balance: number; today: number; cash: number; exchanged: number }>();
  return {
    balance: Number(row?.balance) || 0,
    today: Number(row?.today) || 0,
    cash: Number(row?.cash) || 0,
    exchanged: Number(row?.exchanged) || 0,
  };
}

/**
 * Adds one point to a player's wallet for an activity, in a single statement that also enforces
 * the daily cap, the gap between points and one point per mission.
 */
export async function earnGamePoint(db: Db, player: string, activity: string, now = new Date()) {
  const day = businessDay(now);
  if (!validActivity(activity, day))
    return { counted: false, ...(await gameWallet(db, player, now)) };
  const dayPath = `$.days."${day}"`,
    mission = activity.startsWith('mission:') ? `$.missions."${day}|${activity.slice(8)}"` : '',
    at = now.toISOString(),
    cutoff = new Date(now.getTime() - GAME_MIN_GAP_MS).toISOString();
  const fresh = JSON.stringify({
    id: walletId(player),
    balance: 1,
    days: { [day]: 1 },
    missions: mission ? { [`${day}|${activity.slice(8)}`]: 1 } : {},
    last: at,
  });
  const result = await db
    .prepare(
      `INSERT INTO records(id,kind,data) VALUES(?1,'${WALLET_KIND}',?2)
       ON CONFLICT(id) DO UPDATE SET data=json_set(data,?3,coalesce(json_extract(data,?3),0)+1,'$.balance',coalesce(json_extract(data,'$.balance'),0)+1,'$.last',?4${mission ? ',?6,1' : ''})
       WHERE kind='${WALLET_KIND}' AND coalesce(json_extract(data,?3),0)<?5 AND coalesce(json_extract(data,'$.last'),'')<?7${mission ? ' AND json_extract(data,?6) IS NULL' : ''}`,
    )
    .bind(walletId(player), fresh, dayPath, at, GAME_DAILY_CAP, mission || null, cutoff)
    .run();
  return { counted: (result.meta.changes || 0) > 0, ...(await gameWallet(db, player, now)) };
}

/**
 * Saves the rupiah of one in-game sale into the player's wallet, capped per sale and spaced out
 * like real sales, so the till cannot be filled by sending requests.
 */
export async function recordGameSale(db: Db, player: string, price: number, now = new Date()) {
  const amount = Math.min(GAME_SALE_MAX, Math.max(0, Math.floor(price)));
  if (!amount) return { counted: false, ...(await gameWallet(db, player, now)) };
  const at = now.toISOString(),
    cutoff = new Date(now.getTime() - GAME_SALE_GAP_MS).toISOString();
  const fresh = JSON.stringify({
    id: walletId(player),
    balance: 0,
    days: {},
    missions: {},
    cash: amount,
    saleLast: at,
  });
  const result = await db
    .prepare(
      `INSERT INTO records(id,kind,data) VALUES(?1,'${WALLET_KIND}',?2)
       ON CONFLICT(id) DO UPDATE SET data=json_set(data,'$.cash',coalesce(json_extract(data,'$.cash'),0)+?3,'$.saleLast',?4)
       WHERE kind='${WALLET_KIND}' AND coalesce(json_extract(data,'$.saleLast'),'')<?5`,
    )
    .bind(walletId(player), fresh, amount, at, cutoff)
    .run();
  return { counted: (result.meta.changes || 0) > 0, ...(await gameWallet(db, player, now)) };
}

/**
 * Turns saved rupiah into wallet points, Rp100.000 a point, as many as today's exchange limit
 * still allows; the rest of the rupiah stays saved.
 */
export async function exchangeGameCash(db: Db, player: string, now = new Date()) {
  const day = businessDay(now),
    wallet = await gameWallet(db, player, now),
    points = Math.min(
      Math.floor(wallet.cash / GAME_CASH_PER_POINT),
      Math.max(0, GAME_CASH_DAILY_POINTS - wallet.exchanged),
    );
  if (!points) return { gained: 0, ...wallet };
  const dayPath = `$.cashDays."${day}"`,
    cost = points * GAME_CASH_PER_POINT;
  const result = await db
    .prepare(
      `UPDATE records SET data=json_set(data,'$.cash',json_extract(data,'$.cash')-?2,'$.balance',coalesce(json_extract(data,'$.balance'),0)+?3,?4,coalesce(json_extract(data,?4),0)+?3)
       WHERE id=?1 AND kind='${WALLET_KIND}' AND json_extract(data,'$.cash')>=?2 AND coalesce(json_extract(data,?4),0)+?3<=?5`,
    )
    .bind(walletId(player), cost, points, dayPath, GAME_CASH_DAILY_POINTS)
    .run();
  const after = await gameWallet(db, player, now);
  return { gained: result.meta.changes ? points : 0, ...after };
}

/** "Rina Sari" becomes "R*** S.", enough to recognise a card without revealing the name. */
export const maskName = (name: string) =>
  String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w, i) => (i === 0 ? w[0] + '***' : w[0] + '.'))
    .join(' ');

/**
 * Moves a wallet's points onto a member card, as many as the card may still take in today. The
 * wallet is lowered first and only if it still holds the amount; if the card then refuses, the
 * points go back to the wallet.
 */
export async function redeemGamePoints(
  db: Db,
  s: Pick<State, 'gamePoints'>,
  player: string,
  memberId: string,
  now = new Date(),
) {
  const day = businessDay(now),
    wallet = await gameWallet(db, player, now),
    room = Math.max(0, GAME_DAILY_CAP - gamePointsOn(s, memberId, day)),
    amount = Math.min(wallet.balance, room);
  if (!amount) return { moved: 0, balance: wallet.balance, room };
  const took = await db
    .prepare(
      `UPDATE records SET data=json_set(data,'$.balance',json_extract(data,'$.balance')-?2) WHERE id=?1 AND kind='${WALLET_KIND}' AND json_extract(data,'$.balance')>=?2`,
    )
    .bind(walletId(player), amount)
    .run();
  if (!took.meta.changes) return { moved: 0, balance: wallet.balance, room };
  const id = gameRecordId(memberId, day),
    dayPath = `$.days."${day}"`;
  const fresh = JSON.stringify({ id, memberId, month: day.slice(0, 7), days: { [day]: amount } });
  const gave = await db
    .prepare(
      `INSERT INTO records(id,kind,data) VALUES(?1,'gamePoints',?2)
       ON CONFLICT(id) DO UPDATE SET data=json_set(data,?3,coalesce(json_extract(data,?3),0)+?4)
       WHERE kind='gamePoints' AND coalesce(json_extract(data,?3),0)+?4<=?5`,
    )
    .bind(id, fresh, dayPath, amount, GAME_DAILY_CAP)
    .run();
  if (!gave.meta.changes) {
    await db
      .prepare(
        `UPDATE records SET data=json_set(data,'$.balance',json_extract(data,'$.balance')+?2) WHERE id=?1 AND kind='${WALLET_KIND}'`,
      )
      .bind(walletId(player), amount)
      .run();
    return { moved: 0, balance: wallet.balance, room: 0 };
  }
  return { moved: amount, balance: wallet.balance - amount, room: room - amount };
}
