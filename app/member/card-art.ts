// The member card's two faces, drawn on canvases for the 3D card: the admin's artwork (or the
// house design) with the member's name, code and stamps over it. The layout zones below are the
// same ones the downloadable design template marks, so the artwork can leave room for them.
import type { CardDesign } from '@/lib/member';

/** ISO ID-1 (ATM card) proportions, 85.60 × 53.98 mm. */
export const CARD_RATIO = 85.6 / 53.98;
export const TEXTURE_WIDTH = 1536;
export const TEXTURE_HEIGHT = Math.round(TEXTURE_WIDTH / CARD_RATIO);
export const TEMPLATE_WIDTH = 2048;
export const TEMPLATE_HEIGHT = Math.round(TEMPLATE_WIDTH / CARD_RATIO);
/** Corner radius as a share of the card width (3.18 mm of 85.6 mm). */
export const CORNER = 3.18 / 85.6;

/** Zones as shares of the card: x, y, width, height. */
export const ZONES = {
  /** Front: member name and code, bottom left. */
  name: [0.065, 0.66, 0.62, 0.26],
  /** Front: card number, top right. */
  cardNo: [0.76, 0.07, 0.18, 0.12],
  /** Back: the ten stamps, two rows of five. */
  stamps: [0.07, 0.3, 0.86, 0.56],
  /** Back: card number and progress line. */
  footer: [0.07, 0.88, 0.86, 0.08],
} as const;

export type Face = {
  name: string;
  code: string;
  cardNo: number;
  stamps: { at: string }[];
};
/** One stamp being pressed: 0 = above the card, 1 = pressed. */
export type StampMotion = { slot: number; progress: number };

const SLOTS = 10;
const FREE: Record<number, [string, string]> = {
  4: ['POTONGAN', 'Rp5.000'],
  9: ['MINUMAN', 'GRATIS'],
};

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight),
    dw = img.naturalWidth * scale,
    dh = img.naturalHeight * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}
const rect = (z: readonly number[], w: number, h: number) => ({
  x: z[0] * w,
  y: z[1] * h,
  w: z[2] * w,
  h: z[3] * h,
});
/** Small deterministic random numbers, so a stamp looks the same every time it is drawn. */
function seeded(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (text: string) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);

export function drawFront(
  canvas: HTMLCanvasElement,
  face: Face,
  design: CardDesign,
  art: HTMLImageElement | null,
) {
  const ctx = canvas.getContext('2d')!,
    w = canvas.width,
    h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (art) cover(ctx, art, w, h);
  else {
    // House design: deep olive, a warm glow, a chip and a large monogram.
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#56643f');
    g.addColorStop(1, '#2c3622');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(w * 0.9, 0, 0, w * 0.9, 0, w * 0.7);
    glow.addColorStop(0, 'rgba(241,201,138,0.28)');
    glow.addColorStop(1, 'rgba(241,201,138,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(247,239,223,0.06)';
    ctx.font = `700 ${h * 1.05}px Georgia, serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('W', w * 1.04, h * 0.98);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f7efdf';
    ctx.font = `600 ${h * 0.085}px Georgia, serif`;
    ctx.fillText('WINDS SPACE', w * 0.065, h * 0.2);
    ctx.fillStyle = '#e8c98f';
    ctx.font = `600 ${h * 0.036}px Inter, system-ui, sans-serif`;
    ctx.letterSpacing = `${h * 0.012}px`;
    ctx.fillText('MEMBER CARD', w * 0.067, h * 0.27);
    ctx.letterSpacing = '0px';
    const chip = { x: w * 0.065, y: h * 0.38, w: w * 0.105, h: h * 0.15 };
    const cg = ctx.createLinearGradient(chip.x, chip.y, chip.x + chip.w, chip.y + chip.h);
    cg.addColorStop(0, '#f3d79c');
    cg.addColorStop(0.5, '#c99a4c');
    cg.addColorStop(1, '#f0cf8d');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.roundRect(chip.x, chip.y, chip.w, chip.h, h * 0.02);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,62,23,0.45)';
    ctx.lineWidth = h * 0.004;
    for (const f of [0.33, 0.66]) {
      ctx.beginPath();
      ctx.moveTo(chip.x, chip.y + chip.h * f);
      ctx.lineTo(chip.x + chip.w, chip.y + chip.h * f);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(chip.x + chip.w * 0.5, chip.y);
    ctx.lineTo(chip.x + chip.w * 0.5, chip.y + chip.h);
    ctx.stroke();
  }
  // Name and code.
  const n = rect(ZONES.name, w, h);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = h * 0.012;
  ctx.fillStyle = design.textColor;
  let size = h * 0.085;
  ctx.font = `600 ${size}px Georgia, serif`;
  while (ctx.measureText(face.name).width > n.w && size > h * 0.04) {
    size -= 2;
    ctx.font = `600 ${size}px Georgia, serif`;
  }
  ctx.fillText(face.name, n.x, n.y + n.h * 0.5);
  ctx.font = `600 ${h * 0.05}px ui-monospace, Menlo, monospace`;
  ctx.letterSpacing = `${h * 0.01}px`;
  ctx.globalAlpha = 0.85;
  ctx.fillText(face.code, n.x, n.y + n.h * 0.85);
  ctx.letterSpacing = '0px';
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  // Card number.
  const c = rect(ZONES.cardNo, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath();
  ctx.roundRect(c.x, c.y, c.w, c.h, c.h / 2);
  ctx.fill();
  ctx.fillStyle = design.textColor;
  ctx.font = `600 ${c.h * 0.42}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('KARTU ' + face.cardNo, c.x + c.w / 2, c.y + c.h / 2 + 1);
}

/** One rubber stamp mark, drawn once per slot and date and kept. */
const marks = new Map<string, HTMLCanvasElement>();
function stampMark(size: number, ink: string, date: string, seed: number) {
  const key = [size, ink, date, seed].join('|');
  const cached = marks.get(key);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(size);
  const ctx = c.getContext('2d')!,
    r = size / 2,
    rand = seeded(seed);
  ctx.translate(r, r);
  ctx.strokeStyle = ctx.fillStyle = ink;
  ctx.lineWidth = r * 0.09;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = r * 0.035;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  // WINDS SPACE around the ring.
  ctx.font = `700 ${r * 0.17}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const text = 'WINDS SPACE ★ WINDS SPACE ★ ';
  [...text].forEach((ch, i) => {
    ctx.save();
    ctx.rotate((i / text.length) * Math.PI * 2);
    ctx.fillText(ch, 0, -r * 0.76);
    ctx.restore();
  });
  ctx.font = `700 ${r * 0.62}px Georgia, serif`;
  ctx.fillText('W', 0, -r * 0.04);
  ctx.font = `600 ${r * 0.15}px ui-monospace, Menlo, monospace`;
  ctx.fillText(date, 0, r * 0.38);
  // Worn ink: specks taken out of the mark.
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2,
      d = rand() * r;
    ctx.globalAlpha = 0.35 + rand() * 0.6;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r * (0.01 + rand() * 0.035), 0, Math.PI * 2);
    ctx.fill();
  }
  marks.set(key, c);
  return c;
}
const shortDate = (iso: string) => {
  const d = new Date(iso);
  return [d.getDate(), d.getMonth() + 1, d.getFullYear() % 100]
    .map((v) => String(v).padStart(2, '0'))
    .join('.');
};

export function drawBack(
  canvas: HTMLCanvasElement,
  face: Face,
  design: CardDesign,
  art: HTMLImageElement | null,
  /** Stamps still being pressed; slots not listed are drawn as they are. */
  motion: StampMotion[] = [],
) {
  const ctx = canvas.getContext('2d')!,
    w = canvas.width,
    h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (art) cover(ctx, art, w, h);
  else {
    ctx.fillStyle = '#f5efe3';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#3f4a2f';
    ctx.fillRect(0, 0, w, h * 0.24);
    ctx.fillStyle = '#f7efdf';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${h * 0.07}px Georgia, serif`;
    ctx.fillText('Stamp Card', w * 0.07, h * 0.1);
    ctx.fillStyle = '#e8c98f';
    ctx.font = `500 ${h * 0.034}px Inter, system-ui, sans-serif`;
    ctx.fillText('Stamp ke-5 potongan Rp5.000 · stamp ke-10 minuman gratis', w * 0.07, h * 0.175);
  }
  const area = rect(ZONES.stamps, w, h),
    cellW = area.w / 5,
    cellH = area.h / 2,
    radius = Math.min(cellW, cellH) * 0.4;
  for (let i = 0; i < SLOTS; i++) {
    const cx = area.x + cellW * (i % 5) + cellW / 2,
      cy = area.y + cellH * Math.floor(i / 5) + cellH / 2;
    const stamp = face.stamps[i];
    const moving = motion.find((m) => m.slot === i);
    // The empty circle shows until the stamp lands.
    if (!stamp || (moving && moving.progress < 0.72)) {
      ctx.save();
      ctx.strokeStyle = ctx.fillStyle = design.slotColor;
      const free = FREE[i];
      ctx.globalAlpha = free ? 0.85 : 0.45;
      ctx.lineWidth = radius * (free ? 0.07 : 0.05);
      if (!free) ctx.setLineDash([radius * 0.16, radius * 0.12]);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `600 ${radius * 0.55}px Georgia, serif`;
      ctx.fillText(String(i + 1), cx, cy - (free ? radius * 0.18 : 0));
      if (free) {
        ctx.font = `700 ${radius * 0.2}px Inter, system-ui, sans-serif`;
        ctx.fillText(free[0], cx, cy + radius * 0.3);
        ctx.fillText(free[1], cx, cy + radius * 0.54);
      }
      ctx.restore();
    }
    if (!stamp) continue;
    const seed = hash(face.code) + face.cardNo * 97 + i * 13,
      rand = seeded(seed);
    const mark = stampMark(radius * 2.3, design.inkColor, shortDate(stamp.at), seed);
    const p = moving ? moving.progress : 1;
    // Falls from above, lands a little squashed at 0.72, settles.
    const fall = Math.min(1, p / 0.72),
      settle = Math.max(0, (p - 0.72) / 0.28);
    const scale =
      p < 0.72 ? 2.1 - 1.18 * fall * fall : 0.92 + 0.08 * Math.sin((settle * Math.PI) / 2);
    const alpha = p < 0.72 ? fall * 0.55 : 0.92;
    ctx.save();
    ctx.translate(cx + (rand() - 0.5) * radius * 0.16, cy + (rand() - 0.5) * radius * 0.16);
    ctx.rotate((rand() - 0.5) * 0.7);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(mark, -mark.width / 2, -mark.height / 2);
    ctx.restore();
    // A ring of ink pushed out at the moment it lands.
    if (moving && p >= 0.72 && p < 1) {
      ctx.save();
      ctx.strokeStyle = design.inkColor;
      ctx.globalAlpha = (1 - settle) * 0.5;
      ctx.lineWidth = radius * 0.05;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * (1.05 + settle * 0.35), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
  const f = rect(ZONES.footer, w, h);
  ctx.fillStyle = design.slotColor;
  ctx.globalAlpha = 0.8;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${f.h * 0.5}px Inter, system-ui, sans-serif`;
  ctx.fillText(`KARTU ${face.cardNo} · ${face.stamps.length}/${SLOTS} STAMP`, f.x, f.y + f.h / 2);
  ctx.textAlign = 'right';
  ctx.font = `600 ${f.h * 0.5}px ui-monospace, Menlo, monospace`;
  ctx.fillText(face.code, f.x + f.w, f.y + f.h / 2);
  ctx.globalAlpha = 1;
}

/** A design template for one side: the card outline, the safe margin and the zones drawn over. */
export function drawTemplate(side: 'front' | 'back') {
  const c = document.createElement('canvas');
  c.width = TEMPLATE_WIDTH;
  c.height = TEMPLATE_HEIGHT;
  const ctx = c.getContext('2d')!,
    w = c.width,
    h = c.height;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#eef0e8';
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, w * CORNER);
  ctx.fill();
  ctx.strokeStyle = '#c0392b';
  ctx.setLineDash([18, 12]);
  ctx.lineWidth = 4;
  ctx.strokeRect(w * 0.04, h * 0.04, w * 0.92, h * 0.92);
  ctx.setLineDash([]);
  const zone = (z: readonly number[], label: string) => {
    const r = rect(z, w, h);
    ctx.fillStyle = 'rgba(41,128,185,0.14)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = '#2980b9';
    ctx.lineWidth = 4;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = '#1f5f8b';
    ctx.font = `600 ${h * 0.03}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(label, r.x + 14, r.y + 12);
  };
  if (side === 'front') {
    zone(ZONES.name, 'Nama & kode member (otomatis)');
    zone(ZONES.cardNo, 'KARTU n');
  } else {
    zone(ZONES.stamps, '10 stamp, 2 baris × 5 (otomatis)');
    const area = rect(ZONES.stamps, w, h),
      cellW = area.w / 5,
      cellH = area.h / 2,
      radius = Math.min(cellW, cellH) * 0.4;
    ctx.strokeStyle = '#2980b9';
    for (let i = 0; i < SLOTS; i++) {
      ctx.beginPath();
      ctx.arc(
        area.x + cellW * (i % 5) + cellW / 2,
        area.y + cellH * Math.floor(i / 5) + cellH / 2,
        radius,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
    zone(ZONES.footer, 'Kartu ke-n · jumlah stamp · kode (otomatis)');
  }
  ctx.fillStyle = '#555';
  ctx.font = `500 ${h * 0.026}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(
    `${side === 'front' ? 'DEPAN' : 'BELAKANG'} · ${w} × ${h} px · kartu ATM 85,6 × 54 mm · garis merah = batas aman · area biru diisi otomatis`,
    w / 2,
    h - 14,
  );
  return c;
}
