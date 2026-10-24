import type { TVAlbum } from '@/lib/drive-tv';
import { listPhotos } from '@/lib/photos';
import { filmName } from '@/lib/film-ids';

export const dynamic = 'force-dynamic';
/** Memoirs: Story of Winds photos an admin chose to show (newest first). */
export async function GET() {
  try {
    const photos = await listPhotos({ memoirs: true });
    const album: TVAlbum = {
      photos: photos.map((p) => ({
        id: p.id,
        name: filmName(p.film),
        album: 'Story of Winds',
        src: '/api/photos/' + p.id,
      })),
      partial: false,
      updatedAt: new Date().toISOString(),
    };
    return Response.json(album, { headers: { 'Cache-Control': 'public, max-age=60' } });
  } catch {
    return Response.json(
      { error: 'Memoirs belum dapat dimuat. Coba lagi sebentar lagi.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
