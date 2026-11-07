import type { Row, State } from './model';

export type DayStatus = 'hadir' | 'sakit' | 'izin' | 'libur' | 'absen' | 'terjadwal';
export type DayEntry = {
  shift: Row;
  employeeId: string;
  status: DayStatus;
  record?: Row;
};

/**
 * Everyone rostered or recorded on each shift of a month, by date. A rostered person without a
 * record counts as absent once the shift is over, and as scheduled before that.
 */
export function monthAttendance(s: State, month: string, today: string, only?: string) {
  const days = new Map<string, DayEntry[]>();
  const shifts = s.shifts
    .filter((sh) => sh.date.startsWith(month))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  for (const sh of shifts) {
    const records = s.attendance.filter((at) => at.shiftId === sh.id);
    const people = new Set<string>([...sh.employeeIds, ...records.map((at) => at.employeeId)]);
    for (const employeeId of people) {
      if (only && employeeId !== only) continue;
      const record = records.find((at) => at.employeeId === employeeId);
      const status: DayStatus = record
        ? record.status
        : sh.status === 'closed' || sh.date < today
          ? 'absen'
          : 'terjadwal';
      const list = days.get(sh.date) || [];
      list.push({ shift: sh, employeeId, status, record });
      days.set(sh.date, list);
    }
  }
  return days;
}

/** Shift counts per person and status for a month. */
export function monthSummary(days: Map<string, DayEntry[]>) {
  const out = new Map<string, Record<DayStatus, number>>();
  for (const list of days.values())
    for (const e of list) {
      const row = out.get(e.employeeId) || {
        hadir: 0,
        sakit: 0,
        izin: 0,
        libur: 0,
        absen: 0,
        terjadwal: 0,
      };
      row[e.status]++;
      out.set(e.employeeId, row);
    }
  return out;
}

/** The month's dates in weeks starting on Monday; '' pads the first and last week. */
export function monthGrid(month: string) {
  const [y, m] = month.split('-').map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const cells = [
    ...Array(lead).fill(''),
    ...Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
  ];
  while (cells.length % 7) cells.push('');
  return cells as string[];
}

export const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};
