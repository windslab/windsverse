import { env } from 'cloudflare:workers';
import { errorResponse } from '@/lib/store';
import { authenticate } from '@/lib/auth';
import { Fault } from '@/lib/engine';
export async function POST(req: Request) {
  try {
    if (req.headers.get('origin') !== new URL(req.url).origin)
      throw new Fault('Asal permintaan tidak valid.', 403);
    const actor = await authenticate(req);
    if (!env.BUCKET) throw new Fault('Penyimpanan gambar belum tersedia.', 503);
    const bytes = await req.arrayBuffer();
    const b = new Uint8Array(bytes);
    let type = '';
    // 3D models (binary glTF) for the member gift catalogue.
    if (new TextDecoder().decode(b.slice(0, 4)) === 'glTF') {
      if (actor.role !== 'admin') throw new Fault('Hanya admin dapat mengunggah model 3D.', 403);
      if (bytes.byteLength > 20 * 1024 * 1024) throw new Fault('Model 3D maksimal 20 MB.', 413);
      type = 'model/gltf-binary';
    } else if (bytes.byteLength > 5 * 1024 * 1024) throw new Fault('Gambar maksimal 5 MB.', 413);
    else if (b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71) type = 'image/png';
    else if (b[0] === 255 && b[1] === 216 && b[2] === 255) type = 'image/jpeg';
    else if (
      new TextDecoder().decode(b.slice(0, 4)) === 'RIFF' &&
      new TextDecoder().decode(b.slice(8, 12)) === 'WEBP'
    )
      type = 'image/webp';
    if (!type) throw new Fault('Gunakan gambar PNG, JPEG, WebP, atau model 3D .glb.');
    const id = crypto.randomUUID();
    await env.BUCKET.put(id, bytes, { httpMetadata: { contentType: type } });
    return Response.json({ url: '/api/files/' + id });
  } catch (e) {
    return errorResponse(e);
  }
}
