import { env } from 'cloudflare:workers';
import { errorResponse } from '@/lib/store';
import { Fault } from '@/lib/engine';
import { adminOrNull, deviceOwner, getPhoto } from '@/lib/photos';

export const dynamic = 'force-dynamic';
/** Photo bytes for the owning device or an admin; fetched with headers, never by a public URL. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const photo = await getPhoto((await params).id);
    if (!photo || photo.expiresAt <= new Date().toISOString())
      throw new Fault('Foto tidak ditemukan.', 404);
    if (!(await adminOrNull(req)) && photo.owner !== (await deviceOwner(req)))
      throw new Fault('Foto ini bukan milik perangkatmu.', 403);
    const obj = await env.BUCKET?.get('photo/' + photo.id);
    if (!obj) throw new Fault('Foto tidak ditemukan.', 404);
    return new Response(obj.body, {
      headers: {
        'Content-Type': 'image/jpeg',
        // Same URL, different device: never let the browser reuse a response.
        'Cache-Control': 'no-store',
        Vary: 'x-camera-device, cookie',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
