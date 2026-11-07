import { monthlyExpenses, type Actor, type State } from './model';

export type Estimate = {
  period: string;
  employeeId: string;
  shifts: number;
  base: number;
  bonus: number;
  total: number;
};

/**
 * What each person has earned so far in a month, from the shifts already closed: their shift
 * wages, plus their share of the bonus pool split by shifts attended. This is the sum
 * "Hitung periode" makes, but read from the stored shift snapshots without recalculating them.
 */
export function payrollEstimate(s: State, period: string): Estimate[] {
  const closed = s.shifts.filter((sh) => sh.status === 'closed' && sh.date.startsWith(period));
  const totals = new Map<string, { base: number; count: number }>();
  for (const sh of closed)
    for (const e of sh.snapshot?.employees || []) {
      const old = totals.get(e.employeeId) || { base: 0, count: 0 };
      totals.set(e.employeeId, { base: old.base + (e.wage || 0), count: old.count + 1 });
    }
  const entries = [...totals.entries()].sort(([a], [b]) => a.localeCompare(b));
  const bases = entries.reduce((n, [, v]) => n + v.base, 0),
    count = entries.reduce((n, [, v]) => n + v.count, 0);
  const net =
    closed.reduce((n, sh) => n + (sh.snapshot?.profit || 0), 0) -
    monthlyExpenses(s, period) -
    bases;
  const pool = Math.round(Math.max(0, net) * ((s.settings[0]?.bonusPercentage || 0) / 100));
  let allocated = 0;
  return entries.map(([employeeId, v], i) => {
    const bonus =
      i === entries.length - 1 ? pool - allocated : Math.floor((pool * v.count) / count);
    allocated += bonus;
    return { period, employeeId, shifts: v.count, base: v.base, bonus, total: v.base + bonus };
  });
}

/** Estimates for every month with a closed shift; staff receive only their own. */
export function estimatesFor(s: State, a: Actor) {
  const periods = [
    ...new Set(s.shifts.filter((sh) => sh.status === 'closed').map((sh) => sh.date.slice(0, 7))),
  ];
  return periods
    .flatMap((period) => payrollEstimate(s, period))
    .filter((e) => a.role === 'admin' || e.employeeId === a.employeeId);
}
