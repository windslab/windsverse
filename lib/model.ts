export type Row = { id: string; [key: string]: any };
export const kinds = [
  'employees',
  'categories',
  'products',
  'ingredients',
  'recipes',
  'tables',
  'shifts',
  'attendance',
  'orders',
  'expenses',
  'tiers',
  'payrolls',
  'chat',
  'notes',
  'feedback',
  'books',
  'loans',
  'settings',
  'members',
  'memberRewards',
  'memberClaims',
  'gamePoints',
] as const;
/** Collections added later: an older backup without them restores them as empty. */
export const laterKinds = new Set<string>([
  'members',
  'memberRewards',
  'memberClaims',
  'gamePoints',
]);
export type Kind = (typeof kinds)[number];
export type State = Record<Kind, Row[]>;
export type Actor = {
  id: string;
  employeeId: string;
  name: string;
  role: 'admin' | 'karyawan' | 'system';
  email: string;
  sessionHash?: string;
};
/** The server itself, for scheduled work; no sign-in can ever produce this role. */
export const SYSTEM_ACTOR: Actor = {
  id: 'system',
  employeeId: 'system',
  name: 'Sistem',
  email: '',
  role: 'system',
};
export const blank = (): State => Object.fromEntries(kinds.map((k) => [k, []])) as unknown as State;
export const defaultCategories = () =>
  ['kopi', 'non_kopi', 'makanan', 'dessert', 'snack', 'mocktail'].map((id, sortOrder) => ({
    id,
    name: id.replaceAll('_', ' '),
    sortOrder,
  }));
export const money = (n: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n || 0);
export const CAFE_TIMEZONE = 'Asia/Makassar';
export const OPERATIONS_VERSION = 3;
export const hasMissingHpp = (order: Row) =>
  order.hppComplete === false || order.items?.some((item: any) => item.hppMissing === true);
export const tracksStock = (ingredient: Row) => ingredient.trackStock === true;
/**
 * The business day runs until 05:00 WITA, so a night shift checked into after midnight still
 * counts for the date it started.
 */
export const businessDay = (d: Date = new Date()) =>
  localDate(new Date(d.getTime() - 5 * 60 * 60 * 1000));
/** Morning or night, from the start time in WITA: shifts starting before 14:00 are morning. */
export const shiftSlot = (sh: Row): 'pagi' | 'malam' =>
  (new Date(sh.startAt).getUTCHours() + 8) % 24 < 14 ? 'pagi' : 'malam';
export const localDate = (d: Date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: CAFE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
export const dateTime = (s: string) =>
  new Date(s).toLocaleString('id-ID', {
    timeZone: CAFE_TIMEZONE,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
export const labels: Record<string, string> = {
  menunggu_pembayaran: 'Menunggu bayar',
  diproses: 'Diterima',
  sedang_dibuat: 'Sedang dibuat',
  siap_disajikan: 'Siap disajikan',
  selesai: 'Selesai',
  dibatalkan: 'Dibatalkan',
  planned: 'Terjadwal',
  open: 'Berlangsung',
  closed: 'Selesai',
  kosong: 'Kosong',
  terisi: 'Terisi',
  reserved: 'Dipesan',
  dibersihkan: 'Dibersihkan',
  hadir: 'Hadir',
  sakit: 'Sakit',
  izin: 'Izin',
  libur: 'Libur',
  aktif: 'Aktif',
  nonaktif: 'Nonaktif',
  lunas: 'Lunas',
  belum_dibayar: 'Belum dibayar',
};
/** Start of the calendar day in WITA. */
export const localMidnight = (d: Date = new Date()) => new Date(localDate(d) + 'T00:00:00+08:00');
/** Who is still checked in from before today's midnight, in periods not yet paid. */
export const staleCheckIns = (s: State, now: Date = new Date()) => {
  const midnight = localMidnight(now);
  return s.attendance.filter((at) => {
    if (at.status !== 'hadir' || at.checkOut || new Date(at.checkIn) >= midnight) return false;
    const sh = s.shifts.find((x) => x.id === at.shiftId);
    return (
      !!sh &&
      sh.status !== 'closed' &&
      !s.payrolls.some((pr) => pr.period === sh.date.slice(0, 7) && pr.status === 'lunas')
    );
  });
};
/** Orders by date and then by shift, newest first; the order within a shift is kept. */
export function ordersByDate(s: State, orders: Row[]) {
  const earning = (list: Row[]) =>
    list.filter((o) => o.paid && o.status !== 'dibatalkan').reduce((v, o) => v + o.total, 0);
  return [...new Set(orders.map((o) => o.date as string))]
    .sort((a, b) => b.localeCompare(a))
    .map((date) => {
      const ofDate = orders.filter((o) => o.date === date);
      return {
        date,
        count: ofDate.length,
        total: earning(ofDate),
        shifts: [...new Set(ofDate.map((o) => o.shiftId as string))]
          .map((shiftId) => {
            const list = ofDate.filter((o) => o.shiftId === shiftId);
            return {
              shiftId,
              shift: s.shifts.find((sh) => sh.id === shiftId),
              orders: list,
              total: earning(list),
            };
          })
          .sort((a, b) => (b.shift?.startAt || '').localeCompare(a.shift?.startAt || '')),
      };
    });
}
/**
 * How an expense reaches the wages: rent and utilities are monthly, stock purchases are already in
 * HPP, and everything else belongs to the whole day rather than to whoever went shopping.
 */
export const expenseScope = (e: Row): 'harian' | 'bulanan' | 'stok' =>
  e.category === 'bahan_baku'
    ? 'stok'
    : e.category === 'sewa' || e.category === 'utilitas'
      ? 'bulanan'
      : 'harian';
/** The shifts of a date that share its daily expenses; a closed shift nobody worked is left out. */
export const shiftsSharingDay = (s: State, date: string) =>
  s.shifts
    .filter(
      (sh) =>
        sh.date === date &&
        (sh.status !== 'closed' ||
          s.attendance.some((at) => at.shiftId === sh.id && at.status === 'hadir') ||
          s.orders.some((o) => o.shiftId === sh.id && o.paid && o.status !== 'dibatalkan')),
    )
    .sort((a, b) => a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id));
export const dailyExpenses = (s: State, date: string) =>
  s.expenses
    .filter((e) => e.date === date && expenseScope(e) === 'harian')
    .reduce((v, e) => v + e.amount, 0);
/** An even share of the day's expenses; the earliest shifts carry any leftover rupiah. */
export function dailyExpenseShare(s: State, shift: Row) {
  const sharing = shiftsSharingDay(s, shift.date),
    index = sharing.findIndex((sh) => sh.id === shift.id);
  if (index < 0) return 0;
  const total = dailyExpenses(s, shift.date),
    each = Math.floor(total / sharing.length);
  return each + (index < total - each * sharing.length ? 1 : 0);
}
/** Lowers the monthly bonus only: monthly costs, and daily costs of a day without any shift. */
export const monthlyExpenses = (s: State, period: string) =>
  s.expenses
    .filter(
      (e) =>
        e.date.startsWith(period) &&
        (expenseScope(e) === 'bulanan' ||
          (expenseScope(e) === 'harian' && !shiftsSharingDay(s, e.date).length)),
    )
    .reduce((v, e) => v + e.amount, 0);
export function shiftTotals(s: State, shift: Row) {
  const orders = s.orders.filter(
    (o) => o.shiftId === shift.id && o.paid && o.status !== 'dibatalkan',
  );
  const revenue = orders.reduce((v, o) => v + o.subtotal - o.discount, 0);
  const hpp = orders.reduce((v, o) => v + o.hpp, 0);
  const hppComplete = orders.every((o) => !hasMissingHpp(o));
  const costs = dailyExpenseShare(s, shift);
  const profit = revenue - hpp - costs;
  const tiers = [
    ...(shift.status === 'closed' && Array.isArray(shift.snapshot?.tiers)
      ? shift.snapshot.tiers
      : s.tiers),
  ].sort((a, b) => a.min - b.min);
  const wage = tiers.find(
    (t) => Math.max(0, profit) >= t.min && (t.max === null || Math.max(0, profit) <= t.max),
  )?.wage;
  return {
    revenue,
    hpp,
    costs,
    profit,
    wage,
    orderCount: orders.length,
    tax: orders.reduce((v, o) => v + o.tax, 0),
    hppComplete,
  };
}
export function initial(owner: Actor): State {
  const s = blank();
  s.employees = [
    {
      id: owner.employeeId,
      name: owner.name,
      email: owner.email,
      role: 'admin',
      status: 'aktif',
      phone: '',
      joinedAt: localDate(),
    },
  ];
  s.categories = defaultCategories();
  s.settings = [
    {
      id: 'cafe',
      name: 'Winds Space',
      tagline: 'Coffee, Space & Conversation',
      logo: '',
      address: '',
      phone: '',
      whatsapp: '',
      taxPercentage: 10,
      bonusPercentage: 5,
      receiptFooter: 'Terima kasih sudah singgah di Winds Space.',
      printerWidth: '58',
      timezone: CAFE_TIMEZONE,
    },
  ];
  s.tiers = [
    { id: 'tier-1', min: 0, max: 200000, wage: 20000 },
    { id: 'tier-2', min: 200001, max: 300000, wage: 25000 },
    { id: 'tier-3', min: 300001, max: null, wage: 25000 },
  ];
  return s;
}

export function publicOrder(order: Row): Row {
  const { hpp, deductions, hppCorrection, ...safe } = order;
  return { ...safe, items: order.items.map(({ hppPerUnit, ...item }: any) => item) };
}
