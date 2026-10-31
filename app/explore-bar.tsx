'use client';
// Windstopia bar station, seen through Luna's eyes: everything on the counter can be touched.
// Take a plastic cup (cold) or a paper cup (hot) from the rack, pump syrups (10 ml a pump, three
// bottles whose syrup can be swapped), spoon powders, pour milk or tea, scoop ice from the freezer
// (one scoop fills a glass), and pull espresso the real way: grind into the portafilter, tamp it,
// twist it into the group head from left to right until it locks, brew, and stop the shot.
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ingredientById, tasteOf, type CupId, type Drink, type Order } from '@/lib/barista-game';
import { playSfx } from '@/lib/cafe-sound';
import styles from './explore-bar.module.css';

const SYRUPS = ['gula', 'aren', 'vanila', 'karamel'];
const POWDERS = ['cokelat', 'matcha', 'taro'];
const POURS = [
  { id: 'fullcream', label: 'Susu', kind: 'milk' },
  { id: 'skm', label: 'SKM', kind: 'can' },
  { id: 'teh', label: 'Teh', kind: 'tea' },
  { id: 'air', label: 'Air panas', kind: 'kettle' },
];
const COLORS: Record<string, string> = {
  espresso: '#4a2a18',
  'kopi-tubruk': '#3b2416',
  fullcream: '#f6f1e7',
  skm: '#f0e0bd',
  gula: '#f4e6b6',
  aren: '#8b4a1c',
  vanila: '#f2dfb3',
  karamel: '#c27a36',
  cokelat: '#5b3221',
  matcha: '#8fb65a',
  taro: '#ab8ccb',
  teh: '#a8542a',
  air: '#dce8ee',
};
/** How strongly each ingredient tints the drink, per unit of volume. */
const TINT: Record<string, number> = {
  espresso: 3,
  'kopi-tubruk': 4,
  cokelat: 5,
  matcha: 5,
  taro: 5,
  aren: 1.6,
  karamel: 1.4,
  teh: 1.4,
};
const SLOT_KEY = 'windstopia-syrups';
/** One scoop from the freezer is enough ice for a whole glass. */
const ICE_SCOOP = 3;
const CAPACITY: Record<CupId, number> = { 'gelas-es': 360, cangkir: 240, 'cup-takeaway': 300 };
/** Where things sit on the counter (stage is 100 × 75 em). */
const SPOT = {
  work: [43, 47],
  tray: [86, 53],
  bottle: (i: number) => [8 + i * 10, 9],
  jar: (i: number) => [40 + i * 10, 15],
  beans: [73, 14],
  pour: (i: number) => [83 + (i % 2) * 9, 1.5 + Math.floor(i / 2) * 10],
  rackCold: [7, 38],
  rackHot: [17, 40],
  freezer: [13, 66],
  hopper: [66, 39],
  grinder: [66, 52],
  mat: [57, 66],
  group: [86, 43],
  knock: [54, 71],
};
type Spot = 'rest' | 'grinder' | 'mat' | 'group';
type Fx = { id: number; kind: string; color: string; from: number[]; to: number[] };
type Portafilter = { at: Spot; dose: number; tamped: boolean; angle: number; spent: boolean };
const freshPortafilter = (): Portafilter => ({
  at: 'rest',
  dose: 0,
  tamped: false,
  angle: -55,
  spent: false,
});

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

/** The drink's colour: each ingredient's colour weighted by how much of it went in. */
function liquidColor(amounts: Record<string, number>) {
  let r = 0,
    g = 0,
    b = 0,
    total = 0;
  for (const [id, amount] of Object.entries(amounts)) {
    const hex = COLORS[id];
    if (!hex || !amount || id === 'es') continue;
    const ing = ingredientById(id);
    const volume = ing?.unit === 'shot' ? amount * 30 : ing?.unit === 'g' ? amount * 2 : amount;
    const w = volume * (TINT[id] ?? 1);
    r += parseInt(hex.slice(1, 3), 16) * w;
    g += parseInt(hex.slice(3, 5), 16) * w;
    b += parseInt(hex.slice(5, 7), 16) * w;
    total += w;
  }
  return total ? `rgb(${(r / total) | 0},${(g / total) | 0},${(b / total) | 0})` : 'transparent';
}

export default function BarStation({
  name,
  order,
  drink,
  onChange,
  onClose,
  onFinish,
}: {
  name: string;
  order: Order;
  drink: Drink;
  onChange: (update: (d: Drink) => Drink) => void;
  onClose: () => void;
  onFinish: () => void;
}) {
  const [slots, setSlots] = useState(loadSlots),
    [swapping, setSwapping] = useState<number | null>(null),
    [pumping, setPumping] = useState<number | null>(null),
    [scooping, setScooping] = useState<string | null>(null),
    [freezer, setFreezer] = useState(false),
    [cupAt, setCupAt] = useState<'work' | 'tray'>('work'),
    [pf, setPf] = useState<Portafilter>(freshPortafilter),
    [beans, setBeans] = useState(1),
    [grinding, setGrinding] = useState(false),
    [tamping, setTamping] = useState(false),
    [brew, setBrew] = useState({ on: false, t: 0 }),
    [fx, setFx] = useState<Fx[]>([]),
    [note, setNote] = useState('');
  const stage = useRef<HTMLDivElement>(null),
    scroller = useRef<HTMLDivElement>(null),
    grindTimer = useRef<ReturnType<typeof setInterval> | null>(null),
    brewTimer = useRef<ReturnType<typeof setInterval> | null>(null),
    tampTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    twist = useRef<{
      id: number;
      x: number;
      angle: number;
      moved: boolean;
      tap: boolean;
    } | null>(null),
    fxId = useRef(0);

  // On a narrow phone the counter is wider than the screen: start with the cup in view.
  useEffect(() => {
    const box = scroller.current,
      counter = stage.current;
    if (!box || !counter) return;
    box.scrollLeft = Math.max(0, counter.offsetWidth * 0.5 - box.clientWidth / 2);
  }, []);
  // Leaving the bar stops the grinder and the machine.
  useEffect(
    () => () => {
      if (grindTimer.current) {
        clearInterval(grindTimer.current);
        playSfx('grind-stop');
      }
      if (brewTimer.current) {
        clearInterval(brewTimer.current);
        playSfx('brew-stop');
      }
      if (tampTimer.current) clearTimeout(tampTimer.current);
    },
    [],
  );

  const say = (text: string) => {
    setNote(text);
    window.setTimeout(() => setNote((n) => (n === text ? '' : n)), 2600);
  };
  const fly = (kind: string, color: string, from: number[], to: number[], count = 1) => {
    const made: Fx[] = [];
    for (let i = 0; i < count; i++) made.push({ id: ++fxId.current, kind, color, from, to });
    setFx((list) => [...list, ...made]);
    window.setTimeout(
      () => setFx((list) => list.filter((f) => !made.includes(f))),
      kind === 'ice' ? 900 : 750,
    );
  };
  const cupSpot = cupAt === 'work' ? SPOT.work : SPOT.tray;
  const cupMouth = [cupSpot[0], cupSpot[1] - 6];
  const add = (id: string, times = 1) =>
    onChange((d) => {
      const ing = ingredientById(id)!;
      const next = Math.min(ing.max, (d.amounts[id] ?? 0) + ing.step * times);
      return { ...d, amounts: { ...d.amounts, [id]: next } };
    });
  const needCup = () => {
    if (drink.cup) return false;
    say('Ambil gelas dulu dari rak di kiri.');
    return true;
  };
  const full = (id: string) => {
    const ing = ingredientById(id)!;
    if ((drink.amounts[id] ?? 0) < ing.max) return false;
    say(`${ing.name} sudah cukup banyak.`);
    return true;
  };

  const takeCup = (cup: CupId, from: number[]) => {
    if (drink.cup) return say('Sudah ada gelas di meja.');
    playSfx('cup');
    fly('cup-' + cup, '', from, SPOT.work);
    window.setTimeout(() => onChange((d) => ({ ...d, cup })), 420);
  };
  const pump = (i: number) => {
    const id = slots[i];
    if (needCup() || full(id) || pumping !== null) return;
    setPumping(i);
    playSfx('pump');
    const [x, y] = SPOT.bottle(i);
    window.setTimeout(() => fly('drop', COLORS[id], [x + 2.6, y - 3.5], cupMouth, 3), 120);
    window.setTimeout(() => add(id), 520);
    window.setTimeout(() => setPumping(null), 380);
  };
  const spoon = (id: string, i: number) => {
    if (needCup() || full(id) || scooping) return;
    setScooping(id);
    playSfx('scoop');
    fly('spoon', COLORS[id], SPOT.jar(i), cupMouth);
    window.setTimeout(() => add(id), 600);
    window.setTimeout(() => setScooping(null), 650);
  };
  const pour = (id: string, i: number) => {
    if (needCup() || full(id)) return;
    playSfx('pour');
    fly('stream', COLORS[id], SPOT.pour(i), cupMouth, 4);
    window.setTimeout(() => add(id), 500);
  };
  const scoopIce = () => {
    if (needCup()) return;
    if (drink.amounts.es) return say('Esnya sudah cukup untuk satu gelas.');
    playSfx('ice');
    fly('ice', '#e9f6ff', SPOT.freezer, cupMouth, 6);
    window.setTimeout(() => {
      onChange((d) => ({ ...d, amounts: { ...d.amounts, es: ICE_SCOOP } }));
      setFreezer(false);
    }, 650);
  };
  const refillBeans = () => {
    if (beans > 0.95) return say('Hopper grinder masih penuh.');
    playSfx('scoop');
    fly('beans', '#5a3420', SPOT.beans, SPOT.hopper, 6);
    window.setTimeout(() => setBeans(1), 600);
  };

  // Grinder: hold the button; grounds pile into the portafilter underneath.
  const startGrind = () => {
    if (pf.at !== 'grinder') return say('Taruh portafilter di bawah grinder dulu.');
    if (beans <= 0) return say('Biji kopi habis. Ketuk toples biji kopi.');
    if (grindTimer.current) return;
    setGrinding(true);
    playSfx('grind-start');
    grindTimer.current = setInterval(() => {
      setBeans((b) => Math.max(0, b - 0.012));
      setPf((p) => ({ ...p, dose: Math.min(1.15, p.dose + 0.025) }));
    }, 50);
  };
  const stopGrind = () => {
    if (!grindTimer.current) return;
    clearInterval(grindTimer.current);
    grindTimer.current = null;
    setGrinding(false);
    playSfx('grind-stop');
  };
  useEffect(() => {
    if (grinding && beans <= 0) stopGrind();
  });

  // Tamper: press and hold for a moment.
  const startTamp = () => {
    if (pf.at !== 'mat') return say('Pindahkan portafilter ke alas tamping.');
    if (pf.tamped) return;
    setTamping(true);
    tampTimer.current = setTimeout(() => {
      playSfx('tamp');
      setPf((p) => ({ ...p, tamped: true }));
      setTamping(false);
      tampTimer.current = null;
    }, 520);
  };
  const stopTamp = () => {
    if (tampTimer.current) clearTimeout(tampTimer.current);
    tampTimer.current = null;
    setTamping(false);
  };

  // Portafilter taps move it along: rest → grinder → tamp mat → group head → knock box.
  const tapPortafilter = () => {
    if (brew.on) return;
    if (pf.at === 'rest') {
      playSfx('click');
      setPf((p) => ({ ...p, at: 'grinder' }));
    } else if (pf.at === 'grinder') {
      if (pf.dose < 0.75) return say('Giling sampai portafilter penuh (tahan tombol grinder).');
      playSfx('click');
      setPf((p) => ({ ...p, at: 'mat' }));
    } else if (pf.at === 'mat') {
      if (!pf.tamped) return say('Tamp dulu: tahan tamper di atas portafilter.');
      playSfx('click');
      setPf((p) => ({ ...p, at: 'group', angle: -55 }));
      say('Putar gagangnya dari kiri ke kanan sampai terkunci.');
    } else if (pf.spent) {
      // Unlock, then knock the puck out.
      setPf((p) => ({ ...p, angle: -55 }));
      window.setTimeout(() => {
        playSfx('knock');
        setPf(freshPortafilter());
      }, 450);
    }
  };
  // Twisting into the group head: drag the handle from left to right.
  const twistDown = (e: PointerEvent<HTMLElement>) => {
    // Anywhere but the unlocked group head, a press on the portafilter is just a tap.
    const tap = pf.at !== 'group' || pf.angle >= 0 || pf.spent;
    twist.current = { id: e.pointerId, x: e.clientX, angle: pf.angle, moved: false, tap };
    if (tap) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* Pointer already gone. */
    }
  };
  const twistMove = (e: PointerEvent<HTMLElement>) => {
    const t = twist.current;
    if (!t || t.id !== e.pointerId || t.tap) return;
    const em = (stage.current?.getBoundingClientRect().width ?? 400) / 100;
    const angle = Math.min(0, Math.max(-55, t.angle + ((e.clientX - t.x) / em) * 5));
    if (Math.abs(angle - t.angle) > 1) t.moved = true;
    if (angle >= -4) {
      twist.current = null;
      lock();
      return;
    }
    setPf((p) => ({ ...p, angle }));
  };
  const lock = () => {
    playSfx('lock');
    setPf((p) => ({ ...p, angle: 0 }));
    say('Terkunci! Taruh gelas lalu tekan BREW.');
  };
  const twistUp = () => {
    const t = twist.current;
    twist.current = null;
    if (!t) return;
    if (t.tap || !t.moved) tapPortafilter();
    // Let go close to the middle and it clicks home by itself.
    else if (pf.angle >= -15) lock();
  };

  // Espresso: brew until the player stops it; a shot timer runs at game speed.
  const startBrew = () => {
    if (brew.on) return;
    if (pf.at !== 'group' || pf.angle < 0) return say('Kunci portafilter di mesin dulu.');
    if (pf.spent) return say('Buang ampasnya dulu (ketuk portafilter).');
    if (needCup()) return;
    setCupAt('tray');
    playSfx('brew-start');
    setBrew({ on: true, t: 0 });
    brewTimer.current = setInterval(() => setBrew((b) => ({ ...b, t: b.t + 0.3 })), 50);
  };
  const stopBrew = () => {
    if (!brew.on || !brewTimer.current) return;
    clearInterval(brewTimer.current);
    brewTimer.current = null;
    playSfx('brew-stop');
    const t = brew.t;
    // Sweet spot 24–31 s, like a real shot.
    const quality = Math.max(0.2, Math.min(1, 1 - Math.max(0, Math.abs(t - 27.5) - 3.5) / 12));
    onChange((d) => {
      const shots = Math.min(3, (d.amounts.espresso ?? 0) + 1);
      return {
        ...d,
        amounts: { ...d.amounts, espresso: shots },
        espressoQuality: (d.espressoQuality * (shots - 1) + quality) / shots,
      };
    });
    say(
      quality > 0.85
        ? `Shot sempurna, crema cantik (${Math.round(t)} dtk).`
        : t > 31
          ? `Kelamaan, agak pahit (${Math.round(t)} dtk).`
          : `Kecepetan, agak asam (${Math.round(t)} dtk).`,
    );
    setBrew({ on: false, t });
    setPf((p) => ({ ...p, spent: true }));
    window.setTimeout(() => setCupAt('work'), 700);
  };

  const { volume } = tasteOf(drink);
  const capacity = drink.cup ? CAPACITY[drink.cup] : 300;
  const fill = Math.min(1, volume / capacity);
  const color = liquidColor(drink.amounts);
  const hot = drink.cup === 'cangkir' || drink.cup === 'cup-takeaway';
  const steaming = hot && (drink.amounts.espresso || drink.amounts.air || drink.amounts.teh);
  const hint = note
    ? note
    : !drink.cup
      ? order.iced
        ? 'Pesanan dingin: ambil gelas plastik di rak kiri.'
        : 'Pesanan panas: ambil paper cup di rak kiri.'
      : order.coffee && !drink.amounts.espresso
        ? pf.at === 'rest'
          ? 'Kopi: ketuk portafilter untuk menaruhnya di bawah grinder.'
          : pf.at === 'grinder'
            ? 'Tahan tombol GRIND sampai penuh, lalu ketuk portafilter.'
            : pf.at === 'mat'
              ? 'Tahan tamper untuk memadatkan, lalu ketuk portafilter.'
              : pf.angle < 0
                ? 'Seret gagang portafilter ke kanan sampai terkunci.'
                : brew.on
                  ? 'Tekan STOP saat ekstraksi pas (sekitar 25–30 detik).'
                  : 'Tekan BREW untuk mulai ekstraksi.'
        : order.iced && !drink.amounts.es
          ? 'Jangan lupa es batu: ketuk freezer lalu serok.'
          : 'Tambah sirup, bubuk, atau susu sesuai selera, lalu tekan Selesai.';

  const at = (spot: number[]) => ({ left: spot[0] + 'em', top: spot[1] + 'em' });
  const pfSpot =
    pf.at === 'rest'
      ? [54, 71]
      : pf.at === 'grinder'
        ? SPOT.grinder
        : pf.at === 'mat'
          ? SPOT.mat
          : SPOT.group;

  return (
    <div className={styles.overlay}>
      <section className={styles.ticket} aria-live="polite">
        <small>PESANAN · {name}</small>
        <strong>{order.item.name}</strong>
        <span>
          {order.iced ? '🧊 dingin' : '☕ panas'}
          {order.takeaway ? ' · bawa pulang' : ''}
          {order.coffee ? ' · pakai espresso' : ''}
        </span>
        <p>“{order.line}”</p>
      </section>
      <div className={styles.actions}>
        <button
          className={styles.reset}
          onClick={() => {
            playSfx('knock');
            onChange(() => ({ cup: null, amounts: {}, espressoQuality: 1 }));
          }}
          disabled={!drink.cup}
        >
          Buang & ulang
        </button>
        <button className={styles.leave} onClick={onClose}>
          Tutup
        </button>
        <button
          className={styles.done}
          disabled={!drink.cup || volume < 20 || brew.on}
          onClick={() => {
            playSfx('stir');
            onFinish();
          }}
        >
          Selesai racik
        </button>
      </div>

      <div className={styles.scroller} ref={scroller}>
        <div className={styles.stage} ref={stage}>
          <i className={styles.shelf} />
          <i className={styles.counter} />

          {/* Syrup bottles with pumps */}
          {slots.map((id, i) => (
            <div key={i} className={styles.bottleWrap} style={at(SPOT.bottle(i))}>
              <button
                className={styles.bottle}
                data-pumping={pumping === i || undefined}
                style={{ '--syrup': COLORS[id] } as React.CSSProperties}
                aria-label={`Pompa ${ingredientById(id)!.name} (10 ml)`}
                onClick={() => pump(i)}
              >
                <i className={styles.pumpHead} />
                <i className={styles.pumpNeck} />
                <i className={styles.glass} />
                <span className={styles.label}>
                  {ingredientById(id)!.name.replace('Sirup ', '')}
                </span>
              </button>
              <button
                className={styles.swap}
                aria-label={`Ganti isi botol ${i + 1}`}
                onClick={() => setSwapping(swapping === i ? null : i)}
              >
                ⟲
              </button>
              {swapping === i && (
                <div className={styles.swapMenu} role="listbox" aria-label="Pilih sirup">
                  {SYRUPS.map((s) => (
                    <button
                      key={s}
                      role="option"
                      aria-selected={s === id}
                      onClick={() => {
                        const next = slots.map((x, j) => (j === i ? s : x));
                        setSlots(next);
                        try {
                          localStorage.setItem(SLOT_KEY, JSON.stringify(next));
                        } catch {
                          /* Remembered for this visit only. */
                        }
                        playSfx('click');
                        setSwapping(null);
                      }}
                    >
                      <i style={{ background: COLORS[s] }} />
                      {ingredientById(s)!.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Powder jars */}
          {POWDERS.map((id, i) => (
            <button
              key={id}
              className={styles.jar}
              data-open={scooping === id || undefined}
              style={{ ...at(SPOT.jar(i)), '--powder': COLORS[id] } as React.CSSProperties}
              aria-label={`Sendok ${ingredientById(id)!.name}`}
              onClick={() => spoon(id, i)}
            >
              <i className={styles.lid} />
              <i className={styles.powder} />
              <span className={styles.label}>{ingredientById(id)!.name.replace('Bubuk ', '')}</span>
            </button>
          ))}
          <button
            className={styles.jar + ' ' + styles.beanJar}
            style={at(SPOT.beans)}
            aria-label="Isi biji kopi ke grinder"
            onClick={refillBeans}
          >
            <i className={styles.lid} />
            <i className={styles.beanFill} />
            <span className={styles.label}>Biji kopi</span>
          </button>

          {/* Milk, condensed milk, tea and hot water */}
          {POURS.map((p, i) => (
            <button
              key={p.id}
              className={styles.pourer}
              data-kind={p.kind}
              style={at(SPOT.pour(i))}
              aria-label={`Tuang ${p.label}`}
              onClick={() => pour(p.id, i)}
            >
              <i />
              <span className={styles.label}>{p.label}</span>
            </button>
          ))}

          {/* Cup rack: plastic for cold, paper for hot */}
          <button
            className={styles.rack + ' ' + styles.plastic}
            style={at(SPOT.rackCold)}
            aria-label="Ambil gelas plastik (minuman dingin)"
            onClick={() => takeCup('gelas-es', SPOT.rackCold)}
          >
            {[0, 1, 2, 3].map((k) => (
              <i key={k} style={{ bottom: k * 1.1 + 'em' }} />
            ))}
            <span className={styles.label}>Gelas plastik</span>
          </button>
          <button
            className={styles.rack + ' ' + styles.paper}
            style={at(SPOT.rackHot)}
            aria-label="Ambil paper cup (minuman panas)"
            onClick={() => takeCup('cangkir', SPOT.rackHot)}
          >
            {[0, 1, 2, 3].map((k) => (
              <i key={k} style={{ bottom: k * 1 + 'em' }} />
            ))}
            <span className={styles.label}>Paper cup</span>
          </button>

          {/* Freezer drawer with ice and a scoop */}
          <div className={styles.freezer} data-open={freezer || undefined} style={at(SPOT.freezer)}>
            <button
              className={styles.freezerDoor}
              aria-label={freezer ? 'Tutup freezer' : 'Buka freezer'}
              onClick={() => {
                playSfx('click');
                setFreezer(!freezer);
              }}
            >
              FREEZER
            </button>
            <div className={styles.iceBin} aria-hidden={!freezer}>
              {Array.from({ length: 12 }, (_, k) => (
                <i
                  key={k}
                  style={{ left: (k % 6) * 2.6 + 0.6 + 'em', top: (k >> 2) * 1.6 + 'em' }}
                />
              ))}
              <button className={styles.scoop} onClick={scoopIce} tabIndex={freezer ? 0 : -1}>
                Serok es
              </button>
            </div>
          </div>

          {/* Grinder */}
          <div className={styles.grinder} style={at([SPOT.hopper[0] - 5, SPOT.hopper[1] - 8])}>
            <i className={styles.hopper}>
              <i style={{ height: beans * 100 + '%' }} />
            </i>
            <i className={styles.grinderBody} data-on={grinding || undefined} />
            <button
              className={styles.grindButton}
              aria-label="Tahan untuk menggiling"
              data-on={grinding || undefined}
              onPointerDown={startGrind}
              onPointerUp={stopGrind}
              onPointerLeave={stopGrind}
              onPointerCancel={stopGrind}
            >
              GRIND
            </button>
            {grinding && <i className={styles.grounds} />}
          </div>

          {/* Tamper on its mat */}
          <i className={styles.mat} style={at([SPOT.mat[0] - 5, SPOT.mat[1] + 2])} />
          <button
            className={styles.tamper}
            data-down={tamping || pf.tamped || undefined}
            style={at(pf.at === 'mat' ? [SPOT.mat[0], SPOT.mat[1] - 6.5] : [61, 62])}
            aria-label="Tahan untuk tamping"
            onPointerDown={startTamp}
            onPointerUp={stopTamp}
            onPointerLeave={stopTamp}
            onPointerCancel={stopTamp}
          />

          {/* Espresso machine */}
          <div className={styles.machine} style={at([73, 25])}>
            <i className={styles.machineBody} />
            <i className={styles.groupHead} />
            <span className={styles.timer} data-on={brew.on || undefined}>
              {brew.t ? brew.t.toFixed(0).padStart(2, '0') : '00'}
              <small>dtk</small>
            </span>
            <button
              className={styles.brewButton}
              data-on={brew.on || undefined}
              onClick={brew.on ? stopBrew : startBrew}
            >
              {brew.on ? 'STOP' : 'BREW'}
            </button>
            <i className={styles.dripTray} />
            {brew.on && <i className={styles.shot} />}
            <i className={styles.steamWand} />
          </div>

          {/* Portafilter */}
          <button
            className={styles.portafilter}
            data-at={pf.at}
            data-locked={(pf.at === 'group' && pf.angle >= 0) || undefined}
            style={
              {
                ...at(pfSpot),
                '--angle': (pf.at === 'group' ? pf.angle : 0) + 'deg',
                '--dose': Math.min(1, pf.dose),
              } as React.CSSProperties
            }
            aria-label="Portafilter"
            onPointerDown={twistDown}
            onPointerMove={twistMove}
            onPointerUp={twistUp}
            onPointerCancel={() => (twist.current = null)}
          >
            <i className={styles.handle} />
            <i className={styles.basket}>
              <i
                className={styles.coffee}
                data-tamped={pf.tamped || undefined}
                data-spent={pf.spent || undefined}
              />
            </i>
          </button>

          {/* The cup */}
          {drink.cup && (
            <div className={styles.cup} data-cup={drink.cup} style={at(cupSpot)}>
              <i className={styles.liquid} style={{ height: fill * 82 + '%', background: color }}>
                {drink.amounts.espresso ? <i className={styles.crema} /> : null}
              </i>
              {drink.amounts.es ? (
                <i className={styles.ice}>
                  {[0, 1, 2, 3, 4].map((k) => (
                    <i key={k} />
                  ))}
                </i>
              ) : null}
              {steaming ? <i className={styles.steam} /> : null}
              <i className={styles.cupShell} />
            </div>
          )}

          {/* Flying drops, spoons, ice and beans */}
          {fx.map((f, k) => (
            <i
              key={f.id}
              className={styles.fx}
              data-kind={f.kind}
              style={
                {
                  '--fx': f.from[0] + 'em',
                  '--fy': f.from[1] + 'em',
                  '--tx': f.to[0] + 'em',
                  '--ty': f.to[1] + 'em',
                  '--c': f.color,
                  '--d': (k % 6) * 60 + 'ms',
                  '--j': ((k * 37) % 7) - 3 + 'em',
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      </div>
      <p className={styles.hint}>{hint}</p>
    </div>
  );
}
