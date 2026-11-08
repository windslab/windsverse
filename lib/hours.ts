import { CAFE_TIMEZONE } from './model';

export const WEEKDAYS = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'] as const;
export const DAY_LABEL: Record<string, string> = {
  senin: 'Senin',
  selasa: 'Selasa',
  rabu: 'Rabu',
  kamis: 'Kamis',
  jumat: 'Jumat',
  sabtu: 'Sabtu',
  minggu: 'Minggu',
};

type Hours = {
  openTime?: string;
  closeTime?: string;
  closedDays?: string[];
  [key: string]: unknown;
};
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Day of the week and minutes past midnight at the cafe, in WITA. */
function cafeClock(now: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: CAFE_TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { day, at: Number(get('hour')) * 60 + Number(get('minute')) };
}

/**
 * Whether the cafe is open at this moment, or null when no hours are set. Hours that end at or
 * before they start run past midnight, and then belong to the day they started on.
 */
export function openNow(h: Hours, now = new Date()): boolean | null {
  if (!h.openTime || !h.closeTime) return null;
  const open = minutes(h.openTime),
    close = minutes(h.closeTime),
    closed = new Set(h.closedDays || []);
  const { day, at } = cafeClock(now);
  const today = !closed.has(WEEKDAYS[day]),
    yesterday = !closed.has(WEEKDAYS[(day + 6) % 7]);
  if (close > open) return today && at >= open && at < close;
  return (today && at >= open) || (yesterday && at < close);
}

/** "10.00–23.00", with 00:00 as closing written 24.00. */
export const hoursRange = (h: Hours) =>
  h.openTime && h.closeTime
    ? h.openTime.replace(':', '.') +
      '–' +
      (h.closeTime === '00:00' ? '24.00' : h.closeTime.replace(':', '.'))
    : '';

/** Which days the cafe opens, in words: "Setiap hari" or "Tutup setiap Senin". */
export function openDays(h: Hours) {
  const closed = Object.keys(DAY_LABEL).filter((d) => (h.closedDays || []).includes(d));
  if (!closed.length) return 'Setiap hari';
  if (closed.length === 7) return 'Sedang tutup sementara';
  return 'Tutup setiap ' + closed.map((d) => DAY_LABEL[d]).join(', ');
}
