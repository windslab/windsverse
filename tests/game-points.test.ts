import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  GAME_DAILY_CAP,
  dailyMissions,
  earnGamePoint,
  gamePointsOn,
  gameWallet,
  maskName,
  redeemGamePoints,
  validActivity,
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
// 9 Nov 2026, 10:00 WITA, and a clock that moves on 10 seconds per call.
const clock = (start = Date.parse('2026-11-09T10:00:00+08:00')) => {
  let t = start;
  return () => new Date((t += 10_000));
};

test('each activity earns one wallet point, up to the daily cap', async () => {
  const { db } = memoryDb(),
    tick = clock();
  for (let i = 0; i < GAME_DAILY_CAP; i++) {
    const r = await earnGamePoint(db, 'player-a', 'serve', tick());
    assert.deepEqual([r.counted, r.today, r.balance], [true, i + 1, i + 1]);
  }
  const over = await earnGamePoint(db, 'player-a', 'water', tick());
  assert.deepEqual([over.counted, over.balance], [false, GAME_DAILY_CAP]);
  // Another player is counted on their own.
  assert.equal((await earnGamePoint(db, 'player-b', 'sweep', tick())).balance, 1);
});

test('points too close together, unknown activities and repeated missions do not count', async () => {
  const { db } = memoryDb(),
    at = new Date('2026-11-09T10:00:00+08:00');
  const later = (ms: number) => new Date(at.getTime() + ms);
  assert.equal((await earnGamePoint(db, 'p', 'photo', at)).counted, true);
  assert.equal((await earnGamePoint(db, 'p', 'photo', later(2000))).counted, false);
  assert.equal((await earnGamePoint(db, 'p', 'cheat', later(20_000))).counted, false);
  const mission = 'mission:' + dailyMissions('2026-11-09')[0].id;
  assert.equal((await earnGamePoint(db, 'p', mission, later(30_000))).counted, true);
  assert.equal((await earnGamePoint(db, 'p', mission, later(60_000))).counted, false);
});

test('redeeming moves the wallet onto a card, at most the daily cap per card', async () => {
  const { db, state } = memoryDb(),
    tick = clock();
  // Two devices with 10 and 4 points both redeem onto card m1 on the same day.
  for (let i = 0; i < 10; i++) await earnGamePoint(db, 'phone-1', 'serve', tick());
  for (let i = 0; i < 4; i++) await earnGamePoint(db, 'phone-2', 'wipe', tick());
  const now = new Date('2026-11-09T18:00:00+08:00');
  const first = await redeemGamePoints(db, state(), 'phone-2', 'm1', now);
  assert.deepEqual([first.moved, first.balance, first.room], [4, 0, 6]);
  const second = await redeemGamePoints(db, state(), 'phone-1', 'm1', now);
  assert.deepEqual([second.moved, second.balance, second.room], [6, 4, 0]);
  assert.equal(gamePointsOn(state(), 'm1', '2026-11-09'), GAME_DAILY_CAP);
  // The card is full for today, so the rest waits in the wallet.
  assert.equal((await redeemGamePoints(db, state(), 'phone-1', 'm1', now)).moved, 0);
  assert.equal((await gameWallet(db, 'phone-1', now)).balance, 4);
  // The next day the card takes them in.
  const tomorrow = new Date('2026-11-10T18:00:00+08:00');
  assert.equal((await redeemGamePoints(db, state(), 'phone-1', 'm1', tomorrow)).moved, 4);
});

test('a masked name is enough to recognise a card', () => {
  assert.equal(maskName('Rina Sari Dewi'), 'R*** S.');
  assert.equal(maskName('Budi'), 'B***');
});
test('missions are three different activities, the same for everyone on a day', () => {
  const day = dailyMissions('2026-11-09');
  assert.equal(day.length, 3);
  assert.equal(new Set(day.map((m) => m.activity)).size, 3);
  assert.deepEqual(dailyMissions('2026-11-09'), day);
  assert.ok(validActivity('mission:' + day[1].id, '2026-11-09'));
  assert.ok(!validActivity('mission:serve-99', '2026-11-09'));
});

test('redeemed points join the member card balance and show today’s progress', async () => {
  const { db, state } = memoryDb(),
    tick = clock();
  for (let i = 0; i < 3; i++) await earnGamePoint(db, 'phone', 'wipe', tick());
  await redeemGamePoints(db, state(), 'phone', 'm1', new Date('2026-11-09T11:00:00+08:00'));
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
  const now = new Date('2026-11-09T12:00:00+08:00');
  assert.equal(memberCard(s, member, now).points, 3);
  assert.deepEqual(publicCard(s, member, now).game, { today: 3, cap: GAME_DAILY_CAP });
});
