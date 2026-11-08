import { MapPin, MessageCircle, Navigation } from 'lucide-react';

/** wa.me wants the number in international form without symbols: 0812… becomes 62812…. */
const waNumber = (value: string) => value.replace(/\D/g, '').replace(/^0/, '62');

/** Where the cafe is: the Google map set in Pengaturan, the address, and ways to get there. */
export default function LocationSection({ profile }: { profile: any }) {
  if (!profile?.mapsEmbed) return null;
  const wa = waNumber(profile.whatsapp || '');
  return (
    <section className="location-section" id="lokasi" aria-labelledby="location-title">
      <div className="location-copy">
        <span className="landing-kicker">LOKASI</span>
        <h2 id="location-title">Mampir ke {profile.name || 'Winds Space'}.</h2>
        {profile.address && (
          <p className="location-address">
            <MapPin size={17} />
            <span>{profile.address}</span>
          </p>
        )}
        <div className="location-actions">
          <a
            className="button primary landing-cta"
            href={profile.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Navigation size={17} />
            Petunjuk arah
          </a>
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
      <div className="location-map">
        <iframe
          src={profile.mapsEmbed}
          title={'Peta lokasi ' + (profile.name || 'Winds Space')}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      </div>
    </section>
  );
}
