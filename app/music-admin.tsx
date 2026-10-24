'use client';
// Cafe Management → Noisegasm: upload songs or set a YouTube playlist for the landing page radio.
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, LoaderCircle, Pencil, Trash2, Upload } from 'lucide-react';

type Track = { id: string; title: string; artist: string; size: number; src: string };
type Config = { source: 'upload' | 'youtube'; youtube: string; autoplay: boolean; volume: number };

const errorOf = (e: unknown, fallback: string) => (e instanceof Error && e.message) || fallback;
async function api<T>(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: 'no-store', ...init }),
    data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw Error(data.error || 'Permintaan belum berhasil.');
  return data;
}
const post = <T,>(body: unknown) =>
  api<T>('/api/music', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
/** Back from the stored form ("list:ID" / "video:ID") to a link the admin recognises. */
const youtubeLink = (target: string) => {
  const [kind, id] = target.split(':');
  return !id
    ? ''
    : kind === 'list'
      ? 'https://www.youtube.com/playlist?list=' + id
      : 'https://www.youtube.com/watch?v=' + id;
};
/** "Artist - Title.mp3" → { artist, title } */
const fromFileName = (name: string) => {
  const base = name
      .replace(/\.[^.]+$/, '')
      .replace(/_/g, ' ')
      .trim(),
    [artist, ...rest] = base.split(' - ');
  return rest.length
    ? { artist: artist.trim(), title: rest.join(' - ').trim() }
    : { artist: '', title: base };
};
const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1) + ' MB';

export default function MusicAdmin() {
  const [config, setConfig] = useState<Config | null>(null),
    [link, setLink] = useState(''),
    [tracks, setTracks] = useState<Track[]>([]),
    [uploading, setUploading] = useState(''),
    [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ config: Config; tracks: Track[] }>('/api/music');
      setConfig(data.config);
      setLink(youtubeLink(data.config.youtube));
      setTracks(data.tracks);
    } catch (e) {
      toast.error(errorOf(e, 'Data musik belum dapat dimuat.'));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const data = await post<{ config: Config }>({
        action: 'config',
        config: { ...config, youtube: link },
      });
      setConfig(data.config);
      setLink(youtubeLink(data.config.youtube));
      toast.success('Pengaturan Noisegasm tersimpan');
    } catch (e) {
      toast.error(errorOf(e, 'Belum tersimpan.'));
    } finally {
      setSaving(false);
    }
  };

  const upload = async (files: FileList) => {
    for (const [i, file] of [...files].entries()) {
      setUploading(`Mengunggah ${i + 1}/${files.length}: ${file.name}`);
      const { title, artist } = fromFileName(file.name);
      try {
        const { track } = await api<{ track: Track }>('/api/music', {
          method: 'PUT',
          headers: {
            'x-title': encodeURIComponent(title),
            'x-artist': encodeURIComponent(artist),
          },
          body: file,
        });
        setTracks((list) => [...list, { ...track, src: '/api/music/' + track.id }]);
      } catch (e) {
        toast.error(file.name + ': ' + errorOf(e, 'gagal diunggah'));
      }
    }
    setUploading('');
    toast.success('Unggahan selesai');
  };

  const rename = async (track: Track) => {
    const title = prompt('Judul lagu', track.title);
    if (title === null) return;
    const artist = prompt('Penyanyi / band', track.artist);
    if (artist === null) return;
    try {
      await post({ action: 'update', id: track.id, track: { title, artist } });
      setTracks((list) => list.map((t) => (t.id === track.id ? { ...t, title, artist } : t)));
    } catch (e) {
      toast.error(errorOf(e, 'Belum tersimpan.'));
    }
  };
  const move = async (index: number, dir: -1 | 1) => {
    const next = [...tracks],
      [item] = next.splice(index, 1);
    next.splice(index + dir, 0, item);
    setTracks(next);
    try {
      await post({ action: 'reorder', ids: next.map((t) => t.id) });
    } catch (e) {
      toast.error(errorOf(e, 'Urutan belum tersimpan.'));
      void load();
    }
  };
  const remove = async (track: Track) => {
    if (!confirm(`Hapus lagu "${track.title}"?`)) return;
    try {
      await post({ action: 'delete', id: track.id });
      setTracks((list) => list.filter((t) => t.id !== track.id));
    } catch (e) {
      toast.error(errorOf(e, 'Lagu belum terhapus.'));
    }
  };

  return (
    <>
      <div className="section-head">
        <h1>Noisegasm</h1>
        <p className="muted">Musik latar halaman depan, diputar lewat radio tua.</p>
      </div>
      <section className="panel camera-admin-section">
        <h2>Pengaturan</h2>
        {!config ? (
          <p className="muted">Memuat…</p>
        ) : (
          <div className="camera-admin-config">
            <fieldset>
              <legend>Sumber musik</legend>
              <label className="row">
                <input
                  type="radio"
                  name="music-source"
                  checked={config.source === 'upload'}
                  onChange={() => setConfig({ ...config, source: 'upload' })}
                />
                Lagu yang diunggah ({tracks.length})
              </label>
              <label className="row">
                <input
                  type="radio"
                  name="music-source"
                  checked={config.source === 'youtube'}
                  onChange={() => setConfig({ ...config, source: 'youtube' })}
                />
                Playlist YouTube
              </label>
            </fieldset>
            <label>
              Link playlist atau video YouTube
              <input
                value={link}
                placeholder="https://www.youtube.com/playlist?list=…"
                onChange={(e) => setLink(e.target.value)}
              />
            </label>
            <label className="row">
              <input
                type="checkbox"
                checked={config.autoplay}
                onChange={(e) => setConfig({ ...config, autoplay: e.target.checked })}
              />
              Putar otomatis saat halaman dibuka
            </label>
            <small className="muted">
              Browser baru mengizinkan suara setelah pengunjung menyentuh atau mengklik halaman.
              Musik akan mulai pada sentuhan pertama itu.
            </small>
            <label className="camera-slider">
              <span>
                Volume awal <small className="muted">{Math.round(config.volume * 100)}</small>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={config.volume}
                onChange={(e) => setConfig({ ...config, volume: Number(e.target.value) })}
              />
            </label>
            <button className="button primary" disabled={saving} onClick={() => void saveConfig()}>
              Simpan pengaturan
            </button>
          </div>
        )}
      </section>
      <section className="panel camera-admin-section">
        <div className="row between">
          <h2>Lagu yang diunggah</h2>
          <label className="button primary">
            {uploading ? <LoaderCircle size={16} className="spin" /> : <Upload size={16} />} Unggah
            lagu
            <input
              type="file"
              accept="audio/*,.mp3,.m4a,.ogg,.wav,.flac"
              multiple
              hidden
              disabled={!!uploading}
              onChange={(e) => {
                if (e.target.files?.length) void upload(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        {uploading && <p className="muted">{uploading}</p>}
        <small className="muted">
          MP3, M4A, OGG, WAV, atau FLAC, maksimal 20 MB per lagu. Nama file &quot;Penyanyi -
          Judul&quot; otomatis dipisah. Pastikan kafe punya izin memutar lagu-lagu ini.
        </small>
        {!tracks.length ? (
          <p className="muted">Belum ada lagu.</p>
        ) : (
          <ol className="camera-preset-list">
            {tracks.map((t, i) => (
              <li key={t.id}>
                <span>
                  <strong>
                    {i + 1}. {t.title}
                  </strong>
                  <small className="muted">
                    {t.artist || 'Tanpa nama penyanyi'} · {mb(t.size)}
                  </small>
                </span>
                <audio src={t.src} controls preload="none" className="music-admin-audio" />
                <button
                  className="icon-button"
                  aria-label="Naikkan"
                  disabled={i === 0}
                  onClick={() => void move(i, -1)}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Turunkan"
                  disabled={i === tracks.length - 1}
                  onClick={() => void move(i, 1)}
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Ubah judul"
                  onClick={() => void rename(t)}
                >
                  <Pencil size={16} />
                </button>
                <button className="icon-button" aria-label="Hapus" onClick={() => void remove(t)}>
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
