'use client';
// Plan the roster one employee at a time: pick a name, then tick P (pagi) and/or M (malam) on
// each date of the month. Nothing ticked is a day off; both ticked is a full day.
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { businessDay, shiftSlot, type Row } from '@/lib/model';
import styles from './roster-planner.module.css';

type Slot = 'pagi' | 'malam';
type Day = Record<Slot, boolean>;
type Times = Record<Slot, { name: string; start: string; end: string }>;
type Result = { added: number; removed: number; skipped: string[] };

const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const SLOTS: [Slot, string][] = [
  ['pagi', 'P'],
  ['malam', 'M'],
];
const wita = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Makassar',
    hour: '2-digit',
    minute: '2-digit',
  });
const monthDates = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
};
const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};
const monthLabel = (month: string) =>
  new Date(month + '-15T12:00:00Z').toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
  });

/** The shift times to use for new shifts: those of the latest morning/night shift, or defaults. */
function defaultTimes(shifts: Row[]): Times {
  const latest = (slot: Slot) =>
    [...shifts]
      .filter((sh) => shiftSlot(sh) === slot)
      .sort((a, b) => b.startAt.localeCompare(a.startAt))[0];
  const pick = (slot: Slot, name: string, start: string, end: string) => {
    const sh = latest(slot);
    return sh
      ? { name: sh.name, start: wita(sh.startAt), end: wita(sh.endAt) }
      : { name, start, end };
  };
  return {
    pagi: pick('pagi', 'Shift pagi', '08:00', '16:00'),
    malam: pick('malam', 'Shift malam', '16:00', '23:00'),
  };
}

export default function RosterPlanner({
  open,
  onClose,
  employees,
  shifts,
  busy,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  employees: Row[];
  shifts: Row[];
  busy: boolean;
  onSave: (payload: {
    employeeId: string;
    days: Record<string, Day>;
    pagi: Times['pagi'];
    malam: Times['malam'];
  }) => Promise<Result | boolean>;
}) {
  const today = businessDay();
  const [employeeId, setEmployeeId] = useState(''),
    [month, setMonth] = useState(today.slice(0, 7)),
    [edits, setEdits] = useState<Record<string, Day>>({}),
    [times, setTimes] = useState<Times | null>(null),
    [note, setNote] = useState('');
  const dates = monthDates(month);
  const planned = (d: string): Day => ({
    pagi: shifts.some(
      (sh) => sh.date === d && shiftSlot(sh) === 'pagi' && sh.employeeIds.includes(employeeId),
    ),
    malam: shifts.some(
      (sh) => sh.date === d && shiftSlot(sh) === 'malam' && sh.employeeIds.includes(employeeId),
    ),
  });
  const day = (d: string) => edits[d] || planned(d);
  const editable = (d: string) => !!employeeId && d >= today;
  const shownTimes = times || defaultTimes(shifts);
  const changed = Object.keys(edits).length > 0;

  const choose = (id: string) => {
    setEmployeeId(id);
    setEdits({});
    setNote('');
  };
  const goMonth = (by: number) => {
    setMonth(shiftMonth(month, by));
    setEdits({});
    setNote('');
  };
  // Functional updates, so quick taps in a row all count.
  const toggle = (d: string, slot: Slot) => {
    if (!editable(d)) return;
    setEdits((prev) => {
      const current = prev[d] || planned(d);
      return { ...prev, [d]: { ...current, [slot]: !current[slot] } };
    });
  };
  const fill = (value: Partial<Day>) =>
    setEdits((prev) => {
      const next = { ...prev };
      for (const d of dates) if (editable(d)) next[d] = { ...(prev[d] || planned(d)), ...value };
      return next;
    });
  const save = async () => {
    // Every editable date of the month is sent, so an unticked date becomes a day off.
    const days = Object.fromEntries(dates.filter(editable).map((d) => [d, day(d)]));
    const result = await onSave({ employeeId, days, ...shownTimes });
    if (!result) return;
    setEdits({});
    if (typeof result === 'object' && result.skipped.length)
      setNote(
        'Tidak diubah karena shift-nya sudah berjalan atau selesai: ' +
          result.skipped.map((d) => Number(d.slice(8))).join(', ') +
          '.',
      );
    else setNote('');
  };
  const name = employees.find((e) => e.id === employeeId)?.name;
  const counts = dates.reduce(
    (n, d) => {
      const v = day(d);
      if (v.pagi && v.malam) n.full++;
      else if (v.pagi) n.pagi++;
      else if (v.malam) n.malam++;
      return n;
    },
    { pagi: 0, malam: 0, full: 0 },
  );
  const lead = (new Date(dates[0] + 'T12:00:00Z').getUTCDay() + 6) % 7;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!busy && !v) onClose();
      }}
    >
      <DialogContent className={'editor-dialog ' + styles.dialog}>
        <DialogHeader>
          <DialogTitle>Jadwal per karyawan</DialogTitle>
          <DialogDescription>
            Pilih karyawan, lalu centang P (pagi) dan M (malam). Tanpa centang berarti libur, dua
            centang berarti full day.
          </DialogDescription>
        </DialogHeader>
        <div className={styles.people} role="radiogroup" aria-label="Karyawan">
          {employees.map((e) => (
            <button
              key={e.id}
              role="radio"
              aria-checked={e.id === employeeId}
              className={styles.person}
              disabled={busy || (changed && e.id !== employeeId)}
              onClick={() => choose(e.id)}
            >
              {e.name}
            </button>
          ))}
        </div>
        {changed && <small className={styles.hint}>Simpan dulu sebelum pindah karyawan.</small>}
        <div className={styles.monthBar}>
          <button
            className="icon-button"
            aria-label="Bulan sebelumnya"
            disabled={busy}
            onClick={() => goMonth(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <strong>{monthLabel(month)}</strong>
          <button
            className="icon-button"
            aria-label="Bulan berikutnya"
            disabled={busy}
            onClick={() => goMonth(1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        {!employeeId ? (
          <p className={styles.empty}>Pilih nama karyawan di atas untuk mulai.</p>
        ) : (
          <>
            <div className={styles.grid}>
              {WEEKDAYS.map((w) => (
                <span key={w} className={styles.weekday}>
                  {w}
                </span>
              ))}
              {Array.from({ length: lead }, (_, i) => (
                <span key={'blank' + i} />
              ))}
              {dates.map((d) => {
                const v = day(d);
                return (
                  <div
                    key={d}
                    className={
                      styles.cell +
                      (v.pagi && v.malam ? ' ' + styles.full : '') +
                      (!v.pagi && !v.malam ? ' ' + styles.off : '') +
                      (d === today ? ' ' + styles.today : '') +
                      (!editable(d) ? ' ' + styles.past : '')
                    }
                  >
                    <span className={styles.date}>{Number(d.slice(8))}</span>
                    {SLOTS.map(([slot, letter]) => (
                      <button
                        key={slot}
                        className={styles.tick + ' ' + styles[slot]}
                        aria-pressed={v[slot]}
                        aria-label={`${slot} ${Number(d.slice(8))}`}
                        disabled={busy || !editable(d)}
                        onClick={() => toggle(d, slot)}
                      >
                        {letter}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
            <div className={styles.summary}>
              <span>
                <i className={styles.dotPagi} /> Pagi {counts.pagi}
              </span>
              <span>
                <i className={styles.dotMalam} /> Malam {counts.malam}
              </span>
              <span>
                <i className={styles.dotFull} /> Full day {counts.full}
              </span>
              <span>Libur: sisanya</span>
            </div>
            <div className="row">
              <button className="button" disabled={busy} onClick={() => fill({ pagi: true })}>
                Semua pagi
              </button>
              <button className="button" disabled={busy} onClick={() => fill({ malam: true })}>
                Semua malam
              </button>
              <button
                className="button"
                disabled={busy}
                onClick={() => fill({ pagi: false, malam: false })}
              >
                Kosongkan
              </button>
            </div>
            <details className={styles.times}>
              <summary>
                Jam shift: pagi {shownTimes.pagi.start}–{shownTimes.pagi.end}, malam{' '}
                {shownTimes.malam.start}–{shownTimes.malam.end}
              </summary>
              {SLOTS.map(([slot]) => (
                <div key={slot} className={styles.timeRow}>
                  <input
                    aria-label={'Nama shift ' + slot}
                    value={shownTimes[slot].name}
                    onChange={(e) =>
                      setTimes({
                        ...shownTimes,
                        [slot]: { ...shownTimes[slot], name: e.target.value },
                      })
                    }
                  />
                  <input
                    type="time"
                    aria-label={'Mulai ' + slot}
                    value={shownTimes[slot].start}
                    onChange={(e) =>
                      setTimes({
                        ...shownTimes,
                        [slot]: { ...shownTimes[slot], start: e.target.value },
                      })
                    }
                  />
                  <input
                    type="time"
                    aria-label={'Selesai ' + slot}
                    value={shownTimes[slot].end}
                    onChange={(e) =>
                      setTimes({
                        ...shownTimes,
                        [slot]: { ...shownTimes[slot], end: e.target.value },
                      })
                    }
                  />
                </div>
              ))}
              <small>Jam ini dipakai untuk shift baru. Shift yang sudah ada tidak berubah.</small>
            </details>
            {note && <p className={styles.hint}>{note}</p>}
            <button
              className="button primary"
              disabled={busy || !changed}
              onClick={() => void save()}
            >
              {busy ? 'Menyimpan…' : changed ? `Simpan jadwal ${name}` : 'Belum ada perubahan'}
            </button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
