import { env } from 'cloudflare:workers';
import { blank, defaultCategories, kinds, publicOrder, type State, type Actor } from './model';
import { Fault, apply } from './engine';
import { stateChanges, stateMap } from './audit';
export function database() {
  if (!env.DB) throw new Fault('Penyimpanan belum terhubung. Coba lagi nanti.', 503);
  return env.DB.withSession('first-primary');
}
export async function read() {
  const db = database();
  const [c, r] = await db.batch([
    db.prepare('SELECT * FROM control WHERE id=1'),
    // Camera (lib/photos.ts, lib/camera-config.ts) and music (lib/music.ts) rows are queried on
    // their own and never enter the cafe state.
    db.prepare(
      "SELECT id,kind,data FROM records WHERE kind NOT IN ('photo','filmPreset','cameraConfig','track','musicConfig')",
    ),
  ]);
  const state = blank();
  for (const x of r.results as any[])
    if (kinds.includes(x.kind)) state[x.kind as keyof State].push(JSON.parse(x.data));
  const implicitCategories = !!c.results[0] && !state.categories.length;
  if (implicitCategories) state.categories = defaultCategories();
  return { db, state, control: c.results[0] as any, implicitCategories };
}
export function visible(s: State, a: Actor): State {
  if (a.role === 'admin') return s;
  const v = structuredClone(s);
  v.employees = v.employees.map((e) => ({
    id: e.id,
    name: e.name,
    role: e.role,
    status: e.status,
  }));
  v.attendance = v.attendance.filter((x) => x.employeeId === a.employeeId);
  v.payrolls = v.payrolls.filter((x) => x.employeeId === a.employeeId);
  v.tiers = [];
  v.feedback = [];
  v.orders = v.orders
    .filter((o) =>
      s.shifts.some(
        (sh) =>
          sh.id === o.shiftId && (sh.status === 'open' || sh.employeeIds.includes(a.employeeId)),
      ),
    )
    .map(publicOrder);
  v.shifts = v.shifts.map((sh) => ({
    ...sh,
    snapshot: sh.snapshot
      ? { employees: sh.snapshot.employees.filter((e: any) => e.employeeId === a.employeeId) }
      : undefined,
  }));
  return v;
}
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
) {
  const { db, state, control, implicitCategories } = loaded;
  if (!/^[a-f0-9-]{36}$/.test(key || '')) throw new Fault('ID permintaan tidak valid.');
  const prev = await db
    .prepare('SELECT actor_id,action FROM audit WHERE id=?')
    .bind(key)
    .first<any>();
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
  const guard =
    action === 'feedback.add'
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
    if (data !== old.get(r.id) || before.get(r.id)?.kind !== k)
      ops.push(
        db
          .prepare(
            'INSERT INTO records(id,kind,data) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM control WHERE id=1 AND last_mutation=?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,data=excluded.data',
          )
          .bind(r.id, k, data, key),
      );
    old.delete(r.id);
  }
  for (const id of old.keys())
    ops.push(
      db
        .prepare(
          'DELETE FROM records WHERE id=? AND EXISTS(SELECT 1 FROM control WHERE id=1 AND last_mutation=?)',
        )
        .bind(id, key),
    );
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
