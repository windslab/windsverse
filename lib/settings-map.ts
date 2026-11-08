import { Fault } from './engine';
import { expandMapsLink, isShortMapsLink, mapsEmbed, mapsLink } from './maps';
import type { Row } from './model';

/**
 * Settings about to be saved, with the location map worked out on the server from the pasted
 * Google Maps link. A link left unchanged keeps the map it already has, so saving other settings
 * never calls Google; whatever map the browser sent is ignored.
 */
export async function settingsMap(data: Row, saved?: Row): Promise<Row> {
  const link = String(data.mapsUrl || '').trim();
  if (!link) return { ...data, mapsUrl: '', mapsEmbed: '' };
  if (saved?.mapsEmbed && saved.mapsUrl === link)
    return { ...data, mapsUrl: link, mapsEmbed: saved.mapsEmbed };
  let url = mapsLink(link);
  if (url && isShortMapsLink(url)) url = await expandMapsLink(url).catch(() => null);
  const embed = url && mapsEmbed(url);
  if (!embed)
    throw new Fault(
      'Link Google Maps belum dikenali. Di Google Maps, buka lokasi kafe, tekan Bagikan, lalu salin linknya.',
    );
  return { ...data, mapsUrl: link, mapsEmbed: embed };
}
