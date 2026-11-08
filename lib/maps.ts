/** Google hosts a pasted maps link may come from; anything else is refused. */
const GOOGLE = /(^|\.)google\.[a-z.]+$|^maps\.app\.goo\.gl$|^goo\.gl$|^g\.co$|^g\.page$/;
const SHORT = /^maps\.app\.goo\.gl$|^goo\.gl$|^g\.co$|^g\.page$/;

/** The URL inside a pasted link, or inside the src of a pasted <iframe> embed code. */
export function mapsLink(input: string): URL | null {
  const raw = input.trim().match(/src="([^"]+)"/)?.[1] ?? input.trim();
  try {
    const url = new URL(raw.replaceAll('&amp;', '&'));
    return url.protocol === 'https:' && GOOGLE.test(url.hostname) ? url : null;
  } catch {
    return null;
  }
}

export const isShortMapsLink = (url: URL) => SHORT.test(url.hostname);

const embed = (q: string, at?: string) =>
  'https://www.google.com/maps?q=' +
  encodeURIComponent(q) +
  (at ? '&ll=' + at : '') +
  '&z=16&output=embed';

/**
 * A map address that can sit in an iframe, read from a full Google Maps link: an embed link as
 * it is, or the place name or coordinates in a share link turned into Google's keyless embed.
 */
export function mapsEmbed(url: URL): string | null {
  if (!/(^|\.)google\.[a-z.]+$/.test(url.hostname) || !url.pathname.startsWith('/maps'))
    return null;
  if (url.pathname.startsWith('/maps/embed')) return url.href;
  const pin = url.href.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/),
    view = url.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/),
    at = pin ? pin[1] + ',' + pin[2] : view ? view[1] + ',' + view[2] : undefined;
  const place = url.pathname.match(/\/place\/([^/]+)/)?.[1];
  if (place) return embed(decodeURIComponent(place.replaceAll('+', ' ')), at);
  const q = url.searchParams.get('q') || url.searchParams.get('query');
  if (q) return embed(q);
  return at ? embed(at) : null;
}

/** Follows a short maps link (maps.app.goo.gl and friends) to the full link it stands for. */
export async function expandMapsLink(url: URL, fetcher: typeof fetch = fetch): Promise<URL | null> {
  let current = url;
  for (let hop = 0; hop < 4 && isShortMapsLink(current); hop++) {
    const response = await fetcher(current.href, { redirect: 'manual' });
    const next = response.headers.get('location');
    if (!next) return null;
    const found = mapsLink(new URL(next, current).href);
    // A cookie-consent stop carries the real address in its continue parameter.
    const resumed =
      found?.hostname.startsWith('consent.') && found.searchParams.get('continue')
        ? mapsLink(found.searchParams.get('continue')!)
        : found;
    if (!resumed) return null;
    current = resumed;
  }
  return isShortMapsLink(current) ? null : current;
}
