import { env } from 'cloudflare:workers';

/** Raw LUT bytes for a preset. The client adds ?v=<updatedAt> so edits are never stale. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9-]{3,40}$/.test(id)) return new Response('Not found', { status: 404 });
  const obj = await env.BUCKET?.get('lut/' + id);
  if (!obj) return new Response('Not found', { status: 404 });
  return new Response(obj.body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
