'use client';
// Windstopia bar station: a thin layer over the 3D counter (lib/bar-rig.ts). Taps go to the 3D
// props. The screen shows the order with its recipe steps (ticked as they are done), one line of
// help, a shot menu by the machine, an ice button for the freezer behind Luna, and a small
// "selesai" button above the cup once the drink is made.
import { useEffect, useRef, useState } from 'react';
import { ingredientById, recipeFor, type Drink, type Order } from '@/lib/barista-game';
import type { ShotKind } from '@/lib/bar-rig';
import type { ExploreApi } from './explore-mode';
import styles from './explore-bar.module.css';

const SYRUPS = ['gula', 'aren', 'lemon', 'vanila', 'karamel'];
const SLOT_KEY = 'windstopia-syrups-v2';
const SHOTS: { kind: ShotKind; label: string; note: string }[] = [
  { kind: 'ristretto', label: 'Ristretto', note: '20 ml, pekat' },
  { kind: 'espresso', label: 'Espresso', note: '30 ml' },
  { kind: 'lungo', label: 'Lungo', note: '60 ml, ringan' },
];
/** One scoop from the freezer is enough ice for a whole glass. */
const ICE_SCOOP = 3;

function loadSlots(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(SLOT_KEY) || '[]');
    if (Array.isArray(saved) && saved.length === 3 && saved.every((s) => SYRUPS.includes(s)))
      return saved;
  } catch {
    /* Storage blocked: defaults. */
  }
  return ['gula', 'aren', 'lemon'];
}

export default function BarStation({
  bar,
  name,
  order,
  drink,
  onChange,
  onClose,
  onFinish,
}: {
  bar: ExploreApi['bar'];
  name: string;
  order: Order;
  drink: Drink;
  onChange: (update: (d: Drink) => Drink) => void;
  onClose: () => void;
  onFinish: () => void;
}) {
  const [hint, setHint] = useState(''),
    [slots, setSlots] = useState(loadSlots),
    [swap, setSwap] = useState<number | null>(null),
    [shotMenu, setShotMenu] = useState(false);
  const change = useRef(onChange),
    finish = useRef<HTMLButtonElement>(null),
    shots = useRef<HTMLDivElement>(null);
  useEffect(() => {
    change.current = onChange;
  });

  // Open the 3D station for this drink; close it (and hand Luna back) on the way out.
  useEffect(() => {
    const add = (update: (d: Drink) => Drink) => change.current(update);
    bar.open({
      sound: () => {},
      add: (id, amount) =>
        add((d) => {
          const max = ingredientById(id)?.max ?? 999;
          return {
            ...d,
            amounts: { ...d.amounts, [id]: Math.min(max, (d.amounts[id] ?? 0) + amount) },
          };
        }),
      cup: (cup) => add((d) => ({ ...d, cup })),
      ice: () => add((d) => ({ ...d, amounts: { ...d.amounts, es: ICE_SCOOP } })),
      chooseShot: () => setShotMenu(true),
      hint: (text) => {
        setHint(text);
        window.setTimeout(() => setHint((h) => (h === text ? '' : h)), 3200);
      },
      swap: setSwap,
    });
    return () => bar.close();
  }, [bar]);
  useEffect(() => bar.setDrink({ cup: drink.cup, amounts: drink.amounts }), [bar, drink]);
  useEffect(() => bar.setSlots(slots), [bar, slots]);

  const steps = recipeFor(order).map((s) => ({ label: s.label, done: s.done(drink) }));
  const next = steps.find((s) => !s.done);
  const ready = !!drink.cup && !next;

  // Buttons that follow the 3D props on screen: "selesai" above the cup, shots above the machine.
  useEffect(() => {
    let frame = 0;
    const follow = () => {
      for (const [el, what] of [
        [finish.current, 'cup'],
        [shots.current, 'machine'],
      ] as const) {
        if (!el) continue;
        const at = bar.anchor(what);
        el.style.visibility = at ? 'visible' : 'hidden';
        if (at) el.style.transform = `translate(${at.x}px, ${at.y}px) translate(-50%, -100%)`;
      }
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  }, [bar]);

  return (
    <div className={styles.overlay}>
      <div
        className={styles.touch}
        onPointerDown={(e) => {
          setSwap(null);
          setShotMenu(false);
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* Pointer already gone. */
          }
          bar.down(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => bar.move(e.clientX)}
        onPointerUp={() => bar.up()}
        onPointerCancel={() => bar.up()}
      />
      <section className={styles.ticket}>
        <small>
          {name} · {order.iced ? 'dingin' : 'panas'}
          {order.takeaway ? ' · bawa pulang' : ''}
        </small>
        <strong>{order.item.name}</strong>
        <ol>
          {steps.map((s) => (
            <li key={s.label} data-done={s.done || undefined} data-next={s === next || undefined}>
              {s.label}
            </li>
          ))}
        </ol>
      </section>
      <div className={styles.top}>
        <button
          onClick={() => onChange(() => ({ cup: null, amounts: {}, espressoQuality: 1 }))}
          disabled={!drink.cup}
        >
          buang
        </button>
        <button onClick={onClose}>tutup</button>
      </div>
      {order.iced && !drink.amounts.es && (
        <button className={styles.ice} onClick={() => bar.act('freezer')}>
          🧊 ambil es di freezer
        </button>
      )}
      {shotMenu && (
        <div ref={shots} className={styles.shots} role="menu" aria-label="Pilih shot">
          {SHOTS.map((s) => (
            <button
              key={s.kind}
              role="menuitem"
              onClick={() => {
                setShotMenu(false);
                bar.act(s.kind);
              }}
            >
              <strong>{s.label}</strong>
              <small>{s.note}</small>
            </button>
          ))}
        </div>
      )}
      {swap !== null && (
        <div className={styles.swap} role="listbox" aria-label={`Isi botol ${swap + 1}`}>
          {SYRUPS.map((s) => (
            <button
              key={s}
              role="option"
              aria-selected={slots[swap] === s}
              onClick={() => {
                const nextSlots = slots.map((x, i) => (i === swap ? s : x));
                setSlots(nextSlots);
                try {
                  localStorage.setItem(SLOT_KEY, JSON.stringify(nextSlots));
                } catch {
                  /* Remembered for this visit only. */
                }
                setSwap(null);
              }}
            >
              {ingredientById(s)!.name}
            </button>
          ))}
        </div>
      )}
      <p className={styles.hint}>
        {hint || (next ? 'Berikutnya: ' + next.label : 'Siap disajikan!')}
      </p>
      {ready && (
        <button ref={finish} className={styles.finish} onClick={onFinish}>
          selesai ✓
        </button>
      )}
    </div>
  );
}
