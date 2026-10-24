import { env } from 'cloudflare:workers';
import { database, errorResponse } from '@/lib/store';
import { Fault } from '@/lib/engine';
import { availableFilmIds, readConfig } from '@/lib/camera-config';
import {
  NETWORK_DAILY_LIMIT,
  PHOTO_LIFE_MS,
  adminOrNull,
  countSince,
  deletePhoto,
  deviceOwner,
  getPhoto,
  jpegBytes,
  listPhotos,
  networkKey,
  rollStart,
  setMemoirs,
  sweepExpired,
  type PhotoRecord,
} from '@/lib/photos';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
const sameOrigin = (req: Request) => {
  if (
    req.headers.get('origin') !== new URL(req.url).origin ||
    req.headers.get('sec-fetch-site') === 'cross-site'
  )
    throw new Fault('Permintaan harus berasal dari aplikasi ini.', 403);
};
const view = (p: PhotoRecord) => ({
  id: p.id,
  film: p.film,
  createdAt: p.createdAt,
  expiresAt: p.expiresAt,
  memoirs: !!p.memoirs,
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url),
      start = rollStart();
    if (url.searchParams.get('memoirs') === '1')
      return Response.json(
        { photos: (await listPhotos({ memoirs: true })).map(view) },
        { headers: noStore },
      );
    const admin = await adminOrNull(req);
    if (url.searchParams.get('all') === '1') {
      if (!admin) throw new Fault('Hanya admin yang dapat melihat semua foto.', 403);
      return Response.json(
        { photos: (await listPhotos()).map(view), admin: true },
        { headers: noStore },
      );
    }
    const owner = await deviceOwner(req),
      used = await countSince('owner', owner, start),
      { rollSize } = await readConfig();
    return Response.json(
      {
        photos: (await listPhotos({ owner })).map(view),
        left: Math.max(0, rollSize - used),
        roll: rollSize,
        resetAt: new Date(start + 86_400_000).toISOString(),
        admin: !!admin,
      },
      { headers: noStore },
    );
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    if (!env.BUCKET) throw new Fault('Penyimpanan foto belum tersedia.', 503);
    const owner = await deviceOwner(req),
      network = await networkKey(req),
      start = rollStart(),
      { rollSize } = await readConfig();
    if ((await countSince('owner', owner, start)) >= rollSize)
      throw new Fault('Roll hari ini sudah habis. Film baru tersedia jam 08.00 WITA.', 429);
    if ((await countSince('network', network, start)) >= NETWORK_DAILY_LIMIT)
      throw new Fault('Batas foto dari jaringan ini sudah tercapai hari ini.', 429);
    const film = req.headers.get('x-camera-film') || '';
    if (!(await availableFilmIds()).includes(film)) throw new Fault('Film tidak tersedia.');
    const bytes = jpegBytes(await req.arrayBuffer());
    const now = Date.now(),
      photo: PhotoRecord = {
        id: crypto.randomUUID(),
        owner,
        network,
        film,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + PHOTO_LIFE_MS).toISOString(),
      };
    await env.BUCKET.put('photo/' + photo.id, bytes, {
      httpMetadata: { contentType: 'image/jpeg' },
    });
    await database()
      .prepare("INSERT INTO records(id,kind,data) VALUES(?,'photo',?)")
      .bind(photo.id, JSON.stringify(photo))
      .run();
    await sweepExpired();
    return Response.json(
      {
        photo: view(photo),
        left: Math.max(0, rollSize - (await countSince('owner', owner, start))),
      },
      { headers: noStore },
    );
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    sameOrigin(req);
    const id = new URL(req.url).searchParams.get('id') || '',
      photo = await getPhoto(id);
    if (!photo) throw new Fault('Foto tidak ditemukan.', 404);
    const admin = await adminOrNull(req);
    if (!admin && photo.owner !== (await deviceOwner(req)))
      throw new Fault('Foto ini bukan milik perangkatmu.', 403);
    await deletePhoto(photo.id);
    return Response.json({ ok: true }, { headers: noStore });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Admin: show or hide a photo on the public Memoirs TV. */
export async function PATCH(req: Request) {
  try {
    sameOrigin(req);
    if (!(await adminOrNull(req))) throw new Fault('Hanya admin yang dapat mengatur Memoirs.', 403);
    const url = new URL(req.url),
      photo = await getPhoto(url.searchParams.get('id') || '');
    if (!photo) throw new Fault('Foto tidak ditemukan.', 404);
    await setMemoirs(photo.id, url.searchParams.get('memoirs') === '1');
    return Response.json({ ok: true }, { headers: noStore });
  } catch (e) {
    return errorResponse(e);
  }
}
