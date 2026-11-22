import { Star } from 'lucide-react';

/**
 * Sends a guest to write a Google review of the café: the review link from Pengaturan, or the
 * café on Google Maps (where "Tulis ulasan" is one tap away) while that is empty.
 */
export function reviewLink(profile: { reviewUrl?: string; mapsUrl?: string } | undefined) {
  return profile?.reviewUrl || profile?.mapsUrl || '';
}

export default function ReviewButton({
  profile,
  className = 'button',
}: {
  profile: { reviewUrl?: string; mapsUrl?: string } | undefined;
  className?: string;
}) {
  const href = reviewLink(profile);
  if (!href) return null;
  return (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer">
      <Star size={17} aria-hidden />
      Beri ulasan di Google Maps
    </a>
  );
}
