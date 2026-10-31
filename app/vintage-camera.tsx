'use client';
// Story of Winds: a rangefinder-style digital camera for guests, seen from the back. The body is
// landscape; on a phone held upright it turns to stand vertically and shoots portrait.
// Top: film dial, shutter, exposure (EV) dial, command wheel for zoom, VIEW MODE (front/back
// lens) and FLASH. Back: playback, delete, DISP/BACK, Q menu (upload, timer, grid), focus lever
// and a D-pad ring with MENU/OK. Each shot or upload is developed on the phone with the chosen
// film and kept for 30 days.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
} from 'react';
import { LoaderCircle, Play, Trash2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  FILMS,
  LANDSCAPE_ASPECT,
  PRINT_ASPECT,
  develop,
  presetFilm,
  type Film,
  type PresetData,
} from '@/lib/film';
import styles from './vintage-camera.module.css';

type Photo = { id: string; film: string; createdAt: string; expiresAt: string };
type Roll = { left: number; roll: number; resetAt: string };
type Mode = 'shoot' | 'menu' | 'quick' | 'play';

/** Exposure compensation in thirds of a stop, −2 to +2 like a real EV dial. */
const EV_STEPS = Array.from({ length: 13 }, (_, i) => (i - 6) / 3);
const evLabel = (ev: number) =>
  ev === 0 ? '±0' : (ev > 0 ? '+' : '−') + Math.abs(ev).toFixed(1).replace('.0', '');
const PORTRAIT_QUERY = '(orientation: portrait) and (pointer: coarse)';

const CONSENT_KEY = 'sow-consent-v2',
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
const errorOf = (e: unknown, fallback: string) => (e instanceof Error && e.message) || fallback;

/** Beeps and shutter noise made on the fly, so no audio files need to load. */
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
  const noise = (at: number, length: number, gain: number, freq: number) => {
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
  const tone = (at: number, freq: number, length = 0.06, gain = 0.12) => {
    const a = audio();
    if (!a) return;
    const osc = a.createOscillator(),
      amp = a.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(gain, a.currentTime + at);
    amp.gain.exponentialRampToValueAtTime(0.001, a.currentTime + at + length);
    osc.connect(amp).connect(a.destination);
    osc.start(a.currentTime + at);
    osc.stop(a.currentTime + at + length + 0.02);
  };
  return {
    focus() {
      tone(0, 2600);
      tone(0.1, 2600);
    },
    shutter() {
      noise(0, 0.03, 0.9, 2400);
      noise(0.06, 0.05, 0.5, 1300);
    },
    click() {
      tone(0, 1800, 0.025, 0.06);
    },
    timer() {
      tone(0, 2200, 0.05, 0.08);
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
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Explore mode: the "lens" is Luna's camera inside the 3D café instead of the device camera.
 * Everything else (films, daily roll, album, Memoirs) is the same Story of Winds.
 */
export type SceneLens = {
  start: () => void;
  stop: () => void;
  stream: () => MediaStream | null;
  /** Drag on the screen to aim. */
  look: (dx: number, dy: number) => void;
  facing: (facing: 'environment' | 'user') => void;
  /** Called with each developed photo (explore mode can hang it in the tower's frame). */
  onPhoto?: (photo: Blob) => void;
};

export default function VintageCamera({
  open,
  onOpenChange,
  scene,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scene?: SceneLens;
}) {
  const [consented, setConsented] = useState(false),
    [agree, setAgree] = useState(false),
    [mode, setMode] = useState<Mode>('shoot'),
    [films, setFilms] = useState<Film[]>(FILMS),
    [filmIndex, setFilmIndex] = useState(0),
    [facing, setFacing] = useState<'environment' | 'user'>('environment'),
    [flash, setFlash] = useState(false),
    [timer, setTimer] = useState(false),
    [zoom, setZoom] = useState(1),
    [phase, setPhase] = useState<'live' | 'focus' | 'countdown' | 'saving' | 'review'>('live'),
    [count, setCount] = useState(0),
    [blink, setBlink] = useState(false),
    [cameraError, setCameraError] = useState(''),
    [message, setMessage] = useState(''),
    [roll, setRoll] = useState<Roll | null>(null),
    [photos, setPhotos] = useState<Photo[]>([]),
    [playIndex, setPlayIndex] = useState(0),
    [review, setReview] = useState(''),
    [clock, setClock] = useState(() => new Date()),
    [evIndex, setEvIndex] = useState(6),
    [grid, setGrid] = useState(false),
    [info, setInfo] = useState(true),
    [menuIndex, setMenuIndex] = useState(0);
  const aim = useRef<{ id: number; x: number; y: number } | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    urls = useRef(new Map<string, string>());
  const sounds = useCameraSounds();
  const film = films[filmIndex] ?? films[0];
  const ev = EV_STEPS[evIndex];

  // Held upright, a phone is a camera turned vertical: the body stands up and shoots portrait.
  const portrait = useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(PORTRAIT_QUERY);
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    },
    () => window.matchMedia(PORTRAIT_QUERY).matches,
    () => false,
  );

  useEffect(() => {
    if (!open) return;
    setConsented(store.get(CONSENT_KEY) === '1');
    const t = setInterval(() => setClock(new Date()), 30_000);
    return () => clearInterval(t);
  }, [open]);

  // Films: built-ins the admin left visible, then admin presets (LUTs load when chosen).
  useEffect(() => {
    if (!open) return;
    void fetch('/api/camera', { cache: 'no-store' })
      .then(
        (r) => r.json() as Promise<{ config: { hiddenFilms: string[] }; presets: PresetData[] }>,
      )
      .then(({ config, presets }) => {
        const list = [
          ...FILMS.filter((f) => !config.hiddenFilms.includes(f.id)),
          ...presets.map((p) => presetFilm(p)),
        ];
        if (!list.length) return;
        setFilms(list);
        const saved = list.findIndex((f) => f.id === store.get(FILM_KEY));
        setFilmIndex(saved < 0 ? 0 : saved);
      })
      .catch(() => {});
  }, [open]);

  // Fetch a preset's LUT the first time it is selected.
  useEffect(() => {
    const preset = film as Film & PresetData;
    if (!open || !preset.custom || !preset.lutSize || preset.lut) return;
    let live = true;
    void fetch('/api/camera/lut/' + preset.id + '?v=' + encodeURIComponent(preset.updatedAt ?? ''))
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((buffer) => {
        if (!live) return;
        const lut = { size: preset.lutSize!, data: new Uint8Array(buffer) };
        setFilms((list) => list.map((f) => (f.id === preset.id ? { ...f, lut } : f)));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [open, film]);

  const loadRoll = useCallback(async () => {
    try {
      const res = await fetch('/api/photos', { headers: headers(), cache: 'no-store' }),
        data = (await res.json()) as Roll & { photos: Photo[]; error?: string };
      if (!res.ok) throw Error(data.error || 'Album belum dapat dimuat.');
      setPhotos(data.photos);
      setRoll({ left: data.left, roll: data.roll, resetAt: data.resetAt });
    } catch (e) {
      setMessage(errorOf(e, 'Album belum dapat dimuat.'));
    }
  }, []);

  useEffect(() => {
    if (open && consented) void loadRoll();
  }, [open, consented, loadRoll]);

  // The camera runs only while shooting, and follows the chosen lens.
  useEffect(() => {
    if (!open || !consented || mode !== 'shoot') return;
    let cancelled = false;
    setCameraError('');
    if (scene) {
      // Luna's camera: the 3D view itself is the live picture.
      scene.start();
      scene.facing(facing);
      const s = scene.stream();
      if (!s) {
        setCameraError(
          'Browser ini belum bisa merekam tampilan 3D. Coba Chrome atau Safari terbaru.',
        );
        return () => scene.stop();
      }
      stream.current = s;
      if (video.current) {
        video.current.srcObject = s;
        void video.current.play().catch(() => {});
      }
      return () => {
        s.getTracks().forEach((t) => t.stop());
        stream.current = null;
        scene.stop();
      };
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Browser ini belum mendukung kamera. Coba Chrome atau Safari terbaru.');
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
        setCameraError('Kamera belum diizinkan. Izinkan akses kamera di browser, lalu buka lagi.'),
      );
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, [open, consented, mode, facing, scene]);

  useEffect(() => {
    if (open) return;
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current.clear();
    setMode('shoot');
    setPhase('live');
    setReview('');
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

  const pickFilm = (step: number) => {
    sounds.click();
    setFilmIndex((i) => {
      const next = (i + step + films.length) % films.length;
      store.set(FILM_KEY, films[next].id);
      return next;
    });
  };

  const shoot = async () => {
    const v = video.current;
    if (phase !== 'live' || mode !== 'shoot' || !v?.videoWidth || !roll?.left || cameraError)
      return;
    setMessage('');
    if (timer) {
      setPhase('countdown');
      for (let s = 3; s > 0; s--) {
        setCount(s);
        sounds.timer();
        await wait(1000);
      }
    }
    setPhase('focus');
    sounds.focus();
    vibrate(8);
    await wait(380);
    sounds.shutter();
    vibrate(25);
    setBlink(true);
    setTimeout(() => setBlink(false), flash ? 260 : 110);
    setPhase('saving');
    await save(() =>
      develop(v, film, {
        mirror: facing === 'user' && !scene,
        zoom,
        aspect: portrait ? PRINT_ASPECT : LANDSCAPE_ASPECT,
        exposure: ev,
      }),
    );
    setPhase('live');
  };

  /** Develops, uploads and briefly shows a print; shared by the shutter and photo uploads. */
  const save = async (make: () => Promise<Blob>) => {
    try {
      const blob = await make();
      const res = await fetch('/api/photos', {
          method: 'POST',
          headers: { ...headers(), 'x-camera-film': film.id, 'content-type': 'image/jpeg' },
          body: blob,
        }),
        data = (await res.json()) as { photo: Photo; left: number; error?: string };
      if (!res.ok) throw Error(data.error || 'Foto belum tersimpan.');
      scene?.onPhoto?.(blob);
      const url = URL.createObjectURL(blob);
      urls.current.set(data.photo.id, url);
      setPhotos((p) => [data.photo, ...p]);
      setRoll((r) => (r ? { ...r, left: data.left } : r));
      setReview(url);
      setPhase('review');
      await wait(2200);
      setReview('');
    } catch (e) {
      setMessage(errorOf(e, 'Foto belum tersimpan.'));
      void loadRoll();
    }
  };

  /** Q menu → Unggah foto: a picture from the gallery, developed with the chosen film. */
  const uploadPhoto = async (file: File) => {
    if (phase !== 'live' || !roll?.left) {
      setMessage(roll && !roll.left ? 'Jatah hari ini habis.' : 'Tunggu sebentar.');
      return;
    }
    setMessage('');
    setMode('shoot');
    setPhase('saving');
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      // The print keeps the picture's own orientation.
      const aspect = img.naturalWidth >= img.naturalHeight ? LANDSCAPE_ASPECT : PRINT_ASPECT;
      await save(() => develop(img, film, { aspect, exposure: ev }));
    } catch {
      setMessage('Foto tidak dapat dibuka. Coba foto JPG atau PNG lain.');
    } finally {
      URL.revokeObjectURL(url);
      setPhase('live');
    }
  };

  const download = async (photo: Photo) => {
    try {
      const a = document.createElement('a');
      a.href = await photoUrl(photo.id);
      a.download =
        'story-of-winds-' + photo.createdAt.slice(0, 10) + '-' + photo.id.slice(0, 6) + '.jpg';
      a.click();
    } catch (e) {
      setMessage(errorOf(e, 'Foto belum dapat diunduh.'));
    }
  };

  const remove = async (photo: Photo) => {
    if (!confirm('Hapus foto ini? Jepretan tetap terhitung dan foto tidak bisa dikembalikan.'))
      return;
    const res = await fetch('/api/photos?id=' + photo.id, {
      method: 'DELETE',
      headers: headers(),
    });
    if (!res.ok) {
      setMessage(((await res.json()) as { error?: string }).error || 'Foto belum terhapus.');
      return;
    }
    setPhotos((p) => p.filter((x) => x.id !== photo.id));
    setPlayIndex((i) => Math.max(0, i - 1));
  };

  const resetLabel = roll
    ? new Date(roll.resetAt).toLocaleString('id-ID', {
        timeZone: 'Asia/Makassar',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';
  const time = clock.toLocaleString('id-ID', {
    timeZone: 'Asia/Makassar',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const busy = phase !== 'live';
  const quickItems = [
    'Unggah foto dari galeri',
    `Timer 3 detik: ${timer ? 'ON' : 'OFF'}`,
    `Lampu kilat: ${flash ? 'ON' : 'OFF'}`,
    `Garis bantu: ${grid ? 'ON' : 'OFF'}`,
    `Lensa: ${facing === 'user' ? 'depan (selfie)' : 'belakang'}`,
  ];
  /** Q menu settings (item 0, the upload, opens the file picker instead). */
  const toggleQuick = (i: number) => {
    if (i === 1) setTimer((t) => !t);
    else if (i === 2) setFlash((f) => !f);
    else if (i === 3) setGrid((g) => !g);
    else setFacing((f) => (f === 'user' ? 'environment' : 'user'));
  };
  const back = () => {
    sounds.click();
    setMode('shoot');
  };
  const openMenu = (next: 'menu' | 'quick') => {
    if (busy) return;
    sounds.click();
    setMenuIndex(next === 'menu' ? filmIndex : 0);
    setMode((m) => (m === next ? 'shoot' : next));
  };
  const ok = () => {
    if (mode === 'menu') {
      setFilmIndex(menuIndex);
      store.set(FILM_KEY, films[menuIndex].id);
      back();
    } else if (mode === 'quick') {
      sounds.click();
      if (menuIndex === 0) {
        upload.current?.click();
        setMode('shoot');
      } else toggleQuick(menuIndex);
    } else if (mode === 'play') {
      if (photos[playIndex]) void download(photos[playIndex]);
    } else openMenu('menu');
  };
  const dpad = (dir: 'up' | 'down' | 'left' | 'right') => {
    if (busy) return;
    sounds.click();
    if (mode === 'menu' || mode === 'quick') {
      const length = mode === 'menu' ? films.length : quickItems.length;
      if (dir === 'up') setMenuIndex((i) => (i - 1 + length) % length);
      else if (dir === 'down') setMenuIndex((i) => (i + 1) % length);
      else if (dir === 'left') back();
      else ok();
      return;
    }
    if (mode === 'play') {
      if (dir === 'left') setPlayIndex((i) => Math.max(0, i - 1));
      if (dir === 'right') setPlayIndex((i) => Math.min(photos.length - 1, i + 1));
      return;
    }
    if (dir === 'left' || dir === 'right') pickFilm(dir === 'left' ? -1 : 1);
    else if (dir === 'up') setTimer((t) => !t);
    else setFlash((f) => !f);
  };
  const stepEv = (step: number) => {
    sounds.click();
    setEvIndex((i) => Math.min(EV_STEPS.length - 1, Math.max(0, i + step)));
  };
  const stepZoom = (step: number) => {
    sounds.click();
    setZoom((z) => Math.min(3, Math.max(1, +(z + step * 0.25).toFixed(2))));
  };
  const togglePlay = () => {
    if (busy) return;
    sounds.click();
    setPlayIndex(0);
    setMode((m) => (m === 'play' ? 'shoot' : 'play'));
  };
  const hint = !roll
    ? 'Memuat roll…'
    : mode === 'play'
      ? photos.length
        ? '◀ ▶ lihat foto · OK unduh · 🗑 hapus · ▶ kembali'
        : 'Belum ada foto. Tekan ▶ untuk kembali.'
      : mode === 'menu' || mode === 'quick'
        ? '▲ ▼ pilih · OK pakai · BACK kembali'
        : !roll.left
          ? `Jatah hari ini habis. Jatah baru: ${resetLabel} WITA.`
          : 'Knob FILM & EV bisa diputar · roda: zoom · Q: unggah foto';

  // Keyboard on a computer: space = shutter, arrows = D-pad, Enter = OK, Esc = back.
  const keys = useRef({ dpad, ok, back, shoot });
  useEffect(() => {
    keys.current = { dpad, ok, back, shoot };
  });
  useEffect(() => {
    if (!open || !consented) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select')) return;
      const k = keys.current;
      const map: Record<string, () => void> = {
        ' ': () => void k.shoot(),
        ArrowUp: () => k.dpad('up'),
        ArrowDown: () => k.dpad('down'),
        ArrowLeft: () => k.dpad('left'),
        ArrowRight: () => k.dpad('right'),
        Enter: () => k.ok(),
      };
      if (!map[e.key]) return;
      e.preventDefault();
      map[e.key]();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, consented]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={consented ? styles.stage : styles.dialog}
        showCloseButton={false}
        onEscapeKeyDown={(e) => {
          if (mode !== 'shoot') {
            e.preventDefault();
            back();
          }
        }}
      >
        <DialogTitle className="sr-only">Story of Winds</DialogTitle>
        <DialogDescription className="sr-only">
          Kamera digital Winds Space dengan film vintage. Jepretan terbatas per hari.
        </DialogDescription>
        {!consented ? (
          <>
            <button className={styles.close} onClick={() => onOpenChange(false)} aria-label="Tutup">
              <X size={18} />
            </button>
            <section className={styles.consent}>
              <span className={styles.kicker}>DIGICAM · WINDS SPACE</span>
              <h2>Story of Winds</h2>
              <p>Kamera kecil untukmu. Sebelum mulai memotret:</p>
              <ol>
                <li>
                  Ada <strong>jatah jepretan harian</strong> per perangkat (termasuk foto yang
                  diunggah). Jatah baru tersedia setiap jam <strong>08.00 WITA</strong>.
                </li>
                <li>Foto tersimpan di sini selama 30 hari, lalu terhapus otomatis.</li>
                <li>
                  Foto hanya terlihat dari perangkatmu. Pengelola Winds Space dapat melihat dan
                  menghapus foto, dan <strong>foto pilihan bisa ditampilkan di Memoirs</strong>.
                </li>
                <li>Dilarang memotret konten SARA, pornografi, kekerasan, atau melanggar hukum.</li>
              </ol>
              <label className={styles.agree}>
                <input
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                />
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
                Nyalakan kamera
              </button>
            </section>
          </>
        ) : (
          <section className={styles.body} data-portrait={portrait || undefined}>
            <input
              ref={upload}
              id="sow-upload"
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void uploadPhoto(file);
              }}
            />
            {/* Top plate */}
            <div className={styles.plate} />
            <button
              className={styles.closeBody}
              onClick={() => onOpenChange(false)}
              aria-label="Tutup kamera"
            >
              <X />
            </button>
            <div className={styles.eyecup} aria-hidden>
              <i className={styles.diopter} />
              <i className={styles.eyeGlass} />
              <i className={styles.eyeSensor} />
            </div>
            <span className={styles.led} data-on={phase === 'countdown' || undefined} />
            <label className={styles.topButton} style={{ left: '35em' }}>
              <span>VIEW{'\n'}MODE</span>
              <button
                aria-label="Ganti lensa depan atau belakang"
                onClick={() => {
                  sounds.click();
                  setFacing((f) => (f === 'user' ? 'environment' : 'user'));
                }}
              />
            </label>
            <label className={styles.topButton} style={{ left: '48em' }}>
              <span>FLASH</span>
              <button
                aria-label="Lampu kilat"
                aria-pressed={flash}
                onClick={() => {
                  sounds.click();
                  setFlash((f) => !f);
                }}
              />
            </label>
            <Dial
              className={styles.filmDial}
              label="FILM"
              value={film.name}
              ariaLabel="Knob film: putar untuk ganti film"
              portrait={portrait}
              onStep={(s) => !busy && mode === 'shoot' && pickFilm(s)}
            />
            <button
              className={styles.shutter}
              aria-label="Jepret"
              disabled={mode !== 'shoot' || busy || !roll?.left || !!cameraError}
              onClick={() => void shoot()}
            />
            <Dial
              className={styles.evDial}
              label="EV"
              value={evLabel(ev)}
              ariaLabel="Knob kompensasi cahaya: putar untuk lebih terang atau gelap"
              portrait={portrait}
              onStep={(s) => stepEv(s)}
            />
            <Dial
              className={styles.wheel}
              label="ZOOM"
              value={zoom.toFixed(1) + '×'}
              ariaLabel="Roda zoom: putar untuk memperbesar"
              portrait={portrait}
              flat
              onStep={(s) => stepZoom(s)}
            />

            {/* Back: LCD */}
            <div className={styles.lcdBezel}>
              <div
                className={styles.lcd}
                style={scene ? { touchAction: 'none', cursor: 'grab' } : undefined}
                onPointerDown={(e) => {
                  if (!scene || mode !== 'shoot') return;
                  aim.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
                }}
                onPointerMove={(e) => {
                  const a = aim.current;
                  if (!scene || !a || a.id !== e.pointerId) return;
                  scene.look(e.clientX - a.x, e.clientY - a.y);
                  aim.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
                }}
                onPointerUp={() => (aim.current = null)}
                onPointerCancel={() => (aim.current = null)}
              >
                <div className={styles.screen}>
                  {mode === 'play' ? (
                    <Playback
                      photo={photos[playIndex]}
                      index={playIndex}
                      total={photos.length}
                      photoUrl={photoUrl}
                    />
                  ) : (
                    <>
                      <video
                        ref={video}
                        playsInline
                        muted
                        style={{
                          filter: `${film.preview} brightness(${Math.pow(2, ev * 0.6).toFixed(2)})`,
                          transform: `scale(${zoom})${facing === 'user' && !scene ? ' scaleX(-1)' : ''}`,
                        }}
                      />
                      {review && <img className={styles.review} src={review} alt="Foto terbaru" />}
                      {grid && <i className={styles.grid} aria-hidden />}
                      <div className={styles.osd} aria-hidden hidden={!info && phase === 'live'}>
                        <span className={styles.osdTop}>
                          <span>
                            <i className={styles.battery} /> P
                          </span>
                          <span>{film.name.toUpperCase()}</span>
                          <span>[{roll ? String(roll.left).padStart(2, '0') : '--'}]</span>
                        </span>
                        <span className={styles.osdSide}>
                          <span>{flash ? '⚡ ON' : '⚡ OFF'}</span>
                          {timer && <span>⏲ 3s</span>}
                          {zoom > 1 && <span>{zoom.toFixed(1)}×</span>}
                          {ev !== 0 && <span>EV {evLabel(ev)}</span>}
                        </span>
                        {phase !== 'review' && (
                          <i
                            className={styles.focus}
                            data-state={
                              phase === 'focus' || phase === 'saving' ? 'lock' : undefined
                            }
                          />
                        )}
                        {phase === 'countdown' && <b className={styles.countdown}>{count}</b>}
                        {phase === 'saving' && (
                          <span className={styles.osdCenter}>
                            <LoaderCircle size={14} className="spin" /> MENYIMPAN
                          </span>
                        )}
                        {phase === 'review' && <span className={styles.osdCenter}>REVIEW</span>}
                        <span className={styles.osdBottom}>
                          {film.date ? <span className={styles.dateOn}>DATE</span> : <span />}
                          <span>{time}</span>
                        </span>
                      </div>
                      {(mode === 'menu' || mode === 'quick') && (
                        <div
                          className={styles.menu}
                          role="listbox"
                          aria-label={mode === 'menu' ? 'Pilih film' : 'Menu cepat'}
                        >
                          <strong>{mode === 'menu' ? 'FILM' : 'Q MENU'}</strong>
                          {mode === 'menu'
                            ? films.map((f, i) => (
                                <button
                                  key={f.id}
                                  role="option"
                                  aria-selected={i === menuIndex}
                                  onClick={() => {
                                    setFilmIndex(i);
                                    store.set(FILM_KEY, f.id);
                                    back();
                                  }}
                                >
                                  <i style={{ background: f.color }} />
                                  {f.name}
                                </button>
                              ))
                            : quickItems.map((label, i) =>
                                i === 0 ? (
                                  <label
                                    key={i}
                                    htmlFor="sow-upload"
                                    role="option"
                                    aria-selected={i === menuIndex}
                                    onClick={() => {
                                      sounds.click();
                                      setMode('shoot');
                                    }}
                                  >
                                    {label}
                                  </label>
                                ) : (
                                  <button
                                    key={i}
                                    role="option"
                                    aria-selected={i === menuIndex}
                                    onClick={() => {
                                      sounds.click();
                                      setMenuIndex(i);
                                      toggleQuick(i);
                                    }}
                                  >
                                    {label}
                                  </button>
                                ),
                              )}
                        </div>
                      )}
                      {cameraError && <p className={styles.lcdError}>{cameraError}</p>}
                      {blink && <i className={flash ? styles.flashBurst : styles.shutterBlink} />}
                    </>
                  )}
                  {message && (
                    <p role="alert" className={styles.lcdMessage}>
                      {message}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Back: buttons */}
            <button
              className={styles.lever}
              aria-label="Tuas fokus: garis bantu"
              aria-pressed={grid}
              onClick={() => {
                sounds.click();
                setGrid((g) => !g);
              }}
            />
            <button
              className={styles.round}
              style={{ top: '28.5em' }}
              aria-label="Lihat foto"
              aria-pressed={mode === 'play'}
              onClick={togglePlay}
            >
              <Play />
            </button>
            <button
              className={styles.round}
              style={{ top: '35.5em' }}
              aria-label="Hapus foto"
              disabled={mode !== 'play' || !photos[playIndex]}
              onClick={() => photos[playIndex] && void remove(photos[playIndex])}
            >
              <Trash2 />
            </button>
            <button
              className={styles.round + ' ' + styles.text}
              style={{ top: '42.5em' }}
              aria-label={mode === 'shoot' ? 'Tampilkan atau sembunyikan info layar' : 'Kembali'}
              onClick={() => {
                if (mode === 'shoot') {
                  sounds.click();
                  setInfo((v) => !v);
                } else back();
              }}
            >
              <span>DISP{'\n'}BACK</span>
            </button>
            <button
              className={styles.q}
              aria-label="Menu cepat: unggah foto, timer, kilat, garis bantu"
              aria-pressed={mode === 'quick'}
              onClick={() => openMenu('quick')}
            >
              Q
            </button>
            <div className={styles.dpad}>
              <span className={styles.drive}>DRIVE</span>
              <button className={styles.up} aria-label="Atas: timer" onClick={() => dpad('up')} />
              <button className={styles.left} aria-label="Kiri" onClick={() => dpad('left')} />
              <button className={styles.right} aria-label="Kanan" onClick={() => dpad('right')} />
              <button
                className={styles.down}
                aria-label="Bawah: kilat"
                onClick={() => dpad('down')}
              />
              <button className={styles.ok} aria-label="Menu / OK" onClick={ok}>
                MENU{'\n'}OK
              </button>
            </div>
            <i className={styles.leather} aria-hidden />

            {/* Bottom edge */}
            <p className={styles.strip}>
              <span>
                <i style={{ background: film.color }} /> {film.name}
                {film.note ? ' — ' + film.note : ''}
              </span>
              <span>{hint}</span>
            </p>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * A dial seen edge-on from the back of the camera (or a flat command wheel). Drag sideways to
 * turn it one click at a time, scroll over it, use the arrow keys, or tap its left/right half.
 */
function Dial({
  className,
  label,
  value,
  ariaLabel,
  portrait,
  flat,
  onStep,
}: {
  className: string;
  label: string;
  value: string;
  ariaLabel: string;
  portrait: boolean;
  flat?: boolean;
  onStep: (step: 1 | -1) => void;
}) {
  const [turn, setTurn] = useState(0);
  const drag = useRef<{ id: number; at: number; moved: boolean } | null>(null);
  const step = (s: 1 | -1) => {
    setTurn((t) => t + s);
    onStep(s);
  };
  // On a phone held upright the body is turned a quarter, so "sideways" is down the screen.
  const along = (e: PointerEvent) => (portrait ? e.clientY : e.clientX);
  return (
    <div
      className={styles.dial + ' ' + className + (flat ? ' ' + styles.flat : '')}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuenow={turn}
      aria-valuetext={value}
      style={{ '--turn': turn } as React.CSSProperties}
      onPointerDown={(e) => {
        drag.current = { id: e.pointerId, at: along(e), moved: false };
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* Pointer already gone. */
        }
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        const delta = along(e) - d.at;
        const notch = Math.max(10, e.currentTarget.getBoundingClientRect().width / 8);
        if (Math.abs(delta) >= notch) {
          d.moved = true;
          d.at = along(e);
          step(delta > 0 ? 1 : -1);
        }
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (!d || d.moved) return;
        const box = e.currentTarget.getBoundingClientRect();
        const middle = portrait ? box.top + box.height / 2 : box.left + box.width / 2;
        step(along(e) >= middle ? 1 : -1);
      }}
      onPointerCancel={() => (drag.current = null)}
      onWheel={(e) => step(e.deltaY + e.deltaX > 0 ? 1 : -1)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') step(1);
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') step(-1);
        else return;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <span className={styles.dialLabel}>
        {label} <b>{value}</b>
      </span>
      <i className={styles.knurl} />
    </div>
  );
}

function Playback({
  photo,
  index,
  total,
  photoUrl,
}: {
  photo?: Photo;
  index: number;
  total: number;
  photoUrl: (id: string) => Promise<string>;
}) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!photo) return;
    let live = true;
    photoUrl(photo.id)
      .then((u) => live && setUrl(u))
      .catch(() => {});
    return () => {
      live = false;
      setUrl('');
    };
  }, [photo, photoUrl]);
  if (!photo)
    return (
      <div className={styles.playEmpty}>
        <span>▶ PLAY</span>
        <p>Belum ada foto. Tekan ▶ lagi untuk kembali memotret.</p>
      </div>
    );
  return (
    <div className={styles.play}>
      {url ? <img src={url} alt={'Foto ' + (index + 1)} /> : <LoaderCircle className="spin" />}
      <span className={styles.osdTop}>
        <span>▶ PLAY</span>
        <span>
          {index + 1}/{total}
        </span>
      </span>
      <span className={styles.osdBottom}>
        <span>
          {new Date(photo.createdAt).toLocaleDateString('id-ID', {
            timeZone: 'Asia/Makassar',
            day: '2-digit',
            month: 'short',
          })}
        </span>
        <span>
          hapus otomatis{' '}
          {new Date(photo.expiresAt).toLocaleDateString('id-ID', {
            timeZone: 'Asia/Makassar',
            day: '2-digit',
            month: 'short',
          })}
        </span>
      </span>
    </div>
  );
}
