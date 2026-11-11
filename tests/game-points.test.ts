import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  GAME_DAILY_CAP,
  earnGamePoint,
  gamePointsOn,
  gameWallet,
  markGameOpened,
  maskName,
  redeemGamePoints,
} from '../lib/game-points';
import { memberCard, publicCard } from '../lib/member';
import { blank } from '../lib/model';

/** The D1 calls the game points code makes, on an in-memory SQLite database. */
function memoryDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE records(id TEXT PRIMARY KEY, kind TEXT NOT NULL, data TEXT NOT NULL)');
  const db = {
    prepare: (sql: string) => ({
      bind: (...values: unknown[]) => ({
        run: async () => ({
          meta: { changes: Number(sqlite.prepare(sql).run(...(values as any)).changes) },
        }),
        first: async <T>() => (sqlite.prepare(sql).get(...(values as any)) as T) ?? null,
      }),
    }),
  };
  const state = () => {
    const s = blank();
    s.gamePoints = (
      sqlite.prepare("SELECT data FROM records WHERE kind='gamePoints'").all() as any[]
    ).map((r) => JSON.parse(r.data));
    return s;
  };
  return { db, state };
}
const at = (time: string, day = '2026-11-09') => new Date(`${day}T${time}:00+08:00`);

/** A device that opened the café, put a photo on Memoirs and played a whole game day. */
async function fullDay(db: Parameters<typeof earnGamePoint>[0], player: string, day: string) {
  await markGameOpened(db, player, at('10:00', day));
  await earnGamePoint(db, player, 'open', at('10:01', day));
  await earnGamePoint(db, player, 'photo', at('10:05', day));
  await earnGamePoint(db, player, 'day', at('10:30', day));
}

test('opening the café, a Memoirs photo and a whole game day earn one point each, once a day', async () => {
  const { db } = memoryDb();
  await markGameOpened(db, 'player-a', at('10:00'));
  assert.equal((await earnGamePoint(db, 'player-a', 'photo', at('10:01'))).counted, true);
  // Fifteen more photos the same day still make one point.
  for (let i = 0; i < 15; i++)
    assert.equal((await earnGamePoint(db, 'player-a', 'photo', at('10:02'))).counted, false);
  assert.equal((await earnGamePoint(db, 'player-a', 'open', at('10:03'))).counted, true);
  assert.equal((await earnGamePoint(db, 'player-a', 'open', at('10:04'))).counted, false);
  const day = await earnGamePoint(db, 'player-a', 'day', at('10:25'));
  assert.equal(day.counted, true);
  assert.deepEqual(day.done, { open: true, photo: true, day: true });
  assert.equal(day.today, GAME_DAILY_CAP);
  assert.equal((await earnGamePoint(db, 'player-a', 'day', at('11:00'))).counted, false);
  assert.equal((await earnGamePoint(db, 'player-a', 'serve', at('11:00'))).counted, false);
  // A new café day, new points.
  assert.equal(
    (await earnGamePoint(db, 'player-a', 'photo', at('10:00', '2026-11-10'))).counted,
    true,
  );
  assert.equal((await gameWallet(db, 'player-a', at('10:01', '2026-11-10'))).balance, 4);
});

test('the game-day point needs the game opened a game day earlier', async () => {
  const { db } = memoryDb();
  // Never opened today: nothing to time it from.
  assert.equal((await earnGamePoint(db, 'player-a', 'day', at('10:00'))).counted, false);
  await markGameOpened(db, 'player-a', at('10:00'));
  assert.equal((await earnGamePoint(db, 'player-a', 'day', at('10:10'))).counted, false);
  // Opening again later does not move the start.
  await markGameOpened(db, 'player-a', at('10:20'));
  assert.equal((await earnGamePoint(db, 'player-a', 'day', at('10:24'))).counted, true);
});

test('redeeming moves the wallet onto a card, at most the daily cap per card', async () => {
  const { db, state } = memoryDb();
  // Two devices, each with two days of points, redeem onto card m1 on the same day.
  for (const player of ['phone-1', 'phone-2'])
    for (const day of ['2026-11-08', '2026-11-09']) await fullDay(db, player, day);
  const now = at('18:00');
  const first = await redeemGamePoints(db, state(), 'phone-2', 'm1', now);
  assert.deepEqual([first.moved, first.balance, first.room], [3, 3, 0]);
  const second = await redeemGamePoints(db, state(), 'phone-1', 'm1', now);
  assert.deepEqual([second.moved, second.balance, second.room], [0, 6, 0]);
  assert.equal(gamePointsOn(state(), 'm1', '2026-11-09'), GAME_DAILY_CAP);
  // The next day the card takes in more.
  assert.equal(
    (await redeemGamePoints(db, state(), 'phone-1', 'm1', at('18:00', '2026-11-10'))).moved,
    3,
  );
});

test('a masked name is enough to recognise a card', () => {
  assert.equal(maskName('Rina Sari Dewi'), 'R*** S.');
  assert.equal(maskName('Budi'), 'B***');
});

test('redeemed points join the member card balance and show today’s progress', async () => {
  const { db, state } = memoryDb();
  await fullDay(db, 'phone', '2026-11-09');
  await redeemGamePoints(db, state(), 'phone', 'm1', at('11:00'));
  const s = state();
  const member = {
    id: 'm1',
    token: 't',
    code: 'WS1',
    name: 'Rina',
    status: 'aktif',
    createdAt: '',
  };
  s.members.push(member);
  const now = at('12:00');
  assert.equal(memberCard(s, member, now).points, 3);
  assert.deepEqual(publicCard(s, member, now).game, { today: 3, cap: GAME_DAILY_CAP });
});
