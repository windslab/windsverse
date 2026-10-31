import { env } from 'cloudflare:workers';
import { database } from './store';
import { Fault } from './engine';
import type { Actor } from './model';
import { digest, randomSecret, verifyPin } from './auth-crypto';
export const COOKIE = 'winds_session';
export const SESSION_LIFE = 12 * 60 * 60 * 1000,
  // Admins are signed out after an hour without use. Staff stay signed in for the whole session
  // so the end of a shift is a single tap on check-out, not a new sign-in.
  IDLE_LIFE = 60 * 60 * 1000;
type Credential = {
  employee_id: string;
  login_id: string;
  pin_hash: string;
  salt: string;
  version: string;
  enabled: number;
};
export function sessionToken(req: Request) {
  return (
    req.headers
      .get('cookie')
      ?.split(';')
      .map((x) => x.trim())
      .find((x) => x.startsWith(COOKIE + '='))
      ?.slice(COOKIE.length + 1) || ''
  );
}
export function sessionCookie(req: Request, token: string, seconds = SESSION_LIFE / 1000) {
  return `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${seconds}${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export async function authenticate(req: Request): Promise<Actor> {
  const token = sessionToken(req);
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Fault('Silakan masuk menggunakan ID dan PIN.', 401);
  const db = database(),
    now = Date.now();
  const found = await db
    .prepare(
      `SELECT s.employee_id,s.last_seen,r.data FROM auth_sessions s JOIN auth_credentials c ON c.employee_id=s.employee_id AND c.version=s.version AND c.enabled=1 JOIN records r ON r.id=s.employee_id AND r.kind='employees' WHERE s.token_hash=? AND s.expires_at>? AND s.last_seen>?`,
    )
    .bind(await digest(token), now, now - SESSION_LIFE)
    .first<any>();
  if (!found) throw new Fault('Sesi berakhir. Silakan masuk kembali.', 401);
  const e = JSON.parse(found.data);
  if (e.role === 'admin' && now - found.last_seen > IDLE_LIFE)
    throw new Fault('Sesi berakhir. Silakan masuk kembali.', 401);
  if (e.status !== 'aktif' || !['admin', 'karyawan'].includes(e.role))
    throw new Fault('Akun tidak aktif. Hubungi admin.', 401);
  if (now - found.last_seen > 60_000)
    await db
      .prepare('UPDATE auth_sessions SET last_seen=? WHERE token_hash=?')
      .bind(now, await digest(token))
      .run();
  const actor: Actor = {
    id: 'employee:' + e.id,
    employeeId: e.id,
    name: e.name,
    email: e.email || '',
    role: e.role,
  };
  Object.defineProperty(actor, 'sessionHash', { value: await digest(token), enumerable: false });
  return actor;
}
// The first owner proves themselves with a one-time setup code kept as the OWNER_SETUP_CODE
// secret on the host (never in the repository). Once the owner has an ID and PIN it is unused.
function setupCode() {
  const code = env.OWNER_SETUP_CODE;
  return typeof code === 'string' && code.length >= 12 ? code : '';
}
export async function canActivateOwner() {
  if (!setupCode()) return false;
  return !(await database()
    .prepare("SELECT employee_id FROM auth_credentials WHERE employee_id='owner'")
    .first());
}
export async function setupCodeMatches(value: unknown) {
  const code = setupCode();
  if (!code || typeof value !== 'string' || value.length > 200) return false;
  const [a, b] = await Promise.all([digest(value.trim()), digest(code)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0 && a.length === b.length;
}
// Atomic reservations count in-flight attempts too, so parallel requests cannot skip the limit.
export async function limitAttempt(req: Request, subject: string) {
  const db = database(),
    now = Date.now(),
    ip = req.headers.get('cf-connecting-ip') || 'unknown';
  const keys = [
    { key: 'ip:' + (await digest(ip)), max: 40, window: 60_000 },
    { key: 'account:' + (await digest(subject)), max: 5, window: 15 * 60_000 },
  ];
  const result = await db.batch(
    keys.map((k) =>
      db
        .prepare(
          `INSERT INTO auth_attempts(key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END, expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING count`,
        )
        .bind(k.key, now + k.window, now, now),
    ),
  );
  if (result.some((r, i) => (r.results[0] as any).count > keys[i].max))
    throw new Fault('Terlalu banyak percobaan. Tunggu 15 menit lalu coba kembali.', 429);
}
export async function clearAttempts(subject: string) {
  await database()
    .prepare('DELETE FROM auth_attempts WHERE key=?')
    .bind('account:' + (await digest(subject)))
    .run();
}
export async function credentialFor(employeeId: string) {
  return database()
    .prepare('SELECT * FROM auth_credentials WHERE employee_id=?')
    .bind(employeeId)
    .first<Credential>();
}
export async function confirmAdminPin(req: Request, a: Actor, pin: unknown) {
  if (a.role !== 'admin') throw new Fault('Hanya admin dapat mengatur akun.', 403);
  await limitAttempt(req, 'confirm:' + a.employeeId);
  const c = await credentialFor(a.employeeId);
  if (!c || !(await verifyPin(pin, c))) throw new Fault('PIN admin tidak sesuai.', 403);
  await clearAttempts('confirm:' + a.employeeId);
  return c;
}
export async function createSession(req: Request, c: Credential) {
  const db = database(),
    token = randomSecret(),
    now = Date.now();
  const result = await db
    .prepare(
      `INSERT INTO auth_sessions(token_hash,employee_id,version,expires_at,last_seen) SELECT ?,employee_id,version,?,? FROM auth_credentials WHERE employee_id=? AND version=? AND enabled=1 AND EXISTS(SELECT 1 FROM records WHERE id=? AND kind='employees' AND json_extract(data,'$.status')='aktif')`,
    )
    .bind(await digest(token), now + SESSION_LIFE, now, c.employee_id, c.version, c.employee_id)
    .run();
  if (result.meta.changes !== 1) throw new Fault('Akun telah berubah. Silakan masuk kembali.', 401);
  await db.batch([
    db
      .prepare('DELETE FROM auth_sessions WHERE expires_at<=? OR last_seen<=?')
      .bind(now, now - SESSION_LIFE),
    db.prepare('DELETE FROM auth_attempts WHERE expires_at<=?').bind(now),
  ]);
  return sessionCookie(req, token);
}
export function authResponse(data: unknown, cookie?: string) {
  return Response.json(data, {
    headers: { 'Cache-Control': 'no-store', ...(cookie ? { 'Set-Cookie': cookie } : {}) },
  });
}
