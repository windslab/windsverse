'use client';
// Free build mode: design your own house on the lot beside the road. Draw walls and whole rooms,
// lay floors, cut doors and windows, place furniture, choose the roof. The camera looks down on the
// lot; drag on the ground to build. Everything is kept in this browser and the finished house can
// be walked into.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CATALOGUE,
  FLOORS,
  ROOFS,
  TINTS,
  WALLS,
  canPlace,
  catalogueItem,
  edit,
  emptyHouse,
  footprint,
  type Cursor,
  type HouseData,
  type Opening,
  type RoofKind,
} from '@/lib/build-house';
import { playSfx } from '@/lib/cafe-sound';
import type { ExploreApi } from './explore-mode';
import styles from './explore-build.module.css';

type Tool =
  | 'dinding'
  | 'ruang'
  | 'lantai'
  | 'pintu'
  | 'jendela'
  | 'lengkung'
  | 'perabot'
  | 'pilih'
  | 'cat'
  | 'atap'
  | 'hapus';

const TOOLS: { id: Tool; name: string; hint: string }[] = [
  { id: 'ruang', name: 'Ruang', hint: 'Tarik untuk membuat ruangan persegi (dinding + lantai).' },
  { id: 'dinding', name: 'Dinding', hint: 'Tarik lurus untuk membuat dinding.' },
  { id: 'lantai', name: 'Lantai', hint: 'Tarik untuk melapisi lantai.' },
  {
    id: 'pintu',
    name: 'Pintu',
    hint: 'Ketuk dinding untuk memasang pintu (ketuk lagi untuk melepas).',
  },
  { id: 'jendela', name: 'Jendela', hint: 'Ketuk dinding untuk memasang jendela.' },
  {
    id: 'lengkung',
    name: 'Lengkung',
    hint: 'Ketuk dinding untuk membuat lubang lengkung tanpa daun pintu.',
  },
  { id: 'perabot', name: 'Perabot', hint: 'Pilih perabot, lalu ketuk lahan untuk menaruhnya.' },
  {
    id: 'pilih',
    name: 'Pilih',
    hint: 'Ketuk perabot untuk memilih, lalu ketuk tempat baru untuk memindah.',
  },
  { id: 'cat', name: 'Cat', hint: 'Usap dinding untuk mengganti bahannya.' },
  { id: 'atap', name: 'Atap', hint: 'Pilih bentuk dan warna atap.' },
  {
    id: 'hapus',
    name: 'Hapus',
    hint: 'Ketuk atau usap untuk menghapus dinding, lantai, atau perabot.',
  },
];

type Point = { x: number; z: number };
const snapHalf = (v: number) => Math.round(v * 2) / 2;
const node = (p: Point) => ({ x: Math.round(p.x), z: Math.round(p.z) });
const clampNode = (d: HouseData, n: Point) => ({
  x: Math.min(d.cols, Math.max(0, n.x)),
  z: Math.min(d.rows, Math.max(0, n.z)),
});

/** The wall edge nearest a point on the lot, if there is one within reach. */
function nearestEdge(d: HouseData, p: Point) {
  const hz = Math.round(p.z),
    hx = Math.floor(p.x),
    vx = Math.round(p.x),
    vz = Math.floor(p.z);
  const dh = Math.abs(p.z - hz),
    dv = Math.abs(p.x - vx);
  const canH = !!d.h[`${hx},${hz}`],
    canV = !!d.w[`${vx},${vz}`];
  if (canH && (!canV || dh <= dv) && dh < 0.45) return { axis: 'h' as const, x: hx, z: hz };
  if (canV && dv < 0.45) return { axis: 'w' as const, x: vx, z: vz };
  return null;
}

/** A button that repeats while it is held (for the camera). */
function HoldButton({
  run,
  label,
  children,
}: {
  run: () => void;
  label: string;
  children: React.ReactNode;
}) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  return (
    <button
      aria-label={label}
      onPointerDown={(e) => {
        e.stopPropagation();
        run();
        stop();
        timer.current = setInterval(run, 60);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
    >
      {children}
    </button>
  );
}

function Swatches({
  list,
  current,
  onPick,
}: {
  list: { name: string; color: string }[];
  current: number;
  onPick: (i: number) => void;
}) {
  return (
    <div className={styles.swatches}>
      {list.map((m, i) => (
        <button
          key={m.name}
          className={styles.swatch}
          aria-pressed={current === i}
          aria-label={m.name}
          title={m.name}
          onClick={() => onPick(i)}
          style={{ background: m.color }}
        />
      ))}
      <small>{list[current]?.name}</small>
    </div>
  );
}

export default function BuildMode({ api, onExit }: { api: ExploreApi; onExit: () => void }) {
  const build = api.build;
  const [history, setHistory] = useState<{
      past: HouseData[];
      present: HouseData;
      future: HouseData[];
    }>(() => ({ past: [], present: build.data(), future: [] })),
    [tool, setTool] = useState<Tool>('ruang'),
    [wall, setWall] = useState(0),
    [floor, setFloor] = useState(0),
    [item, setItem] = useState(CATALOGUE[0].id),
    [tint, setTint] = useState(0),
    [turn, setTurn] = useState<0 | 1 | 2 | 3>(0),
    [pickedId, setPickedId] = useState<string | null>(null),
    [roofOn, setRoofOn] = useState(false),
    [wallsLow, setWallsLow] = useState(false),
    [note, setNote] = useState('');
  const house = history.present;
  /** Only the "Pilih" tool keeps a selection. */
  const selected = tool === 'pilih' ? pickedId : null;
  const drag = useRef<{ id: number; start: Point } | null>(null);

  // The camera and ground overlay belong to this mode.
  useEffect(() => {
    build.enter();
    return () => {
      build.cursor(null);
      build.walls(1);
      build.exit();
    };
  }, [build]);

  // Whatever the history says is the house gets shown (and remembered) by the world.
  useEffect(() => {
    build.set(history.present);
  }, [build, history.present]);

  const commit = useCallback((next: HouseData, sound = true) => {
    setHistory((h) => ({ past: [...h.past.slice(-79), h.present], present: next, future: [] }));
    if (sound) playSfx('click');
  }, []);
  const undo = useCallback(
    () =>
      setHistory((h) =>
        h.past.length
          ? {
              past: h.past.slice(0, -1),
              present: h.past[h.past.length - 1],
              future: [h.present, ...h.future],
            }
          : h,
      ),
    [],
  );
  const redo = useCallback(
    () =>
      setHistory((h) =>
        h.future.length
          ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) }
          : h,
      ),
    [],
  );

  const flash = useCallback((text: string) => {
    setNote(text);
    window.setTimeout(() => setNote(''), 1800);
  }, []);

  const pieceAt = useCallback(
    (p: Point) => {
      // Solid furniture first, then rugs underneath.
      const order = [...house.items].sort(
        (a, b) => Number(!!catalogueItem(a.t)?.walkable) - Number(!!catalogueItem(b.t)?.walkable),
      );
      return order.find((i) => {
        const f = footprint(i);
        return Math.abs(p.x - i.x) <= f.hx && Math.abs(p.z - i.z) <= f.hz;
      });
    },
    [house],
  );

  /** Where would a piece of furniture land if placed under the pointer? */
  const placement = useCallback(
    (p: Point) => {
      const f = footprint({ t: item, r: turn });
      // Pieces sit on the half-cell grid with their edges on it.
      const snap = (v: number, half: number) => snapHalf(v - half) + half;
      return { t: item, x: snap(p.x, f.hx), z: snap(p.z, f.hz), r: turn, c: tint };
    },
    [item, turn, tint],
  );

  // --- Pointer: preview and edit -----------------------------------------------------------
  const preview = useCallback(
    (p: Point | null, end?: Point) => {
      if (!p) return build.cursor(null);
      const d = house;
      let c: Cursor | null = null;
      if (tool === 'ruang' || tool === 'dinding' || tool === 'lantai') {
        const start = drag.current?.start ?? p;
        const e = end ?? p;
        if (tool === 'lantai') {
          const x0 = Math.floor(Math.min(start.x, e.x)),
            z0 = Math.floor(Math.min(start.z, e.z));
          const x1 = Math.floor(Math.max(start.x, e.x)),
            z1 = Math.floor(Math.max(start.z, e.z));
          c = { kind: 'cell', x: x0, z: z0, w: x1 - x0 + 1, d: z1 - z0 + 1 };
        } else if (tool === 'ruang') {
          const a = clampNode(d, node(start)),
            b = clampNode(d, node(e));
          c = {
            kind: 'cell',
            x: Math.min(a.x, b.x),
            z: Math.min(a.z, b.z),
            w: Math.max(0.3, Math.abs(a.x - b.x)),
            d: Math.max(0.3, Math.abs(a.z - b.z)),
          };
        } else {
          const a = clampNode(d, node(start)),
            b = clampNode(d, node(e));
          const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.z - a.z);
          c = horizontal
            ? {
                kind: 'cell',
                x: Math.min(a.x, b.x),
                z: a.z - 0.15,
                w: Math.max(0.3, Math.abs(b.x - a.x)),
                d: 0.3,
              }
            : {
                kind: 'cell',
                x: a.x - 0.15,
                z: Math.min(a.z, b.z),
                w: 0.3,
                d: Math.max(0.3, Math.abs(b.z - a.z)),
              };
        }
      } else if (tool === 'pintu' || tool === 'jendela' || tool === 'lengkung' || tool === 'cat') {
        const e = nearestEdge(d, p);
        c = e ? { kind: 'edge', axis: e.axis, x: e.x, z: e.z } : null;
      } else if (tool === 'hapus') {
        const piece = pieceAt(p);
        if (piece) {
          const f = footprint(piece);
          c = {
            kind: 'cell',
            x: piece.x - f.hx,
            z: piece.z - f.hz,
            w: f.hx * 2,
            d: f.hz * 2,
            ok: false,
          };
        } else {
          const e = nearestEdge(d, p);
          c = e
            ? { kind: 'edge', axis: e.axis, x: e.x, z: e.z, ok: false }
            : { kind: 'cell', x: Math.floor(p.x), z: Math.floor(p.z), ok: false };
        }
      } else if (tool === 'perabot') {
        const spot = placement(p);
        c = { kind: 'item', t: spot.t, x: spot.x, z: spot.z, r: spot.r, ok: canPlace(d, spot) };
      } else if (tool === 'pilih') {
        const piece = selected ? d.items.find((i) => i.id === selected) : null;
        if (piece) {
          const f = footprint(piece);
          const moving = { ...piece, x: snapHalf(p.x), z: snapHalf(p.z) };
          c = {
            kind: 'cell',
            x: moving.x - f.hx,
            z: moving.z - f.hz,
            w: f.hx * 2,
            d: f.hz * 2,
            ok: canPlace(d, moving, piece.id),
          };
        }
      }
      build.cursor(c);
    },
    [build, house, tool, pieceAt, placement, selected],
  );

  const apply = useCallback(
    (p: Point, end?: Point) => {
      const d = house;
      const start = drag.current?.start ?? p;
      const e = end ?? p;
      switch (tool) {
        case 'ruang': {
          const next = edit.room(d, clampNode(d, node(start)), clampNode(d, node(e)), wall, floor);
          if (JSON.stringify(next) !== JSON.stringify(d)) commit(next);
          break;
        }
        case 'dinding': {
          const a = clampNode(d, node(start)),
            b = clampNode(d, node(e));
          if (a.x !== b.x || a.z !== b.z) commit(edit.walls(d, a, b, wall));
          break;
        }
        case 'lantai':
          commit(
            edit.floor(
              d,
              { x: Math.floor(start.x), z: Math.floor(start.z) },
              { x: Math.floor(e.x), z: Math.floor(e.z) },
              floor,
            ),
          );
          break;
        case 'pintu':
        case 'jendela':
        case 'lengkung': {
          const edge = nearestEdge(d, p);
          if (!edge) return flash('Ketuk tepat pada dinding.');
          const kind: Opening = tool === 'pintu' ? 'door' : tool === 'jendela' ? 'window' : 'arch';
          commit(edit.opening(d, edge.axis, edge.x, edge.z, kind));
          break;
        }
        case 'cat': {
          const edge = nearestEdge(d, p);
          if (edge && d[edge.axis][`${edge.x},${edge.z}`]?.m !== wall)
            commit(edit.paintEdge(d, edge.axis, edge.x, edge.z, wall), false);
          break;
        }
        case 'hapus': {
          const piece = pieceAt(p);
          if (piece) return commit(edit.removeItem(d, piece.id));
          const edge = nearestEdge(d, p);
          if (edge) return commit(edit.removeEdge(d, edge.axis, edge.x, edge.z));
          const cx = Math.floor(p.x),
            cz = Math.floor(p.z);
          if (d.floors[`${cx},${cz}`] !== undefined)
            commit(edit.floor(d, { x: cx, z: cz }, { x: cx, z: cz }, null));
          break;
        }
        case 'perabot': {
          const spot = placement(p);
          if (!canPlace(d, spot)) return flash('Tidak muat di sini.');
          commit(edit.addItem(d, { t: spot.t, x: spot.x, z: spot.z, r: spot.r, c: spot.c }));
          break;
        }
        case 'pilih': {
          const here = pieceAt(p);
          const current = selected ? d.items.find((i) => i.id === selected) : null;
          if (current && !here) {
            const moved = { ...current, x: snapHalf(p.x), z: snapHalf(p.z) };
            if (!canPlace(d, moved, current.id)) return flash('Tidak muat di sini.');
            commit(edit.updateItem(d, current.id, { x: moved.x, z: moved.z }));
          } else setPickedId(here?.id ?? null);
          break;
        }
      }
    },
    [house, tool, wall, floor, commit, flash, pieceAt, placement, selected],
  );

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const p = build.pick(e.clientX, e.clientY);
    if (!p) return;
    drag.current = { id: e.pointerId, start: p };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* Capture is a nicety; dragging still works without it. */
    }
    preview(p, p);
    // Tools that act as you move.
    if (tool === 'cat' || tool === 'hapus') apply(p);
  };
  const onMove = (e: React.PointerEvent) => {
    const p = build.pick(e.clientX, e.clientY);
    if (!p) return;
    const d = drag.current;
    const mine = d?.id === e.pointerId;
    preview(p, mine ? p : undefined);
    if (mine && (tool === 'cat' || tool === 'hapus')) apply(p);
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const p = build.pick(e.clientX, e.clientY) ?? d.start;
    if (tool !== 'cat' && tool !== 'hapus') apply(p, p);
    drag.current = null;
    preview(p);
  };

  // A new tool or palette choice clears the old preview.
  useEffect(() => {
    drag.current = null;
    build.cursor(null);
  }, [tool, build, wall, floor, item, turn, pickedId]);

  // --- Camera: keys and the wheel (the buttons are on screen) --------------------------------
  const rotateSelected = useCallback(() => {
    const piece = house.items.find((i) => i.id === selected);
    if (!piece) return flash('Pilih perabot dulu.');
    const next = { ...piece, r: ((piece.r + 1) % 4) as 0 | 1 | 2 | 3 };
    if (canPlace(house, next, piece.id)) commit(edit.updateItem(house, piece.id, { r: next.r }));
    else flash('Tidak muat saat diputar.');
  }, [house, selected, commit, flash]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('input, textarea')) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'y')) {
        e.preventDefault();
        return k === 'y' || e.shiftKey ? redo() : undo();
      }
      if (k === 'w' || k === 'arrowup') build.view(0, 1, 0, 1.4);
      else if (k === 's' || k === 'arrowdown') build.view(0, 1, 0, -1.4);
      else if (k === 'a' || k === 'arrowleft') build.view(0, 1, -1.4, 0);
      else if (k === 'd' || k === 'arrowright') build.view(0, 1, 1.4, 0);
      else if (k === 'q') build.view(0.08, 1, 0, 0);
      else if (k === 'e') build.view(-0.08, 1, 0, 0);
      else if (k === 'r') {
        if (tool === 'pilih') rotateSelected();
        else setTurn((t) => ((t + 1) % 4) as 0 | 1 | 2 | 3);
      } else if (k === 'escape') onExit();
      else return;
      e.preventDefault();
    };
    const wheel = (e: WheelEvent) => build.view(0, e.deltaY > 0 ? 1.08 : 0.93, 0, 0);
    window.addEventListener('keydown', key);
    window.addEventListener('wheel', wheel, { passive: true });
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('wheel', wheel);
    };
  }, [build, undo, redo, tool, rotateSelected, onExit]);

  const selectedPiece = selected ? house.items.find((i) => i.id === selected) : null;
  const counts = useMemo(
    () => ({
      walls: Object.keys(house.h).length + Object.keys(house.w).length,
      floors: Object.keys(house.floors).length,
      items: house.items.length,
    }),
    [house],
  );
  const hint = TOOLS.find((t) => t.id === tool)!.hint;

  return (
    <div className={styles.build} role="dialog" aria-label="Mode bangun">
      <div
        className={styles.ground}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => {
          drag.current = null;
          build.cursor(null);
        }}
        onPointerLeave={() => {
          if (!drag.current) build.cursor(null);
        }}
      />
      <header className={styles.top}>
        <button onClick={onExit}>← selesai</button>
        <span className={styles.actions}>
          <button onClick={undo} disabled={!history.past.length} aria-label="Urungkan">
            urungkan
          </button>
          <button onClick={redo} disabled={!history.future.length} aria-label="Ulangi">
            ulangi
          </button>
          <button
            aria-pressed={roofOn}
            onClick={() => {
              setRoofOn(!roofOn);
              build.roof(!roofOn);
            }}
          >
            atap {roofOn ? 'tampil' : 'sembunyi'}
          </button>
          <button
            aria-pressed={wallsLow}
            onClick={() => {
              setWallsLow(!wallsLow);
              build.walls(wallsLow ? 1 : 0.28);
            }}
          >
            dinding {wallsLow ? 'rendah' : 'penuh'}
          </button>
          <button
            onClick={() => {
              if (!counts.walls && !counts.floors && !counts.items) return;
              if (window.confirm('Kosongkan seluruh lahan? (Bisa diurungkan.)'))
                commit(emptyHouse(house.cols, house.rows));
            }}
          >
            kosongkan
          </button>
        </span>
      </header>
      <aside className={styles.camera} aria-label="Kamera">
        <span>
          <HoldButton label="Putar kiri" run={() => build.view(0.07, 1, 0, 0)}>
            ⟲
          </HoldButton>
          <HoldButton label="Putar kanan" run={() => build.view(-0.07, 1, 0, 0)}>
            ⟳
          </HoldButton>
        </span>
        <span>
          <HoldButton label="Perbesar" run={() => build.view(0, 0.94, 0, 0)}>
            +
          </HoldButton>
          <HoldButton label="Perkecil" run={() => build.view(0, 1.06, 0, 0)}>
            −
          </HoldButton>
        </span>
        <span>
          <HoldButton label="Geser maju" run={() => build.view(0, 1, 0, 1.4)}>
            ↑
          </HoldButton>
          <HoldButton label="Geser mundur" run={() => build.view(0, 1, 0, -1.4)}>
            ↓
          </HoldButton>
        </span>
        <span>
          <HoldButton label="Geser kiri" run={() => build.view(0, 1, -1.4, 0)}>
            ←
          </HoldButton>
          <HoldButton label="Geser kanan" run={() => build.view(0, 1, 1.4, 0)}>
            →
          </HoldButton>
        </span>
      </aside>
      {note && <p className={styles.note}>{note}</p>}
      <footer className={styles.bottom}>
        <p className={styles.hint}>
          {hint}{' '}
          <small>
            {counts.walls} dinding · {counts.floors} petak lantai · {counts.items} perabot
          </small>
        </p>
        <div className={styles.palette}>
          {(tool === 'dinding' || tool === 'ruang' || tool === 'cat') && (
            <>
              <label>Dinding</label>
              <Swatches list={WALLS} current={wall} onPick={setWall} />
            </>
          )}
          {(tool === 'lantai' || tool === 'ruang') && (
            <>
              <label>Lantai</label>
              <Swatches list={FLOORS} current={floor} onPick={setFloor} />
            </>
          )}
          {tool === 'perabot' && (
            <>
              <div className={styles.items}>
                {CATALOGUE.map((c) => (
                  <button key={c.id} aria-pressed={item === c.id} onClick={() => setItem(c.id)}>
                    {c.name}
                  </button>
                ))}
              </div>
              <Swatches list={TINTS} current={tint} onPick={setTint} />
              <button
                className={styles.text}
                onClick={() => setTurn(((turn + 1) % 4) as 0 | 1 | 2 | 3)}
              >
                putar (R)
              </button>
            </>
          )}
          {tool === 'pilih' && selectedPiece && (
            <div className={styles.row}>
              <small>{catalogueItem(selectedPiece.t)?.name}</small>
              <button className={styles.text} onClick={rotateSelected}>
                putar
              </button>
              <button
                className={styles.text}
                onClick={() => {
                  commit(edit.removeItem(house, selectedPiece.id));
                  setPickedId(null);
                }}
              >
                hapus
              </button>
              <Swatches
                list={TINTS}
                current={selectedPiece.c}
                onPick={(i) => commit(edit.updateItem(house, selectedPiece.id, { c: i }), false)}
              />
            </div>
          )}
          {tool === 'atap' && (
            <>
              <div className={styles.items}>
                {(['gable', 'flat', 'none'] as RoofKind[]).map((k) => (
                  <button
                    key={k}
                    aria-pressed={house.roof.kind === k}
                    onClick={() => {
                      commit(edit.roof(house, { ...house.roof, kind: k }));
                      setRoofOn(true);
                      build.roof(true);
                    }}
                  >
                    {k === 'gable' ? 'Pelana' : k === 'flat' ? 'Datar' : 'Tanpa atap'}
                  </button>
                ))}
              </div>
              <Swatches
                list={ROOFS.map((color, i) => ({ name: `Warna ${i + 1}`, color }))}
                current={house.roof.c}
                onPick={(i) => commit(edit.roof(house, { ...house.roof, c: i }), false)}
              />
            </>
          )}
        </div>
        <nav className={styles.tools} aria-label="Alat bangun">
          {TOOLS.map((t) => (
            <button key={t.id} aria-pressed={tool === t.id} onClick={() => setTool(t.id)}>
              {t.name}
            </button>
          ))}
        </nav>
      </footer>
    </div>
  );
}
