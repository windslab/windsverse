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
] as const;
export type Kind = (typeof kinds)[number];
export type State = Record<Kind, Row[]>;
export type Actor = {
  id: string;
  employeeId: string;
  name: string;
  role: 'admin' | 'karyawan';
  email: string;
  sessionHash?: string;
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
export const OPERATIONS_VERSION = 2;
export const hasMissingHpp = (order: Row) =>
  order.hppComplete === false || order.items?.some((item: any) => item.hppMissing === true);
export const tracksStock = (ingredient: Row) => ingredient.trackStock === true;
/**
 * The business day runs until 05:00 WITA, so a night shift checked into after midnight still
 * counts for the date it started.
 */
export const businessDay = (d: Date = new Date()) =>
  localDate(new Date(d.getTime() - 5 * 60 * 60 * 1000));
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
export function shiftTotals(s: State, shift: Row) {
  const orders = s.orders.filter(
    (o) => o.shiftId === shift.id && o.paid && o.status !== 'dibatalkan',
  );
  const revenue = orders.reduce((v, o) => v + o.subtotal - o.discount, 0);
  const hpp = orders.reduce((v, o) => v + o.hpp, 0);
  const hppComplete = orders.every((o) => !hasMissingHpp(o));
  const costs = s.expenses
    .filter((e) => e.shiftId === shift.id && e.category !== 'bahan_baku')
    .reduce((v, e) => v + e.amount, 0);
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
