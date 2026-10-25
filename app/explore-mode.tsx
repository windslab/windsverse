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
import VintageCamera from './vintage-camera';

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
  /** A free seat within reach, then sit / stand. */
  seatNear: () => { id: string; position: THREE.Vector3 } | null;
  sit: (id: string) => boolean;
  stand: () => void;
  sitting: () => boolean;
  chore: (
    kind: 'watering' | 'sweeping' | 'wiping',
    seconds: number,
    target?: THREE.Vector3,
  ) => void;
  /** Out on the land beyond the sidewalk. */
  outdoors: () => boolean;
  spots: {
    plants: Spot[];
    tables: Spot[];
    telescope: Spot | null;
  };
  /** Open Windstronout through the café's telescope. */
  telescope: () => void;
  /** Story of Winds from Luna's camera. */
  photo: {
    start: () => void;
    stop: () => void;
    look: (dx: number, dy: number) => void;
    facing: (facing: 'environment' | 'user') => void;
    stream: () => MediaStream | null;
  };
};
type Spot = { name: string; box: THREE.Box3 };

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
type Panel = 'cashier' | 'cup' | 'prep' | 'espresso' | null;
type MenuSource = { id: string; name: string; price: number; category: string; status?: string };

const NEAR = 1.15;
// Each "walk there" goal and the action it leads to.
const GOAL_ACTION: Record<string, string[]> = {
  'go-cashier': ['cashier'],
  'go-bar': ['cup', 'prep'],
  'go-espresso': ['espresso'],
  'go-guest': ['serve'],
};
const flat = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);
/** Floor distance from Luna to the outside of a box, if she is on its level. */
const spotDistance = (at: THREE.Vector3, box: THREE.Box3) =>
  at.y < box.min.y - 0.7 || at.y > box.max.y + 0.4
    ? Infinity
    : Math.hypot(
        Math.max(box.min.x - at.x, 0, at.x - box.max.x),
        Math.max(box.min.z - at.z, 0, at.z - box.max.z),
      );
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
    [goals, setGoals] = useState<{ id: string; label: string }[]>([]),
    [photoOpen, setPhotoOpen] = useState(false),
    [note, setNote] = useState('');
  const customersRef = useRef<Customer[]>([]),
    keys = useRef(new Set<string>()),
    stick = useRef({ x: 0, y: 0 }),
    counter = useRef(0),
    chase = useRef<string | null>(null),
    cooldown = useRef<Record<string, number>>({});
  useEffect(() => {
    customersRef.current = customers;
  }, [customers]);

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
      photoOpen
        ? 'photo'
        : holding
          ? 'serving'
          : panel === 'cashier'
            ? 'cashier'
            : panel
              ? 'preparing'
              : 'idle',
    );
  }, [holding, panel, photoOpen, api]);

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
    // Walking by hand cancels following a guest.
    if (x || y || stick.current.x || stick.current.y) chase.current = null;
    if (x || y) api.setStick(x / len, y / len);
    else api.setStick(stick.current.x, stick.current.y);
  }, [api]);
  const actionsRef = useRef(actions);
  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);
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
        list.push(
          ticket && drink.cup
            ? { id: 'prep', label: 'Masukkan takaran' }
            : { id: 'cup', label: 'Ambil cangkir / cup' },
        );
      if (!holding && ticket && drink.cup && flat(at, api.stations.espresso) < NEAR)
        list.push({ id: 'espresso', label: 'Pakai mesin espresso' });
      if (holding && ticket) {
        const guest = api.guests().find((g) => g.key === ticket);
        if (guest && flat(at, guest.position) < NEAR + 0.25)
          list.push({ id: 'serve', label: 'Antar pesanan' });
      }
      // Around the café: telescope, plants, tables, seats.
      const scope = api.spots.telescope;
      if (scope && spotDistance(at, scope.box) < 0.7)
        list.push({ id: 'telescope', label: 'Lihat teleskop' });
      const plant = api.spots.plants.find(
        (p) => spotDistance(at, p.box) < 0.45 && !(cooldown.current[p.name] > Date.now()),
      );
      if (plant) list.push({ id: 'water:' + plant.name, label: 'Siram tanaman' });
      const table = api.spots.tables.find(
        (p) => spotDistance(at, p.box) < 0.4 && !(cooldown.current[p.name] > Date.now()),
      );
      if (table && !holding) list.push({ id: 'wipe:' + table.name, label: 'Lap meja' });
      if (api.sitting()) list.push({ id: 'stand', label: 'Berdiri' });
      else if (!holding) {
        const seat = api.seatNear();
        if (seat) list.push({ id: 'sit:' + seat.id, label: 'Duduk' });
      }
      list.splice(3);
      setActions((old) => (JSON.stringify(old) === JSON.stringify(list) ? old : list));
      // Heading to a guest who was still walking to their seat: follow them there.
      if (chase.current && !api.walking() && !list.some((a) => a.id === 'serve')) {
        const guest = api.guests().find((g) => g.key === chase.current);
        if (guest && flat(at, guest.position) > NEAR) api.walkTo(guest.position);
        else chase.current = null;
      }
      // Where to go next, offered as a one-tap "walk there" button when Luna is not there yet.
      let next: { id: string; label: string } | null = null;
      if (holding && ticket) next = { id: 'go-guest', label: 'ke meja tamu' };
      else if (
        ticket &&
        drink.cup &&
        customersRef.current.find((c) => c.key === ticket)?.order.coffee &&
        !(drink.amounts.espresso > 0)
      )
        next = { id: 'go-espresso', label: 'ke mesin espresso' };
      else if (tickets.length) next = { id: 'go-bar', label: 'ke meja bar' };
      else if (queue) next = { id: 'go-cashier', label: 'ke kasir' };
      // Hide it only once the matching action is already within reach.
      const arrived = next && list.some((a) => GOAL_ACTION[next.id].includes(a.id));
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
    chase.current = id === 'go-guest' ? ticket : null;
    if (id.startsWith('go-')) {
      const target =
        id === 'go-cashier'
          ? api.stations.cashier
          : id === 'go-bar'
            ? api.stations.bar
            : id === 'go-espresso'
              ? api.stations.bar
              : api.guests().find((g) => g.key === ticket)?.position;
      if (target && !api.walkTo(target)) setHint('Jalannya tertutup, jalan kembali ke kafe dulu.');
      return;
    }
    const cut = id.indexOf(':'),
      verb = cut < 0 ? id : id.slice(0, cut),
      arg = cut < 0 ? '' : id.slice(cut + 1);
    const reward = (text: string, points: number, seconds: number) =>
      setTimeout(() => {
        setScore((s) => ({ ...s, points: s.points + points }));
        setNote(`${text} · +${points}`);
        setTimeout(() => setNote(''), 2200);
      }, seconds * 1000);
    if (verb === 'telescope') api.telescope();
    if (verb === 'stand') api.stand();
    if (verb === 'sit') api.sit(arg);
    if (verb === 'water' || verb === 'wipe') {
      const spot = (verb === 'water' ? api.spots.plants : api.spots.tables).find(
        (p) => p.name === arg,
      );
      if (spot) {
        cooldown.current[spot.name] = Date.now() + 45_000;
        api.chore(
          verb === 'water' ? 'watering' : 'wiping',
          3,
          spot.box.getCenter(new THREE.Vector3()),
        );
        reward(verb === 'water' ? 'Tanaman segar' : 'Meja bersih', 5, 3);
      }
    }
    if (verb === 'sweep') {
      api.chore('sweeping', 4);
      reward('Lantai disapu', 2, 4);
    }
    if (verb === 'photo') setPhotoOpen(true);
    if (id === 'cashier') setPanel('cashier');
    if (id === 'cup' || id === 'prep') {
      if (!ticket) {
        const next = customersRef.current.find((c) => c.stage === 'waiting');
        if (next) {
          setTicket(next.key);
          setDrink(emptyDrink());
        }
      }
      setPanel(id);
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
  useEffect(() => {
    runRef.current = run;
  });
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
        <span className={styles.score}>
          {score.points} poin · {average ? average.toFixed(1) : '–'}
          <Star size={10} /> · {score.served} tamu
        </span>
        <button className={styles.exit} onClick={onExit} aria-label="Keluar dari mode explore">
          <LogOut size={14} />
        </button>
      </header>
      <p className={styles.hint}>{hint}</p>
      {ticketCustomer && (
        <aside className={styles.ticket}>
          <small>pesanan · {ticketCustomer.name}</small>
          <strong>{ticketCustomer.order.item.name}</strong>
          <span>{ticketCustomer.order.line}</span>
          {holding && <em>siap diantar</em>}
        </aside>
      )}
      <TouchStick
        onMove={(x, y) => {
          stick.current = { x, y };
          applyStick();
        }}
      />
      {!panel && actions.length > 0 && (
        <div className={styles.prompts}>
          {actions.map((a, i) => (
            <button key={a.id} className={styles.prompt} onClick={() => run(a.id)}>
              {a.label}
              {i === 0 && <kbd>E</kbd>}
            </button>
          ))}
        </div>
      )}
      {!panel && (
        <nav className={styles.tools} aria-label="Alat">
          <button onClick={() => run('photo')}>kamera</button>
          <button onClick={() => run('sweep')}>sapu</button>
        </nav>
      )}
      {note && (
        <p className={styles.note} role="status">
          {note}
        </p>
      )}
      {photoOpen && (
        <VintageCamera
          open={photoOpen}
          onOpenChange={(open) => {
            if (!open) setPhotoOpen(false);
          }}
          scene={api.photo}
        />
      )}
      {!panel &&
        goals.map((g) => (
          <button key={g.id} className={styles.goal} onClick={() => run(g.id)}>
            {g.label} →
          </button>
        ))}
      {toast && (
        <div className={styles.toast} role="status">
          <strong>
            {toast.name} {'★'.repeat(toast.review.stars)}
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
      {panel === 'cup' && (
        <div className={styles.panel} role="dialog" aria-label="Ambil cangkir atau cup">
          <p className={styles.speech}>Ambil yang mana?</p>
          <div className={styles.choices}>
            {CUPS.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setDrink((d) => ({ ...d, cup: c.id as CupId }));
                  setPanel(null);
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
          <button className={styles.close} onClick={() => setPanel(null)}>
            batal
          </button>
        </div>
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

/**
 * Invisible stick: drag anywhere in the lower-left part of the screen to walk. The point where
 * the finger lands is the centre; nothing is drawn.
 */
function TouchStick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const origin = useRef<{ id: number; x: number; y: number } | null>(null);
  const RADIUS = 48;
  const move = (e: React.PointerEvent) => {
    const o = origin.current;
    if (!o || o.id !== e.pointerId) return;
    let x = (e.clientX - o.x) / RADIUS,
      y = (e.clientY - o.y) / RADIUS;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    onMove(x, y);
  };
  const end = (e: React.PointerEvent) => {
    if (origin.current?.id !== e.pointerId) return;
    origin.current = null;
    onMove(0, 0);
  };
  return (
    <div
      className={styles.stickZone}
      onPointerDown={(e) => {
        origin.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* Capture is a nicety; dragging still works without it. */
        }
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      aria-label="Geser di sini untuk berjalan"
    />
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
      <p className={styles.speech}>
        <b>{customer.name}</b> “{customer.order.line}”
      </p>
      {step === 'order' ? (
        <>
          <small className={styles.label}>catat pesanan</small>
          <div className={styles.choices}>
            {menu.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  if (m.id !== customer.order.item.id) {
                    setWrong(true);
                    setReply(`Bukan itu kak, ${customer.order.item.name}.`);
                    return;
                  }
                  setStep('pay');
                  setReply('');
                }}
              >
                {m.name}
              </button>
            ))}
          </div>
          {reply && <p className={styles.reply}>{reply}</p>}
        </>
      ) : (
        <>
          <p className={styles.bill}>
            total <b>{rupiah(customer.order.item.price)}</b> · dibayar{' '}
            <b>{rupiah(customer.order.paid)}</b>
            {due > 0 && (
              <>
                {' '}
                · kembalian <b className={given === due ? styles.ok : undefined}>{rupiah(given)}</b>
              </>
            )}
          </p>
          {due === 0 ? (
            <p className={styles.reply}>Uangnya pas.</p>
          ) : (
            <div className={styles.choices}>
              {DENOMINATIONS.filter((d) => d < customer.order.paid).map((d) => (
                <button key={d} onClick={() => setTray((t) => [...t, d])}>
                  +{d >= 1000 ? d / 1000 + 'rb' : d}
                </button>
              ))}
              {tray.length > 0 && (
                <button className={styles.muted} onClick={() => setTray([])}>
                  ulang
                </button>
              )}
            </div>
          )}
          <button className={styles.primary} onClick={() => onDone(wrong, { given, due })}>
            {due === 0 ? 'terima uang' : 'berikan kembalian'} →
          </button>
        </>
      )}
      <button className={styles.close} onClick={onClose}>
        tutup
      </button>
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
  const cup = CUPS.find((c) => c.id === drink.cup);
  return (
    <div className={styles.panel} role="dialog" aria-label="Masukkan takaran">
      <p className={styles.speech}>
        {cup?.name} · {customer.order.item.name}
      </p>
      <ul className={styles.ingredients}>
        {INGREDIENTS.map((ing) => {
          const amount = drink.amounts[ing.id] ?? 0;
          return (
            <li key={ing.id} className={amount ? styles.used : undefined}>
              <span>{ing.name}</span>
              {ing.espresso ? (
                <small>{amount ? `${amount} shot` : 'mesin espresso'}</small>
              ) : (
                <span className={styles.stepper}>
                  <button onClick={() => add(ing.id, -1)} aria-label={'Kurangi ' + ing.name}>
                    −
                  </button>
                  <small>
                    {amount} {ing.unit}
                  </small>
                  <button onClick={() => add(ing.id, 1)} aria-label={'Tambah ' + ing.name}>
                    +
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {customer.order.coffee && !(drink.amounts.espresso > 0) && (
        <p className={styles.reply}>
          <Coffee size={12} /> menu kopi: tarik shot di mesin espresso
        </p>
      )}
      <button className={styles.primary} onClick={onFinish}>
        selesai, siap diantar →
      </button>
      <button className={styles.close} onClick={onClose}>
        tutup
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
