'use client';
import { useState, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import dynamic from 'next/dynamic';
import { RotateCcw, Telescope, Moon, X, Search, Camera, Download, Clock3 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  DEFAULT_OPTICS,
  WIDE_FOV,
  MIN_WIDE_FOV,
  MAX_WIDE_FOV,
  MIN_MOUNT_ALT,
  MAX_MOUNT_ALT,
  clampWideFov,
  magnification,
  fieldOfView,
  type SkyOptics,
  type SkyObjectOption,
} from '@/lib/sky-optics';
import type { SkyCommand, SkyInfo } from './sky-viewer';
const SkyViewer = dynamic(() => import('./sky-viewer'), { ssr: false });
const witaInput = (date: Date) =>
  new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16);
const fold = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
type MountProps = {
  variant: 'mobile' | 'desktop';
  ready: boolean;
  view: { az: number; alt: number; minAltitude: number };
  jog: { az: number; alt: number };
  slewMode: 'fine' | 'travel';
  setSlewMode: (mode: 'fine' | 'travel') => void;
  setJog: (update: (previous: { az: number; alt: number }) => { az: number; alt: number }) => void;
  stopJog: () => void;
  setMount: (key: 'az' | 'alt', value: number) => void;
};
function MountControls({
  variant,
  ready,
  view,
  jog,
  slewMode,
  setSlewMode,
  setJog,
  stopJog,
  setMount,
}: MountProps) {
  return (
    <section className={'scope-mount scope-mount-' + variant} aria-label="Kontrol dudukan teleskop">
      <span className="scope-kicker">DUDUKAN ALT-AZ</span>
      <label className="scope-speed">
        Kecepatan gerak
        <select
          aria-label="Kecepatan gerak teleskop"
          value={slewMode}
          onChange={(event) => setSlewMode(event.target.value as 'fine' | 'travel')}
        >
          <option value="fine">Halus · mengikuti eyepiece</option>
          <option value="travel">Jelajah · pindah area langit</option>
        </select>
      </label>
      {[
        { key: 'az' as const, title: 'Putar kiri / kanan', min: 0, max: 360 },
        { key: 'alt' as const, title: 'Naik / turun', min: view.minAltitude, max: MAX_MOUNT_ALT },
      ].map((control) => (
        <div className="mount-slider" key={control.key}>
          <label htmlFor={'mount-' + variant + '-' + control.key}>
            {control.title}
            <span>{view[control.key].toFixed(3)}°</span>
          </label>
          <input
            id={'mount-' + variant + '-' + control.key}
            aria-label={control.title}
            type="range"
            min={-100}
            max={100}
            step={5}
            value={jog[control.key]}
            aria-valuetext={
              jog[control.key] === 0
                ? 'Berhenti'
                : (jog[control.key] < 0 ? 'Ke arah negatif' : 'Ke arah positif') +
                  ' · ' +
                  Math.abs(jog[control.key]) +
                  '%'
            }
            disabled={!ready}
            onChange={(event) =>
              setJog((previous) => ({ ...previous, [control.key]: Number(event.target.value) }))
            }
            onPointerUp={stopJog}
            onPointerCancel={stopJog}
            onLostPointerCapture={stopJog}
            onBlur={stopJog}
            onKeyUp={stopJog}
          />
          <div>
            <small>{control.key === 'az' ? '← Kiri' : '↓ Turun'}</small>
            <input
              aria-label={'Sudut ' + control.title.toLowerCase()}
              type="number"
              min={control.min}
              max={control.max}
              step="0.001"
              value={Number(view[control.key].toFixed(3))}
              disabled={!ready}
              onChange={(event) => {
                if (event.target.value === '') return;
                const value = Number(event.target.value);
                if (Number.isFinite(value) && value >= control.min && value <= control.max)
                  setMount(control.key, value);
              }}
            />
            <small>{control.key === 'az' ? 'Kanan →' : 'Naik ↑'}</small>
          </div>
        </div>
      ))}
    </section>
  );
}
function Eyepiece() {
  const [focus, setFocus] = useState(0),
    focusDrag = useRef<{ pointerId: number; angle: number } | undefined>(undefined);
  const focusAngle = (event: ReactPointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return (
      (Math.atan2(
        event.clientY - box.top - box.height / 2,
        event.clientX - box.left - box.width / 2,
      ) *
        180) /
      Math.PI
    );
  };
  const beginFocus = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    focusDrag.current = { pointerId: event.pointerId, angle: focusAngle(event) };
  };
  const turnFocus = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = focusDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const angle = focusAngle(event),
      delta = ((angle - drag.angle + 540) % 360) - 180;
    drag.angle = angle;
    setFocus((value) => Math.max(-100, Math.min(100, value + delta / 1.2)));
  };
  const endFocus = () => {
    focusDrag.current = undefined;
  };

  const [simulationTime, setSimulationTime] = useState<number | null>(null),
    [timeOpen, setTimeOpen] = useState(false),
    [timeStep, setTimeStep] = useState(60),
    timeInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (timeInput.current)
      timeInput.current.value = witaInput(new Date(simulationTime ?? Date.now()));
  }, [simulationTime, timeOpen]);
  const [clock, setClock] = useState(() => new Date()),
    [command, setCommand] = useState<SkyCommand>({ seq: 0, kind: 'reset' }),
    [info, setInfo] = useState<SkyInfo | null>(null),
    [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false),
    [tracking, setTracking] = useState<string | null>(null),
    [view, setView] = useState({
      az: 0,
      alt: 45,
      fov: fieldOfView(DEFAULT_OPTICS),
      minAltitude: MIN_MOUNT_ALT,
    }),
    [optics, setOptics] = useState<SkyOptics>(DEFAULT_OPTICS),
    [objects, setObjects] = useState<SkyObjectOption[]>([]),
    [searchOpen, setSearchOpen] = useState(false),
    [query, setQuery] = useState(''),
    [detailsLoading, setDetailsLoading] = useState(false),
    [jog, setJog] = useState({ az: 0, alt: 0 }),
    [slewMode, setSlewMode] = useState<'fine' | 'travel'>('fine'),
    [photo, setPhoto] = useState<{ url: string; name: string } | null>(null),
    [photoBusy, setPhotoBusy] = useState(false),
    [photoError, setPhotoError] = useState('');
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const stop = () => setJog({ az: 0, alt: 0 });
    const hide = () => {
      if (document.hidden) stop();
    };
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', hide);
    return () => {
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', hide);
    };
  }, []);
  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.url);
    },
    [photo],
  );
  const receivePhoto = (blob: Blob, name: string) => {
    setPhoto({ url: URL.createObjectURL(blob), name });
    setPhotoBusy(false);
  };
  const send = (patch: Omit<SkyCommand, 'seq'>) =>
    setCommand((previous) => ({ ...patch, seq: previous.seq + 1 }));
  const stopJog = () => setJog({ az: 0, alt: 0 });
  const setMount = (key: 'az' | 'alt', value: number) => {
    const next = { ...view, [key]: value };
    setView(next);
    setTracking(null);
    send({ kind: 'point', az: next.az, alt: next.alt });
  };
  const q = fold(query),
    matches = (
      q
        ? objects.filter((item) => item.aliases.some((alias) => fold(alias).includes(q)))
        : objects.filter((item) => !item.id.startsWith('HIP'))
    )
      .sort((a, b) => Number(fold(b.name) === q) - Number(fold(a.name) === q))
      .slice(0, 12);
  const findObject = (id: string) => {
    if (id === 'MilkyWay' || id === 'M45') setOptics((value) => ({ ...value, wide: true }));
    stopJog();
    send({ kind: 'target', id });
    setSearchOpen(false);
  };
  const setWideFov = (wideFov: number) =>
    setOptics((value) => (value.wide ? { ...value, wideFov: clampWideFov(wideFov) } : value));
  const observationDate = new Date(simulationTime ?? clock.getTime());
  const selectTime = (value: string) => {
    const timestamp = Date.parse(value + '+08:00');
    if (
      Number.isFinite(timestamp) &&
      timestamp >= Date.parse('0001-01-01T00:00:00+08:00') &&
      timestamp <= Date.parse('9999-12-31T23:59:00+08:00')
    ) {
      stopJog();
      setSimulationTime(timestamp);
    }
  };
  const shiftTime = (direction: number) => {
    stopJog();
    setSimulationTime((previous) => {
      const next = (previous ?? Date.now()) + direction * timeStep * 60_000;
      return Math.max(
        Date.parse('0001-01-01T00:00:00+08:00'),
        Math.min(Date.parse('9999-12-31T23:59:00+08:00'), next),
      );
    });
  };
  const resetTime = () => {
    stopJog();
    setClock(new Date());
    setSimulationTime(null);
  };
  const zoom = magnification(optics),
    fov = fieldOfView(optics);
  return (
    <>
      <header className="telescope-heading">
        <div className="telescope-icon">
          <Telescope size={23} />
        </div>
        <div>
          <span>WINDS SPACE OBSERVATORY</span>
          <DialogTitle>Windstronout</DialogTitle>
          <p>
            Pangkajene, Pangkep ·{' '}
            {observationDate.toLocaleDateString('id-ID', {
              timeZone: 'Asia/Makassar',
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}{' '}
            ·{' '}
            {observationDate.toLocaleTimeString('id-ID', {
              timeZone: 'Asia/Makassar',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}{' '}
            WITA · {simulationTime === null ? 'Sekarang' : 'Waktu pilihan'}
          </p>
        </div>
      </header>
      <DialogDescription className="sr-only">
        Simulasi teleskop Pangkep dengan pengaturan arah, fokus, dan eyepiece. Lensa wide mendukung
        pinch zoom.
      </DialogDescription>
      <div className="telescope-body">
        <div className="scope-visual">
          <div className="eyepiece-housing">
            <svg
              className="eyepiece-focus-ring"
              viewBox="0 0 100 100"
              role="slider"
              tabIndex={0}
              aria-label="Fokus eyepiece, putar bingkai"
              aria-valuemin={-100}
              aria-valuemax={100}
              aria-valuenow={Math.round(focus)}
              aria-valuetext={Math.abs(focus) < 4 ? 'Fokus tajam' : 'Fokus ' + Math.round(focus)}
              aria-orientation="horizontal"
              onPointerDown={beginFocus}
              onPointerMove={turnFocus}
              onPointerUp={endFocus}
              onPointerCancel={endFocus}
              onLostPointerCapture={endFocus}
              onKeyDown={(event) => {
                const step = event.shiftKey ? 10 : 2;
                if (
                  ['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'Home'].includes(event.key)
                ) {
                  event.preventDefault();
                  setFocus((value) =>
                    event.key === 'Home'
                      ? 0
                      : Math.max(
                          -100,
                          Math.min(
                            100,
                            value + (['ArrowRight', 'ArrowUp'].includes(event.key) ? step : -step),
                          ),
                        ),
                  );
                }
              }}
            >
              <circle className="focus-ring-hit" cx="50" cy="50" r="46" />
              <g className="focus-ring-markings" transform={'rotate(' + focus * 1.2 + ' 50 50)'}>
                <circle cx="50" cy="50" r="46" />
                <path d="M50 1.5V8.5" />
              </g>
            </svg>
            <div className="eyepiece-aperture">
              <SkyViewer
                simulationTime={simulationTime}
                onWideFov={setWideFov}
                command={command}
                optics={optics}
                focus={focus}
                motion={{ ...jog, mode: slewMode }}
                onPhoto={receivePhoto}
                onPhotoError={() => {
                  setPhotoBusy(false);
                  setPhotoError('Foto belum berhasil dibuat. Silakan coba lagi.');
                }}
                onCatalog={setObjects}
                onDetail={setDetailsLoading}
                onSelect={setInfo}
                onReady={() => setReady(true)}
                onError={() => setFailed(true)}
                onTracking={setTracking}
                onView={setView}
              />
              <div className="eyepiece-glass" aria-hidden="true" />
              <div className="eyepiece-reticle" aria-hidden="true">
                <i />
                <i />
              </div>
              {(!ready || failed) && (
                <div className="sky-status" role="status">
                  {failed
                    ? 'Peta langit belum dapat dimuat. Coba tutup lalu buka kembali.'
                    : 'Menyiapkan langit Pangkep…'}
                </div>
              )}
            </div>
          </div>
          <div className="eyepiece-legend">
            <span className="eyepiece-label">
              WINDS ·{' '}
              {optics.wide
                ? 'WIDE · ' + fov.toFixed(1) + '°'
                : optics.eyepiece +
                  ' MM · ' +
                  zoom.toLocaleString('id-ID', { maximumFractionDigits: 1 }) +
                  '×'}
            </span>
          </div>
          <MountControls
            variant="mobile"
            ready={ready}
            view={view}
            jog={jog}
            slewMode={slewMode}
            setSlewMode={setSlewMode}
            setJog={setJog}
            stopJog={stopJog}
            setMount={setMount}
          />
          {detailsLoading && (
            <div className="scope-detail-status" role="status">
              Memuat detail permukaan…
            </div>
          )}
        </div>
        <aside className="telescope-controls">
          <div className="scope-quick-actions">
            <button
              type="button"
              className={'scope-moon ' + (tracking === 'Moon' ? 'active' : '')}
              aria-pressed={tracking === 'Moon'}
              disabled={!ready}
              onClick={() => {
                stopJog();
                send({ kind: 'moon' });
              }}
            >
              <Moon size={16} />
              {tracking === 'Moon' ? 'Mengikuti Bulan' : 'Lacak Bulan'}
            </button>
            <button
              type="button"
              className="scope-search-toggle"
              aria-expanded={searchOpen}
              disabled={!ready}
              onClick={() => setSearchOpen((open) => !open)}
            >
              <Search size={16} />
              Cari objek
            </button>
          </div>
          <div className="scope-time-actions">
            <button
              type="button"
              aria-expanded={timeOpen}
              aria-controls="scope-time-panel"
              onClick={() => setTimeOpen((open) => !open)}
            >
              <Clock3 size={16} />
              Atur waktu
            </button>
            <button type="button" disabled={simulationTime === null} onClick={resetTime}>
              <RotateCcw size={15} />
              Reset waktu
            </button>
          </div>
          {timeOpen && (
            <section
              id="scope-time-panel"
              className="scope-time-panel"
              aria-label="Pengaturan waktu langit"
            >
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (timeInput.current) selectTime(timeInput.current.value);
                }}
              >
                <label>
                  Tanggal & jam · WITA
                  <input
                    ref={timeInput}
                    aria-label="Tanggal dan jam pengamatan WITA"
                    type="datetime-local"
                    min="0001-01-01T00:00"
                    max="9999-12-31T23:59"
                    step={60}
                    defaultValue={witaInput(observationDate)}
                    required
                  />
                </label>
                <button className="scope-time-apply" type="submit">
                  Terapkan waktu
                </button>
              </form>
              <label>
                Langkah waktu
                <select
                  aria-label="Langkah maju atau mundur waktu"
                  value={timeStep}
                  onChange={(event) => setTimeStep(Number(event.target.value))}
                >
                  <option value={1}>1 menit</option>
                  <option value={10}>10 menit</option>
                  <option value={60}>1 jam</option>
                  <option value={360}>6 jam</option>
                  <option value={1440}>1 hari</option>
                </select>
              </label>
              <div className="scope-time-step">
                <button type="button" onClick={() => shiftTime(-1)}>
                  ← Mundur
                </button>
                <button type="button" onClick={() => shiftTime(1)}>
                  Maju →
                </button>
              </div>
              <small role="status">
                {simulationTime === null
                  ? 'Mengikuti waktu sekarang.'
                  : 'Waktu pilihan dijeda. Reset untuk kembali ke waktu sekarang.'}
              </small>
            </section>
          )}
          <div className="scope-photo-actions">
            <button
              type="button"
              disabled={!ready || photoBusy || detailsLoading}
              onClick={() => {
                stopJog();
                setPhotoError('');
                setPhotoBusy(true);
                send({ kind: 'photo' });
              }}
            >
              <Camera size={17} />
              {photoBusy ? 'Memotret…' : 'Foto eyepiece'}
            </button>
            {photoError && <small role="alert">{photoError}</small>}
          </div>

          {optics.wide && (
            <section className="scope-sky-mode" aria-label="Panorama horizon">
              <button
                type="button"
                className="scope-horizon-button"
                disabled={!ready}
                onClick={() => {
                  stopJog();
                  setInfo(null);
                  send({ kind: 'direction', az: 0, alt: -90 });
                }}
              >
                Lihat panorama horizon
              </button>
            </section>
          )}
          {searchOpen && (
            <div className="scope-search">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (matches[0]) findObject(matches[0].id);
                }}
              >
                <input
                  autoFocus
                  aria-label="Cari objek langit"
                  placeholder="Bulan, Bima Sakti, Pleiades…"
                  value={query}
                  maxLength={80}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <button type="submit" aria-label="Cari" disabled={!matches.length}>
                  <Search size={17} />
                </button>
              </form>
              <ul aria-label="Hasil pencarian objek">
                {matches.map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => findObject(item.id)}>
                      <strong>{item.name}</strong>
                      <small>
                        {item.kind}
                        {item.id.startsWith('HIP') ? ' · ' + item.id : ''}
                      </small>
                    </button>
                  </li>
                ))}
              </ul>
              {!matches.length && (
                <p>Objek tidak ditemukan dalam katalog Bulan, Matahari, planet, dan bintang.</p>
              )}
            </div>
          )}
          {tracking && (
            <div className="scope-tracking-status">
              <span>Melacak {objects.find((item) => item.id === tracking)?.name || tracking}</span>
              <button
                type="button"
                aria-label="Hentikan pelacakan"
                onClick={() => send({ kind: 'point', az: view.az, alt: view.alt })}
              >
                <X size={14} />
              </button>
            </div>
          )}
          <MountControls
            variant="desktop"
            ready={ready}
            view={view}
            jog={jog}
            slewMode={slewMode}
            setSlewMode={setSlewMode}
            setJog={setJog}
            stopJog={stopJog}
            setMount={setMount}
          />
          <section className="scope-optics" aria-label="Eyepiece dan Barlow">
            <span className="scope-kicker">OPTIK TELESKOP · 1.500 MM</span>
            <div className="scope-optics-grid">
              <label>
                Ukuran dudukan
                <select
                  aria-label="Ukuran dudukan eyepiece"
                  disabled={optics.wide}
                  value={optics.barrel}
                  onChange={(event) =>
                    setOptics((value) => ({
                      ...value,
                      barrel: Number(event.target.value) as 31.7 | 50.8,
                    }))
                  }
                >
                  <option value={31.7}>31,7 mm (1,25″)</option>
                  <option value={50.8}>50,8 mm (2″)</option>
                </select>
              </label>
              <label>
                Eyepiece
                <select
                  aria-label="Panjang fokus eyepiece"
                  value={optics.wide ? 'wide' : optics.eyepiece}
                  onChange={(event) =>
                    setOptics((value) => ({
                      ...value,
                      wide: event.target.value === 'wide',
                      eyepiece:
                        event.target.value === 'wide' ? value.eyepiece : Number(event.target.value),
                    }))
                  }
                >
                  <option value="wide">Wide · panorama {WIDE_FOV}°</option>
                  {[4, 10, 25, 32].map((mm) => (
                    <option key={mm} value={mm}>
                      {mm} mm
                    </option>
                  ))}
                </select>
              </label>
              <label className="scope-barlow">
                Lensa Barlow
                <select
                  aria-label="Lensa Barlow"
                  disabled={optics.wide}
                  value={optics.barlow}
                  onChange={(event) =>
                    setOptics((value) => ({ ...value, barlow: Number(event.target.value) }))
                  }
                >
                  <option value={1}>Tanpa Barlow (1×)</option>
                  <option value={2}>Barlow 2×</option>
                  <option value={3}>Barlow 3×</option>
                </select>
              </label>
            </div>
            <div className="scope-optics-readout">
              <strong>
                {optics.wide
                  ? 'Wide'
                  : zoom.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '×'}
              </strong>
              <span>
                Bidang pandang {fov.toFixed(3)}°
                <small>
                  {optics.wide
                    ? 'Mode penjelajah langit'
                    : 'AFOV eyepiece: ' + optics.apparentFov + '°'}
                </small>
              </span>
            </div>
            {optics.wide && (
              <div className="scope-wide-zoom" aria-label="Zoom lensa wide">
                <button
                  type="button"
                  aria-label="Perkecil tampilan wide"
                  disabled={fov >= MAX_WIDE_FOV}
                  onClick={() => setWideFov(fov * 1.2)}
                >
                  −
                </button>
                <button
                  type="button"
                  aria-label="Atur ulang zoom wide"
                  onClick={() => setWideFov(WIDE_FOV)}
                >
                  {fov.toFixed(1)}°
                </button>
                <button
                  type="button"
                  aria-label="Perbesar tampilan wide"
                  disabled={fov <= MIN_WIDE_FOV}
                  onClick={() => setWideFov(fov / 1.2)}
                >
                  +
                </button>
              </div>
            )}
            <small>
              {optics.wide
                ? 'Cubit untuk zoom, atau gunakan tombol − / +. Barlow tidak digunakan dalam mode wide.'
                : 'Pembesaran = 1.500 ÷ fokus eyepiece × Barlow. Ukuran dudukan tidak mengubah pembesaran.'}
            </small>
          </section>
          <button
            type="button"
            className="scope-reset"
            disabled={!ready}
            onClick={() => send({ kind: 'reset' })}
          >
            <RotateCcw size={15} />
            Atur ulang arah
          </button>
        </aside>
        <div className={'scope-information-slot ' + (info ? 'has-object' : '')}>
          {info ? (
            <article className="sky-object-info" aria-label="Informasi objek langit">
              <button
                type="button"
                aria-label="Tutup informasi objek"
                onClick={() => {
                  setInfo(null);
                  send({ kind: 'clear' });
                }}
              >
                <X size={16} />
              </button>
              <span>{info.kind}</span>
              <h3>{info.name}</h3>
              <p>{info.description}</p>
              <dl>
                <div>
                  <dt>Ketinggian</dt>
                  <dd>{info.altitude.toFixed(2)}°</dd>
                </div>
                <div>
                  <dt>Azimut</dt>
                  <dd>{info.azimuth.toFixed(2)}°</dd>
                </div>
                {info.details.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <small className={info.altitude < 0 ? 'sky-below-horizon' : ''}>
                {info.altitude < view.minAltitude
                  ? 'Objek berada di bawah batas pandang eyepiece saat ini.'
                  : optics.wide && info.obscured
                    ? 'Objek berada di balik ground atau siluet panorama.'
                    : info.altitude < 0
                      ? 'Sedang di bawah horizon Pangkep; ditampilkan dalam mode peta.'
                      : 'Sedang di atas horizon Pangkep.'}
                {optics.wide && (
                  <span className="scope-selected-credit">
                    Panorama:{' '}
                    <a
                      href="https://www.eso.org/public/images/eso0932a/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      ESO/S. Brunier
                    </a>{' '}
                    ·{' '}
                    <a
                      href="https://creativecommons.org/licenses/by/4.0/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      CC BY 4.0
                    </a>
                  </span>
                )}
              </small>
            </article>
          ) : (
            <footer className="telescope-footer">
              <span>
                {simulationTime === null ? 'Waktu sekarang' : 'Waktu pilihan'} · Lokasi Pangkajene ·{' '}
                {optics.wide ? 'Atmosfer wide' : 'Langit gelap'}
              </span>
              <p>
                Posisi dan fase mengikuti waktu pengamatan; objek di bawah horizon ditandai. Detail
                mengikuti resolusi peta yang tersedia. Siluet horizon wide adalah ilustrasi, bukan
                pemetaan bangunan atau kondisi cuaca langsung. Orientasi permukaan disederhanakan.
              </p>
              <span className="scope-panorama-credit">
                Panorama Bima Sakti:{' '}
                <a
                  href="https://www.eso.org/public/images/eso0932a/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ESO/S. Brunier
                </a>{' '}
                ·{' '}
                <a
                  href="https://creativecommons.org/licenses/by/4.0/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  CC BY 4.0
                </a>{' '}
                · Dipetakan dan diredupkan untuk simulasi.
              </span>
              <a href="/sky/CREDITS.txt" target="_blank" rel="noopener noreferrer">
                Sumber data astronomi
              </a>
            </footer>
          )}
        </div>
      </div>

      <Dialog
        open={!!photo}
        onOpenChange={(open) => {
          if (!open) setPhoto(null);
        }}
      >
        <DialogContent className="scope-photo-dialog">
          <DialogTitle>Foto langitmu</DialogTitle>
          <DialogDescription>
            Hasil simulasi melalui eyepiece, disimpan dari tampilan saat dipotret.
          </DialogDescription>
          {photo && (
            <>
              <img src={photo.url} alt="Hasil foto langit melalui eyepiece teleskop Winds Space" />
              <a className="button primary" href={photo.url} download={photo.name}>
                <Download size={17} />
                Unduh PNG
              </a>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
export default function TelescopeView({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="telescope-dialog">{open && <Eyepiece />}</DialogContent>
    </Dialog>
  );
}
