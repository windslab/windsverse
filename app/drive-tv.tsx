'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Camera,
  Pause,
  Play,
  RefreshCw,
} from 'lucide-react';
import { TV_DRIVE_URL, type TVAlbum, type TVPhoto } from '@/lib/drive-tv';
export type TVProgram = { photoId: string; playing: boolean };
let albumCache: TVAlbum | undefined;
let albumReadAt = 0;
let albumRequest: Promise<TVAlbum> | undefined;
function requestAlbum(force = false) {
  if (!force && albumCache && Date.now() - albumReadAt < 300_000)
    return Promise.resolve(albumCache);
  if (!albumRequest)
    albumRequest = fetch('/api/tv', { cache: 'no-store' })
      .then(async (response) => {
        const data = (await response.json()) as TVAlbum & { error?: string };
        if (!response.ok) throw new Error(data.error || 'Album tidak dapat dimuat.');
        albumCache = data;
        albumReadAt = Date.now();
        return data;
      })
      .finally(() => {
        albumRequest = undefined;
      });
  return albumRequest;
}
export default function DriveTV({
  focused = true,
  active = true,
  onFocus,
  program,
  onProgramChange,
}: {
  focused?: boolean;
  active?: boolean;
  onFocus?: () => void;
  program: TVProgram;
  onProgramChange: (program: TVProgram) => void;
}) {
  const [album, setAlbum] = useState<TVAlbum | undefined>(albumCache),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(!albumCache),
    [loadedId, setLoadedId] = useState(''),
    [failedId, setFailedId] = useState(''),
    [previous, setPrevious] = useState<TVPhoto>();
  const programRef = useRef(program);
  programRef.current = program;
  const lastLoaded = useRef<TVPhoto | undefined>(undefined);
  const photos = album?.photos || [],
    index = Math.max(
      0,
      photos.findIndex((photo) => photo.id === program.photoId),
    ),
    selected = photos[index];
  const change = (patch: Partial<TVProgram>) =>
    onProgramChange({ ...programRef.current, ...patch });
  useEffect(() => {
    setPrevious(lastLoaded.current);
  }, [selected?.id]);
  const refresh = async () => {
    setLoading(true);
    try {
      setAlbum(await requestAlbum(true));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Album tidak dapat dimuat.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (!active) return;
    let mounted = true;
    const read = () => {
      requestAlbum()
        .then((data) => {
          if (mounted) {
            setAlbum(data);
            setError('');
          }
        })
        .catch(() => {
          if (mounted) setError('Album belum dapat dimuat. Coba muat ulang.');
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });
    };
    read();
    const timer = setInterval(read, 300_000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [active]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const reduce = () => {
      if (media.matches) change({ playing: false });
    };
    reduce();
    media.addEventListener('change', reduce);
    return () => media.removeEventListener('change', reduce);
  }, []);
  useEffect(() => {
    if (!active || !program.playing || photos.length < 2) return;
    const timer = setTimeout(
      () => change({ photoId: photos[(index + 1) % photos.length].id }),
      8000,
    );
    return () => clearTimeout(timer);
  }, [active, program.playing, selected?.id, photos]);
  const move = (offset: number) => {
    if (photos.length)
      change({
        photoId: photos[(index + offset + photos.length) % photos.length].id,
        playing: false,
      });
  };
  return (
    <section className="drive-tv" aria-label="TV album foto Winds Space">
      <header>
        <Camera size={19} />
        <div>
          <strong>WINDS SPACE</strong>
          <span>Moments at Winds Space</span>
        </div>
        <a
          href={TV_DRIVE_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Buka album Google Drive"
        >
          <ArrowUpRight size={20} />
        </a>
      </header>
      <div className="tv-photo-stage" aria-busy={loading && !photos.length}>
        {previous && previous.id !== selected?.id && (
          <img
            className="tv-photo tv-photo-previous"
            src={previous.src}
            alt=""
            referrerPolicy="no-referrer"
          />
        )}
        {selected && (
          <img
            key={selected.id}
            className={'tv-photo ' + (loadedId === selected.id ? 'tv-photo-visible' : '')}
            src={selected.src}
            alt="Foto suasana Winds Space"
            referrerPolicy="no-referrer"
            decoding="async"
            onLoad={() => {
              setLoadedId(selected.id);
              setFailedId('');
              lastLoaded.current = selected;
            }}
            onError={() => setFailedId(selected.id)}
          />
        )}
        {!photos.length && (
          <div className="tv-photo-message">
            <Camera size={32} />
            <p>{loading ? 'Menyiapkan album…' : error || 'Belum ada foto publik di album ini.'}</p>
            <button type="button" onClick={() => void refresh()} disabled={loading}>
              Muat ulang album
            </button>
          </div>
        )}
        {selected && failedId === selected.id && (
          <div className="tv-photo-error">Foto belum tersedia. Coba foto berikutnya.</div>
        )}
        {selected && (
          <div className="tv-photo-caption">
            <span>WINDS SPACE</span>
            <small>
              {index + 1} / {photos.length}
            </small>
          </div>
        )}
      </div>
      <div className="tv-playback">
        <button
          type="button"
          aria-label="Foto sebelumnya"
          disabled={!photos.length}
          onClick={() => move(-1)}
        >
          <ChevronLeft size={18} />
        </button>
        <select
          aria-label="Pilih foto"
          disabled={!photos.length}
          value={selected?.id || ''}
          onChange={(e) => change({ photoId: e.target.value, playing: false })}
        >
          {!photos.length && <option value="">Album foto</option>}
          {photos.map((photo, i) => (
            <option key={photo.id} value={photo.id}>
              Foto {i + 1} · {photo.album}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Foto berikutnya"
          disabled={!photos.length}
          onClick={() => move(1)}
        >
          <ChevronRight size={18} />
        </button>
        <button
          type="button"
          aria-label={program.playing ? 'Jeda slideshow' : 'Putar slideshow'}
          aria-pressed={program.playing}
          disabled={!photos.length}
          onClick={() => change({ playing: !program.playing })}
        >
          {program.playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button
          type="button"
          aria-label="Muat ulang album"
          disabled={loading}
          onClick={() => void refresh()}
        >
          <RefreshCw size={15} />
        </button>
      </div>
      <footer>
        <a href={TV_DRIVE_URL} target="_blank" rel="noopener noreferrer">
          Album Google Drive <ArrowUpRight size={13} />
        </a>
        <small>
          {error && photos.length
            ? 'Pembaruan tertunda'
            : album?.partial
              ? 'Pilihan foto · lihat album lengkap'
              : 'Foto berganti setiap 8 detik'}
        </small>
      </footer>
      {!focused && onFocus && (
        <button
          type="button"
          className="tv-focus-cover"
          aria-label="Dekati TV foto"
          onClick={onFocus}
        >
          <span>
            <Play size={22} /> Tonton TV
          </span>
        </button>
      )}
    </section>
  );
}
