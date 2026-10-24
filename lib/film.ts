// Film looks for the Story of Winds camera. `develop` turns a raw camera frame into a print:
// colour grade, faded blacks, grain, vignette, optional light leak and date stamp, then a
// cream border with a caption. Everything is plain canvas so it runs on any phone.

export type Lut = { size: number; data: Uint8Array };

export type Film = {
  id: string;
  name: string;
  note: string;
  /** Canister colour in the film picker. */
  color: string;
  /** Cheap live preview for the viewfinder (CSS filter). */
  preview: string;
  grade: {
    /** Per-channel gain. */
    gain: [number, number, number];
    /** Lifted blacks per channel (0–255). */
    lift: [number, number, number];
    contrast: number;
    saturation: number;
    mono?: boolean;
  };
  grain: number;
  vignette: number;
  leak?: { color: string; strength: number };
  date?: boolean;
  /** Optional 3D LUT applied before the grade (from an uploaded .cube preset). */
  lut?: Lut;
  /** Preset made by an admin (not built in). */
  custom?: boolean;
};

export const FILMS: Film[] = [
  {
    id: 'hangat',
    name: 'Hangat 200',
    note: 'Warna lembut dan hangat seperti sore di kafe.',
    color: '#d99a3d',
    preview: 'sepia(0.22) saturate(1.08) contrast(0.96) brightness(1.04)',
    grade: { gain: [1.08, 1.0, 0.86], lift: [22, 14, 6], contrast: 0.94, saturation: 1.02 },
    grain: 0.05,
    vignette: 0.32,
  },
  {
    id: 'retro',
    name: 'Retro 70',
    note: 'Pudar, kekuningan, seperti album foto lama.',
    color: '#b8743a',
    preview: 'sepia(0.38) saturate(0.82) contrast(0.88) hue-rotate(-8deg) brightness(1.05)',
    grade: { gain: [1.04, 1.0, 0.8], lift: [36, 28, 18], contrast: 0.84, saturation: 0.78 },
    grain: 0.08,
    vignette: 0.38,
    leak: { color: '255,120,60', strength: 0.18 },
  },
  {
    id: 'sekali-pakai',
    name: 'Sekali Pakai',
    note: 'Kontras, sedikit belang cahaya, dan tanggal oranye di pojok.',
    color: '#e0b02c',
    preview: 'saturate(1.25) contrast(1.15) sepia(0.12) brightness(1.03)',
    grade: { gain: [1.06, 1.02, 0.9], lift: [10, 8, 12], contrast: 1.12, saturation: 1.2 },
    grain: 0.1,
    vignette: 0.48,
    leak: { color: '255,90,40', strength: 0.28 },
    date: true,
  },
  {
    id: 'senja',
    name: 'Senja',
    note: 'Keemasan seperti cahaya matahari terbenam.',
    color: '#e0703b',
    preview: 'sepia(0.35) saturate(1.2) hue-rotate(-12deg) contrast(0.95) brightness(1.04)',
    grade: { gain: [1.14, 0.98, 0.78], lift: [26, 12, 4], contrast: 0.96, saturation: 1.12 },
    grain: 0.06,
    vignette: 0.4,
    leak: { color: '255,160,70', strength: 0.22 },
  },
  {
    id: 'klasik',
    name: 'Klasik',
    note: 'Hitam putih hangat dengan butiran film.',
    color: '#5b5048',
    preview: 'grayscale(1) sepia(0.25) contrast(1.1) brightness(1.02)',
    grade: {
      gain: [1.04, 1.0, 0.94],
      lift: [18, 15, 12],
      contrast: 1.1,
      saturation: 0,
      mono: true,
    },
    grain: 0.12,
    vignette: 0.42,
  },
];

export const filmById = (id: string) => FILMS.find((f) => f.id === id) ?? FILMS[0];

/** Photo area aspect: portrait 35 mm (2:3). */
export const PRINT_ASPECT = 2 / 3;

/**
 * Develops `source` (a video frame or image) into a JPEG print.
 * `mirror` flips selfies so the print matches what the guest saw.
 */
export async function develop(
  source: CanvasImageSource & { videoWidth?: number; videoHeight?: number },
  film: Film,
  { mirror = false, maxSide = 1500, now = new Date(), zoom = 1 } = {},
) {
  const sw = source.videoWidth || (source as HTMLImageElement).naturalWidth || 1,
    sh = source.videoHeight || (source as HTMLImageElement).naturalHeight || 1;
  // Crop the centre of the frame to 2:3 portrait.
  let cw = sw,
    ch = sw / PRINT_ASPECT;
  if (ch > sh) {
    ch = sh;
    cw = sh * PRINT_ASPECT;
  }
  // Digital zoom crops further into the centre.
  cw /= zoom;
  ch /= zoom;
  const scale = Math.min(1, maxSide / ch),
    w = Math.round(cw * scale),
    h = Math.round(ch * scale);
  const photo = document.createElement('canvas');
  photo.width = w;
  photo.height = h;
  const ctx = photo.getContext('2d', { willReadFrequently: true })!;
  ctx.save();
  if (mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, w, h);
  ctx.restore();

  if (film.lut) applyLut(ctx, w, h, film.lut);
  grade(ctx, w, h, film);
  if (film.leak) leak(ctx, w, h, film.leak);
  vignette(ctx, w, h, film.vignette);
  if (film.date) stamp(ctx, w, h, now);

  return print(photo, film, now);
}

function grade(ctx: CanvasRenderingContext2D, w: number, h: number, film: Film) {
  const img = ctx.getImageData(0, 0, w, h),
    d = img.data,
    { gain, lift, contrast, saturation, mono } = film.grade,
    grain = film.grain * 255;
  // Lookup tables keep the per-pixel loop cheap.
  const curve = (c: number) => {
    const x = c / 255;
    // Gentle S-curve around mid grey, scaled by `contrast`.
    const s = x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x);
    return Math.min(255, Math.max(0, (x + (s - x) * (contrast - 0.8) * 1.6) * 255));
  };
  const lut = [0, 1, 2].map((ch) => {
    const t = new Float32Array(256);
    for (let i = 0; i < 256; i++) t[i] = lift[ch] + (curve(i) * gain[ch] * (255 - lift[ch])) / 255;
    return t;
  });
  let seed = 1234567;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i],
      g = d[i + 1],
      b = d[i + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    if (mono) r = g = b = luma;
    else if (saturation !== 1) {
      r = luma + (r - luma) * saturation;
      g = luma + (g - luma) * saturation;
      b = luma + (b - luma) * saturation;
    }
    const n = rand() * grain;
    d[i] = lut[0][clamp(r)] + n;
    d[i + 1] = lut[1][clamp(g)] + n;
    d[i + 2] = lut[2][clamp(b)] + n;
  }
  ctx.putImageData(img, 0, 0);
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

function vignette(ctx: CanvasRenderingContext2D, w: number, h: number, strength: number) {
  const g = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.35,
    w / 2,
    h / 2,
    Math.hypot(w, h) / 2,
  );
  g.addColorStop(0, 'rgba(30,18,8,0)');
  g.addColorStop(1, `rgba(30,18,8,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function leak(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  { color, strength }: { color: string; strength: number },
) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const side = Math.random() < 0.5 ? 0 : w;
  const g = ctx.createRadialGradient(side, h * 0.25, 0, side, h * 0.25, w * 0.75);
  g.addColorStop(0, `rgba(${color},${strength * 1.6})`);
  g.addColorStop(0.5, `rgba(${color},${strength * 0.5})`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function stamp(ctx: CanvasRenderingContext2D, w: number, h: number, now: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Makassar',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const text = `'${get('year')} ${get('month')} ${get('day')}`;
  const size = Math.round(w * 0.045);
  ctx.save();
  ctx.font = `bold ${size}px "Courier New", ui-monospace, monospace`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.shadowColor = 'rgba(255,110,30,0.9)';
  ctx.shadowBlur = size * 0.5;
  ctx.fillStyle = '#ffa23a';
  ctx.fillText(text, w * 0.94, h * 0.95);
  ctx.restore();
}

/** Cream border with a caption, like a lab print. */
function print(photo: HTMLCanvasElement, film: Film, now: Date) {
  const w = photo.width,
    h = photo.height,
    pad = Math.round(w * 0.05),
    foot = Math.round(w * 0.14);
  const out = document.createElement('canvas');
  out.width = w + pad * 2;
  out.height = h + pad + foot;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#f4ecdf';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(photo, pad, pad);
  ctx.fillStyle = '#6b5644';
  ctx.textBaseline = 'middle';
  const y = pad + h + foot / 2;
  ctx.font = `italic ${Math.round(w * 0.05)}px Georgia, serif`;
  ctx.textAlign = 'left';
  ctx.fillText('Story of Winds', pad, y);
  ctx.font = `${Math.round(w * 0.028)}px "Courier New", ui-monospace, monospace`;
  ctx.textAlign = 'right';
  const day = now.toLocaleDateString('id-ID', {
    timeZone: 'Asia/Makassar',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  ctx.fillText(`${film.name.toUpperCase()} · ${day}`, out.width - pad, y);
  return new Promise<Blob>((resolve, reject) =>
    out.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', 0.86),
  );
}

/** Trilinear 3D LUT lookup; `data` is RGB bytes with red changing fastest (.cube order). */
function applyLut(ctx: CanvasRenderingContext2D, w: number, h: number, lut: Lut) {
  const img = ctx.getImageData(0, 0, w, h),
    d = img.data,
    { size: n, data } = lut,
    max = n - 1;
  const at = (r: number, g: number, b: number, c: number) => data[((b * n + g) * n + r) * 3 + c];
  for (let i = 0; i < d.length; i += 4) {
    const r = (d[i] / 255) * max,
      g = (d[i + 1] / 255) * max,
      b = (d[i + 2] / 255) * max;
    const r0 = r | 0,
      g0 = g | 0,
      b0 = b | 0,
      r1 = Math.min(max, r0 + 1),
      g1 = Math.min(max, g0 + 1),
      b1 = Math.min(max, b0 + 1),
      fr = r - r0,
      fg = g - g0,
      fb = b - b0;
    for (let c = 0; c < 3; c++) {
      const c00 = at(r0, g0, b0, c) * (1 - fr) + at(r1, g0, b0, c) * fr,
        c10 = at(r0, g1, b0, c) * (1 - fr) + at(r1, g1, b0, c) * fr,
        c01 = at(r0, g0, b1, c) * (1 - fr) + at(r1, g0, b1, c) * fr,
        c11 = at(r0, g1, b1, c) * (1 - fr) + at(r1, g1, b1, c) * fr;
      d[i + c] = (c00 * (1 - fg) + c10 * fg) * (1 - fb) + (c01 * (1 - fg) + c11 * fg) * fb;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Reads an Adobe/Resolve .cube 3D LUT and resamples it to at most `maxSize` per side,
 * so even 64³ LUTs stay small (33³ × 3 bytes ≈ 105 KB).
 */
export function parseCube(text: string, maxSize = 33): Lut {
  let size = 0,
    min = [0, 0, 0],
    max = [1, 1, 1];
  const values: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [key, ...rest] = line.split(/\s+/);
    if (key === 'LUT_3D_SIZE') size = Number(rest[0]);
    else if (key === 'DOMAIN_MIN') min = rest.map(Number);
    else if (key === 'DOMAIN_MAX') max = rest.map(Number);
    else if (/^[-+.\d]/.test(key)) values.push(Number(key), Number(rest[0]), Number(rest[1]));
  }
  if (!size || size < 2 || size > 128 || values.length !== size ** 3 * 3 || values.some(isNaN))
    throw new Error('File .cube tidak valid atau bukan LUT 3D.');
  const src = (r: number, g: number, b: number, c: number) =>
    (values[((b * size + g) * size + r) * 3 + c] - min[c]) / (max[c] - min[c] || 1);
  const n = Math.min(size, maxSize),
    out = new Uint8Array(n ** 3 * 3),
    step = (size - 1) / (n - 1);
  for (let b = 0; b < n; b++)
    for (let g = 0; g < n; g++)
      for (let r = 0; r < n; r++) {
        const sr = r * step,
          sg = g * step,
          sb = b * step,
          r0 = Math.floor(sr),
          g0 = Math.floor(sg),
          b0 = Math.floor(sb),
          r1 = Math.min(size - 1, r0 + 1),
          g1 = Math.min(size - 1, g0 + 1),
          b1 = Math.min(size - 1, b0 + 1),
          fr = sr - r0,
          fg = sg - g0,
          fb = sb - b0;
        for (let c = 0; c < 3; c++) {
          const v =
            ((src(r0, g0, b0, c) * (1 - fr) + src(r1, g0, b0, c) * fr) * (1 - fg) +
              (src(r0, g1, b0, c) * (1 - fr) + src(r1, g1, b0, c) * fr) * fg) *
              (1 - fb) +
            ((src(r0, g0, b1, c) * (1 - fr) + src(r1, g0, b1, c) * fr) * (1 - fg) +
              (src(r0, g1, b1, c) * (1 - fr) + src(r1, g1, b1, c) * fr) * fg) *
              fb;
          out[((b * n + g) * n + r) * 3 + c] = Math.round(Math.min(1, Math.max(0, v)) * 255);
        }
      }
  return { size: n, data: out };
}

/** Preset saved by an admin (lib/camera-config.ts) → film, with its LUT if it has one. */
export type PresetData = Omit<Film, 'preview' | 'lut' | 'custom'> & {
  enabled?: boolean;
  lutSize?: number;
  updatedAt?: string;
};
export function presetFilm(p: PresetData, lut?: Lut): Film {
  const [r, , b] = p.grade.gain,
    warm = Math.max(0, Math.min(0.6, (r - b) * 1.2));
  return {
    ...p,
    lut,
    custom: true,
    // Rough viewfinder look; the developed print uses the exact grade and LUT.
    preview: p.grade.mono
      ? 'grayscale(1) contrast(' + p.grade.contrast + ')'
      : `sepia(${warm.toFixed(2)}) saturate(${p.grade.saturation}) contrast(${p.grade.contrast}) brightness(${(1 + p.grade.lift[0] / 400).toFixed(2)})`,
  };
}
