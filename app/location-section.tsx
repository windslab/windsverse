import { Clock, MapPin, MessageCircle, Navigation } from 'lucide-react';
import { hoursRange, openDays, openNow } from '@/lib/hours';

/** wa.me wants the number in international form without symbols: 0812… becomes 62812…. */
const waNumber = (value: string) => value.replace(/\D/g, '').replace(/^0/, '62');

/** Where and when to find the cafe: the Google map, address and opening hours from Pengaturan. */
export default function LocationSection({ profile }: { profile: any }) {
  const hours = hoursRange(profile || {}),
    open = openNow(profile || {});
  if (!profile?.mapsEmbed && !hours && !profile?.address) return null;
  const wa = waNumber(profile.whatsapp || '');
  return (
    <section
      className={'location-section' + (profile.mapsEmbed ? '' : ' no-map')}
      id="lokasi"
      aria-labelledby="location-title"
    >
      <div className="location-copy">
        <span className="landing-kicker">LOKASI</span>
        <h2 id="location-title">Mampir ke {profile.name || 'Winds Space'}.</h2>
        {profile.address && (
          <p className="location-address">
            <MapPin size={17} />
            <span>{profile.address}</span>
          </p>
        )}
        {hours && (
          <div className="location-hours">
            <Clock size={17} />
            <div>
              <strong>{hours} WITA</strong>
              <span>{openDays(profile)}</span>
            </div>
            {open !== null && (
              <span className={'open-badge ' + (open ? 'open' : 'closed')}>
                {open ? 'Buka sekarang' : 'Sedang tutup'}
              </span>
            )}
          </div>
        )}
        <div className="location-actions">
          {profile.mapsUrl && (
            <a
              className="button primary landing-cta"
              href={profile.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Navigation size={17} />
              Petunjuk arah
            </a>
          )}
          {wa.length >= 9 && (
            <a
              className="button landing-library-cta"
              href={'https://wa.me/' + wa}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={17} />
              WhatsApp
            </a>
          )}
        </div>
      </div>
      {profile.mapsEmbed && (
        <div className="location-map">
          <iframe
            src={profile.mapsEmbed}
            title={'Peta lokasi ' + (profile.name || 'Winds Space')}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>
      )}
    </section>
  );
}
