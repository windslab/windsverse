// Windstopia points: two things earn a point into the player's game wallet, each at most once a
// café day: a photo from Luna's camera that went up on Memoirs, and playing through a whole game
// day. The player redeems the wallet onto a member card by its code. A card takes in at most the
// same daily cap, so points gathered on many devices cannot pile onto one card. Wallets and card
// totals are written apart from the café's revisioned records, so a player never makes a
// cashier's screen reload.
import { businessDay, type Row, type State } from './model';

export const GAME_ACTIVITIES = ['photo', 'day'] as const;
export type GameActivity = (typeof GAME_ACTIVITIES)[number];
/** One point per activity per day, so the cap is simply their number. */
export const GAME_DAILY_CAP = GAME_ACTIVITIES.length;
/** A game day lasts 24 real minutes; the claim needs the game opened at least this long ago. */
export const GAME_DAY_MS = 23 * 60_000;

/** Whether something sent by the game can earn a point. */
export const validActivity = (activity: string): activity is GameActivity =>
  (GAME_ACTIVITIES as readonly string[]).includes(activity);

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

/** Points waiting in a player's wallet, today's points, and which activities already earned one. */
export async function gameWallet(db: Db, player: string, now = new Date()) {
  const day = businessDay(now);
  const row = await db
    .prepare(
      `SELECT json_extract(data,'$.balance') AS balance, json_extract(data,?2) AS today, json_extract(data,?3) AS photo, json_extract(data,?4) AS played FROM records WHERE id=?1 AND kind='${WALLET_KIND}'`,
    )
    .bind(walletId(player), `$.days."${day}"`, `$.done."${day}|photo"`, `$.done."${day}|day"`)
    .first<{ balance: number; today: number; photo: number | null; played: number | null }>();
  return {
    balance: Number(row?.balance) || 0,
    today: Number(row?.today) || 0,
    done: { photo: !!row?.photo, day: !!row?.played },
  };
}

/** Notes when the player first opened the game today, which the game-day point is timed from. */
export async function markGameOpened(db: Db, player: string, now = new Date()) {
  const day = businessDay(now),
    at = now.toISOString();
  await db
    .prepare(
      `INSERT INTO records(id,kind,data) VALUES(?1,'${WALLET_KIND}',?2)
       ON CONFLICT(id) DO UPDATE SET data=json_set(data,?3,coalesce(json_extract(data,?3),?4))
       WHERE kind='${WALLET_KIND}'`,
    )
    .bind(
      walletId(player),
      JSON.stringify({
        id: walletId(player),
        balance: 0,
        days: {},
        done: {},
        opened: { [day]: at },
      }),
      `$.opened."${day}"`,
      at,
    )
    .run();
}

/**
 * Adds one point to a player's wallet for an activity, once per activity per café day, in a
 * single statement. The game-day point also needs the game opened long enough ago today.
 */
export async function earnGamePoint(db: Db, player: string, activity: string, now = new Date()) {
  const day = businessDay(now);
  if (!validActivity(activity)) return { counted: false, ...(await gameWallet(db, player, now)) };
  const dayPath = `$.days."${day}"`,
    donePath = `$.done."${day}|${activity}"`,
    openedBy = new Date(now.getTime() - GAME_DAY_MS).toISOString();
  const fresh = JSON.stringify({
    id: walletId(player),
    balance: 1,
    days: { [day]: 1 },
    done: { [`${day}|${activity}`]: 1 },
  });
  const set = `json_set(data,?2,coalesce(json_extract(data,?2),0)+1,'$.balance',coalesce(json_extract(data,'$.balance'),0)+1,?3,1)`;
  // The game-day point only updates a wallet the game opened (and timed) earlier today.
  const result =
    activity === 'day'
      ? await db
          .prepare(
            `UPDATE records SET data=${set} WHERE id=?1 AND kind='${WALLET_KIND}' AND json_extract(data,?3) IS NULL AND json_extract(data,?4)<=?5`,
          )
          .bind(walletId(player), dayPath, donePath, `$.opened."${day}"`, openedBy)
          .run()
      : await db
          .prepare(
            `INSERT INTO records(id,kind,data) VALUES(?1,'${WALLET_KIND}',?4)
             ON CONFLICT(id) DO UPDATE SET data=${set}
             WHERE kind='${WALLET_KIND}' AND json_extract(data,?3) IS NULL`,
          )
          .bind(walletId(player), dayPath, donePath, fresh)
          .run();
  return { counted: (result.meta.changes || 0) > 0, ...(await gameWallet(db, player, now)) };
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
