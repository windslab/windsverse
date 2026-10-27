'use client';
// Luna's digicam in explore mode: photos and videos of the 3D world, held in her hand (she can
// keep walking while it records) or set on her tripod to film or photograph herself. Zoom, tilt
// the picture and drag on the screen to aim. Nothing is uploaded: keep a shot by saving it to
// the device (or hang a photo in the tower's frame).
import { useEffect, useRef, useState } from 'react';
import type { ExploreApi } from './explore-mode';
import styles from './explore-digicam.module.css';

type Result = { kind: 'photo' | 'video'; url: string; blob: Blob };

const stamp = () => {
  const d = new Date(),
    two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
};
/** The best recording format this browser offers. */
const videoType = () =>
  ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find(
    (t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t),
  ) ?? '';

export default function Digicam({
  api,
  mount,
  onClose,
  onHang,
}: {
  api: ExploreApi;
  mount: 'hand' | 'tripod';
  onClose: () => void;
  /** Hang a photo (data URL) in the tower's frame. */
  onHang: (url: string) => void;
}) {
  const lens = api.photo;
  const [mode, setMode] = useState<'foto' | 'video'>('foto'),
    [zoom, setZoom] = useState(1),
    [roll, setRoll] = useState(0),
    [selfie, setSelfie] = useState(false),
    [timer, setTimer] = useState(mount === 'tripod' ? 3 : 0),
    [count, setCount] = useState(0),
    [recording, setRecording] = useState(false),
    [elapsed, setElapsed] = useState(0),
    [result, setResult] = useState<Result | null>(null),
    [error, setError] = useState('');
  const stream = useRef<MediaStream | null>(null),
    video = useRef<HTMLVideoElement | null>(null),
    recorder = useRef<MediaRecorder | null>(null),
    chunks = useRef<Blob[]>([]),
    drag = useRef<{ id: number; x: number; y: number } | null>(null);

  // Look through the lens while the digicam is open.
  useEffect(() => {
    lens.start();
    lens.mount(mount);
    if (mount === 'hand') api.setTask('photo');
    const s = lens.stream();
    stream.current = s;
    if (s) {
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.srcObject = s;
      void v.play().catch(() => {});
      video.current = v;
    }
    return () => {
      if (recorder.current?.state === 'recording') recorder.current.stop();
      s?.getTracks().forEach((t) => t.stop());
      lens.stop();
      api.setTask('idle');
    };
  }, [api, lens, mount]);
  useEffect(() => lens.zoom(zoom), [lens, zoom]);
  useEffect(() => lens.roll(roll), [lens, roll]);
  useEffect(() => {
    if (mount === 'hand') lens.facing(selfie ? 'user' : 'environment');
  }, [lens, mount, selfie]);
  // Recording clock; videos stop by themselves after a minute.
  useEffect(() => {
    if (!recording) return;
    const started = Date.now();
    const t = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      setElapsed(s);
      if (s >= 60) recorder.current?.stop();
    }, 250);
    return () => clearInterval(t);
  }, [recording]);
  useEffect(() => () => void (result && URL.revokeObjectURL(result.url)), [result]);

  const snap = () => {
    const v = video.current;
    if (!stream.current) return setError('Browser ini belum bisa memotret tampilan 3D.');
    if (!v || !v.videoWidth) return setError('Kamera belum siap, coba lagi.');
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    c.toBlob(
      (blob) => blob && setResult({ kind: 'photo', url: URL.createObjectURL(blob), blob }),
      'image/jpeg',
      0.92,
    );
  };
  const shoot = () => {
    if (!timer) return snap();
    // Self-timer: Luna has a few seconds to strike a pose.
    let left = timer;
    setCount(left);
    const t = setInterval(() => {
      left -= 1;
      setCount(left);
      if (left <= 0) {
        clearInterval(t);
        snap();
      }
    }, 1000);
  };
  const record = () => {
    if (recording) return recorder.current?.stop();
    const s = stream.current;
    if (!s || typeof MediaRecorder === 'undefined')
      return setError('Browser ini belum bisa merekam video.');
    const tracks = [...s.getVideoTracks()];
    const sound = lens.audio();
    if (sound) tracks.push(...sound.getAudioTracks());
    const type = videoType();
    const r = new MediaRecorder(new MediaStream(tracks), type ? { mimeType: type } : undefined);
    chunks.current = [];
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = () => {
      setRecording(false);
      const blob = new Blob(chunks.current, { type: r.mimeType || 'video/webm' });
      if (blob.size) setResult({ kind: 'video', url: URL.createObjectURL(blob), blob });
    };
    recorder.current = r;
    r.start(500);
    setElapsed(0);
    setRecording(true);
  };
  const save = () => {
    if (!result) return;
    const ext = result.kind === 'photo' ? 'jpg' : result.blob.type.includes('mp4') ? 'mp4' : 'webm';
    const a = document.createElement('a');
    a.href = result.url;
    a.download = `luna-${stamp()}.${ext}`;
    a.click();
  };
  const hang = () => {
    if (!result || result.kind !== 'photo') return;
    const reader = new FileReader();
    reader.onload = () => onHang(String(reader.result));
    reader.readAsDataURL(result.blob);
    setResult(null);
  };

  return (
    <div className={styles.cam} aria-label="Digicam Luna">
      {/* Drag here to aim (the lower-left corner stays free for walking). */}
      <div
        className={styles.aim}
        onPointerDown={(e) => {
          drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          lens.look(e.clientX - d.x, e.clientY - d.y);
          drag.current = { ...d, x: e.clientX, y: e.clientY };
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      />
      <div className={styles.frame} />
      <header className={styles.top}>
        <span className={styles.modes}>
          <button
            aria-pressed={mode === 'foto'}
            onClick={() => setMode('foto')}
            disabled={recording}
          >
            foto
          </button>
          <button
            aria-pressed={mode === 'video'}
            onClick={() => setMode('video')}
            disabled={recording}
          >
            video
          </button>
        </span>
        <span className={styles.status}>
          {recording ? (
            <b className={styles.rec}>
              ● REC {String(Math.floor(elapsed / 60)).padStart(2, '0')}:
              {String(elapsed % 60).padStart(2, '0')}
            </b>
          ) : mount === 'tripod' ? (
            'tripod'
          ) : (
            'di tangan'
          )}
        </span>
        <button onClick={onClose} disabled={recording} aria-label="Tutup digicam">
          tutup ×
        </button>
      </header>
      <aside className={styles.side}>
        <button
          onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}
          aria-label="Zoom in"
        >
          +
        </button>
        <small>{zoom.toFixed(1)}×</small>
        <button
          onClick={() => setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))}
          aria-label="Zoom out"
        >
          −
        </button>
        <button onClick={() => setRoll((r) => r - Math.PI / 12)} aria-label="Putar ke kiri">
          ⟲
        </button>
        <button onClick={() => setRoll(0)} aria-label="Luruskan">
          ↕
        </button>
        <button onClick={() => setRoll((r) => r + Math.PI / 12)} aria-label="Putar ke kanan">
          ⟳
        </button>
        {mount === 'hand' && (
          <button aria-pressed={selfie} onClick={() => setSelfie((v) => !v)}>
            selfie
          </button>
        )}
        {mode === 'foto' && (
          <button onClick={() => setTimer((t) => (t === 0 ? 3 : t === 3 ? 10 : 0))}>
            timer {timer ? timer + 's' : 'off'}
          </button>
        )}
      </aside>
      {count > 0 && <p className={styles.count}>{count}</p>}
      <footer className={styles.bottom}>
        {mode === 'foto' ? (
          <button
            className={styles.shutter}
            onClick={shoot}
            disabled={count > 0}
            aria-label="Ambil foto"
          />
        ) : (
          <button
            className={recording ? styles.stop : styles.record}
            onClick={record}
            aria-label={recording ? 'Berhenti merekam' : 'Mulai merekam'}
          />
        )}
        <small>
          {mode === 'video'
            ? recording
              ? 'Luna bisa terus berjalan sambil merekam.'
              : 'Rekam sampai 1 menit.'
            : mount === 'tripod'
              ? 'Pakai timer, lalu bergaya di depan kamera.'
              : 'Geser layar untuk membidik.'}
        </small>
      </footer>
      {error && <p className={styles.error}>{error}</p>}
      {result && (
        <div className={styles.result} role="dialog" aria-label="Hasil">
          {result.kind === 'photo' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={result.url} alt="Foto dari digicam Luna" />
          ) : (
            <video src={result.url} controls playsInline />
          )}
          <div className={styles.row}>
            <button onClick={save}>simpan ke perangkat</button>
            {result.kind === 'photo' && <button onClick={hang}>pasang di bingkai</button>}
            <button onClick={() => setResult(null)}>buang</button>
          </div>
        </div>
      )}
    </div>
  );
}
