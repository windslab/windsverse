import { env } from 'cloudflare:workers';
import {
  blank,
  defaultCategories,
  kinds,
  type Row,
  type State,
  type Actor,
} from './model';
import { Fault, apply } from './engine';
import { stateChanges, stateMap } from './audit';
export function database() {
  if (!env.DB) throw new Fault('Penyimpanan belum terhubung. Coba lagi nanti.', 503);
  return env.DB.withSession('first-primary');
}
/**
 * The café's data. `only` limits it to some collections (a quick read for the game's calls);
 * everything else (camera, music, presence, game wallets) lives in the same table and is left out.
 * With `recent`, a tap on the till reads only what it can touch (see RECENT_SQL): `recentFrom` then
 * names the first date read in full.
 */
export async function read(
  only: readonly (typeof kinds)[number][] = kinds,
  key?: string,
  recent?: { memberId?: string; orderId?: string; month: string },
) {
  const db = database();
  // A save's request ID is looked up in the same trip, so commit need not ask again.
  const checkKey = typeof key === 'string' && /^[a-f0-9-]{36}$/.test(key);
  const records = recent
    ? db
        .prepare(RECENT_SQL)
        .bind(recent.month, recent.memberId || null, recent.orderId || null, ...RECENT_WHOLE)
    : db
        .prepare(
          `SELECT id,kind,data FROM records WHERE kind IN (${only.map(() => '?').join(',')})`,
        )
        .bind(...only);
  const [c, r, v, k, f] = await db.batch([
    db.prepare('SELECT * FROM control WHERE id=1'),
    records,
    db.prepare(`SELECT data FROM records WHERE id='${VERSION_ID}'`),
    db
      .prepare(checkKey ? 'SELECT actor_id,action FROM audit WHERE id=?' : 'SELECT 1 WHERE 0')
      .bind(...(checkKey ? [key] : [])),
    ...(recent ? [db.prepare(`WITH ${RECENT_CUT} SELECT d FROM cut`).bind(recent.month)] : []),
  ]);
  const state = blank();
  for (const x of r.results as any[])
    if (kinds.includes(x.kind)) state[x.kind as keyof State].push(JSON.parse(x.data));
  const implicitCategories =
    (recent ? RECENT_WHOLE : only).includes('categories') &&
    !!c.results[0] &&
    !state.categories.length;
  if (implicitCategories) state.categories = defaultCategories();
  const control = c.results[0] as any;
  return {
    db,
    state,
    control,
    implicitCategories,
    version: versionOf(control?.revision, (v.results[0] as any)?.data),
    /** For the key given: its earlier save (null if none); undefined when no key was checked. */
    prior: checkKey ? ((k.results[0] as any) ?? null) : undefined,
    priorKey: checkKey ? key : undefined,
    recentFrom: recent ? String((f.results[0] as any)?.d || recent.month) : undefined,
  };
}

// The till's daily taps (start making, ready, done, take payment, a new order) need the menu and
// stock, the cards, and only the recent part of the café's history: everything dated from the
// start of this month, or from an earlier day that still has an open shift or an unfinished order
// (a night shift running past midnight into a new month). For a member's order, all of that
// member's orders come along too, since stamps and free drinks are counted from all of them.
// Books, loans, chat, notes and feedback stay unread. Shifts close and their wages are worked out
// from that day's orders, attendance and expenses, so a day is always read whole.
const RECENT_WHOLE = [
  'employees',
  'categories',
  'products',
  'ingredients',
  'recipes',
  'tables',
  'tiers',
  'payrolls',
  'settings',
  'members',
  'memberRewards',
  'memberClaims',
  'gamePoints',
  'referrals',
] as const;
const RECENT_CUT = `cut AS (SELECT MIN(d) AS d FROM (
  SELECT ?1 AS d
  UNION ALL SELECT json_extract(data,'$.date') FROM records WHERE kind='shifts' AND json_extract(data,'$.status')='open'
  UNION ALL SELECT json_extract(data,'$.date') FROM records WHERE kind='orders' AND json_extract(data,'$.status') NOT IN ('selesai','dibatalkan')))`;
const RECENT_SQL = `WITH ${RECENT_CUT}
SELECT id,kind,data FROM records WHERE kind IN (${RECENT_WHOLE.map((_, i) => '?' + (i + 4)).join(',')})
  OR (kind IN ('orders','shifts','expenses') AND json_extract(data,'$.date') >= (SELECT d FROM cut))
  OR (kind='attendance' AND json_extract(data,'$.shiftId') IN (SELECT id FROM records WHERE kind='shifts' AND json_extract(data,'$.date') >= (SELECT d FROM cut)))
  OR (kind='orders' AND json_extract(data,'$.memberId') IN (?2, (SELECT json_extract(data,'$.memberId') FROM records WHERE id=?3 AND kind='orders')))`;
/** The taps on the till that read only the recent café (see RECENT_SQL). */
export const RECENT_ACTIONS = ['order.create', 'order.pay', 'order.status'];

// Has anything changed? The control row's revision moves with every save; game points onto a
// member card are written apart from it and move a small counter of their own. Pollers send the
// version they have and get "unchanged" from a one-row read instead of the whole café.
const VERSION_ID = 'state-version';
const versionOf = (revision: unknown, extra: unknown) =>
  revision === undefined || revision === null ? '' : `${revision}.${Number(extra) || 0}`;
/**
 * What changed since the version a device shows, for its 3-second check: the records saves wrote
 * since then (read as they are now; gone ones listed as removed), each save found in the audit.
 * Null when the whole café should be sent instead: an unknown or far-off version, a gap in the
 * audit, a big change (a restore), or a change to shifts, expenses, settings, employees or
 * categories, which move payroll estimates and what staff may see.
 */
export async function readDelta(since: string, a: Actor) {
  const [sinceRev, sinceExtra] = since.split('.').map(Number);
  if (!Number.isInteger(sinceRev) || !Number.isInteger(sinceExtra) || sinceRev < 1) return null;
  const db = database();
  // The latest saves (read through the created_at index, not the whole audit), those after the
  // version the device has, and the records they touched.
  const saves = `WITH a AS (SELECT id FROM (SELECT id,detail FROM audit ORDER BY created_at DESC LIMIT ${DELTA_SAVES}) WHERE CASE WHEN json_valid(detail) THEN json_extract(detail,'$.revision') END>?1), ch AS (SELECT DISTINCT record_id FROM audit_changes WHERE audit_id IN (SELECT id FROM a))`;
  const changed = 'SELECT record_id FROM ch';
  // One batch, so the version, the audit and the records all describe the same moment.
  const [c, v, n, r, sh, ids] = await db.batch([
    db.prepare('SELECT revision FROM control WHERE id=1'),
    db.prepare(`SELECT data FROM records WHERE id='${VERSION_ID}'`),
    db
      .prepare(`${saves} SELECT (SELECT count(*) FROM a) AS n, (SELECT count(*) FROM ch) AS ids`)
      .bind(sinceRev),
    db
      .prepare(
        `${saves} SELECT id,kind,data FROM records WHERE id IN (${changed}) LIMIT ${DELTA_MAX + 1}`,
      )
      .bind(sinceRev),
    // The shifts of changed orders: whether staff may see an order depends on its shift.
    db
      .prepare(
        `${saves} SELECT id,kind,data FROM records WHERE kind='shifts' AND id IN (SELECT json_extract(data,'$.shiftId') FROM records WHERE kind='orders' AND id IN (${changed}))`,
      )
      .bind(sinceRev),
    db.prepare(`${saves} ${changed} LIMIT ${DELTA_MAX + 1}`).bind(sinceRev),
  ]);
  const revision = (c.results[0] as any)?.revision;
  const extra = Number((v.results[0] as any)?.data) || 0;
  const count = n.results[0] as any;
  if (
    typeof revision !== 'number' ||
    sinceRev > revision ||
    revision - sinceRev > DELTA_SAVES - 10 ||
    extra < sinceExtra
  )
    return null;
  // Every save since then must be in the audit, and not too many records touched.
  if (count.n !== revision - sinceRev || count.ids > DELTA_MAX) return null;
  type Raw = { id: string; kind: string; data: string };
  const rows = r.results as Raw[];
  if (rows.some((x) => DELTA_FULL.includes(x.kind))) return null;
  // Game points onto a card are written outside the audit: send the cards and points whole.
  const replace: string[] = extra !== sinceExtra ? ['members', 'gamePoints'] : [];
  const whole = replace.length
    ? ((
        await db
          .prepare(`SELECT id,kind,data FROM records WHERE kind IN ('members','gamePoints')`)
          .all()
      ).results as Raw[])
    : [];
  const mini = blank() as unknown as Record<string, Row[]>;
  const put = (x: Raw) => {
    if ((kinds as readonly string[]).includes(x.kind)) mini[x.kind].push(JSON.parse(x.data));
  };
  rows.filter((x) => !replace.includes(x.kind)).forEach(put);
  whole.forEach(put);
  for (const x of sh.results as Raw[])
    if (!mini.shifts.some((y) => y.id === x.id)) mini.shifts.push(JSON.parse(x.data));
  const shown = visible(mini as unknown as State, a) as unknown as Record<string, Row[]>;
  const written = rows.flatMap((x) => {
    if (replace.includes(x.kind)) return [];
    const record = shown[x.kind]?.find((y) => y.id === x.id);
    return record ? [{ kind: x.kind, record }] : [];
  });
  const kept = new Set([...written.map((w) => w.record.id), ...whole.map((w) => w.id)]);
  return {
    revision,
    version: versionOf(revision, extra),
    written,
    // Gone since then, or not for this person's eyes.
    removed: (ids.results as { record_id: string }[])
      .map((x) => x.record_id)
      .filter((id) => !kept.has(id)),
    replace: Object.fromEntries(replace.map((k) => [k, shown[k]])),
  };
}
const DELTA_MAX = 300;
const DELTA_SAVES = 60;
const DELTA_FULL = ['shifts', 'expenses', 'settings', 'employees', 'categories', 'tiers'];
/** The data's current version ('' before the café is set up). */
export async function dataVersion() {
  const row = await database()
    .prepare(
      `SELECT c.revision AS revision, (SELECT data FROM records WHERE id='${VERSION_ID}') AS extra FROM control c WHERE c.id=1`,
    )
    .first<{ revision: number; extra: string | null }>();
  return row ? versionOf(row.revision, row.extra) : '';
}
/** Marks a change written outside the revision (game points onto a member card). */
export async function bumpDataVersion(
  db: { prepare: (sql: string) => { run: () => Promise<unknown> } } = database(),
) {
  await db
    .prepare(
      `INSERT INTO records(id,kind,data) VALUES('${VERSION_ID}','stateVersion','1') ON CONFLICT(id) DO UPDATE SET data=CAST(data AS INTEGER)+1`,
    )
    .run();
}
export { visible, memberOrder } from './visible';
import { visible } from './visible';
export function checkMutation(req: Request) {
  const origin = req.headers.get('origin');
  if (origin !== new URL(req.url).origin || req.headers.get('sec-fetch-site') === 'cross-site')
    throw new Fault('Permintaan harus berasal dari aplikasi ini.', 403);
  if (!req.headers.get('content-type')?.includes('application/json'))
    throw new Fault('Gunakan JSON.', 415);
}
export async function body(req: Request) {
  const text = await req.text();
  if (text.length > 750000) throw new Fault('Ukuran data terlalu besar.', 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new Fault('Data JSON tidak valid.');
  }
}
export async function commit(
  loaded: Awaited<ReturnType<typeof read>>,
  a: Actor,
  action: string,
  p: any,
  revision: number,
  key: string,
  restore?: { backupId: string; safetyBackupId: string; jobId: string },
  /** Filled with the records this save wrote and removed, for an answer that carries only them. */
  out?: { written: { kind: string; id: string }[]; removed: string[] },
) {
  const { db, state, control, implicitCategories } = loaded;
  if (!/^[a-f0-9-]{36}$/.test(key || '')) throw new Fault('ID permintaan tidak valid.');
  const prev =
    loaded.priorKey === key
      ? loaded.prior
      : await db.prepare('SELECT actor_id,action FROM audit WHERE id=?').bind(key).first<any>();
  if (prev) {
    if (prev.actor_id !== a.id || prev.action !== action)
      throw new Fault('ID permintaan sudah digunakan.', 409);
    return { duplicate: true };
  }
  if (action === 'backup.restore' && !restore)
    throw new Fault('Gunakan menu Cadangan & pemulihan untuk pemeriksaan dan konfirmasi PIN.', 403);
  if (action === 'initialize') throw new Fault('Gunakan pengaturan pemilik yang sudah ada.', 403);
  if (!control) throw new Fault('Siapkan kafe terlebih dahulu.', 409);
  if (control.revision !== revision)
    throw new Fault(
      'Data telah berubah di perangkat lain. Muat ulang dan ulangi tindakan.',
      409,
      'stale',
    );
  const old = new Map(
    kinds.flatMap((k) =>
      implicitCategories && k === 'categories'
        ? []
        : state[k].map((r) => [r.id, JSON.stringify(r)] as const),
    ),
  );
  const before = stateMap(state);
  const result = apply(state, a, action, p, new Date(), { allowActiveRestore: !!restore });
  const changes = stateChanges(before, state);
  const rows = kinds.flatMap((k) => state[k].map((r) => ({ k, r })));
  if (new Set(rows.map((x) => x.r.id)).size !== rows.length) throw new Fault('ID data berulang.');
  const now = Date.now();
  // Guests may only sign up for a member card or ask for a gift on their own card
  // (no staff session needed). Scheduled work runs as the system and has no session either.
  const guard =
    a.role === 'system' || action === 'member.signup' || action === 'member.request'
      ? db
          .prepare(
            'UPDATE control SET revision=revision+1,last_mutation=? WHERE id=1 AND revision=?',
          )
          .bind(key, revision)
      : db
          .prepare(
            `UPDATE control SET revision=revision+1,last_mutation=? WHERE id=1 AND revision=? AND EXISTS(SELECT 1 FROM auth_sessions se JOIN auth_credentials c ON c.employee_id=se.employee_id AND c.version=se.version AND c.enabled=1 JOIN records r ON r.id=c.employee_id AND r.kind='employees' WHERE se.token_hash=? AND se.employee_id=? AND se.expires_at>? AND se.last_seen>? AND json_extract(r.data,'$.status')='aktif' AND json_extract(r.data,'$.role')=?)`,
          )
          .bind(
            key,
            revision,
            a.sessionHash || '',
            a.employeeId,
            now,
            now - 60 * 60 * 1000,
            a.role,
          );
  const ops = [guard];
  for (const { k, r } of rows) {
    const data = JSON.stringify(r);
    if (data !== old.get(r.id) || before.get(r.id)?.kind !== k) {
      out?.written.push({ kind: k, id: r.id });
      ops.push(
        db
          .prepare(
            'INSERT INTO records(id,kind,data) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM control WHERE id=1 AND last_mutation=?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,data=excluded.data',
          )
          .bind(r.id, k, data, key),
      );
    }
    old.delete(r.id);
  }
  for (const id of old.keys()) {
    out?.removed.push(id);
    ops.push(
      db
        .prepare(
          'DELETE FROM records WHERE id=? AND EXISTS(SELECT 1 FROM control WHERE id=1 AND last_mutation=?)',
        )
        .bind(id, key),
    );
  }
  // Changes to employee status/role invalidate all existing sessions in the same transaction.
  if ((action === 'save' || action === 'delete') && p.kind === 'employees' && p.id) {
    const updated = loaded.state.employees.find((e) => e.id === p.id);
    ops.push(
      db
        .prepare(
          'DELETE FROM auth_sessions WHERE employee_id=? AND EXISTS(SELECT 1 FROM control WHERE id=1 AND last_mutation=?)',
        )
        .bind(p.id, key),
    );
    if (!updated || updated.status !== 'aktif')
      ops.push(
        db
          .prepare(
            'UPDATE auth_credentials SET enabled=0,version=? WHERE employee_id=? AND EXISTS(SELECT 1 FROM control WHERE id=1 AND last_mutation=?)',
          )
          .bind(crypto.randomUUID(), p.id, key),
      );
  }
  if (action === 'backup.restore') {
    ops.push(
      db
        .prepare(
          "DELETE FROM auth_sessions WHERE employee_id NOT IN ('owner',?) AND EXISTS(SELECT 1 FROM control WHERE id=1 AND last_mutation=?)",
        )
        .bind(a.employeeId, key),
    );
    ops.push(
      db
        .prepare(
          "DELETE FROM auth_credentials WHERE employee_id NOT IN ('owner',?) AND EXISTS(SELECT 1 FROM control WHERE id=1 AND last_mutation=?)",
        )
        .bind(a.employeeId, key),
    );
  }
  for (let index = 0; index < changes.length; index++) {
    const change = changes[index];
    ops.push(
      db
        .prepare(
          'INSERT INTO audit_changes(id,audit_id,kind,record_id,before_data,after_data) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM control WHERE id=1 AND last_mutation=?)',
        )
        .bind(
          key + ':' + index,
          key,
          change.kind,
          change.recordId,
          change.before === null ? null : JSON.stringify(change.before),
          change.after === null ? null : JSON.stringify(change.after),
          key,
        ),
    );
  }
  const detail = {
    kind: p.kind,
    id: p.id,
    employeeId: p.employeeId,
    shiftId: p.shiftId,
    reason: typeof p.reason === 'string' ? p.reason.slice(0, 2000) : undefined,
    actorName: a.name,
    revision: revision + 1,
    changeCount: changes.length,
    ...(restore ? { backupId: restore.backupId, safetyBackupId: restore.safetyBackupId } : {}),
  };
  ops.push(
    db
      .prepare(
        'INSERT INTO audit(id,actor_id,action,detail,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM control WHERE id=1 AND last_mutation=?)',
      )
      .bind(key, a.id, action, JSON.stringify(detail), new Date().toISOString(), key),
  );
  if (restore)
    ops.push(
      db
        .prepare(
          "UPDATE restore_jobs SET status='completed' WHERE id=? AND EXISTS(SELECT 1 FROM control WHERE id=1 AND last_mutation=?)",
        )
        .bind(restore.jobId, key),
    );
  // D1 batches are transactional. Optimistic revision guards protect every record write.
  const response = await db.batch(ops);
  if (response[0].meta.changes !== 1)
    throw new Fault('Data berubah saat disimpan. Muat ulang lalu ulangi.', 409);
  return result;
}
export function errorResponse(e: any) {
  console.error('Cafe request:', e instanceof Fault ? e.message : e);
  return Response.json(
    {
      error:
        e instanceof Fault
          ? e.message
          : e?.name === 'ZodError'
            ? 'Isian tidak valid: ' +
              e.issues.map((i: any) => i.path.join('.') + ' ' + i.message).join('; ')
            : 'Permintaan belum berhasil. Coba lagi atau hubungi pemilik.',
      ...(e instanceof Fault && e.code ? { code: e.code } : {}),
    },
    {
      status: e instanceof Fault ? e.status : e?.name === 'ZodError' ? 400 : 500,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
