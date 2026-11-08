import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  GAME_DAILY_CAP,
  dailyMissions,
  earnGamePoint,
  gamePointsOn,
  validActivity,
} from '../lib/game-points';
import { memberCard, publicCard } from '../lib/member';
import { blank } from '../lib/model';

/** The D1 calls earnGamePoint makes, on an in-memory SQLite database. */
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

test('each activity earns one point, up to the daily cap', async () => {
  const { db, state } = memoryDb(),
    tick = clock();
  for (let i = 0; i < GAME_DAILY_CAP; i++) {
    const r = await earnGamePoint(db, 'm1', 'serve', tick());
    assert.deepEqual([r.counted, r.today], [true, i + 1]);
  }
  const over = await earnGamePoint(db, 'm1', 'water', tick());
  assert.deepEqual([over.counted, over.today], [false, GAME_DAILY_CAP]);
  assert.equal(gamePointsOn(state(), 'm1', '2026-11-09'), GAME_DAILY_CAP);
  // Another card is counted on its own.
  assert.equal((await earnGamePoint(db, 'm2', 'sweep', tick())).today, 1);
});

test('points too close together, unknown activities and repeated missions do not count', async () => {
  const { db } = memoryDb(),
    at = new Date('2026-11-09T10:00:00+08:00');
  assert.equal((await earnGamePoint(db, 'm1', 'photo', at)).counted, true);
  assert.equal(
    (await earnGamePoint(db, 'm1', 'photo', new Date(at.getTime() + 2000))).counted,
    false,
  );
  assert.equal(
    (await earnGamePoint(db, 'm1', 'cheat', new Date(at.getTime() + 20_000))).counted,
    false,
  );
  const mission = 'mission:' + dailyMissions('2026-11-09')[0].id;
  assert.equal(
    (await earnGamePoint(db, 'm1', mission, new Date(at.getTime() + 30_000))).counted,
    true,
  );
  assert.equal(
    (await earnGamePoint(db, 'm1', mission, new Date(at.getTime() + 60_000))).counted,
    false,
  );
});

test('missions are three different activities, the same for everyone on a day', () => {
  const day = dailyMissions('2026-11-09');
  assert.equal(day.length, 3);
  assert.equal(new Set(day.map((m) => m.activity)).size, 3);
  assert.deepEqual(dailyMissions('2026-11-09'), day);
  assert.ok(validActivity('mission:' + day[1].id, '2026-11-09'));
  assert.ok(!validActivity('mission:serve-99', '2026-11-09'));
});

test('game points join the member card balance and show today’s progress', async () => {
  const { db, state } = memoryDb(),
    tick = clock();
  for (let i = 0; i < 3; i++) await earnGamePoint(db, 'm1', 'wipe', tick());
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
