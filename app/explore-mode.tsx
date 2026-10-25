'use client';
// Explore mode: walk Luna around the café and run the bar for virtual guests.
// Take the order at the cashier, give change, mix the drink at the bar (your own recipe),
// pull espresso for coffee, then carry it to the guest's table for a star rating.
import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Coffee, LogOut, Star } from 'lucide-react';
import type { CafeVisitor } from '@/lib/cafe-activity';
import {
  CUPS,
  DENOMINATIONS,
  INGREDIENTS,
  drinkMenu,
  newCustomer,
  review,
  rupiah,
  type CupId,
  type Drink,
  type MenuItem,
  type Order,
  type Review,
} from '@/lib/barista-game';
import styles from './explore-mode.module.css';

export type ExploreApi = {
  setManual: (on: boolean) => void;
  setTask: (task: string) => void;
  setStick: (x: number, y: number) => void;
  setVisitors: (visitors: CafeVisitor[]) => void;
  guests: () => { key: string; phase: string; status: string; position: THREE.Vector3 }[];
  deliver: (key: string) => void;
  /** Auto-walk along the café's paths (the stick takes over at any time). */
  walkTo: (point: THREE.Vector3) => boolean;
  walking: () => boolean;
  luna: () => THREE.Vector3;
  stations: { cashier: THREE.Vector3; bar: THREE.Vector3; espresso: THREE.Vector3 };
};

type Stage = 'queue' | 'waiting' | 'served';
type Customer = {
  key: string;
  name: string;
  order: Order;
  stage: Stage;
  arrivedAt: number;
  change?: { given: number; due: number };
  wrongItem?: boolean;
  servedAt?: number;
};
type Panel = 'cashier' | 'prep' | 'espresso' | null;
type MenuSource = { id: string; name: string; price: number; category: string; status?: string };

const NEAR = 1.15;
// Each "walk there" goal and the action it leads to.
const GOAL_ACTION: Record<string, string> = {
  'go-cashier': 'cashier',
  'go-bar': 'prep',
  'go-espresso': 'espresso',
  'go-guest': 'serve',
};
const flat = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);
const emptyDrink = (): Drink => ({ cup: null, amounts: {}, espressoQuality: 1 });

export default function ExploreMode({ api, onExit }: { api: ExploreApi; onExit: () => void }) {
  const [menu, setMenu] = useState<MenuItem[]>([]),
    [customers, setCustomers] = useState<Customer[]>([]),
    [panel, setPanel] = useState<Panel>(null),
    [actions, setActions] = useState<{ id: string; label: string }[]>([]),
    [ticket, setTicket] = useState<string | null>(null),
    [drink, setDrink] = useState<Drink>(emptyDrink()),
    [holding, setHolding] = useState(false),
    [score, setScore] = useState({ points: 0, served: 0, stars: 0 }),
    [toast, setToast] = useState<{ name: string; review: Review } | null>(null),
    [hint, setHint] = useState('Jalan ke kasir untuk menyambut tamu.'),
    [goals, setGoals] = useState<{ id: string; label: string }[]>([]);
  const customersRef = useRef<Customer[]>([]),
    keys = useRef(new Set<string>()),
    stick = useRef({ x: 0, y: 0 }),
    counter = useRef(0);
  customersRef.current = customers;

  // Menu from the café (names and prices only; recipes stay private).
  useEffect(() => {
    void fetch('/api/public', { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<{ products?: MenuSource[] }>) : Promise.reject()))
      .then((data) => setMenu(drinkMenu(data.products ?? [])))
      .catch(() => setMenu(drinkMenu([])));
  }, []);

  // Keep the scene's virtual guests in step with the game.
  useEffect(() => {
    api.setVisitors(
      customers.map((c) => ({
        key: c.key,
        group: c.key,
        status:
          c.stage === 'queue' ? 'diproses' : c.stage === 'waiting' ? 'sedang_dibuat' : 'selesai',
        type: c.order.takeaway ? 'takeaway' : 'dine_in',
        tableNumber: null,
        finishedAt: c.servedAt ?? null,
      })),
    );
  }, [customers, api]);

  useEffect(() => {
    api.setTask(
      holding ? 'serving' : panel === 'cashier' ? 'cashier' : panel ? 'preparing' : 'idle',
    );
  }, [holding, panel, api]);

  // Guests arrive now and then (at most three at a time while testing).
  useEffect(() => {
    if (!menu.length) return;
    const spawn = () => {
      if (customersRef.current.filter((c) => c.stage !== 'served').length >= 3) return;
      const { name, order } = newCustomer(menu);
      counter.current += 1;
      setCustomers((list) => [
        ...list,
        {
          key: 'explore-' + Date.now() + '-' + counter.current,
          name,
          order,
          stage: 'queue',
          arrivedAt: Date.now(),
        },
      ]);
    };
    const first = setTimeout(spawn, 2500),
      timer = setInterval(spawn, 26000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [menu]);

  // Guests who were served leave after their drink.
  useEffect(() => {
    const t = setInterval(() => {
      setCustomers((list) => list.filter((c) => !c.servedAt || Date.now() - c.servedAt < 60_000));
    }, 5000);
    return () => clearInterval(t);
  }, []);

  // Keyboard: WASD / arrows to walk, E or Space to act.
  const applyStick = useCallback(() => {
    const k = keys.current;
    const x =
        (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0),
      y = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0);
    const len = Math.hypot(x, y) || 1;
    if (x || y) api.setStick(x / len, y / len);
    else api.setStick(stick.current.x, stick.current.y);
  }, [api]);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const runRef = useRef<(id: string) => void>(() => {});
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (panel) return;
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        keys.current.add(key);
        applyStick();
        e.preventDefault();
      } else if ((key === 'e' || key === ' ') && actionsRef.current[0]) {
        runRef.current(actionsRef.current[0].id);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      keys.current.delete(e.key.toLowerCase());
      applyStick();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      api.setStick(0, 0);
    };
  }, [panel, applyStick, api]);

  // What can Luna do where she stands? (checked a few times a second)
  useEffect(() => {
    const t = setInterval(() => {
      const at = api.luna(),
        list: { id: string; label: string }[] = [];
      const queue = customersRef.current.find((c) => c.stage === 'queue');
      const tickets = customersRef.current.filter((c) => c.stage === 'waiting');
      if (flat(at, api.stations.cashier) < NEAR && queue)
        list.push({ id: 'cashier', label: 'Terima pesanan' });
      if (!holding && flat(at, api.stations.bar) < NEAR && tickets.length)
        list.push({ id: 'prep', label: 'Racik minuman' });
      if (!holding && ticket && drink.cup && flat(at, api.stations.espresso) < NEAR)
        list.push({ id: 'espresso', label: 'Mesin espresso' });
      if (holding && ticket) {
        const guest = api.guests().find((g) => g.key === ticket);
        if (guest && flat(at, guest.position) < NEAR + 0.25)
          list.push({ id: 'serve', label: 'Antar pesanan' });
      }
      setActions((old) => (JSON.stringify(old) === JSON.stringify(list) ? old : list));
      // Where to go next, offered as a one-tap "walk there" button when Luna is not there yet.
      let next: { id: string; label: string } | null = null;
      if (holding && ticket) next = { id: 'go-guest', label: 'Pergi ke meja tamu' };
      else if (
        ticket &&
        drink.cup &&
        customersRef.current.find((c) => c.key === ticket)?.order.coffee &&
        !(drink.amounts.espresso > 0)
      )
        next = { id: 'go-espresso', label: 'Pergi ke mesin espresso' };
      else if (tickets.length) next = { id: 'go-bar', label: 'Pergi ke meja bar' };
      else if (queue) next = { id: 'go-cashier', label: 'Pergi ke kasir' };
      // Hide it only once the matching action is already within reach.
      const arrived = next && list.some((a) => GOAL_ACTION[next.id] === a.id);
      const nextList = next && !arrived ? [next] : [];
      setGoals((old) => (JSON.stringify(old) === JSON.stringify(nextList) ? old : nextList));
      setHint(
        holding
          ? 'Antar minumannya ke meja tamu.'
          : tickets.length && !ticket
            ? 'Ada pesanan. Ke meja bar untuk meracik.'
            : queue
              ? `${queue.name} menunggu di kasir.`
              : tickets.length
                ? 'Lanjutkan racikan di meja bar.'
                : 'Jalan-jalan dulu, tamu berikutnya segera datang.',
      );
    }, 200);
    return () => clearInterval(t);
  }, [api, holding, ticket, drink.cup, drink.amounts.espresso]);

  const run = (id: string) => {
    if (id.startsWith('go-')) {
      const target =
        id === 'go-cashier'
          ? api.stations.cashier
          : id === 'go-bar'
            ? api.stations.bar
            : id === 'go-espresso'
              ? api.stations.bar
              : api.guests().find((g) => g.key === ticket)?.position;
      if (target && !api.walkTo(target)) setHint('Jalannya tertutup, coba pakai joystick.');
      return;
    }
    if (id === 'cashier') setPanel('cashier');
    if (id === 'prep') {
      if (!ticket) {
        const next = customersRef.current.find((c) => c.stage === 'waiting');
        if (next) {
          setTicket(next.key);
          setDrink(emptyDrink());
        }
      }
      setPanel('prep');
    }
    if (id === 'espresso') setPanel('espresso');
    if (id === 'serve' && ticket) {
      const c = customersRef.current.find((x) => x.key === ticket);
      if (!c) return;
      const waited = (Date.now() - c.arrivedAt) / 1000;
      const result = review(c.order, drink, c.change ?? { given: 0, due: 0 }, waited);
      const penalty = c.wrongItem ? 1 : 0;
      const final = { ...result, stars: Math.max(1, result.stars - penalty) };
      if (c.wrongItem) final.lines = ['Tadi sempat salah catat pesanan.', ...final.lines];
      api.deliver(c.key);
      setCustomers((list) =>
        list.map((x) => (x.key === c.key ? { ...x, stage: 'served', servedAt: Date.now() } : x)),
      );
      setScore((s) => ({
        points: s.points + final.points,
        served: s.served + 1,
        stars: s.stars + final.stars,
      }));
      setToast({ name: c.name, review: final });
      setTimeout(() => setToast(null), 5500);
      setHolding(false);
      setTicket(null);
      setDrink(emptyDrink());
    }
  };
  runRef.current = run;
  // Development only (?sceneStats): a handle for testing the flows without walking.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || !location.search.includes('sceneStats')) return;
    (window as unknown as { __explore: unknown }).__explore = {
      run: (id: string) => runRef.current(id),
      luna: () => api.luna().toArray(),
      stations: () =>
        Object.fromEntries(Object.entries(api.stations).map(([k, v]) => [k, v.toArray()])),
      customers: () =>
        customersRef.current.map((c) => ({ key: c.key, stage: c.stage, item: c.order.item.name })),
      actions: () => actionsRef.current,
    };
  }, [api]);

  const queueCustomer = customers.find((c) => c.stage === 'queue');
  const ticketCustomer = customers.find((c) => c.key === ticket);
  const average = score.served ? score.stars / score.served : 0;

  return (
    <div className={styles.hud}>
      <header className={styles.top}>
        <div className={styles.score}>
          <strong>{score.points}</strong>
          <small>poin</small>
        </div>
        <div className={styles.score}>
          <strong>
            {average ? average.toFixed(1) : '–'} <Star size={13} />
          </strong>
          <small>{score.served} tamu</small>
        </div>
        <p className={styles.hint}>{hint}</p>
        <button className={styles.exit} onClick={onExit} aria-label="Keluar dari mode explore">
          <LogOut size={16} />
        </button>
      </header>
      {ticketCustomer && (
        <aside className={styles.ticket}>
          <small>PESANAN · {ticketCustomer.name}</small>
          <strong>{ticketCustomer.order.item.name}</strong>
          <span>{ticketCustomer.order.line}</span>
          {holding && <em>Siap diantar</em>}
        </aside>
      )}
      <Joystick
        onMove={(x, y) => {
          stick.current = { x, y };
          applyStick();
        }}
      />
      <div className={styles.actions}>
        {goals.map((g) => (
          <button key={g.id} className={styles.goal} onClick={() => run(g.id)}>
            {g.label} →
          </button>
        ))}
        {actions.map((a) => (
          <button key={a.id} className={styles.action} onClick={() => run(a.id)}>
            {a.label}
          </button>
        ))}
      </div>
      {toast && (
        <div className={styles.toast} role="status">
          <strong>
            {toast.name}: {'★'.repeat(toast.review.stars)}
            {'☆'.repeat(5 - toast.review.stars)}
          </strong>
          {toast.review.lines.map((l) => (
            <span key={l}>“{l}”</span>
          ))}
          <small>+{toast.review.points} poin</small>
        </div>
      )}
      {panel === 'cashier' && queueCustomer && (
        <CashierPanel
          customer={queueCustomer}
          menu={menu}
          onClose={() => setPanel(null)}
          onDone={(wrongItem, change) => {
            setCustomers((list) =>
              list.map((c) =>
                c.key === queueCustomer.key ? { ...c, stage: 'waiting', wrongItem, change } : c,
              ),
            );
            setPanel(null);
          }}
        />
      )}
      {panel === 'prep' && ticketCustomer && (
        <PrepPanel
          customer={ticketCustomer}
          drink={drink}
          onChange={setDrink}
          onClose={() => setPanel(null)}
          onFinish={() => {
            setHolding(true);
            setPanel(null);
          }}
        />
      )}
      {panel === 'espresso' && (
        <EspressoPanel
          shots={drink.amounts.espresso ?? 0}
          onClose={() => setPanel(null)}
          onShot={(quality) =>
            setDrink((d) => {
              const shots = (d.amounts.espresso ?? 0) + 1;
              return {
                ...d,
                amounts: { ...d.amounts, espresso: shots },
                espressoQuality: (d.espressoQuality * (shots - 1) + quality) / shots,
              };
            })
          }
        />
      )}
    </div>
  );
}

function Joystick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const base = useRef<HTMLDivElement>(null),
    [knob, setKnob] = useState({ x: 0, y: 0 }),
    active = useRef<number | null>(null);
  const move = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect(),
      radius = r.width / 2;
    let x = (e.clientX - r.left - radius) / radius,
      y = (e.clientY - r.top - radius) / radius;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    setKnob({ x, y });
    onMove(x, y);
  };
  const end = () => {
    active.current = null;
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  };
  return (
    <div
      ref={base}
      className={styles.joystick}
      onPointerDown={(e) => {
        active.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={(e) => active.current === e.pointerId && move(e)}
      onPointerUp={end}
      onPointerCancel={end}
      aria-label="Joystick: geser untuk berjalan"
    >
      <i style={{ transform: `translate(${knob.x * 34}px, ${knob.y * 34}px)` }} />
    </div>
  );
}

function CashierPanel({
  customer,
  menu,
  onClose,
  onDone,
}: {
  customer: Customer;
  menu: MenuItem[];
  onClose: () => void;
  onDone: (wrongItem: boolean, change: { given: number; due: number }) => void;
}) {
  const [step, setStep] = useState<'order' | 'pay'>('order'),
    [wrong, setWrong] = useState(false),
    [reply, setReply] = useState(''),
    [tray, setTray] = useState<number[]>([]);
  const due = customer.order.paid - customer.order.item.price,
    given = tray.reduce((a, b) => a + b, 0);
  return (
    <div className={styles.panel} role="dialog" aria-label="Kasir">
      <header>
        <strong>Kasir</strong>
        <button onClick={onClose} aria-label="Tutup">
          ×
        </button>
      </header>
      <p className={styles.speech}>
        <b>{customer.name}:</b> “{customer.order.line}”
      </p>
      {step === 'order' ? (
        <>
          <small className={styles.label}>Pilih menu yang dipesan</small>
          <div className={styles.menuGrid}>
            {menu.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  if (m.id !== customer.order.item.id) {
                    setWrong(true);
                    setReply(`Bukan itu, saya pesan ${customer.order.item.name}.`);
                    return;
                  }
                  setStep('pay');
                  setReply('');
                }}
              >
                <span>{m.name}</span>
                <small>{rupiah(m.price)}</small>
              </button>
            ))}
          </div>
          {reply && <p className={styles.reply}>{reply}</p>}
        </>
      ) : (
        <>
          <div className={styles.bill}>
            <span>Total</span>
            <strong>{rupiah(customer.order.item.price)}</strong>
            <span>Uang diterima</span>
            <strong>{rupiah(customer.order.paid)}</strong>
            <span>Kembalian diberikan</span>
            <strong>{rupiah(given)}</strong>
          </div>
          {due === 0 ? (
            <p className={styles.reply}>Uangnya pas, tidak perlu kembalian.</p>
          ) : (
            <>
              <small className={styles.label}>Ambil uang kembalian dari laci</small>
              <div className={styles.drawer}>
                {DENOMINATIONS.filter((d) => d < customer.order.paid).map((d) => (
                  <button key={d} onClick={() => setTray((t) => [...t, d])}>
                    {d >= 1000 ? d / 1000 + 'rb' : d}
                  </button>
                ))}
              </div>
              <button className={styles.secondary} onClick={() => setTray([])}>
                Ulangi kembalian
              </button>
            </>
          )}
          <button className={styles.primary} onClick={() => onDone(wrong, { given, due })}>
            {due === 0 ? 'Terima uang' : 'Berikan kembalian'}
          </button>
        </>
      )}
    </div>
  );
}

function PrepPanel({
  customer,
  drink,
  onChange,
  onClose,
  onFinish,
}: {
  customer: Customer;
  drink: Drink;
  onChange: (update: (d: Drink) => Drink) => void;
  onClose: () => void;
  onFinish: () => void;
}) {
  const add = (id: string, delta: number) => {
    const ing = INGREDIENTS.find((i) => i.id === id)!;
    onChange((d) => ({
      ...d,
      amounts: {
        ...d.amounts,
        [id]: Math.min(ing.max, Math.max(0, (d.amounts[id] ?? 0) + delta * ing.step)),
      },
    }));
  };
  const fill = Math.min(
    1,
    Object.entries(drink.amounts).reduce((v, [id, n]) => {
      const ing = INGREDIENTS.find((i) => i.id === id);
      if (!ing) return v;
      return (
        v +
        (ing.unit === 'ml'
          ? n
          : ing.unit === 'shot'
            ? n * 30
            : ing.unit === 'sendok'
              ? n * 20
              : n * 0.5)
      );
    }, 0) / 280,
  );
  return (
    <div className={styles.panel} role="dialog" aria-label="Meja racik">
      <header>
        <strong>Meja racik · {customer.order.item.name}</strong>
        <button onClick={onClose} aria-label="Tutup">
          ×
        </button>
      </header>
      <p className={styles.speech}>“{customer.order.line}”</p>
      <small className={styles.label}>1. Ambil gelas</small>
      <div className={styles.cups}>
        {CUPS.map((c) => (
          <button
            key={c.id}
            aria-pressed={drink.cup === c.id}
            onClick={() => onChange((d) => ({ ...d, cup: c.id as CupId }))}
          >
            {c.name}
            <small>{c.note}</small>
          </button>
        ))}
      </div>
      <small className={styles.label}>2. Takar bahan (racikanmu sendiri)</small>
      <div className={styles.prep}>
        <div className={styles.glass} aria-hidden>
          <i style={{ height: `${fill * 100}%` }} />
        </div>
        <ul className={styles.ingredients}>
          {INGREDIENTS.map((ing) => (
            <li key={ing.id}>
              <span>
                {ing.name}
                <small>
                  {drink.amounts[ing.id] ?? 0} {ing.unit}
                </small>
              </span>
              {ing.espresso ? (
                <small className={styles.machineOnly}>dari mesin espresso</small>
              ) : (
                <span className={styles.stepper}>
                  <button
                    disabled={!drink.cup}
                    onClick={() => add(ing.id, -1)}
                    aria-label={'Kurangi ' + ing.name}
                  >
                    −
                  </button>
                  <button
                    disabled={!drink.cup}
                    onClick={() => add(ing.id, 1)}
                    aria-label={'Tambah ' + ing.name}
                  >
                    +
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
      {customer.order.coffee && !(drink.amounts.espresso > 0) && (
        <p className={styles.reply}>
          <Coffee size={14} /> Menu kopi: tutup panel ini lalu pakai mesin espresso.
        </p>
      )}
      <button className={styles.primary} disabled={!drink.cup} onClick={onFinish}>
        Selesai, bawa ke tamu
      </button>
    </div>
  );
}

function EspressoPanel({
  shots,
  onClose,
  onShot,
}: {
  shots: number;
  onClose: () => void;
  onShot: (quality: number) => void;
}) {
  const [step, setStep] = useState<'grind' | 'tamp' | 'pull' | 'done'>('grind'),
    [grind, setGrind] = useState(0),
    [needle, setNeedle] = useState(0),
    [result, setResult] = useState(''),
    holdTimer = useRef<ReturnType<typeof setInterval> | null>(null),
    pullTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(
    () => () => {
      if (holdTimer.current) clearInterval(holdTimer.current);
      if (pullTimer.current) clearInterval(pullTimer.current);
    },
    [],
  );
  const startPull = () => {
    setStep('pull');
    const started = Date.now();
    pullTimer.current = setInterval(() => {
      const t = ((Date.now() - started) / 2600) % 2;
      setNeedle(t < 1 ? t : 2 - t);
    }, 16);
  };
  const stopPull = () => {
    if (pullTimer.current) clearInterval(pullTimer.current);
    // Sweet spot in the middle of the dial (like 25–30 s on a real machine).
    const quality = Math.max(0.2, 1 - Math.abs(needle - 0.55) * 3.2);
    onShot(quality);
    setResult(
      quality > 0.85
        ? 'Sempurna! Crema cantik.'
        : quality > 0.5
          ? 'Lumayan.'
          : needle > 0.55
            ? 'Kelamaan, pahit.'
            : 'Kecepetan, asam.',
    );
    setStep('done');
  };
  return (
    <div className={styles.panel} role="dialog" aria-label="Mesin espresso">
      <header>
        <strong>Mesin espresso · {shots} shot</strong>
        <button onClick={onClose} aria-label="Tutup">
          ×
        </button>
      </header>
      {step === 'grind' && (
        <>
          <p className={styles.speech}>Tahan tombol untuk menggiling biji kopi.</p>
          <div className={styles.meter}>
            <i style={{ width: `${grind * 100}%` }} />
          </div>
          <button
            className={styles.primary}
            onPointerDown={() => {
              if (holdTimer.current) clearInterval(holdTimer.current);
              holdTimer.current = setInterval(
                () =>
                  setGrind((g) => {
                    const next = Math.min(1, g + 0.04);
                    if (next >= 1) {
                      if (holdTimer.current) clearInterval(holdTimer.current);
                      setStep('tamp');
                    }
                    return next;
                  }),
                30,
              );
            }}
            onPointerUp={() => holdTimer.current && clearInterval(holdTimer.current)}
            onPointerLeave={() => holdTimer.current && clearInterval(holdTimer.current)}
          >
            Tahan untuk menggiling
          </button>
        </>
      )}
      {step === 'tamp' && (
        <>
          <p className={styles.speech}>Bubuk kopi siap. Padatkan (tamp) lalu pasang portafilter.</p>
          <button className={styles.primary} onClick={startPull}>
            Tamp & mulai seduh
          </button>
        </>
      )}
      {step === 'pull' && (
        <>
          <p className={styles.speech}>Hentikan saat jarum di zona hijau.</p>
          <div className={styles.dial}>
            <i className={styles.zone} />
            <i className={styles.needle} style={{ left: `${needle * 100}%` }} />
          </div>
          <button className={styles.primary} onClick={stopPull}>
            Stop
          </button>
        </>
      )}
      {step === 'done' && (
        <>
          <p className={styles.speech}>{result} Shot masuk ke gelas.</p>
          <div className={styles.row}>
            {shots < 3 && (
              <button
                className={styles.secondary}
                onClick={() => {
                  setGrind(0);
                  setStep('grind');
                }}
              >
                Tambah shot
              </button>
            )}
            <button className={styles.primary} onClick={onClose}>
              Selesai
            </button>
          </div>
        </>
      )}
    </div>
  );
}
