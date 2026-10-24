'use client';
// Story of Winds: a 35 mm-style camera for guests. Wind the film, look through the viewfinder,
// press the shutter, and the shot is developed with a warm film look and kept for 30 days.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Aperture,
  Download,
  Images,
  LoaderCircle,
  RefreshCw,
  Trash2,
  X,
  Zap,
  ZapOff,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { FILMS, develop, filmById, type Film } from '@/lib/film';
import styles from './vintage-camera.module.css';

type Photo = { id: string; film: string; createdAt: string; expiresAt: string };
type Roll = { left: number; roll: number; resetAt: string; admin: boolean };

const CONSENT_KEY = 'sow-consent-v1',
  DEVICE_KEY = 'sow-device',
  FILM_KEY = 'sow-film';

const store = {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Private mode: the camera still works for this visit. */
    }
  },
};
let memoryDevice = '';
/** Random token that identifies this browser's roll; only its hash is stored on the server. */
function deviceToken() {
  let token = store.get(DEVICE_KEY) || memoryDevice;
  if (!/^[a-f0-9]{32}$/.test(token)) {
    token = [...crypto.getRandomValues(new Uint8Array(16))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    store.set(DEVICE_KEY, token);
  }
  memoryDevice = token;
  return token;
}
const headers = () => ({ 'x-camera-device': deviceToken() });

/** Short mechanical sounds made on the fly, so no audio files need to load. */
function useCameraSounds() {
  const ctx = useRef<AudioContext | null>(null);
  const audio = () => {
    try {
      ctx.current ??= new AudioContext();
      return ctx.current;
    } catch {
      return null;
    }
  };
  const burst = (at: number, length: number, gain: number, freq: number) => {
    const a = audio();
    if (!a) return;
    const buffer = a.createBuffer(1, Math.ceil(a.sampleRate * length), a.sampleRate),
      data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
    const src = a.createBufferSource(),
      filter = a.createBiquadFilter(),
      amp = a.createGain();
    src.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    amp.gain.value = gain;
    src.connect(filter).connect(amp).connect(a.destination);
    src.start(a.currentTime + at);
  };
  return {
    shutter() {
      burst(0, 0.03, 0.9, 2400);
      burst(0.07, 0.05, 0.6, 1200);
    },
    tick() {
      burst(0, 0.012, 0.35, 3200);
    },
  };
}

const vibrate = (pattern: number | number[]) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* Not supported. */
  }
};

export default function VintageCamera({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [consented, setConsented] = useState(false),
    [agree, setAgree] = useState(false),
    [view, setView] = useState<'camera' | 'album'>('camera'),
    [film, setFilm] = useState<Film>(FILMS[0]),
    [facing, setFacing] = useState<'environment' | 'user'>('environment'),
    [flash, setFlash] = useState(false),
    [wound, setWound] = useState(false),
    [winding, setWinding] = useState(0),
    [busy, setBusy] = useState(false),
    [flashing, setFlashing] = useState(false),
    [cameraError, setCameraError] = useState(''),
    [message, setMessage] = useState(''),
    [roll, setRoll] = useState<Roll | null>(null),
    [photos, setPhotos] = useState<Photo[]>([]),
    [adminAll, setAdminAll] = useState(false),
    [developed, setDeveloped] = useState<{ url: string; photo: Photo } | null>(null);
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    urls = useRef(new Map<string, string>()),
    lever = useRef<{ x: number; start: number } | null>(null);
  const sounds = useCameraSounds();

  useEffect(() => {
    if (!open) return;
    setConsented(store.get(CONSENT_KEY) === '1');
    const saved = store.get(FILM_KEY);
    if (saved) setFilm(filmById(saved));
  }, [open]);

  const loadRoll = useCallback(async (all = false) => {
    try {
      const res = await fetch('/api/photos' + (all ? '?all=1' : ''), {
          headers: headers(),
          cache: 'no-store',
        }),
        data: any = await res.json();
      if (!res.ok) throw Error(data.error || 'Album belum dapat dimuat.');
      setPhotos(data.photos);
      if (!all)
        setRoll({ left: data.left, roll: data.roll, resetAt: data.resetAt, admin: data.admin });
    } catch (e: any) {
      setMessage(e.message || 'Album belum dapat dimuat.');
    }
  }, []);

  useEffect(() => {
    if (open && consented) void loadRoll();
  }, [open, consented, loadRoll]);

  // Camera stream follows the dialog, the viewfinder tab and the chosen lens.
  useEffect(() => {
    if (!open || !consented || view !== 'camera') return;
    let cancelled = false;
    setCameraError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        'Browser ini belum mendukung kamera. Coba buka di Chrome atau Safari terbaru.',
      );
      return;
    }
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } },
        audio: false,
      })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play().catch(() => {});
        }
      })
      .catch(() =>
        setCameraError(
          'Kamera belum diizinkan. Izinkan akses kamera di pengaturan browser, lalu buka lagi.',
        ),
      );
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, [open, consented, view, facing]);

  // Free downloaded photos when the camera closes.
  useEffect(() => {
    if (open) return;
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current.clear();
    setDeveloped(null);
    setView('camera');
    setAdminAll(false);
  }, [open]);

  const photoUrl = useCallback(async (id: string) => {
    const cached = urls.current.get(id);
    if (cached) return cached;
    const res = await fetch('/api/photos/' + id, { headers: headers(), cache: 'no-store' });
    if (!res.ok) throw Error('Foto tidak dapat dibuka.');
    const url = URL.createObjectURL(await res.blob());
    urls.current.set(id, url);
    return url;
  }, []);

  const advance = (amount: number) => {
    if (wound || busy || !roll?.left) return;
    const next = Math.min(1, winding + amount);
    if (Math.floor(next * 6) > Math.floor(winding * 6)) {
      sounds.tick();
      vibrate(6);
    }
    setWinding(next);
    if (next >= 1) {
      setWound(true);
      setWinding(0);
      vibrate([10, 30, 10]);
    }
  };

  const shoot = async () => {
    if (!wound || busy || !video.current || !roll?.left) return;
    const v = video.current;
    if (!v.videoWidth) return;
    sounds.shutter();
    vibrate(25);
    setFlashing(true);
    setTimeout(() => setFlashing(false), flash ? 260 : 120);
    setWound(false);
    setBusy(true);
    setMessage('');
    try {
      const blob = await develop(v, film, { mirror: facing === 'user' });
      const res = await fetch('/api/photos', {
          method: 'POST',
          headers: { ...headers(), 'x-camera-film': film.id, 'content-type': 'image/jpeg' },
          body: blob,
        }),
        data: any = await res.json();
      if (!res.ok) throw Error(data.error || 'Foto belum tersimpan.');
      const url = URL.createObjectURL(blob);
      urls.current.set(data.photo.id, url);
      setDeveloped({ url, photo: data.photo });
      setPhotos((p) => [data.photo, ...p]);
      setRoll((r) => (r ? { ...r, left: data.left } : r));
    } catch (e: any) {
      setMessage(e.message || 'Foto belum tersimpan.');
      void loadRoll();
    } finally {
      setBusy(false);
    }
  };

  const download = async (photo: Photo) => {
    try {
      const a = document.createElement('a');
      a.href = await photoUrl(photo.id);
      a.download =
        'story-of-winds-' + photo.createdAt.slice(0, 10) + '-' + photo.id.slice(0, 6) + '.jpg';
      a.click();
    } catch (e: any) {
      setMessage(e.message);
    }
  };

  const remove = async (photo: Photo) => {
    if (!confirm('Hapus foto ini? Foto yang dihapus tidak bisa dikembalikan.')) return;
    const res = await fetch('/api/photos?id=' + photo.id, { method: 'DELETE', headers: headers() });
    if (!res.ok) {
      setMessage(((await res.json()) as any).error || 'Foto belum terhapus.');
      return;
    }
    setPhotos((p) => p.filter((x) => x.id !== photo.id));
    if (developed?.photo.id === photo.id) setDeveloped(null);
  };

  const resetLabel = roll
    ? new Date(roll.resetAt).toLocaleString('id-ID', {
        timeZone: 'Asia/Makassar',
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={styles.dialog} showCloseButton={false}>
        <DialogTitle className="sr-only">Story of Winds</DialogTitle>
        <DialogDescription className="sr-only">
          Kamera film Winds Space dengan filter vintage. 15 jepretan per hari.
        </DialogDescription>
        <button className={styles.close} onClick={() => onOpenChange(false)} aria-label="Tutup">
          <X size={18} />
        </button>
        {!consented ? (
          <section className={styles.consent}>
            <span className={styles.kicker}>VINTAGE BOOTH · WINDS SPACE</span>
            <h2>Story of Winds</h2>
            <p>Kamera film kecil untukmu. Sebelum mulai memotret:</p>
            <ol>
              <li>
                Satu roll berisi <strong>15 jepretan per hari</strong> per perangkat. Film baru
                tersedia setiap jam <strong>08.00 WITA</strong>.
              </li>
              <li>Foto tersimpan di sini selama 30 hari, lalu terhapus otomatis.</li>
              <li>
                Foto hanya terlihat dari perangkatmu sendiri. Pengelola Winds Space dapat melihat
                dan menghapus foto untuk menjaga kenyamanan bersama.
              </li>
              <li>Dilarang memotret konten SARA, pornografi, kekerasan, atau melanggar hukum.</li>
            </ol>
            <label className={styles.agree}>
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              Saya sudah membaca dan menyetujui aturan di atas.
            </label>
            <button
              className={styles.primary}
              disabled={!agree}
              onClick={() => {
                store.set(CONSENT_KEY, '1');
                setConsented(true);
              }}
            >
              Masukkan film
            </button>
          </section>
        ) : (
          <>
            <nav className={styles.tabs} aria-label="Bagian kamera">
              <button aria-pressed={view === 'camera'} onClick={() => setView('camera')}>
                <Aperture size={16} /> Kamera
              </button>
              <button
                aria-pressed={view === 'album'}
                onClick={() => {
                  setView('album');
                  setDeveloped(null);
                }}
              >
                <Images size={16} /> Album ({photos.length})
              </button>
            </nav>
            {view === 'camera' ? (
              <section className={styles.body}>
                <div className={styles.topPlate}>
                  <div
                    className={styles.counter}
                    aria-label={'Sisa jepretan ' + (roll?.left ?? '…')}
                  >
                    <span>{roll ? String(roll.left).padStart(2, '0') : '··'}</span>
                    <small>SISA</small>
                  </div>
                  <span className={styles.brand}>STORY OF WINDS 35</span>
                  <button
                    className={styles.flashToggle}
                    aria-pressed={flash}
                    aria-label={flash ? 'Matikan lampu kilat' : 'Nyalakan lampu kilat'}
                    onClick={() => setFlash((f) => !f)}
                  >
                    {flash ? <Zap size={16} /> : <ZapOff size={16} />}
                  </button>
                </div>
                <div className={styles.viewfinder}>
                  {developed ? (
                    <img
                      className={styles.developing}
                      src={developed.url}
                      alt="Foto yang baru dicuci"
                    />
                  ) : (
                    <>
                      <video
                        ref={video}
                        playsInline
                        muted
                        style={{
                          filter: film.preview,
                          transform: facing === 'user' ? 'scaleX(-1)' : undefined,
                        }}
                      />
                      <i className={styles.frameLines} />
                      {film.date && <span className={styles.dateHint}>DATE</span>}
                    </>
                  )}
                  {cameraError && <p className={styles.cameraError}>{cameraError}</p>}
                  {busy && (
                    <p className={styles.status}>
                      <LoaderCircle size={16} className="spin" /> Mencuci film…
                    </p>
                  )}
                  {flashing && <i className={flash ? styles.flashBurst : styles.shutterBlink} />}
                </div>
                {developed ? (
                  <div className={styles.afterShot}>
                    <button className={styles.secondary} onClick={() => download(developed.photo)}>
                      <Download size={16} /> Unduh
                    </button>
                    <button className={styles.primary} onClick={() => setDeveloped(null)}>
                      Foto lagi
                    </button>
                  </div>
                ) : (
                  <div className={styles.controls}>
                    <button
                      className={styles.flip}
                      aria-label="Ganti kamera depan atau belakang"
                      onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
                    >
                      <RefreshCw size={18} />
                    </button>
                    <button
                      className={styles.shutter}
                      disabled={!wound || busy || !roll?.left || !!cameraError}
                      aria-label="Jepret"
                      onClick={() => void shoot()}
                    />
                    <div
                      className={styles.lever}
                      role="slider"
                      tabIndex={0}
                      aria-label="Tuas penggulung film. Geser ke kanan untuk menggulung."
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={wound ? 100 : Math.round(winding * 100)}
                      data-wound={wound || undefined}
                      onPointerDown={(e) => {
                        e.currentTarget.setPointerCapture(e.pointerId);
                        lever.current = { x: e.clientX, start: winding };
                      }}
                      onPointerMove={(e) => {
                        if (!lever.current) return;
                        const dx = e.clientX - lever.current.x;
                        if (dx > 0) advance(dx / 160 - (winding - lever.current.start));
                      }}
                      onPointerUp={(e) => {
                        const start = lever.current;
                        lever.current = null;
                        // A tap winds a third of the way, like short strokes on a real lever.
                        if (start && Math.abs(e.clientX - start.x) < 6) advance(0.34);
                      }}
                      onPointerCancel={() => {
                        lever.current = null;
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault();
                          advance(0.34);
                        }
                      }}
                    >
                      <span style={{ transform: `rotate(${(wound ? 1 : winding) * 70}deg)` }} />
                    </div>
                  </div>
                )}
                <p className={styles.hint}>
                  {!roll
                    ? 'Memuat roll…'
                    : !roll.left
                      ? `Roll hari ini habis. Film baru: ${resetLabel} WITA.`
                      : wound
                        ? 'Film siap. Tekan tombol rana.'
                        : 'Geser atau ketuk tuas di kanan untuk menggulung film.'}
                </p>
                <div className={styles.films} role="radiogroup" aria-label="Pilih film">
                  {FILMS.map((f) => (
                    <button
                      key={f.id}
                      role="radio"
                      aria-checked={film.id === f.id}
                      className={styles.film}
                      style={{ '--film': f.color } as React.CSSProperties}
                      onClick={() => {
                        setFilm(f);
                        store.set(FILM_KEY, f.id);
                      }}
                    >
                      <i />
                      <span>{f.name}</span>
                    </button>
                  ))}
                </div>
                <p className={styles.filmNote}>{film.note}</p>
              </section>
            ) : (
              <Album
                photos={photos}
                admin={!!roll?.admin}
                all={adminAll}
                onAll={(all) => {
                  setAdminAll(all);
                  void loadRoll(all);
                }}
                photoUrl={photoUrl}
                onDownload={download}
                onDelete={remove}
              />
            )}
            {message && (
              <p role="alert" className={styles.message}>
                {message}
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Album({
  photos,
  admin,
  all,
  onAll,
  photoUrl,
  onDownload,
  onDelete,
}: {
  photos: Photo[];
  admin: boolean;
  all: boolean;
  onAll: (all: boolean) => void;
  photoUrl: (id: string) => Promise<string>;
  onDownload: (p: Photo) => void;
  onDelete: (p: Photo) => void;
}) {
  return (
    <section className={styles.album}>
      {admin && (
        <label className={styles.agree}>
          <input type="checkbox" checked={all} onChange={(e) => onAll(e.target.checked)} />
          Tampilkan foto semua tamu (admin)
        </label>
      )}
      {!photos.length ? (
        <p className={styles.empty}>Belum ada foto. Gulung filmnya dan mulai memotret.</p>
      ) : (
        <div className={styles.grid}>
          {photos.map((p) => (
            <AlbumPhoto
              key={p.id}
              photo={p}
              photoUrl={photoUrl}
              onDownload={onDownload}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function AlbumPhoto({
  photo,
  photoUrl,
  onDownload,
  onDelete,
}: {
  photo: Photo;
  photoUrl: (id: string) => Promise<string>;
  onDownload: (p: Photo) => void;
  onDelete: (p: Photo) => void;
}) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let live = true;
    photoUrl(photo.id)
      .then((u) => live && setUrl(u))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [photo.id, photoUrl]);
  const days = Math.max(0, Math.ceil((Date.parse(photo.expiresAt) - Date.now()) / 86_400_000));
  return (
    <figure className={styles.print}>
      {url ? <img src={url} alt={'Foto ' + filmById(photo.film).name} /> : <span />}
      <figcaption>
        <small>
          {filmById(photo.film).name} · {days} hari lagi
        </small>
        <span>
          <button aria-label="Unduh foto" onClick={() => onDownload(photo)}>
            <Download size={15} />
          </button>
          <button aria-label="Hapus foto" onClick={() => onDelete(photo)}>
            <Trash2 size={15} />
          </button>
        </span>
      </figcaption>
    </figure>
  );
}
