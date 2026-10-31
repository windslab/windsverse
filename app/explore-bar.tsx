'use client';
// Windstopia bar station: a thin layer over the 3D counter (lib/bar-rig.ts). Taps go to the 3D
// props; the screen only shows the order, one line of help, the grinder dose and the shot
// readout while they matter, and a small "selesai" button that floats above the cup.
import { useEffect, useRef, useState } from 'react';
import { ingredientById, tasteOf, type Drink, type Order } from '@/lib/barista-game';
import type { BarReadout } from '@/lib/bar-rig';
import type { ExploreApi } from './explore-mode';
import styles from './explore-bar.module.css';

const SYRUPS = ['gula', 'aren', 'vanila', 'karamel'];
const SLOT_KEY = 'windstopia-syrups';
const DOSES = [16, 18, 20];
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
  return ['gula', 'aren', 'vanila'];
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
  const [hint, setHint] = useState(
    order.iced ? 'Ambil cup plastik di ujung kiri meja.' : 'Ambil paper cup di ujung kiri meja.',
  );
  const [readout, setReadout] = useState<BarReadout | null>(null),
    [slots, setSlots] = useState(loadSlots),
    [swap, setSwap] = useState<number | null>(null),
    [dose, setDose] = useState(18);
  const change = useRef(onChange),
    finish = useRef<HTMLButtonElement>(null);
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
      shot: (quality) =>
        add((d) => {
          const shots = Math.min(3, (d.amounts.espresso ?? 0) + 1);
          return {
            ...d,
            amounts: { ...d.amounts, espresso: shots },
            espressoQuality: (d.espressoQuality * (shots - 1) + quality) / shots,
          };
        }),
      ice: () => add((d) => ({ ...d, amounts: { ...d.amounts, es: ICE_SCOOP } })),
      hint: setHint,
      readout: setReadout,
      swap: setSwap,
    });
    return () => bar.close();
  }, [bar]);
  useEffect(() => bar.setDrink({ cup: drink.cup, amounts: drink.amounts }), [bar, drink]);
  useEffect(() => bar.setSlots(slots), [bar, slots]);
  useEffect(() => bar.setDose(dose), [bar, dose]);

  // The finish button follows the cup on screen.
  const { volume } = tasteOf(drink);
  const ready = !!drink.cup && volume >= 20;
  useEffect(() => {
    if (!ready) return;
    let frame = 0;
    const follow = () => {
      const at = bar.anchor(),
        el = finish.current;
      if (el) {
        el.style.visibility = at ? 'visible' : 'hidden';
        if (at) el.style.transform = `translate(${at.x}px, ${at.y}px) translate(-50%, -100%)`;
      }
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  }, [bar, ready]);

  return (
    <div className={styles.overlay}>
      <div
        className={styles.touch}
        onPointerDown={(e) => {
          setSwap(null);
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* Pointer already gone. */
          }
          bar.down(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => bar.move(e.clientX, e.clientY)}
        onPointerUp={() => bar.up()}
        onPointerCancel={() => bar.up()}
      />
      <section className={styles.ticket}>
        <small>{name}</small>
        <strong>{order.item.name}</strong>
        <span>
          {order.iced ? 'dingin' : 'panas'}
          {order.takeaway ? ' · bawa pulang' : ''}
          {order.coffee ? ' · espresso' : ''}
        </span>
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
      {order.coffee && (
        <div className={styles.dose} role="radiogroup" aria-label="Takaran grinder">
          {DOSES.map((g) => (
            <button key={g} role="radio" aria-checked={g === dose} onClick={() => setDose(g)}>
              {g} g
            </button>
          ))}
        </div>
      )}
      {readout && (
        <p className={styles.readout} aria-live="polite">
          <span>
            dosis {readout.dose.toFixed(1)}/{readout.doseTarget} g
          </span>
          {readout.time > 0 && (
            <>
              <span>{Math.round(readout.time)} dtk</span>
              <span>
                {Math.round(readout.yield)}/{readout.doseTarget * 2} ml
              </span>
            </>
          )}
        </p>
      )}
      {swap !== null && (
        <div className={styles.swap} role="listbox" aria-label={`Isi botol ${swap + 1}`}>
          {SYRUPS.map((s) => (
            <button
              key={s}
              role="option"
              aria-selected={slots[swap] === s}
              onClick={() => {
                const next = slots.map((x, i) => (i === swap ? s : x));
                setSlots(next);
                try {
                  localStorage.setItem(SLOT_KEY, JSON.stringify(next));
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
      <p className={styles.hint}>{hint}</p>
      {ready && (
        <button
          ref={finish}
          className={styles.finish}
          onClick={onFinish}
          style={{ visibility: 'hidden' }}
        >
          selesai
        </button>
      )}
    </div>
  );
}
