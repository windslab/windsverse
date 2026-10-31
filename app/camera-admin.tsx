'use client';
// Cafe Management → Story of Winds: camera settings, film presets (sliders and .cube LUTs),
// and every guest photo with "show on Memoirs" and delete.
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Eye, EyeOff, Pencil, Plus, Trash2, Tv, Upload } from 'lucide-react';
import {
  FILMS,
  develop,
  parseCube,
  presetFilm,
  type Curves,
  type Lut,
  type PresetData,
} from '@/lib/film';
import CurveEditor, { cleanCurves } from './curve-editor';

type Preset = PresetData & { enabled: boolean };
type Photo = { id: string; film: string; createdAt: string; expiresAt: string; memoirs: boolean };
type Config = { rollSize: number; hiddenFilms: string[] };

const LEAKS: Record<string, string> = {
  '': 'Tanpa',
  '255,120,60': 'Oranye',
  '255,90,40': 'Merah',
  '255,160,70': 'Emas',
  '255,110,180': 'Merah muda',
};

/** Slider values the editor shows; converted to and from the preset's grade. */
type Knobs = {
  name: string;
  note: string;
  color: string;
  warmth: number;
  fade: number;
  contrast: number;
  saturation: number;
  mono: boolean;
  curves: Curves;
  grain: number;
  vignette: number;
  leakColor: string;
  leak: number;
  date: boolean;
  enabled: boolean;
};
const blankKnobs: Knobs = {
  name: '',
  note: '',
  color: '#d99a3d',
  warmth: 0.08,
  fade: 16,
  contrast: 1,
  saturation: 1,
  mono: false,
  curves: {},
  grain: 0.06,
  vignette: 0.35,
  leakColor: '',
  leak: 0.2,
  date: false,
  enabled: true,
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
function toPreset(id: string, k: Knobs, lutSize?: number): PresetData & { enabled: boolean } {
  return {
    id,
    name: k.name.trim(),
    note: k.note.trim(),
    color: k.color,
    grade: {
      gain: [1 + k.warmth, 1, 1 - k.warmth],
      lift: [
        clamp(k.fade + k.warmth * 40, 0, 80),
        clamp(k.fade, 0, 80),
        clamp(k.fade - k.warmth * 40, 0, 80),
      ],
      contrast: k.contrast,
      saturation: k.saturation,
      mono: k.mono || undefined,
      curves: cleanCurves(k.curves),
    },
    grain: k.grain,
    vignette: k.vignette,
    leak: k.leakColor ? { color: k.leakColor, strength: k.leak } : undefined,
    date: k.date || undefined,
    enabled: k.enabled,
    lutSize,
  };
}
function toKnobs(p: Preset): Knobs {
  return {
    name: p.name,
    note: p.note,
    color: p.color,
    warmth: +((p.grade.gain[0] - p.grade.gain[2]) / 2).toFixed(2),
    fade: p.grade.lift[1],
    contrast: p.grade.contrast,
    saturation: p.grade.saturation,
    mono: !!p.grade.mono,
    curves: p.grade.curves ?? {},
    grain: p.grain,
    vignette: p.vignette,
    leakColor: p.leak?.color ?? '',
    leak: p.leak?.strength ?? 0.2,
    date: !!p.date,
    enabled: p.enabled,
  };
}
const slug = (name: string) =>
  (name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24) || 'preset') +
  '-' +
  Math.random().toString(36).slice(2, 6);
const toBase64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
async function api<T>(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: 'no-store', ...init }),
    data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw Error(data.error || 'Permintaan belum berhasil.');
  return data;
}
const postJSON = <T,>(body: unknown) =>
  api<T>('/api/camera', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

export default function CameraAdmin() {
  const [config, setConfig] = useState<Config | null>(null),
    [presets, setPresets] = useState<Preset[]>([]),
    [photos, setPhotos] = useState<Photo[]>([]),
    [editing, setEditing] = useState<{ id: string; isNew: boolean } | null>(null),
    [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [camera, gallery] = await Promise.all([
        api<{ config: Config; presets: Preset[] }>('/api/camera?admin=1'),
        api<{ photos: Photo[] }>('/api/photos?all=1'),
      ]);
      setConfig(camera.config);
      setPresets(camera.presets);
      setPhotos(gallery.photos);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Data kamera belum dapat dimuat.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const saveConfig = async (next: Config) => {
    setBusy(true);
    try {
      const { config } = await postJSON<{ config: Config }>({ action: 'config', config: next });
      setConfig(config);
      toast.success('Pengaturan kamera tersimpan');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Belum tersimpan.');
    } finally {
      setBusy(false);
    }
  };

  const setMemoirs = async (photo: Photo, on: boolean) => {
    try {
      await api('/api/photos?id=' + photo.id + '&memoirs=' + (on ? 1 : 0), { method: 'PATCH' });
      setPhotos((list) => list.map((p) => (p.id === photo.id ? { ...p, memoirs: on } : p)));
      toast.success(on ? 'Tampil di Memoirs' : 'Dihapus dari Memoirs');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Belum tersimpan.');
    }
  };
  const removePhoto = async (photo: Photo) => {
    if (!confirm('Hapus foto ini untuk semua orang? Tidak bisa dikembalikan.')) return;
    try {
      await api('/api/photos?id=' + photo.id, { method: 'DELETE' });
      setPhotos((list) => list.filter((p) => p.id !== photo.id));
      toast.success('Foto dihapus');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Foto belum terhapus.');
    }
  };
  const removePreset = async (preset: Preset) => {
    if (!confirm(`Hapus preset "${preset.name}"?`)) return;
    try {
      await postJSON({ action: 'deletePreset', id: preset.id });
      setPresets((list) => list.filter((p) => p.id !== preset.id));
      toast.success('Preset dihapus');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Preset belum terhapus.');
    }
  };

  const filmLabel = (id: string) =>
    FILMS.find((f) => f.id === id)?.name ?? presets.find((p) => p.id === id)?.name ?? id;

  return (
    <>
      <div className="section-head">
        <h1>Story of Winds</h1>
        <p className="muted">Kamera tamu, preset film, dan foto pilihan untuk Memoirs.</p>
      </div>

      <section className="panel camera-admin-section">
        <h2>Pengaturan kamera</h2>
        {!config ? (
          <p className="muted">Memuat…</p>
        ) : (
          <div className="camera-admin-config">
            <label>
              Jepretan per perangkat per hari
              <input
                type="number"
                min={1}
                max={60}
                value={config.rollSize}
                onChange={(e) => setConfig({ ...config, rollSize: Number(e.target.value) || 1 })}
              />
            </label>
            <fieldset>
              <legend>Film bawaan yang tersedia untuk tamu</legend>
              {FILMS.map((f) => (
                <label key={f.id} className="row">
                  <input
                    type="checkbox"
                    checked={!config.hiddenFilms.includes(f.id)}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        hiddenFilms: e.target.checked
                          ? config.hiddenFilms.filter((id) => id !== f.id)
                          : [...config.hiddenFilms, f.id],
                      })
                    }
                  />
                  <i className="camera-swatch" style={{ background: f.color }} /> {f.name}
                </label>
              ))}
            </fieldset>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void saveConfig(config)}
            >
              Simpan pengaturan
            </button>
          </div>
        )}
      </section>

      <section className="panel camera-admin-section">
        <div className="row between">
          <h2>Preset film</h2>
          <button
            className="button primary"
            onClick={() => setEditing({ id: '', isNew: true })}
            disabled={!!editing}
          >
            <Plus size={16} /> Buat preset
          </button>
        </div>
        {editing && (
          <PresetEditor
            preset={presets.find((p) => p.id === editing.id)}
            onCancel={() => setEditing(null)}
            onSaved={(saved) => {
              setPresets((list) => [...list.filter((p) => p.id !== saved.id), saved]);
              setEditing(null);
            }}
          />
        )}
        {!presets.length && !editing ? (
          <p className="muted">
            Belum ada preset buatan sendiri. Buat dengan penggeser atau unggah file LUT (.cube).
          </p>
        ) : (
          <ul className="camera-preset-list">
            {presets.map((p) => (
              <li key={p.id}>
                <i className="camera-swatch" style={{ background: p.color }} />
                <span>
                  <strong>{p.name}</strong>
                  <small className="muted">
                    {p.enabled ? 'Tersedia untuk tamu' : 'Disembunyikan'}
                    {p.lutSize ? ' · LUT ' + p.lutSize + '³' : ''}
                  </small>
                </span>
                <button
                  className="icon-button"
                  aria-label={'Ubah ' + p.name}
                  onClick={() => setEditing({ id: p.id, isNew: false })}
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label={'Hapus ' + p.name}
                  onClick={() => void removePreset(p)}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel camera-admin-section">
        <div className="row between">
          <h2>Foto tamu ({photos.length})</h2>
          <small className="muted">
            <Tv size={14} /> {photos.filter((p) => p.memoirs).length} tampil di Memoirs
          </small>
        </div>
        {!photos.length ? (
          <p className="muted">Belum ada foto dari kamera Story of Winds.</p>
        ) : (
          <div className="camera-photo-grid">
            {photos.map((p) => (
              <AdminPhoto
                key={p.id}
                photo={p}
                film={filmLabel(p.film)}
                onMemoirs={(on) => void setMemoirs(p, on)}
                onDelete={() => void removePhoto(p)}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function AdminPhoto({
  photo,
  film,
  onMemoirs,
  onDelete,
}: {
  photo: Photo;
  film: string;
  onMemoirs: (on: boolean) => void;
  onDelete: () => void;
}) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let live = true,
      made = '';
    void fetch('/api/photos/' + photo.id, { cache: 'no-store' })
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => {
        made = URL.createObjectURL(b);
        if (live) setUrl(made);
      })
      .catch(() => {});
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [photo.id]);
  return (
    <figure className={'camera-photo' + (photo.memoirs ? ' on-memoirs' : '')}>
      {url ? <img src={url} alt={'Foto tamu, film ' + film} /> : <span />}
      <figcaption>
        <small>
          {film} ·{' '}
          {new Date(photo.createdAt).toLocaleString('id-ID', {
            timeZone: 'Asia/Makassar',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </small>
        <span>
          <button
            className="icon-button"
            aria-pressed={photo.memoirs}
            aria-label={photo.memoirs ? 'Keluarkan dari Memoirs' : 'Tampilkan di Memoirs'}
            title={photo.memoirs ? 'Keluarkan dari Memoirs' : 'Tampilkan di Memoirs'}
            onClick={() => onMemoirs(!photo.memoirs)}
          >
            {photo.memoirs ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
          <button className="icon-button" aria-label="Hapus foto" onClick={onDelete}>
            <Trash2 size={16} />
          </button>
        </span>
      </figcaption>
    </figure>
  );
}

function PresetEditor({
  preset,
  onCancel,
  onSaved,
}: {
  preset?: Preset;
  onCancel: () => void;
  onSaved: (preset: Preset) => void;
}) {
  const [knobs, setKnobs] = useState<Knobs>(preset ? toKnobs(preset) : blankKnobs),
    // undefined = keep current LUT, null = remove it, Lut = new upload
    [lut, setLut] = useState<Lut | null | undefined>(undefined),
    [currentLut, setCurrentLut] = useState<Lut | undefined>(),
    [sample, setSample] = useState<HTMLImageElement | null>(null),
    [preview, setPreview] = useState(''),
    [saving, setSaving] = useState(false);
  const id = useRef(preset?.id ?? '');
  const set = <K extends keyof Knobs>(key: K, value: Knobs[K]) =>
    setKnobs((k) => ({ ...k, [key]: value }));

  // Default sample: Luna's poster; admins can try their own photo.
  useEffect(() => {
    const img = new Image();
    img.onload = () => setSample(img);
    img.src = '/models/luna-ps1-preview.webp?v=6';
  }, []);
  useEffect(() => {
    if (!preset?.lutSize) return;
    void fetch('/api/camera/lut/' + preset.id + '?v=' + encodeURIComponent(preset.updatedAt ?? ''))
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((b) => setCurrentLut({ size: preset.lutSize!, data: new Uint8Array(b) }))
      .catch(() => {});
  }, [preset]);

  const activeLut = lut === undefined ? currentLut : (lut ?? undefined);
  // Re-develop the sample whenever a knob changes (debounced).
  useEffect(() => {
    if (!sample) return;
    let made = '';
    const t = setTimeout(() => {
      const film = presetFilm(toPreset('preview', knobs, activeLut?.size), activeLut);
      void develop(sample, film, { maxSide: 700 }).then((blob) => {
        made = URL.createObjectURL(blob);
        setPreview((old) => {
          if (old) URL.revokeObjectURL(old);
          return made;
        });
      });
    }, 180);
    return () => clearTimeout(t);
  }, [sample, knobs, activeLut]);

  const save = async () => {
    if (!knobs.name.trim()) return toast.error('Beri nama preset dulu.');
    setSaving(true);
    try {
      id.current ||= slug(knobs.name);
      const body = {
        action: 'preset',
        preset: toPreset(id.current, knobs, activeLut?.size),
        lut: lut === undefined ? undefined : lut ? toBase64(lut.data) : null,
      };
      const { preset: saved } = await postJSON<{ preset: Preset }>(body);
      toast.success('Preset tersimpan');
      onSaved(saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Preset belum tersimpan.');
    } finally {
      setSaving(false);
    }
  };

  const slider = (
    label: string,
    key: 'warmth' | 'fade' | 'contrast' | 'saturation' | 'grain' | 'vignette' | 'leak',
    min: number,
    max: number,
    step: number,
  ) => (
    <label className="camera-slider">
      <span>
        {label} <small className="muted">{knobs[key]}</small>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={knobs[key]}
        onChange={(e) => set(key, Number(e.target.value))}
      />
    </label>
  );

  return (
    <div className="camera-editor">
      <div className="camera-editor-preview">
        {preview ? (
          <img src={preview} alt="Pratinjau preset" />
        ) : (
          <span>Menyiapkan pratinjau…</span>
        )}
        <label className="button">
          <Upload size={15} /> Coba dengan fotomu
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const img = new Image();
              img.onload = () => setSample(img);
              img.src = URL.createObjectURL(file);
            }}
          />
        </label>
      </div>
      <div className="camera-editor-fields">
        <label>
          Nama preset
          <input
            maxLength={30}
            value={knobs.name}
            placeholder="Contoh: Kopi Susu"
            onChange={(e) => set('name', e.target.value)}
          />
        </label>
        <label>
          Keterangan singkat
          <input
            maxLength={120}
            value={knobs.note}
            placeholder="Tampil di bawah kamera tamu"
            onChange={(e) => set('note', e.target.value)}
          />
        </label>
        <label className="row">
          Warna label{' '}
          <input type="color" value={knobs.color} onChange={(e) => set('color', e.target.value)} />
        </label>
        <fieldset>
          <legend>File LUT (.cube)</legend>
          <p className="muted">
            {activeLut
              ? `LUT aktif (${activeLut.size}³). Penggeser di bawah tetap berlaku di atas LUT.`
              : 'Opsional. Ekspor dari Lightroom, Photoshop, atau aplikasi edit lain.'}
          </p>
          <div className="row">
            <label className="button">
              <Upload size={15} /> Unggah .cube
              <input
                type="file"
                accept=".cube"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    setLut(parseCube(await file.text()));
                    toast.success('LUT dimuat');
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'File LUT tidak valid.');
                  }
                }}
              />
            </label>
            {activeLut && (
              <button className="button" onClick={() => setLut(null)}>
                Lepas LUT
              </button>
            )}
          </div>
        </fieldset>
        {slider('Kehangatan', 'warmth', -0.3, 0.3, 0.01)}
        {slider('Pudar', 'fade', 0, 60, 1)}
        {slider('Kontras', 'contrast', 0.6, 1.4, 0.01)}
        {slider('Saturasi', 'saturation', 0, 1.6, 0.01)}
        <fieldset>
          <legend>Kurva warna</legend>
          <CurveEditor value={knobs.curves} onChange={(curves) => set('curves', curves)} />
        </fieldset>
        {slider('Butiran film', 'grain', 0, 0.25, 0.01)}
        {slider('Sudut gelap', 'vignette', 0, 1, 0.01)}
        <label>
          Cahaya bocor
          <select value={knobs.leakColor} onChange={(e) => set('leakColor', e.target.value)}>
            {Object.entries(LEAKS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {knobs.leakColor && slider('Kekuatan cahaya bocor', 'leak', 0, 1, 0.01)}
        <label className="row">
          <input
            type="checkbox"
            checked={knobs.mono}
            onChange={(e) => set('mono', e.target.checked)}
          />
          Hitam putih
        </label>
        <label className="row">
          <input
            type="checkbox"
            checked={knobs.date}
            onChange={(e) => set('date', e.target.checked)}
          />
          Cap tanggal oranye
        </label>
        <label className="row">
          <input
            type="checkbox"
            checked={knobs.enabled}
            onChange={(e) => set('enabled', e.target.checked)}
          />
          Tersedia untuk tamu
        </label>
        <div className="row">
          <button className="button primary" disabled={saving} onClick={() => void save()}>
            Simpan preset
          </button>
          <button className="button" onClick={onCancel}>
            Batal
          </button>
        </div>
      </div>
    </div>
  );
}
