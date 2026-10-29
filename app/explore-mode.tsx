'use client';
// Explore mode: walk Luna around the café and run the bar for virtual guests.
// Take the order at the cashier, give change, mix the drink at the bar (your own recipe),
// pull espresso for coffee, then carry it to the guest's table for a star rating.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Coffee, LogOut } from 'lucide-react';
import type { CafeVisitor } from '@/lib/cafe-activity';
import {
  CUPS,
  DENOMINATIONS,
  INGREDIENTS,
  crowdFor,
  drinkMenu,
  GAME_MINUTES_PER_SECOND,
  newCustomer,
  rupiah,
  type Crowd,
  type CupId,
  type Drink,
  type MenuItem,
  type Order,
} from '@/lib/barista-game';
import { playSfx } from '@/lib/cafe-sound';
import type { Cursor, HouseData } from '@/lib/build-house';
import { regionById, visitRegion } from '@/lib/windstopia-map';
import styles from './explore-mode.module.css';
import VintageCamera from './vintage-camera';
import Digicam from './explore-digicam';
import BuildMode from './explore-build';
import { Bag, Notebook, Reader, type BagItem } from './explore-bag';

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
  /** Explore mode's own clock for the sky (faster than real time). */
  setClock: (date: Date | null) => void;
  /** Run while Shift or a second finger is held. */
  setRun: (on: boolean) => void;
  /** Hop (Space, or a double tap on a phone). */
  jump: () => void;
  /** Arrow over the guest whose order Luna carries (null = none). */
  marker: (key: string | null) => void;
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
  /** Free build mode on the lot beside the road. */
  build: {
    lot: { cols: number; rows: number };
    near: () => boolean;
    enter: () => void;
    exit: () => void;
    view: (dyaw: number, zoom: number, dx: number, dz: number) => void;
    pick: (clientX: number, clientY: number) => { x: number; z: number } | null;
    data: () => HouseData;
    set: (data: HouseData) => void;
    cursor: (c: Cursor | null) => void;
    roof: (on: boolean) => void;
    /** Wall height as drawn: 1 full, lower to see inside. */
    walls: (k: number) => void;
    spots: () => { id: string; kind: 'sit' | 'lie'; position: THREE.Vector3; heading: number }[];
  };
  /** Out on the land beyond the sidewalk. */
  outdoors: () => boolean;
  /** Which named place of the island Luna is in (ids in lib/windstopia-map.ts). */
  region: () => string;
  spots: {
    plants: Spot[];
    tables: Spot[];
    telescope: Spot | null;
  };
  /** Where to stand to hang a photo in the tower's living-room frame, and hang one (image URL). */
  frame: THREE.Vector3 | null;
  hangPhoto: (url: string) => void;
  /** Open Windstronout through the café's telescope. */
  telescope: () => void;
  /** Story of Winds from Luna's camera. */
  photo: {
    start: () => void;
    stop: () => void;
    look: (dx: number, dy: number) => void;
    facing: (facing: 'environment' | 'user') => void;
    stream: () => MediaStream | null;
    /** Digicam: zoom 1–4×, tilt the picture (radians), hand-held or on the tripod. */
    zoom: (zoom: number) => void;
    roll: (radians: number) => void;
    mount: (mount: 'hand' | 'tripod') => void;
    /** The world's sounds, for recording a video (null while sound is off). */
    audio: () => MediaStream | null;
  };
  /** Luna's tripod: set it up in front of her, pack it away. */
  tripod: { place: () => boolean; remove: () => void; placed: () => boolean; near: () => boolean };
  /** Places to settle: piano, guitar, cello, sofa, sofaLie, pier. */
  restSpots: { name: string; position: THREE.Vector3; heading: number; lie: boolean }[];
  /** Settle at a rest spot (name, or name + ':read'), or 'read-here' / 'lie-here'. */
  settle: (name: string) => boolean;
  /** What Luna is doing while settled ('' when not). */
  activity: () => string;
  /** Sit or lie on a piece of furniture in the player's house. */
  settleAt: (spot: { position: THREE.Vector3; heading: number; kind: 'sit' | 'lie' }) => void;
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
const FRAME_KEY = 'explore-frame-photo';
/** A Story of Winds photo scaled down to a small JPEG data URL (fits in local storage). */
async function shrinkPhoto(blob: Blob) {
  const bitmap = await createImageBitmap(blob),
    scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height)),
    canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.82);
}
const THANKS = [
  'Enak banget, makasih kak!',
  'Wah, pas banget rasanya.',
  'Ini favoritku sekarang!',
  'Makasih Luna, bikin semangat.',
  'Hmm… hangatnya nyampe hati.',
  'Besok aku balik lagi ya!',
  'Cantik banget penyajiannya.',
];
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
/** What Luna can do at each rest spot. */
const REST_LABELS: Record<string, string> = {
  piano: 'Main piano',
  guitar: 'Main gitar',
  cello: 'Main cello',
  sofa: 'Duduk santai',
  sofaLie: 'Rebahan di sofa',
  pier: 'Duduk di ujung dermaga',
};
const emptyDrink = (): Drink => ({ cup: null, amounts: {}, espressoQuality: 1 });

export default function ExploreMode({
  api,
  onExit,
  sound,
  onToggleSound,
}: {
  api: ExploreApi;
  onExit: () => void;
  /** Sound on/off (the same switch as the café view's). */
  sound: boolean;
  onToggleSound: () => void;
}) {
  const [menu, setMenu] = useState<MenuItem[]>([]),
    [customers, setCustomers] = useState<Customer[]>([]),
    [panel, setPanel] = useState<Panel>(null),
    /** Luna's bag and what's open from it. */
    [bagOpen, setBagOpen] = useState(false),
    [notebookOpen, setNotebookOpen] = useState(false),
    [readerOpen, setReaderOpen] = useState(false),
    [digicam, setDigicam] = useState<'hand' | 'tripod' | null>(null),
    /** Free build mode is open. */
    [building, setBuilding] = useState(false),
    /** The place name shown briefly when Luna arrives somewhere (new places say so). */
    [place, setPlace] = useState<{ name: string; note: string; first: boolean } | null>(null),
    [actions, setActions] = useState<{ id: string; label: string }[]>([]),
    [ticket, setTicket] = useState<string | null>(null),
    [drink, setDrink] = useState<Drink>(emptyDrink()),
    [holding, setHolding] = useState(false),
    [score, setScore] = useState({ points: 0, served: 0 }),
    [toast, setToast] = useState<{ name: string; line: string; points: number } | null>(null),
    [hint, setHint] = useState('Jalan ke kasir untuk menyambut tamu.'),
    [goals, setGoals] = useState<{ id: string; label: string }[]>([]),
    [photoOpen, setPhotoOpen] = useState(false),
    [open, setOpen] = useState(false),
    [minutes, setMinutes] = useState(8 * 60),
    [crowdLabel, setCrowdLabel] = useState('sepi'),
    [note, setNote] = useState('');
  const customersRef = useRef<Customer[]>([]),
    keys = useRef(new Set<string>()),
    stick = useRef({ x: 0, y: 0 }),
    counter = useRef(0),
    chase = useRef<string | null>(null),
    cooldown = useRef<Record<string, number>>({}),
    regionRef = useRef(''),
    placeTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    lastPhoto = useRef<string | null>(null),
    keyRun = useRef(false),
    touchRun = useRef(false),
    stickHeld = useRef(false),
    touchIds = useRef(new Set<number>()),
    minutesRef = useRef(8 * 60),
    openRef = useRef(false),
    crowdHour = useRef(-1),
    crowdRef = useRef<Crowd>({ label: 'sepi', chance: 0.12, max: 2 });
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

  // Story of Winds from Luna's camera: keep the latest shot (small) for the tower's frame.
  const photoLens = useMemo(
    () => ({
      ...api.photo,
      onPhoto: (blob: Blob) => {
        void shrinkPhoto(blob).then((url) => (lastPhoto.current = url));
      },
    }),
    [api],
  );
  // The frame keeps the last photo hung in it (on this device).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(FRAME_KEY);
      if (saved) {
        lastPhoto.current = saved;
        api.hangPhoto(saved);
      }
    } catch {
      /* Storage blocked: the frame starts empty. */
    }
  }, [api]);
  // Point at the guest whose drink Luna is carrying.
  useEffect(() => {
    api.marker(holding ? ticket : null);
  }, [holding, ticket, api]);
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

  // Explore mode's own day: a game hour per real minute, starting at 08.00. The sky follows it.
  useEffect(() => {
    let last = performance.now();
    const t = setInterval(() => {
      const now = performance.now();
      setMinutes((m) => (m + ((now - last) / 1000) * GAME_MINUTES_PER_SECOND) % (24 * 60));
      last = now;
    }, 500);
    return () => {
      clearInterval(t);
      api.setClock(null);
    };
  }, [api]);
  useEffect(() => {
    // Game time is WITA (UTC+8), today.
    const d = new Date();
    api.setClock(
      new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0) +
          (minutes - 8 * 60) * 60_000,
      ),
    );
  }, [minutes, api]);
  const hour = Math.floor(minutes / 60);

  // While the café is open, guests walk in now and then: some hours quiet, some busy.
  useEffect(() => {
    minutesRef.current = minutes;
  }, [minutes]);
  useEffect(() => {
    if (!menu.length) return;
    const spawn = () => {
      const h = Math.floor(minutesRef.current / 60);
      if (crowdHour.current !== h) {
        crowdHour.current = h;
        crowdRef.current = crowdFor(h);
        setCrowdLabel(crowdRef.current.label);
      }
      if (!openRef.current) return;
      const crowd = crowdRef.current,
        waiting = customersRef.current.filter((c) => c.stage !== 'served').length;
      if (waiting >= crowd.max || Math.random() > crowd.chance) return;
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
    spawn();
    const timer = setInterval(spawn, 5000);
    return () => clearInterval(timer);
  }, [menu]);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  /** Closing up: every guest heads home and the bar is cleared. */
  const toggleOpen = () => {
    if (open) {
      setCustomers([]);
      setTicket(null);
      setHolding(false);
      setDrink(emptyDrink());
      setPanel(null);
      setNote('Kafe tutup · sampai jumpa besok');
      setTimeout(() => setNote(''), 2500);
    }
    setOpen(!open);
  };

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
      if (panel || building) return;
      const key = e.key.toLowerCase();
      if (key === 'shift') {
        keyRun.current = true;
        api.setRun(true);
      } else if (
        ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)
      ) {
        keys.current.add(key);
        applyStick();
        e.preventDefault();
      } else if (key === ' ') {
        if (!e.repeat) {
          api.jump();
          playSfx('jump');
        }
        e.preventDefault();
      } else if (key === 'e' && actionsRef.current[0]) {
        runRef.current(actionsRef.current[0].id);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      keys.current.delete(e.key.toLowerCase());
      if (e.key === 'Shift') {
        keyRun.current = false;
        api.setRun(touchRun.current);
      }
      applyStick();
    };
    // Phone: one thumb on the (invisible) stick, the other held anywhere on the screen to run.
    const touches = touchIds.current;
    const touchUpdate = () => {
      touchRun.current = stickHeld.current && touches.size >= 2;
      api.setRun(keyRun.current || touchRun.current);
    };
    let lastTap = { at: 0, x: 0, y: 0 };
    const pointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      touches.add(e.pointerId);
      touchUpdate();
      // Double tap (on the scene, not on a button) → hop.
      const now = performance.now();
      if (
        !(e.target as HTMLElement).closest('button, [role=dialog]') &&
        now - lastTap.at < 320 &&
        Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40
      ) {
        api.jump();
        playSfx('jump');
        lastTap = { at: 0, x: 0, y: 0 };
      } else lastTap = { at: now, x: e.clientX, y: e.clientY };
    };
    const pointerUp = (e: PointerEvent) => {
      touches.delete(e.pointerId);
      touchUpdate();
    };
    window.addEventListener('pointerdown', pointerDown, true);
    window.addEventListener('pointerup', pointerUp, true);
    window.addEventListener('pointercancel', pointerUp, true);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('pointerdown', pointerDown, true);
      window.removeEventListener('pointerup', pointerUp, true);
      window.removeEventListener('pointercancel', pointerUp, true);
      api.setStick(0, 0);
      api.setRun(false);
    };
  }, [panel, building, applyStick, api]);

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
      if (
        api.frame &&
        lastPhoto.current &&
        flat(at, api.frame) < 0.9 &&
        Math.abs(at.y - api.frame.y) < 0.6
      )
        list.push({ id: 'hang', label: 'Pasang foto di bingkai' });
      if (api.sitting()) {
        const doing = api.activity();
        list.push({
          id: 'stand',
          label: ['piano', 'guitar', 'cello'].includes(doing)
            ? 'Berhenti main'
            : doing === 'lying'
              ? 'Bangun'
              : 'Berdiri',
        });
      } else if (!holding) {
        // Chairs, sofas and beds in the player's own house.
        for (const spot of api.build.spots()) {
          if (flat(at, spot.position) > 0.9 || Math.abs(at.y - spot.position.y) > 0.8) continue;
          list.push({
            id: 'hseat:' + spot.id,
            label: spot.kind === 'lie' ? 'Berbaring' : 'Duduk',
          });
          break;
        }
        // Instruments, the sofa and the end of the pier.
        for (const spot of api.restSpots) {
          if (flat(at, spot.position) > 0.85 || Math.abs(at.y - spot.position.y) > 0.8) continue;
          const label = REST_LABELS[spot.name];
          if (label) list.push({ id: 'settle:' + spot.name, label });
        }
        const seat = api.seatNear();
        if (seat) list.push({ id: 'sit:' + seat.id, label: 'Duduk' });
        if (api.tripod.near()) list.push({ id: 'tripod-pack', label: 'Ambil tripod' });
        // Out on the land: lie back on the grass for a while.
        if (api.outdoors() && !list.some((a) => a.id.startsWith('settle:')))
          list.push({ id: 'settle:lie-here', label: 'Rebahan' });
      }
      list.splice(3);
      // Open world: name each place when Luna arrives, and note the first visit.
      const here = api.region();
      if (here !== regionRef.current) {
        regionRef.current = here;
        const region = regionById(here);
        if (region) {
          const first = visitRegion(here);
          setPlace({ name: region.name, note: first ? region.note : '', first });
          if (placeTimer.current) clearTimeout(placeTimer.current);
          placeTimer.current = setTimeout(() => setPlace(null), first ? 4200 : 2200);
        }
      }
      // The book closes when Luna stops reading.
      if (api.activity() !== 'reading') setReaderOpen(false);
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
                : open
                  ? `Kafe buka (${crowdLabel}). Tunggu tamu, atau jalan-jalan dulu.`
                  : 'Kafe tutup. Ketuk "buka kafe" kapan saja.',
      );
    }, 200);
    return () => clearInterval(t);
  }, [api, holding, ticket, drink.cup, drink.amounts.espresso, open, crowdLabel]);

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
    if (verb === 'sit' && api.sit(arg)) playSfx('sit');
    if (verb === 'settle' && api.settle(arg)) playSfx('sit');
    if (verb === 'hseat') {
      const spot = api.build.spots().find((s) => s.id === arg);
      if (spot) {
        api.settleAt(spot);
        playSfx('sit');
      }
    }
    if (verb === 'tripod-pack') {
      api.tripod.remove();
      setNote('Tripod masuk tas');
      setTimeout(() => setNote(''), 1800);
    }
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
    if (verb === 'hang' && lastPhoto.current) {
      api.hangPhoto(lastPhoto.current);
      try {
        localStorage.setItem(FRAME_KEY, lastPhoto.current);
      } catch {
        /* Too big or storage blocked: it still hangs for this visit. */
      }
      setNote('Foto terpasang di bingkai');
      setTimeout(() => setNote(''), 2200);
    }
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
      // Every guest loves what Luna makes: a thank-you and a few points, no ratings.
      const thanks = THANKS[Math.floor(Math.random() * THANKS.length)];
      const points = 20 + Math.round(c.order.item.price / 1000);
      api.deliver(c.key);
      playSfx('serve');
      setCustomers((list) =>
        list.map((x) => (x.key === c.key ? { ...x, stage: 'served', servedAt: Date.now() } : x)),
      );
      setScore((s) => ({ points: s.points + points, served: s.served + 1 }));
      setToast({ name: c.name, line: thanks, points });
      setTimeout(() => setToast(null), 5500);
      setHolding(false);
      setTicket(null);
      setDrink(emptyDrink());
    }
  };
  /** Using something from Luna's bag. */
  const applyItem = (item: BagItem, action?: string) => {
    setBagOpen(false);
    if (item === 'notebook') setNotebookOpen(true);
    if (item === 'book') {
      // On the sofa if she's beside it, otherwise right where she is.
      const sofa = api.restSpots.find((s) => s.name === 'sofa');
      const at = api.luna();
      api.settle(sofa && flat(at, sofa.position) < 1.2 ? 'sofa:read' : 'read-here');
      setReaderOpen(true);
    }
    if (item === 'digicam') setDigicam('hand');
    if (item === 'storycam') run('photo');
    if (item === 'tripod') {
      if (action === 'pack') {
        api.tripod.remove();
        setDigicam(null);
      } else {
        if (action === 'place') {
          if (api.sitting()) api.stand();
          if (!api.tripod.place()) {
            setNote('Tidak ada tempat lapang untuk tripod di sini');
            setTimeout(() => setNote(''), 2200);
            return;
          }
        }
        setDigicam('tripod');
      }
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
      time: (hhmm: number) => setMinutes(Math.floor(hhmm / 100) * 60 + (hhmm % 100)),
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

  return (
    <div className={styles.hud} data-camera={digicam || building ? '' : undefined}>
      <header className={styles.top}>
        <span className={styles.score}>
          {score.points} poin · {score.served} tamu
        </span>
        <span className={styles.clock}>
          {String(hour).padStart(2, '0')}.{String(Math.floor(minutes % 60)).padStart(2, '0')}
          <button onClick={toggleOpen} aria-pressed={open}>
            {open ? 'tutup kafe' : 'buka kafe'}
          </button>
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
      {!building && (
        <TouchStick
          onMove={(x, y) => {
            stick.current = { x, y };
            applyStick();
          }}
          onHold={(held) => {
            stickHeld.current = held;
            touchRun.current = held && touchIds.current.size >= 2;
            api.setRun(keyRun.current || touchRun.current);
          }}
        />
      )}
      {!panel && !digicam && !building && actions.length > 0 && (
        <div className={styles.prompts}>
          {actions.map((a, i) => (
            <button key={a.id} className={styles.prompt} onClick={() => run(a.id)}>
              {a.label}
              {i === 0 && <kbd>E</kbd>}
            </button>
          ))}
        </div>
      )}
      {!panel && !digicam && !building && (
        <nav className={styles.tools} aria-label="Alat">
          <button onClick={() => setBagOpen(true)}>tas</button>
          <button onClick={() => setBuilding(true)}>bangun</button>
          <button onClick={() => run('photo')}>kamera</button>
          <button onClick={() => run('sweep')}>sapu</button>
          <button onClick={onToggleSound} aria-pressed={sound}>
            {sound ? 'suara: on' : 'suara: off'}
          </button>
        </nav>
      )}
      {place && !digicam && (
        <p className={styles.place} key={place.name} role="status">
          <b>{place.name}</b>
          {place.note && <small>{place.note}</small>}
        </p>
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
          scene={photoLens}
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
          <strong>{toast.name} ♡</strong>
          <span>“{toast.line}”</span>
          <small>+{toast.points} poin</small>
        </div>
      )}
      {building && <BuildMode api={api} onExit={() => setBuilding(false)} />}
      {bagOpen && !panel && (
        <Bag
          tripodPlaced={api.tripod.placed()}
          onUse={applyItem}
          onClose={() => setBagOpen(false)}
        />
      )}
      {notebookOpen && !panel && <Notebook onClose={() => setNotebookOpen(false)} />}
      {readerOpen && !panel && (
        <Reader
          onClose={() => {
            setReaderOpen(false);
          }}
        />
      )}
      {digicam && (
        <Digicam
          api={api}
          mount={digicam}
          onClose={() => setDigicam(null)}
          onHang={(url) => {
            lastPhoto.current = url;
            api.hangPhoto(url);
            try {
              localStorage.setItem(FRAME_KEY, url);
            } catch {
              /* Too big or storage blocked: it still hangs for this visit. */
            }
            setNote('Foto terpasang di bingkai menara');
            setTimeout(() => setNote(''), 2200);
          }}
        />
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
                  playSfx('cup');
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
            playSfx('stir');
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
function TouchStick({
  onMove,
  onHold,
}: {
  onMove: (x: number, y: number) => void;
  onHold: (held: boolean) => void;
}) {
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
    onHold(false);
  };
  return (
    <div
      className={styles.stickZone}
      onPointerDown={(e) => {
        origin.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
        onHold(true);
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
                <button
                  key={d}
                  onClick={() => {
                    playSfx('coin');
                    setTray((t) => [...t, d]);
                  }}
                >
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
          <button
            className={styles.primary}
            onClick={() => {
              playSfx('register');
              onDone(wrong, { given, due });
            }}
          >
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
    if (delta > 0) playSfx('pour');
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
      // Closing the panel mid-way: the grinder and the brew stop too.
      if (holdTimer.current) {
        clearInterval(holdTimer.current);
        playSfx('grind-stop');
      }
      if (pullTimer.current) {
        clearInterval(pullTimer.current);
        playSfx('brew-stop');
      }
    },
    [],
  );
  const startPull = () => {
    playSfx('tamp');
    setTimeout(() => playSfx('brew-start'), 450);
    setStep('pull');
    const started = Date.now();
    pullTimer.current = setInterval(() => {
      const t = ((Date.now() - started) / 2600) % 2;
      setNeedle(t < 1 ? t : 2 - t);
    }, 16);
  };
  const stopPull = () => {
    if (pullTimer.current) clearInterval(pullTimer.current);
    pullTimer.current = null;
    playSfx('brew-stop');
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
              playSfx('grind-start');
              if (holdTimer.current) clearInterval(holdTimer.current);
              holdTimer.current = setInterval(
                () =>
                  setGrind((g) => {
                    const next = Math.min(1, g + 0.04);
                    if (next >= 1) {
                      if (holdTimer.current) clearInterval(holdTimer.current);
                      holdTimer.current = null;
                      playSfx('grind-stop');
                      setStep('tamp');
                    }
                    return next;
                  }),
                30,
              );
            }}
            onPointerUp={() => {
              playSfx('grind-stop');
              if (holdTimer.current) clearInterval(holdTimer.current);
              holdTimer.current = null;
            }}
            onPointerLeave={() => {
              playSfx('grind-stop');
              if (holdTimer.current) clearInterval(holdTimer.current);
              holdTimer.current = null;
            }}
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
