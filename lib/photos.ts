// Story of Winds vintage camera: per-device photo rolls stored for 30 days.
//
// Photos live in R2 (`photo/<id>`) with a small `records` row (kind 'photo') holding the owner,
// timestamps and film. The owner is a hash of a random device token kept in the guest's browser,
// so photos are private to that device; admins can see and delete every photo.
import { env } from 'cloudflare:workers';
import { digest } from './auth-crypto';
import { authenticate } from './auth';
import { database } from './store';
import { Fault } from './engine';

/** Extra cap per network so clearing browser data does not give unlimited rolls. */
export const NETWORK_DAILY_LIMIT = 60;
export const PHOTO_LIFE_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_PHOTO_BYTES = 1.5 * 1024 * 1024;

export type PhotoRecord = {
  id: string;
  owner: string;
  network: string;
  film: string;
  createdAt: string;
  expiresAt: string;
  /** Deleted photos keep their row (without the image) so they still count against the roll. */
  deleted?: boolean;
  /** Chosen by an admin to play on the public Memoirs TV. */
  memoirs?: boolean;
};

/** Rolls refill at 08:00 WITA, which is 00:00 UTC. */
export function rollStart(now = Date.now()) {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export async function deviceOwner(req: Request) {
  const token = req.headers.get('x-camera-device') || '';
  if (!/^[a-f0-9]{32,64}$/.test(token)) throw new Fault('Perangkat kamera belum dikenali.', 400);
  return (await digest('camera-device:' + token)).slice(0, 32);
}

export async function networkKey(req: Request) {
  return (await digest('camera-net:' + (req.headers.get('cf-connecting-ip') || 'local'))).slice(
    0,
    32,
  );
}

/** Admin session if the request carries one; never throws. */
export async function adminOrNull(req: Request) {
  try {
    const actor = await authenticate(req);
    return actor.role === 'admin' ? actor : null;
  } catch {
    return null;
  }
}

export async function listPhotos(filter: { owner?: string; memoirs?: boolean } = {}) {
  const db = database();
  const rows = filter.memoirs
    ? await db
        .prepare(
          "SELECT data FROM records WHERE kind='photo' AND json_extract(data,'$.memoirs')=1 ORDER BY json_extract(data,'$.createdAt') DESC LIMIT 200",
        )
        .all<{ data: string }>()
    : filter.owner
      ? await db
          .prepare(
            "SELECT data FROM records WHERE kind='photo' AND json_extract(data,'$.owner')=? ORDER BY json_extract(data,'$.createdAt') DESC LIMIT 500",
          )
          .bind(filter.owner)
          .all<{ data: string }>()
      : await db
          .prepare(
            "SELECT data FROM records WHERE kind='photo' ORDER BY json_extract(data,'$.createdAt') DESC LIMIT 500",
          )
          .all<{ data: string }>();
  const now = new Date().toISOString();
  return rows.results
    .map((r) => JSON.parse(r.data) as PhotoRecord)
    .filter((p) => p.expiresAt > now && !p.deleted);
}

export async function countSince(field: 'owner' | 'network', value: string, since: number) {
  const row = await database()
    .prepare(
      `SELECT count(*) AS n FROM records WHERE kind='photo' AND json_extract(data,'$.${field}')=? AND json_extract(data,'$.createdAt')>=?`,
    )
    .bind(value, new Date(since).toISOString())
    .first<{ n: number }>();
  return row?.n || 0;
}

export async function getPhoto(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  const row = await database()
    .prepare("SELECT data FROM records WHERE id=? AND kind='photo'")
    .bind(id)
    .first<{ data: string }>();
  const photo = row ? (JSON.parse(row.data) as PhotoRecord) : null;
  return photo && !photo.deleted ? photo : null;
}

/** Removes the image now; the row stays as a used shot until the 30-day sweep. */
export async function deletePhoto(id: string) {
  await database()
    .prepare(
      "UPDATE records SET data=json_set(data,'$.deleted',json('true')) WHERE id=? AND kind='photo'",
    )
    .bind(id)
    .run();
  await env.BUCKET?.delete('photo/' + id);
}

/** Removes a few expired photos per request; the gallery query already hides expired ones. */
export async function sweepExpired() {
  const rows = await database()
    .prepare(
      "SELECT id FROM records WHERE kind='photo' AND json_extract(data,'$.expiresAt')<=? LIMIT 25",
    )
    .bind(new Date().toISOString())
    .all<{ id: string }>();
  for (const row of rows.results) {
    await env.BUCKET?.delete('photo/' + row.id);
    await database().prepare("DELETE FROM records WHERE id=? AND kind='photo'").bind(row.id).run();
  }
}

export function jpegBytes(bytes: ArrayBuffer) {
  const b = new Uint8Array(bytes);
  if (b.byteLength > MAX_PHOTO_BYTES) throw new Fault('Foto terlalu besar.', 413);
  if (!(b[0] === 255 && b[1] === 216 && b[2] === 255)) throw new Fault('Foto harus JPEG.');
  return b;
}

export async function setMemoirs(id: string, memoirs: boolean) {
  await database()
    .prepare(
      "UPDATE records SET data=json_set(data,'$.memoirs',json(?)) WHERE id=? AND kind='photo'",
    )
    .bind(memoirs ? 'true' : 'false', id)
    .run();
}
