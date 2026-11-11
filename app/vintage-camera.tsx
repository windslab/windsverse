'use client';
// Story of Winds: a pocket digicam for guests. Live LCD with on-screen info, zoom rocker,
// D-pad to change film, MENU, playback, self-timer, focus beeps before the shutter, and REC for
// short videos. Each shot is developed on the phone with the chosen film and kept for 30 days.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, LoaderCircle, Trash2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { FILMS, develop, presetFilm, type Film, type PresetData } from '@/lib/film';
import styles from './vintage-camera.module.css';

type Photo = { id: string; film: string; createdAt: string; expiresAt: string; memoirs?: boolean };
type Roll = { left: number; roll: number; resetAt: string };
type Mode = 'shoot' | 'menu' | 'play';

const CONSENT_KEY = 'sow-consent-v3',
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
  /** Held in Luna's hand, or standing on her tripod. */
  mount?: (mount: 'hand' | 'tripod') => void;
  /** The scene's sound, for videos. */
  audio?: () => MediaStream | null;
  /** Called with each developed photo (explore mode can hang it in the tower's frame). */
  onPhoto?: (photo: Blob) => void;
  /** Windstopia: the player whose wallet earns the point when a photo goes up on Memoirs. */
  player?: () => string;
  onShared?: (wallet: unknown) => void;
};
/** The best video format this browser records. */
const videoType = () =>
  ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find(
    (t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t),
  ) ?? '';

export default function VintageCamera({
  open,
  onOpenChange,
  scene,
  mount = 'hand',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scene?: SceneLens;
  /** Explore mode: Luna's camera in her hand or on the tripod. */
  mount?: 'hand' | 'tripod';
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
    [recording, setRecording] = useState(false),
    [recSeconds, setRecSeconds] = useState(0),
    [clip, setClip] = useState<{ url: string; blob: Blob } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null),
    recFrame = useRef(0);
  const aim = useRef<{ id: number; x: number; y: number } | null>(null);
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    urls = useRef(new Map<string, string>());
  const sounds = useCameraSounds();
  const film = films[filmIndex] ?? films[0];

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
      scene.mount?.(mount);
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
  }, [open, consented, mode, facing, scene, mount]);

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
    await save(() => develop(v, film, { mirror: facing === 'user' && !scene, zoom }));
    setPhase('live');
  };

  /** Develops, uploads and briefly shows a print. */
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

  /**
   * OK on a photo: it is saved to the phone, and in Windstopia it also goes up on Memoirs,
   * which earns the day's photo point.
   */
  const keep = async (photo: Photo) => {
    await download(photo);
    const player = scene?.player?.();
    if (!player || photo.memoirs) return;
    try {
      const res = await fetch('/api/photos?memoirs=1&id=' + photo.id, {
          method: 'PATCH',
          headers: { ...headers(), 'x-windstopia-player': player },
        }),
        data = (await res.json()) as { counted?: boolean; error?: string };
      if (!res.ok) throw Error(data.error || 'Foto belum masuk Memoirs.');
      setPhotos((list) => list.map((p) => (p.id === photo.id ? { ...p, memoirs: true } : p)));
      setMessage(data.counted ? 'Masuk Memoirs · +1 poin' : 'Foto masuk Memoirs');
      scene?.onShared?.(data);
      setTimeout(() => setMessage(''), 2600);
    } catch (e) {
      setMessage(errorOf(e, 'Foto belum masuk Memoirs.'));
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
  const busy = phase !== 'live' || recording;

  // Video: the live picture drawn through the chosen film (the same look as its photos), with
  // the zoom, recorded until stopped (a minute at most). Kept on the device, not on the roll.
  const toggleVideo = () => {
    if (recording) return recorder.current?.stop();
    const v = video.current;
    if (!v?.videoWidth || typeof MediaRecorder === 'undefined')
      return setMessage('Browser ini belum bisa merekam video.');
    const scaleDown = Math.min(1, 1280 / v.videoWidth),
      canvas = document.createElement('canvas');
    canvas.width = Math.round(v.videoWidth * scaleDown);
    canvas.height = Math.round(v.videoHeight * scaleDown);
    const ctx = canvas.getContext('2d');
    if (!ctx || !canvas.captureStream) return setMessage('Browser ini belum bisa merekam video.');
    const look = film.preview,
      mirror = facing === 'user' && !scene;
    const draw = () => {
      const w = canvas.width,
        h = canvas.height,
        sw = v.videoWidth / zoom,
        sh = v.videoHeight / zoom;
      ctx.save();
      ctx.filter = look;
      if (mirror) {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(v, (v.videoWidth - sw) / 2, (v.videoHeight - sh) / 2, sw, sh, 0, 0, w, h);
      ctx.restore();
      recFrame.current = requestAnimationFrame(draw);
    };
    draw();
    const tracks = [...canvas.captureStream(30).getVideoTracks()];
    const sound = scene?.audio?.();
    if (sound) tracks.push(...sound.getAudioTracks());
    const type = videoType(),
      chunks: Blob[] = [],
      r = new MediaRecorder(new MediaStream(tracks), type ? { mimeType: type } : undefined);
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = () => {
      cancelAnimationFrame(recFrame.current);
      tracks.forEach((t) => t.kind === 'video' && t.stop());
      setRecording(false);
      const blob = new Blob(chunks, { type: r.mimeType || 'video/webm' });
      if (blob.size) setClip({ url: URL.createObjectURL(blob), blob });
    };
    recorder.current = r;
    r.start(500);
    sounds.click();
    setRecSeconds(0);
    setRecording(true);
  };
  useEffect(() => {
    if (!recording) return;
    const started = Date.now();
    const t = setInterval(() => {
      const secs = Math.floor((Date.now() - started) / 1000);
      setRecSeconds(secs);
      if (secs >= 60) recorder.current?.stop();
    }, 250);
    return () => clearInterval(t);
  }, [recording]);
  useEffect(() => () => void (clip && URL.revokeObjectURL(clip.url)), [clip]);
  // Closing the camera stops a recording.
  useEffect(() => {
    if (!open && recorder.current?.state === 'recording') recorder.current.stop();
  }, [open]);
  const saveClip = () => {
    if (!clip) return;
    const a = document.createElement('a');
    a.href = clip.url;
    a.download = `story-of-winds-${Date.now()}.${clip.blob.type.includes('mp4') ? 'mp4' : 'webm'}`;
    a.click();
  };
  const back = () => {
    sounds.click();
    setMode('shoot');
  };
  const pickFilm = (step: number) => {
    sounds.click();
    setFilmIndex((i) => {
      const next = (i + step + films.length) % films.length;
      store.set(FILM_KEY, films[next].id);
      return next;
    });
  };
  const ok = () => {
    if (mode === 'play') {
      if (photos[playIndex]) void keep(photos[playIndex]);
    } else if (mode === 'menu') back();
    else void shoot();
  };
  const dpad = (dir: 'up' | 'down' | 'left' | 'right') => {
    if (busy) return;
    if (mode === 'play') {
      if (dir === 'left') setPlayIndex((i) => Math.max(0, i - 1));
      if (dir === 'right') setPlayIndex((i) => Math.min(photos.length - 1, i + 1));
      if (dir === 'down' && photos[playIndex]) void remove(photos[playIndex]);
      sounds.click();
      return;
    }
    if (dir === 'left' || dir === 'right') pickFilm(dir === 'left' ? -1 : 1);
    else if (dir === 'up') {
      sounds.click();
      setFlash((f) => !f);
    } else {
      sounds.click();
      setTimer((t) => !t);
    }
  };
  const stepZoom = (step: number) => {
    sounds.click();
    setZoom((z) => Math.min(3, Math.max(1, +(z + step * 0.5).toFixed(1))));
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
        ? `◀ ▶ lihat foto · OK ${scene?.player ? 'simpan & masuk Memoirs' : 'unduh'} · 🗑 hapus`
        : 'Belum ada foto.'
      : !roll.left
        ? `Jatah hari ini habis. Jatah baru: ${resetLabel} WITA.`
        : '◀ ▶ ganti film · ⚡ kilat · ⏲ timer · W/T zoom';

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
        className={styles.dialog}
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
        <button className={styles.close} onClick={() => onOpenChange(false)} aria-label="Tutup">
          <X size={18} />
        </button>
        {!consented ? (
          <section className={styles.consent}>
            <span className={styles.kicker}>DIGICAM · WINDS SPACE</span>
            <h2>Story of Winds</h2>
            <p>Kamera saku kecil untukmu. Sebelum mulai memotret:</p>
            <ol>
              <li>
                Ada <strong>jatah jepretan harian</strong> per perangkat. Jatah baru tersedia setiap
                jam <strong>08.00 WITA</strong>.
              </li>
              <li>Foto tersimpan di sini selama 30 hari, lalu terhapus otomatis.</li>
              {scene ? (
                <li>
                  Foto hanya terlihat dari perangkatmu, kecuali foto yang kamu pilih dengan{' '}
                  <strong>OK: foto itu tampil untuk umum di Memoirs</strong>. Pengelola Winds Space
                  dapat melihat dan menghapus foto.
                </li>
              ) : (
                <li>
                  Foto hanya terlihat dari perangkatmu. Pengelola Winds Space dapat melihat dan
                  menghapus foto, dan <strong>foto pilihan bisa ditampilkan di Memoirs</strong>.
                </li>
              )}
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
              Nyalakan kamera
            </button>
          </section>
        ) : (
          <section className={styles.camera}>
            <div className={styles.topEdge}>
              <span
                className={styles.led}
                data-on={phase === 'countdown' || recording || undefined}
              />
              <span className={styles.model}>
                WINDS <b>SW-35</b>
              </span>
              <button
                className={styles.rec}
                aria-label={recording ? 'Berhenti merekam video' : 'Rekam video'}
                aria-pressed={recording}
                disabled={mode !== 'shoot' || (phase !== 'live' && !recording) || !!cameraError}
                onClick={toggleVideo}
              >
                {recording
                  ? `${String(Math.floor(recSeconds / 60)).padStart(2, '0')}:${String(recSeconds % 60).padStart(2, '0')}`
                  : 'REC'}
              </button>
              <button
                className={styles.shutter}
                aria-label="Jepret"
                disabled={mode !== 'shoot' || busy || !roll?.left || !!cameraError}
                onClick={() => void shoot()}
              />
            </div>

            <div className={styles.lcdBezel}>
              <div
                className={styles.lcd}
                style={scene ? { touchAction: 'none', cursor: 'grab' } : undefined}
                onWheel={(e) => mode === 'shoot' && stepZoom(e.deltaY < 0 ? 1 : -1)}
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
                        filter: film.preview,
                        transform: `scale(${zoom})${facing === 'user' && !scene ? ' scaleX(-1)' : ''}`,
                      }}
                    />
                    {review && <img className={styles.review} src={review} alt="Foto terbaru" />}
                    {recording && <b className={styles.recBadge}>● REC</b>}
                    {clip && (
                      <div className={styles.clip}>
                        <video src={clip.url} controls playsInline />
                        <div className={styles.clipActions}>
                          <button onClick={saveClip}>simpan video</button>
                          <button onClick={() => setClip(null)}>buang</button>
                        </div>
                      </div>
                    )}
                    <div className={styles.osd} aria-hidden>
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
                      </span>
                      {phase !== 'review' && (
                        <i
                          className={styles.focus}
                          data-state={phase === 'focus' || phase === 'saving' ? 'lock' : undefined}
                        />
                      )}
                      {phase === 'countdown' && <b className={styles.countdown}>{count}</b>}
                      {phase === 'saving' && (
                        <span className={styles.osdCenter}>
                          <LoaderCircle size={16} className="spin" /> MENYIMPAN
                        </span>
                      )}
                      {phase === 'review' && <span className={styles.osdCenter}>REVIEW</span>}
                      <span className={styles.osdBottom}>
                        {film.date ? <span className={styles.dateOn}>DATE</span> : <span />}
                        <span>{time}</span>
                      </span>
                    </div>
                    {mode === 'menu' && (
                      <div className={styles.menu} role="listbox" aria-label="Pilih film">
                        <strong>FILM</strong>
                        {films.map((f, i) => (
                          <button
                            key={f.id}
                            role="option"
                            aria-selected={i === filmIndex}
                            onClick={() => {
                              setFilmIndex(i);
                              store.set(FILM_KEY, f.id);
                              setMode('shoot');
                            }}
                          >
                            <i style={{ background: f.color }} />
                            {f.name}
                          </button>
                        ))}
                      </div>
                    )}
                    {cameraError && <p className={styles.lcdError}>{cameraError}</p>}
                    {blink && <i className={flash ? styles.flashBurst : styles.shutterBlink} />}
                  </>
                )}
              </div>
            </div>

            <div className={styles.controls}>
              <div className={styles.leftColumn}>
                <div className={styles.rocker} aria-label="Zoom">
                  <button aria-label="Perkecil" onClick={() => stepZoom(-1)}>
                    W
                  </button>
                  <button aria-label="Perbesar" onClick={() => stepZoom(1)}>
                    T
                  </button>
                </div>
                <div className={styles.smallButtons}>
                  <button
                    aria-pressed={mode === 'menu'}
                    onClick={() => {
                      if (busy) return;
                      sounds.click();
                      setMode((m) => (m === 'menu' ? 'shoot' : 'menu'));
                    }}
                  >
                    MENU
                  </button>
                  <button
                    aria-pressed={mode === 'play'}
                    aria-label="Lihat foto"
                    onClick={togglePlay}
                  >
                    ▶
                  </button>
                  <button
                    aria-label="Ganti kamera depan atau belakang"
                    onClick={() => {
                      sounds.click();
                      setFacing((f) => (f === 'user' ? 'environment' : 'user'));
                    }}
                  >
                    ⟲
                  </button>
                </div>
              </div>
              <div className={styles.dpad}>
                <button
                  className={styles.up}
                  onClick={() => dpad('up')}
                  aria-label="Lampu kilat"
                  disabled={mode === 'play'}
                >
                  ⚡
                </button>
                <button
                  className={styles.left}
                  onClick={() => dpad('left')}
                  aria-label={mode === 'play' ? 'Foto sebelumnya' : 'Film sebelumnya'}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  className={styles.ok}
                  aria-label={
                    mode === 'play'
                      ? scene?.player
                        ? 'Simpan foto dan masukkan ke Memoirs'
                        : 'Unduh foto'
                      : 'Jepret'
                  }
                  onClick={ok}
                >
                  {mode === 'play' ? <Download size={15} /> : 'OK'}
                </button>
                <button
                  className={styles.right}
                  onClick={() => dpad('right')}
                  aria-label={mode === 'play' ? 'Foto berikutnya' : 'Film berikutnya'}
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  className={styles.down}
                  onClick={() => dpad('down')}
                  aria-label={mode === 'play' ? 'Hapus foto' : 'Timer 3 detik'}
                >
                  {mode === 'play' ? <Trash2 size={13} /> : '⏲'}
                </button>
              </div>
            </div>

            <p className={styles.hint}>{hint}</p>
            <p className={styles.filmNote}>
              <i style={{ background: film.color }} /> {film.name}
              {film.note ? ' — ' + film.note : ''}
            </p>
            {message && (
              <p role="alert" className={styles.message}>
                {message}
              </p>
            )}
          </section>
        )}
      </DialogContent>
    </Dialog>
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
