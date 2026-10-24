import { env } from 'cloudflare:workers';
import { getTrack } from '@/lib/music';

/** Streams a song with Range support (Safari will not play audio without it). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const track = await getTrack((await params).id);
  if (!track || !env.BUCKET) return new Response('Not found', { status: 404 });
  const size = track.size,
    match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '');
  const base = {
    'Content-Type': track.type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
  };
  if (match && (match[1] || match[2])) {
    let start = match[1] ? Number(match[1]) : size - Number(match[2]),
      end = match[1] && match[2] ? Number(match[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end)
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    const obj = await env.BUCKET.get('music/' + track.id, {
      range: { offset: start, length: end - start + 1 },
    });
    if (!obj) return new Response('Not found', { status: 404 });
    return new Response(obj.body, {
      status: 206,
      headers: {
        ...base,
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Content-Length': String(end - start + 1),
      },
    });
  }
  const obj = await env.BUCKET.get('music/' + track.id);
  if (!obj) return new Response('Not found', { status: 404 });
  return new Response(obj.body, { headers: { ...base, 'Content-Length': String(size) } });
}
