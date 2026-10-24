import { body, checkMutation, errorResponse } from '@/lib/store';
import { Fault } from '@/lib/engine';
import { adminOrNull } from '@/lib/photos';
import {
  addTrack,
  deleteTrack,
  listTracks,
  readMusicConfig,
  reorderTracks,
  saveMusicConfig,
  updateTrack,
} from '@/lib/music';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };

/** Public: what the landing page should play. */
export async function GET() {
  try {
    const [config, tracks] = await Promise.all([readMusicConfig(), listTracks()]);
    return Response.json(
      {
        config,
        tracks: tracks.map((t) => ({
          id: t.id,
          title: t.title,
          artist: t.artist,
          size: t.size,
          src: '/api/music/' + t.id,
        })),
      },
      { headers: noStore },
    );
  } catch (e) {
    return errorResponse(e);
  }
}

/** Admin settings and track edits (JSON). */
export async function POST(req: Request) {
  try {
    checkMutation(req);
    if (!(await adminOrNull(req))) throw new Fault('Hanya admin yang dapat mengatur musik.', 403);
    const p = await body(req);
    if (p.action === 'config') return Response.json({ config: await saveMusicConfig(p.config) });
    if (p.action === 'update') await updateTrack(String(p.id), p.track);
    else if (p.action === 'reorder') await reorderTracks(p.ids);
    else if (p.action === 'delete') await deleteTrack(String(p.id));
    else throw new Fault('Perintah tidak dikenal.');
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Admin upload: raw audio body, title and artist in headers (URI-encoded). */
export async function PUT(req: Request) {
  try {
    if (
      req.headers.get('origin') !== new URL(req.url).origin ||
      req.headers.get('sec-fetch-site') === 'cross-site'
    )
      throw new Fault('Permintaan harus berasal dari aplikasi ini.', 403);
    if (!(await adminOrNull(req))) throw new Fault('Hanya admin yang dapat mengunggah lagu.', 403);
    const decode = (name: string) => {
      try {
        return decodeURIComponent(req.headers.get(name) || '');
      } catch {
        return '';
      }
    };
    const track = await addTrack(await req.arrayBuffer(), decode('x-title'), decode('x-artist'));
    return Response.json({ track });
  } catch (e) {
    return errorResponse(e);
  }
}
