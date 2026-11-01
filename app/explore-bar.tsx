'use client';
// Windstopia bar station: a thin layer over the 3D counter (lib/bar-rig.ts). Taps go to the 3D
// props. The screen shows the order with its recipe steps (ticked as they are done), one line of
// help, a shot menu by the machine, an ice button for the freezer behind Luna, and a small
// "selesai" button above the cup once the drink is made.
import { useEffect, useRef, useState } from 'react';
import { ingredientById, POUR_WINDOW, recipeFor, type Drink, type Order } from '@/lib/barista-game';
import { mlOf, type ShotKind } from '@/lib/bar-rig';
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
    [shotMenu, setShotMenu] = useState(false),
    [pouring, setPouring] = useState<string | null>(null);
  const change = useRef(onChange),
    finish = useRef<HTMLButtonElement>(null),
    shots = useRef<HTMLDivElement>(null),
    meter = useRef<HTMLDivElement>(null);
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
      pouring: setPouring,
    });
    return () => bar.close();
  }, [bar]);
  const recipe = recipeFor(order);
  // The finished drink's volume: the cup fills to the brim as the last step goes in.
  const full = recipe.reduce((ml, s) => ml + (s.need ? mlOf(s.need.id, s.need.amount) : 0), 0);
  useEffect(
    () => bar.setDrink({ cup: drink.cup, amounts: drink.amounts, full }),
    [bar, drink, full],
  );
  useEffect(() => bar.setSlots(slots), [bar, slots]);

  // A held pour: the meter shows how much went in against the recipe's "just right" window, and
  // letting go says how it went.
  const pourStep = pouring ? recipe.find((s) => s.pour && s.need?.id === pouring) : undefined;
  const target = pourStep?.need?.amount ?? 0,
    poured = pouring ? (drink.amounts[pouring] ?? 0) : 0,
    lastPour = useRef<{ id: string; target: number; poured: number } | null>(null);
  useEffect(() => {
    if (pouring) lastPour.current = { id: pouring, target, poured };
  }, [pouring, target, poured]);
  useEffect(() => {
    if (pouring || !lastPour.current) return;
    const { target: aim, poured: got } = lastPour.current;
    lastPour.current = null;
    if (!aim) return;
    const ratio = got / aim;
    const text =
      ratio < POUR_WINDOW[0]
        ? 'Kurang sedikit, tahan lagi.'
        : ratio <= POUR_WINDOW[1]
          ? 'Pas! Takarannya sempurna ✨'
          : 'Kebanyakan sedikit, tapi masih enak.';
    const timer = window.setTimeout(() => setHint(text), 0);
    const clear = window.setTimeout(() => setHint((h) => (h === text ? '' : h)), 3000);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(clear);
    };
  }, [pouring]);

  const steps = recipe.map((s) => ({ label: s.label, done: s.done(drink) }));
  const next = steps.find((s) => !s.done);
  const ready = !!drink.cup && !next;

  // Buttons that follow the 3D props on screen: "selesai" above the cup, shots above the machine.
  useEffect(() => {
    let frame = 0;
    const follow = () => {
      for (const [el, what] of [
        [finish.current, 'cup'],
        [shots.current, 'machine'],
        [meter.current, 'cup'],
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
      {pouring && (
        <div ref={meter} className={styles.meter} aria-label="Takaran">
          <div className={styles.meterBar}>
            {target > 0 && (
              <span
                className={styles.meterZone}
                style={{
                  bottom: `${(POUR_WINDOW[0] / 1.4) * 100}%`,
                  height: `${((POUR_WINDOW[1] - POUR_WINDOW[0]) / 1.4) * 100}%`,
                }}
              />
            )}
            <span
              className={styles.meterFill}
              style={{ height: `${Math.min(100, (poured / Math.max(1, target * 1.4)) * 100)}%` }}
            />
          </div>
          <small>
            {Math.round(poured)}
            {target ? ` / ${target}` : ''} ml
          </small>
        </div>
      )}
      {ready && (
        <button ref={finish} className={styles.finish} onClick={onFinish}>
          selesai ✓
        </button>
      )}
    </div>
  );
}
