'use client';
// RGB tone curves for a film preset, like an editing app: a master RGB curve and one per
// channel. Tap the graph to add a point, drag to move it, double-tap (or "Hapus titik") to
// remove it. The first and last points stay at the edges and only move up and down.
import { useRef, useState, type PointerEvent } from 'react';
import { curveTable, type CurvePoint, type Curves } from '@/lib/film';
import styles from './curve-editor.module.css';

type Channel = keyof Curves;
const CHANNELS: { key: Channel; label: string; color: string }[] = [
  { key: 'rgb', label: 'RGB', color: '#f5f6f8' },
  { key: 'r', label: 'Merah', color: '#ff6b6b' },
  { key: 'g', label: 'Hijau', color: '#6bd68a' },
  { key: 'b', label: 'Biru', color: '#6ba8ff' },
];
const STRAIGHT: CurvePoint[] = [
  [0, 0],
  [255, 255],
];
const MAX_POINTS = 12;
const isStraight = (p?: CurvePoint[]) =>
  !p || (p.length === 2 && p[0][0] === 0 && p[0][1] === 0 && p[1][0] === 255 && p[1][1] === 255);

/** Drops straight curves so a preset only stores the curves that change something. */
export function cleanCurves(curves: Curves): Curves | undefined {
  const out: Curves = {};
  for (const { key } of CHANNELS) if (!isStraight(curves[key])) out[key] = curves[key];
  return Object.keys(out).length ? out : undefined;
}

export default function CurveEditor({
  value,
  onChange,
}: {
  value: Curves;
  onChange: (curves: Curves) => void;
}) {
  const [channel, setChannel] = useState<Channel>('rgb'),
    [selected, setSelected] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null),
    drag = useRef<number | null>(null);
  const points = value[channel] ?? STRAIGHT;
  const color = CHANNELS.find((c) => c.key === channel)!.color;

  const put = (next: CurvePoint[]) => onChange({ ...value, [channel]: next });
  // Graph coordinates (0–255, y up) from a pointer position.
  const at = (e: PointerEvent): CurvePoint => {
    const box = svg.current!.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * 255,
      y = 255 - ((e.clientY - box.top) / box.height) * 255;
    return [Math.round(Math.min(255, Math.max(0, x))), Math.round(Math.min(255, Math.max(0, y)))];
  };
  const move = (i: number, [x, y]: CurvePoint) => {
    const next = points.map((p) => [...p] as CurvePoint);
    const last = points.length - 1;
    // Edge points keep their input; inner points stay between their neighbours.
    next[i] = [
      i === 0
        ? points[0][0]
        : i === last
          ? points[last][0]
          : Math.min(points[i + 1][0] - 1, Math.max(points[i - 1][0] + 1, x)),
      y,
    ];
    put(next);
  };
  const remove = (i: number) => {
    if (i === 0 || i === points.length - 1) return;
    put(points.filter((_, j) => j !== i));
    setSelected(null);
  };

  const down = (e: PointerEvent<SVGSVGElement>) => {
    const p = at(e);
    const box = svg.current!.getBoundingClientRect(),
      reach = (14 / box.width) * 255;
    let i = points.findIndex((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < reach);
    if (i < 0) {
      if (points.length >= MAX_POINTS || points.some((q) => Math.abs(q[0] - p[0]) < 3)) return;
      const next = [...points, p].sort((a, b) => a[0] - b[0]);
      i = next.findIndex((q) => q === p);
      put(next);
    }
    setSelected(i);
    drag.current = i;
    try {
      svg.current!.setPointerCapture(e.pointerId);
    } catch {
      /* Pointer already gone. */
    }
  };
  const moveTo = (e: PointerEvent<SVGSVGElement>) => {
    if (drag.current === null) return;
    move(drag.current, at(e));
  };
  const up = () => {
    drag.current = null;
  };

  const table = curveTable(points);
  const path = Array.from(table, (v, x) => `${x ? 'L' : 'M'}${x} ${255 - v}`).join('');
  const changed = (key: Channel) => !isStraight(value[key]);

  return (
    <div className={styles.editor}>
      <div className={styles.channels} role="tablist" aria-label="Kanal kurva">
        {CHANNELS.map((c) => (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={c.key === channel}
            className={styles.channel}
            style={{ '--dot': c.color } as React.CSSProperties}
            onClick={() => {
              setChannel(c.key);
              setSelected(null);
            }}
          >
            {c.label}
            {changed(c.key) && <i aria-label="diubah" />}
          </button>
        ))}
      </div>
      <svg
        ref={svg}
        className={styles.graph}
        viewBox="0 0 255 255"
        role="img"
        aria-label={'Kurva ' + channel}
        onPointerDown={down}
        onPointerMove={moveTo}
        onPointerUp={up}
        onPointerCancel={up}
        onDoubleClick={() => selected !== null && remove(selected)}
      >
        {[64, 128, 192].map((v) => (
          <g key={v} className={styles.grid}>
            <line x1={v} y1={0} x2={v} y2={255} />
            <line x1={0} y1={v} x2={255} y2={v} />
          </g>
        ))}
        <line className={styles.diagonal} x1={0} y1={255} x2={255} y2={0} />
        <path d={path} stroke={color} className={styles.curve} />
        {points.map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={255 - y}
            r={i === selected ? 7 : 5.5}
            fill={i === selected ? color : '#101722'}
            stroke={color}
            className={styles.point}
          />
        ))}
      </svg>
      <div className={styles.actions}>
        <small className="muted">
          {selected !== null
            ? `Titik ${points[selected]?.[0] ?? ''} → ${points[selected]?.[1] ?? ''}`
            : 'Ketuk kurva untuk menambah titik, geser untuk mengubah.'}
        </small>
        <div className="row">
          {selected !== null && selected > 0 && selected < points.length - 1 && (
            <button type="button" className="button" onClick={() => remove(selected)}>
              Hapus titik
            </button>
          )}
          <button
            type="button"
            className="button"
            disabled={!changed(channel)}
            onClick={() => {
              put(STRAIGHT);
              setSelected(null);
            }}
          >
            Reset {CHANNELS.find((c) => c.key === channel)!.label}
          </button>
          <button
            type="button"
            className="button"
            disabled={!CHANNELS.some((c) => changed(c.key))}
            onClick={() => {
              onChange({});
              setSelected(null);
            }}
          >
            Reset semua
          </button>
        </div>
      </div>
    </div>
  );
}
