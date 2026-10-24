'use client';
import QRCode from 'qrcode';
import BackupPanel from './backup-panel';
import AuditPanel from './audit-panel';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Calculator,
  QrCode,
  Activity,
  LayoutDashboard,
  ShoppingCart,
  ClipboardList,
  CalendarDays,
  Users,
  Clock,
  Wallet,
  TrendingUp,
  Coffee,
  BookOpen,
  MessageCircle,
  StickyNote,
  Settings,
  Grid2X2,
  Package,
  ChefHat,
  LogOut,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Check,
  Trash2,
  Pencil,
  RefreshCw,
  Printer,
  Download,
  Upload,
  ShieldCheck,
  ArrowUpRight,
  Sun,
  Moon,
  Utensils,
  Receipt,
  CircleHelp,
} from 'lucide-react';
import {
  Sidebar,
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import {
  blank,
  money,
  localDate,
  dateTime,
  labels,
  shiftTotals,
  CAFE_TIMEZONE,
  hasMissingHpp as missingHpp,
  OPERATIONS_VERSION,
  type State,
  type Row,
  type Actor,
  type Kind,
} from '@/lib/model';
import { BrandMark } from '@/components/brand-mark';
import {
  ingredientUnitCost,
  hasPackageCost,
  preciseMoney,
  ingredientQuantity,
} from '@/lib/ingredient-cost';

type Field = {
  key: string;
  label: string;
  type?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  default?: any;
  step?: string;
  hint?: string;
};
const opts = (values: string[]) =>
  values.map((v) => ({ value: v, label: labels[v] || v.replaceAll('_', ' ') }));
function Choice({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label?: string;
}) {
  return (
    <Select value={value || '__empty'} onValueChange={(v) => onChange(v === '__empty' ? '' : v)}>
      <SelectTrigger className="w-full" aria-label={label || 'Pilih opsi'}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value || '__empty'} value={o.value || '__empty'}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Badge({ value }: { value: string }) {
  return <span className={'badge ' + value}>{labels[value] || value}</span>;
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <Coffee size={28} />
      <p>{children}</p>
    </div>
  );
}
function Metric({
  label,
  value,
  detail,
  icon: Icon = TrendingUp,
}: {
  label: string;
  value: string;
  detail: string;
  icon?: any;
}) {
  return (
    <div className="metric">
      <div className="row between">
        <span>{label}</span>
        <Icon size={19} />
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
const fmtDate = (value: string) =>
  new Date(value + 'T12:00:00+08:00').toLocaleDateString('id-ID', {
    timeZone: CAFE_TIMEZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
const nav = [
  {
    group: 'OPERASIONAL',
    items: [
      ['dashboard', 'Ringkasan', LayoutDashboard],
      ['pos', 'Kasir POS', ShoppingCart],
      ['orders', 'Pesanan', ClipboardList],
      ['tables', 'Denah meja', Grid2X2],
    ],
  },
  {
    group: 'TIM & KEUANGAN',
    items: [
      ['roster', 'Kalender shift', CalendarDays],
      ['attendance', 'Absensi', Clock],
      ['expenses', 'Pengeluaran', Receipt],
      ['payroll', 'Gaji & bonus', Wallet],
      ['financials', 'Laporan keuangan', TrendingUp],
      ['employees', 'Karyawan', Users],
    ],
  },
  {
    group: 'KATALOG & RUANG TIM',
    items: [
      ['products', 'Menu kafe', Coffee],
      ['recipes', 'Resep & HPP', ChefHat],
      ['ingredients', 'Bahan baku', Package],
      ['books', 'Koleksi buku', BookOpen],
      ['notes', 'Catatan tim', StickyNote],
      ['feedback', 'Kritik & saran', MessageCircle],
      ['settings', 'Pengaturan', Settings],
    ],
  },
];
const restricted = ['financials', 'employees', 'products', 'feedback', 'settings'];
export default function Cafe({ name }: { name: string }) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [s, setS] = useState<State>(blank()),
    [actor, setActor] = useState<Actor | null>(null),
    [setup, setSetup] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [synced, setSynced] = useState(''),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState('dashboard'),
    [search, setSearch] = useState(''),
    [modal, setModal] = useState<any>(null),
    [confirm, setConfirm] = useState<any>(null),
    [receipt, setReceipt] = useState<Row | null>(null),
    [week, setWeek] = useState(0),
    [period, setPeriod] = useState(localDate().slice(0, 7)),
    [reportFrom, setReportFrom] = useState(localDate().slice(0, 7) + '-01'),
    [reportTo, setReportTo] = useState(localDate()),
    [category, setCategory] = useState('all'),
    [orderFilter, setOrderFilter] = useState('all'),
    [cart, setCart] = useState<any[]>([]),
    [discount, setDiscount] = useState(0),
    [taxEnabled, setTaxEnabled] = useState(true),
    [paymentMethod, setPaymentMethod] = useState('tunai'),
    [cashPaid, setCashPaid] = useState(''),
    [orderType, setOrderType] = useState('takeaway'),
    [tableId, setTableId] = useState(''),
    [audit, setAudit] = useState<any[]>([]);
  const revision = useRef(0),
    mutation = useRef(false),
    pending = useRef<any>(null),
    initialLoad = useRef(true);
  const admin = actor?.role === 'admin';
  const canEditKind = (kind: Kind) =>
    admin || ['ingredients', 'recipes', 'expenses', 'books'].includes(kind);
  const openShiftNow = s.shifts.find((sh) => sh.status === 'open');
  const isHistoricalShift = (sh: Row) =>
    sh.status === 'closed' || (sh.status === 'planned' && new Date(sh.endAt) <= new Date());
  const historicalPosShift =
    tab === 'pos'
      ? [...s.shifts]
          .filter(
            (sh) => isHistoricalShift(sh) && (admin || sh.employeeIds.includes(actor?.employeeId)),
          )
          .sort((a, b) => b.startAt.localeCompare(a.startAt))[0]
      : undefined;
  const current = openShiftNow || historicalPosShift;
  const settings = s.settings[0];
  const today = localDate();
  const attendanceShifts = s.shifts.filter(
    (sh) =>
      (sh.date === today || (sh.date < today && localDate(new Date(sh.endAt)) === today)) &&
      (admin || sh.employeeIds.includes(actor?.employeeId)),
  );
  const missingRecipeProducts = s.products.filter(
    (p) => !s.recipes.some((r) => r.productId === p.id),
  );
  const hasMissingHpp = missingHpp;
  const incompleteHppOrders = s.orders.filter(
    (o) => o.paid && o.status !== 'dibatalkan' && hasMissingHpp(o),
  );
  const categoryName = (id: string) => s.categories.find((c) => c.id === id)?.name || id;
  const categoryOptions = () =>
    [...s.categories]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map((c) => ({ value: c.id, label: c.name }));
  const employee = (id: string) => s.employees.find((e) => e.id === id)?.name || 'Karyawan';
  const shiftName = (id: string) => s.shifts.find((sh) => sh.id === id)?.name || 'Umum';
  async function load() {
    try {
      const r = await fetch('/api/cafe', { cache: 'no-store' });
      const d: any = await r.json();
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) {
          setActor(null);
          setS(blank());
          window.location.replace('/login');
        }
        throw Error(d.error);
      }
      if (!mutation.current && d.revision >= revision.current) {
        revision.current = d.revision;
        setS(d.state);
        setActor(d.actor);
        setSetup(d.setup);
      }
      setError('');
      setSynced(new Date().toLocaleTimeString('id-ID', { timeZone: CAFE_TIMEZONE }));
      setLoading(false);
      initialLoad.current = false;
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    let gone = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!document.hidden && !mutation.current) await load();
      if (!gone) timer = setTimeout(poll, 3000);
    };
    timer = setTimeout(poll, 3000);
    return () => {
      gone = true;
      clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    if (tab !== 'pos' || !actor) return;
    const send = (active: boolean) =>
      fetch('/api/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
        keepalive: !active,
      }).catch(() => {});
    void send(true);
    const timer = setInterval(() => {
      if (!document.hidden) void send(true);
    }, 10_000);
    return () => {
      clearInterval(timer);
      void send(false);
    };
  }, [tab, actor?.employeeId]);
  useEffect(() => {
    if (actor && !admin && restricted.includes(tab)) setTab('dashboard');
  }, [actor, tab, admin]);
  async function act(action: string, payload: any = {}, success = 'Tersimpan') {
    if (mutation.current) return false;
    mutation.current = true;
    setBusy(true);
    const identity = JSON.stringify({ action, payload });
    const key = pending.current?.identity === identity ? pending.current.key : crypto.randomUUID();
    pending.current = { identity, key };
    try {
      const r = await fetch('/api/cafe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload, revision: revision.current, key }),
      });
      const d: any = await r.json();
      if (!r.ok) {
        pending.current = null;
        throw Error(d.error);
      }
      pending.current = null;
      mutation.current = false;
      await load();
      if (success) toast.success(success);
      return d.result || true;
    } catch (e: any) {
      toast.error(e.message);
      mutation.current = false;
      await load();
      return false;
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }
  async function loadAccounts() {
    try {
      const r = await fetch('/api/auth?accounts=1', { cache: 'no-store' }),
        d: any = await r.json();
      if (!r.ok) throw Error(d.error);
      setAccounts(d.accounts);
    } catch (e: any) {
      toast.error(e.message);
    }
  }
  useEffect(() => {
    if (admin && tab === 'employees') void loadAccounts();
  }, [admin, tab]);
  async function authAction(payload: any) {
    setBusy(true);
    try {
      const r = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
        d: any = await r.json();
      if (!r.ok) throw Error(d.error);
      if (d.relogin) {
        window.location.replace('/login');
        return true;
      }
      await loadAccounts();
      toast.success(
        payload.action === 'revoke' ? 'Akses dicabut dan sesi diakhiri' : 'ID dan PIN tersimpan',
      );
      return true;
    } catch (e: any) {
      toast.error(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const accessEditor = (e: Row, revoke = false) => {
    const account = accounts.find((x) => x.employeeId === e.id);
    setModal({
      title: (revoke ? 'Cabut akses: ' : 'Atur ID & PIN: ') + e.name,
      description: revoke
        ? 'Akun tidak dapat masuk sampai admin membuat PIN baru. Semua sesi akun ini akan berakhir.'
        : 'Bagikan ID dan PIN secara pribadi kepada pemilik akun. PIN tidak dapat dilihat kembali. Mengganti PIN mengakhiri semua sesi akun ini.',
      fields: [
        ...(revoke
          ? []
          : [
              {
                key: 'loginId',
                label: 'ID login (3–32 karakter)',
                required: true,
                hint: 'Huruf, angka, titik, _ atau -. Tidak membedakan huruf besar/kecil.',
              },
              { key: 'pin', label: 'PIN baru (8–12 angka)', type: 'password', required: true },
              { key: 'confirmPin', label: 'Ulangi PIN baru', type: 'password', required: true },
            ]),
        {
          key: 'currentPin',
          label: 'PIN admin kamu untuk konfirmasi',
          type: 'password',
          required: true,
        },
      ],
      initial: { loginId: account?.loginId || '' },
      submit: (v: any) => {
        if (!revoke && v.pin !== v.confirmPin) {
          toast.error('Konfirmasi PIN belum sama.');
          return false;
        }
        return authAction({ action: revoke ? 'revoke' : 'credentials', employeeId: e.id, ...v });
      },
    });
  };
  async function logout() {
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      });
      if (!r.ok) throw Error('Belum berhasil keluar. Coba lagi.');
      window.location.replace('/login');
    } catch (e: any) {
      toast.error(e.message);
    }
  }
  // Agent tools operate through the same authorized API and expose read-only navigation.
  useEffect(() => {
    const mc = (document as any).modelContext;
    if (!mc?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      Promise.resolve(
        mc.registerTool(
          {
            name: 'winds_open_view',
            title: 'Buka tampilan Winds Space',
            description: 'Buka tampilan operasional tanpa mengubah data.',
            inputSchema: {
              type: 'object',
              properties: {
                view: { type: 'string', enum: nav.flatMap((g) => g.items.map((i) => i[0])) },
              },
              required: ['view'],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true, untrustedContentHint: false },
            execute: async (input: unknown) => {
              const view = (input as any)?.view;
              if (typeof view !== 'string' || !nav.some((g) => g.items.some((i) => i[0] === view)))
                throw Error('Tampilan tidak valid.');
              if (!admin && restricted.includes(view)) throw Error('Akses ditolak.');
              setTab(view);
              return { view };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => lifecycle.abort();
  }, [admin]);

  const fields = (kind: Kind): Field[] => {
    const employees = s.employees
      .filter((e) => e.status === 'aktif')
      .map((e) => ({ value: e.id, label: e.name }));
    const shifts = [
      { value: '', label: 'Biaya umum — tidak dibebankan ke shift' },
      ...[...s.shifts]
        .filter(
          (sh) =>
            !s.payrolls.some((pr) => pr.period === sh.date.slice(0, 7) && pr.status === 'lunas'),
        )
        .sort((a, b) => b.startAt.localeCompare(a.startAt))
        .map((sh) => ({
          value: sh.id,
          label:
            sh.name +
            ' · ' +
            sh.date +
            (s.payrolls.some((pr) => pr.period === sh.date.slice(0, 7) && pr.status === 'lunas')
              ? ' · Periode terkunci'
              : sh.status === 'closed'
                ? ' · Selesai'
                : ''),
        })),
    ];
    const map: Partial<Record<Kind, Field[]>> = {
      categories: [
        { key: 'name', label: 'Nama kategori', required: true },
        { key: 'sortOrder', label: 'Urutan tampil', type: 'number', default: 0 },
      ],
      products: [
        { key: 'name', label: 'Nama menu', required: true },
        { key: 'price', label: 'Harga jual (Rp)', type: 'number', required: true },
        {
          key: 'category',
          label: 'Kategori',
          type: 'select',
          options: categoryOptions(),
          default: s.categories[0]?.id || '',
        },
        { key: 'description', label: 'Deskripsi', type: 'textarea' },
        {
          key: 'status',
          label: 'Ketersediaan',
          type: 'select',
          options: opts(['tersedia', 'habis']),
          default: 'tersedia',
        },
        { key: 'sortOrder', label: 'Urutan tampil', type: 'number', default: 0 },
        { key: 'image', label: 'Foto menu', type: 'image' },
      ],
      ingredients: [
        { key: 'name', label: 'Nama bahan', required: true },
        {
          key: 'unit',
          label: 'Satuan pemakaian resep',
          type: 'select',
          required: true,
          default: 'gram',
          options: [...new Set(['ml', 'gram', 'pcs', ...s.ingredients.map((i) => i.unit)])].map(
            (unit) => ({ value: unit, label: unit }),
          ),
          hint: 'Contoh: susu memakai ml, bubuk memakai gram, cup memakai pcs. Ukuran kemasan diisi terpisah.',
        },
        {
          key: 'packageQuantity',
          label: 'Isi per kemasan (dalam satuan pemakaian)',
          type: 'number',
          step: 'any',
          required: true,
          default: 1,
          hint: 'Contoh: 1 pack susu = 1000 ml; 1 bungkus cup = 25 pcs.',
        },
        {
          key: 'packagePrice',
          label: 'Harga beli per kemasan (Rp)',
          type: 'number',
          step: 'any',
          required: true,
          hint: 'Harga satu pack / bungkus, bukan harga per ml atau per cup.',
        },
        {
          key: 'trackStock',
          label: 'Lacak persediaan bahan ini',
          type: 'boolean',
          default: false,
          hint: 'Opsional. Jika nonaktif, stok tidak membatasi kasir dan tidak dipotong otomatis; HPP tetap dihitung.',
        },
        {
          key: 'stock',
          label: 'Stok saat ini (dalam satuan pemakaian)',
          type: 'number',
          step: '0.001',
          default: 0,
          hint: 'Contoh: 2 pack susu @1000 ml = stok 2000 ml; 2 bungkus cup @25 pcs = stok 50 pcs.',
        },
        {
          key: 'minStock',
          label: 'Stok minimum (dalam satuan pemakaian)',
          type: 'number',
          step: '0.001',
          default: 0,
        },
      ],
      recipes: [
        {
          key: 'productId',
          label: 'Menu',
          type: 'select',
          required: true,
          options: s.products.map((p) => ({ value: p.id, label: p.name })),
        },
        { key: 'ingredients', label: 'Komposisi resep', type: 'recipe', default: [] },
      ],
      tables: [
        { key: 'number', label: 'Nomor meja', required: true },
        { key: 'capacity', label: 'Kapasitas', type: 'number', default: 4 },
        { key: 'zone', label: 'Area', default: 'Indoor', required: true },
        {
          key: 'status',
          label: 'Status',
          type: 'select',
          options: opts(['kosong', 'terisi', 'reserved', 'dibersihkan']),
          default: 'kosong',
        },
        { key: 'notes', label: 'Catatan', type: 'textarea' },
        { key: 'image', label: 'Foto meja', type: 'image' },
      ],
      employees: [
        { key: 'name', label: 'Nama lengkap', required: true },
        { key: 'email', label: 'Email kontak (opsional)', type: 'email' },
        {
          key: 'role',
          label: 'Hak akses',
          type: 'select',
          options: opts(['admin', 'karyawan']),
          default: 'karyawan',
        },
        {
          key: 'status',
          label: 'Status',
          type: 'select',
          options: opts(['aktif', 'nonaktif']),
          default: 'aktif',
        },
        { key: 'phone', label: 'Telepon' },
        { key: 'joinedAt', label: 'Tanggal bergabung', type: 'date', default: localDate() },
      ],
      shifts: [
        { key: 'name', label: 'Nama shift', required: true, default: 'Shift pagi' },
        { key: 'startAt', label: 'Mulai (WITA)', type: 'datetime-local', required: true },
        { key: 'endAt', label: 'Selesai (WITA)', type: 'datetime-local', required: true },
        {
          key: 'employeeIds',
          label: 'Karyawan yang dijadwalkan',
          type: 'multi',
          options: employees,
          default: [],
        },
      ],
      expenses: [
        { key: 'title', label: 'Nama biaya', required: true },
        { key: 'amount', label: 'Nilai biaya (Rp)', type: 'number', required: true },
        {
          key: 'category',
          label: 'Kategori',
          type: 'select',
          options: opts(['operasional', 'bahan_baku', 'sewa', 'utilitas', 'lainnya']),
          default: 'operasional',
        },
        { key: 'date', label: 'Tanggal', type: 'date', default: localDate(), required: true },
        {
          key: 'shiftId',
          label: 'Alokasi',
          type: 'select',
          options: shifts,
          default: current?.id || '',
        },
        {
          key: 'notes',
          label: 'Keterangan',
          type: 'textarea',
          hint: 'Pembelian bahan baku dicatat sebagai arus kas, tidak dikurangi lagi dari laba yang sudah memakai HPP.',
        },
      ],
      books: [
        { key: 'title', label: 'Judul', required: true },
        { key: 'author', label: 'Penulis', required: true },
        { key: 'isbn', label: 'ISBN' },
        { key: 'category', label: 'Kategori', default: 'fiksi', required: true },
        { key: 'shelfLocation', label: 'Lokasi rak', default: 'Rak A', required: true },
        { key: 'totalCopies', label: 'Jumlah eksemplar', type: 'number', default: 1 },
        { key: 'publisher', label: 'Penerbit' },
        { key: 'year', label: 'Tahun' },
        { key: 'synopsis', label: 'Sinopsis', type: 'textarea' },
        { key: 'image', label: 'Sampul', type: 'image' },
        {
          key: 'status',
          label: 'Status',
          type: 'select',
          options: opts(['tersedia', 'hilang', 'pemeliharaan']),
          default: 'tersedia',
        },
      ],
      settings: [
        { key: 'name', label: 'Nama kafe', required: true },
        {
          key: 'logo',
          label: 'Logo Winds Space',
          type: 'image',
          hint: 'Tampil di halaman masuk, area staf, dan menu pelanggan.',
        },
        { key: 'tagline', label: 'Tagline' },
        { key: 'address', label: 'Alamat' },
        { key: 'phone', label: 'Telepon' },
        { key: 'whatsapp', label: 'WhatsApp' },
        { key: 'taxPercentage', label: 'Pajak (%)', type: 'number', default: 10 },
        { key: 'bonusPercentage', label: 'Bonus laba bulanan (%)', type: 'number', default: 5 },
        { key: 'receiptFooter', label: 'Pesan struk', type: 'textarea' },
        {
          key: 'printerWidth',
          label: 'Lebar kertas struk (mm)',
          type: 'select',
          options: opts(['58', '80']),
          default: '58',
        },
        {
          key: 'timezone',
          label: 'Zona waktu',
          type: 'select',
          options: [{ value: CAFE_TIMEZONE, label: 'Pangkep · WITA (UTC+8)' }],
          default: CAFE_TIMEZONE,
        },
      ],
    };
    return map[kind] || [];
  };
  const edit = (kind: Kind, row?: Row) =>
    setModal({
      title:
        (row ? 'Ubah ' : 'Tambah ') +
        ({
          categories: 'kategori menu',
          products: 'menu',
          ingredients: 'bahan',
          recipes: 'resep',
          tables: 'meja',
          employees: 'karyawan',
          shifts: 'jadwal shift',
          expenses: 'biaya',
          books: 'buku',
          settings: 'pengaturan',
        }[kind as string] || kind),
      fields: [
        ...fields(kind),
        ...(row ? [{ key: '_auditReason', label: 'Alasan perubahan', required: true }] : []),
      ],
      initial:
        kind === 'ingredients'
          ? {
              ...row,
              packageQuantity: row?.packageQuantity ?? 1,
              packagePrice: row?.packagePrice ?? row?.unitCost ?? '',
              _legacyPricing: !!row && !hasPackageCost(row),
            }
          : kind === 'settings'
            ? { ...row, timezone: CAFE_TIMEZONE }
            : row || {},
      submit: (data: any) => act('save', { kind, id: row?.id, data, reason: data._auditReason }),
    });
  const confirmRemove = (kind: Kind, row: Row, reason: string) =>
    setConfirm({
      title:
        'Hapus ' +
        (kind === 'shifts' ? 'shift ' + row.name : row.name || row.title || row.number || 'data') +
        '?',
      description:
        kind === 'shifts'
          ? 'Shift ini beserta pesanan, absensi, dan pengeluaran yang terkait akan dihapus dari laporan. Stok dari pesanan dikembalikan dan payroll yang belum dibayar pada periode ini perlu dihitung ulang. Shift tidak dapat dihapus jika payroll periode sudah dibayar. Tindakan dicatat dalam audit.'
          : 'Tindakan akan dicatat dalam riwayat audit. Data yang sudah terkait operasional dapat ditolak untuk menjaga riwayat.',
      run: () =>
        act(
          'delete',
          { kind, id: row.id, reason },
          kind === 'shifts' ? 'Shift dan catatan terkait dihapus' : 'Data dihapus',
        ),
    });
  const remove = (kind: Kind, row: Row) =>
    setModal({
      title: 'Hapus ' + (row.name || row.title || row.number || 'data'),
      description: 'Isi alasan penghapusan. Nilai sebelum penghapusan akan disimpan dalam audit.',
      fields: [{ key: 'reason', label: 'Alasan penghapusan', required: true }],
      initial: {},
      submit: async (v: any) => {
        confirmRemove(kind, row, v.reason);
        return true;
      },
    });
  const filtered = (rows: Row[], key = 'name') =>
    rows.filter((r) =>
      String(r[key] || '')
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  const controls = (kind: Kind, row: Row) => (
    <div className="row">
      {canEditKind(kind) && (
        <button
          className="icon-button"
          aria-label="Ubah"
          disabled={
            kind === 'expenses' &&
            s.payrolls.some(
              (pr) =>
                pr.status === 'lunas' &&
                (pr.period === row.date.slice(0, 7) ||
                  (row.shiftId &&
                    pr.period === s.shifts.find((sh) => sh.id === row.shiftId)?.date.slice(0, 7))),
            )
          }
          onClick={() => edit(kind, row)}
        >
          <Pencil size={16} />
        </button>
      )}
      {admin && (
        <button className="icon-button danger" aria-label="Hapus" onClick={() => remove(kind, row)}>
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
  const toolbar = (title: string, kind?: Kind, extra?: ReactNode) => (
    <div className="section-head">
      <div>
        <h2>{title}</h2>
      </div>
      <div className="row">
        {title === 'Kalender shift' && admin && (
          <button className="button primary" onClick={quickRoster}>
            <CalendarDays size={16} />
            Input cepat
          </button>
        )}
        {extra}
        {kind && canEditKind(kind) && (
          <button className="button primary" onClick={() => edit(kind)}>
            <Plus size={17} />
            Tambah
          </button>
        )}
      </div>
    </div>
  );
  const title =
    (nav.flatMap((g) => g.items).find((i) => i[0] === tab)?.[1] as string) || 'Ringkasan';
  const table = (
    heads: string[],
    rows: ReactNode[][],
    options: { className?: string; columns?: string[] } = {},
  ) => (
    <div className="panel table-panel">
      <Table className={options.className}>
        {options.columns && (
          <colgroup>
            {options.columns.map((width, i) => (
              <col key={i} style={{ width }} />
            ))}
          </colgroup>
        )}
        <TableHeader>
          <TableRow>
            {heads.map((h) => (
              <TableHead scope="col" key={h}>
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>
              {r.map((c, j) => (
                <TableCell key={j}>{c}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!rows.length && <Empty>Belum ada data untuk tampilan ini.</Empty>}
    </div>
  );
  const activeOrders = s.orders.filter((o) => !['selesai', 'dibatalkan'].includes(o.status));
  const totals = current && admin ? shiftTotals(s, current) : null;
  const eligibleOrderShifts = [...s.shifts]
    .filter((sh) => sh.status === 'open' || isHistoricalShift(sh))
    .filter((sh) => admin || sh.employeeIds.includes(actor?.employeeId))
    .sort((a, b) => b.startAt.localeCompare(a.startAt));
  const [orderShiftId, setOrderShiftId] = useState('');
  const selectedOrderShift =
    eligibleOrderShifts.find((sh) => sh.id === orderShiftId) ||
    eligibleOrderShifts.find((sh) => sh.status === 'open') ||
    eligibleOrderShifts[0];
  const checkout = async (paid: boolean) => {
    const sh = eligibleOrderShifts.find((item) => item.id === orderShiftId) || selectedOrderShift;
    if (!sh) {
      toast.error(
        'Tidak ada jadwal shift yang dapat dipilih. Hubungi admin untuk memastikan jadwalmu.',
      );
      return;
    }
    if (!paid && sh.status !== 'open') {
      toast.error('Pesanan yang belum lunas hanya dapat dicatat pada shift berjalan.');
      return;
    }
    const result = await act(
      'order.create',
      {
        shiftId: sh.id,
        items: cart.map((i) => ({ productId: i.id, quantity: i.quantity, notes: i.notes || '' })),
        discount,
        taxEnabled,
        paymentMethod,
        cashPaid: Number(cashPaid || 0),
        orderType,
        tableId,
        paid,
      },
      'Pesanan tercatat',
    );
    if (result) {
      setCart([]);
      setDiscount(0);
      setCashPaid('');
      if (result.id) setReceipt(result);
    }
  };
  const subtotal = cart.reduce((v, i) => v + i.price * i.quantity, 0),
    tax = taxEnabled
      ? Math.round((Math.max(0, subtotal - discount) * (settings?.taxPercentage || 0)) / 100)
      : 0,
    total = Math.max(0, subtotal - discount) + tax;
  const payOrder = (o: Row) =>
    setModal({
      title: 'Terima pembayaran ' + o.no,
      fields: [
        {
          key: 'paymentMethod',
          label: 'Metode',
          type: 'select',
          options: opts(['tunai', 'qris', 'transfer', 'ewallet']),
          default: 'tunai',
        },
        { key: 'cashPaid', label: 'Uang diterima (Rp)', type: 'number', default: o.total },
      ],
      initial: {},
      submit: (data: any) => act('order.pay', { id: o.id, ...data }),
    });
  const borrow = (b: Row) =>
    setModal({
      title: 'Pinjam ' + b.title,
      fields: [
        { key: 'borrowerName', label: 'Nama peminjam', required: true },
        { key: 'borrowerContact', label: 'Kontak / nomor meja', required: true },
        {
          key: 'borrowerType',
          label: 'Peminjam',
          type: 'select',
          options: opts(['pengunjung', 'staf']),
          default: 'pengunjung',
        },
        {
          key: 'dueDate',
          label: 'Batas pengembalian',
          type: 'date',
          default: localDate(new Date(Date.now() + 3 * 86400000)),
          required: true,
        },
        { key: 'notes', label: 'Catatan', type: 'textarea' },
      ],
      initial: {},
      submit: (data: any) => act('book.borrow', { bookId: b.id, ...data }),
    });
  const startOfWeek = new Date(localDate() + 'T12:00:00+08:00');
  startOfWeek.setUTCDate(startOfWeek.getUTCDate() - ((startOfWeek.getUTCDay() + 6) % 7) + week * 7);
  const days = Array.from({ length: 7 }, (_, i) =>
    localDate(new Date(startOfWeek.getTime() + i * 86400000)),
  );
  const quickRoster = () => {
    const employees = s.employees
      .filter((e) => e.status === 'aktif')
      .map((e) => ({ value: e.id, label: e.name }));
    setModal({
      title: 'Input cepat jadwal shift',
      description:
        'Pilih rentang untuk satu kelompok, atau rotasi agar kelompok pagi dan malam otomatis bertukar setiap minggu. Hari libur yang dipilih akan dilewati.',
      fields: [
        {
          key: 'mode',
          label: 'Pola jadwal',
          type: 'select',
          options: [
            { value: 'rentang', label: 'Satu shift dalam rentang tanggal' },
            { value: 'rotasi', label: 'Rotasi pagi ↔ malam setiap minggu' },
          ],
          required: true,
          default: 'rotasi',
        },
        {
          key: 'startDate',
          label: 'Tanggal mulai',
          type: 'date',
          required: true,
          default: days[0],
        },
        {
          key: 'endDate',
          label: 'Tanggal selesai',
          type: 'date',
          required: true,
          default: days[6],
        },
        {
          key: 'employeeIds',
          label: 'Karyawan / kelompok A',
          type: 'multi',
          options: employees,
          required: true,
        },
        {
          key: 'rotationEmployeeIds',
          label: 'Kelompok B (opsional)',
          type: 'multi',
          options: employees,
          hint: 'Jika kosong, kelompok A sendiri berganti dari pagi ke malam setiap minggu.',
        },
        { key: 'shiftAName', label: 'Nama shift pertama', required: true, default: 'Shift pagi' },
        {
          key: 'shiftAStart',
          label: 'Mulai shift pertama',
          type: 'time',
          required: true,
          default: '08:00',
        },
        {
          key: 'shiftAEnd',
          label: 'Selesai shift pertama',
          type: 'time',
          required: true,
          default: '16:00',
        },
        { key: 'shiftBName', label: 'Nama shift kedua', required: true, default: 'Shift malam' },
        {
          key: 'shiftBStart',
          label: 'Mulai shift kedua',
          type: 'time',
          required: true,
          default: '16:00',
        },
        {
          key: 'shiftBEnd',
          label: 'Selesai shift kedua',
          type: 'time',
          required: true,
          default: '23:00',
        },
        {
          key: 'offDays',
          label: 'Hari libur — tidak dibuat jadwal',
          type: 'multi',
          options: [
            { value: '1', label: 'Senin' },
            { value: '2', label: 'Selasa' },
            { value: '3', label: 'Rabu' },
            { value: '4', label: 'Kamis' },
            { value: '5', label: 'Jumat' },
            { value: '6', label: 'Sabtu' },
            { value: '0', label: 'Minggu' },
          ],
        },
      ],
      initial: {
        mode: 'rotasi',
        startDate: days[0],
        endDate: days[6],
        employeeIds: [],
        rotationEmployeeIds: [],
        shiftAName: 'Shift pagi',
        shiftAStart: '08:00',
        shiftAEnd: '16:00',
        shiftBName: 'Shift malam',
        shiftBStart: '16:00',
        shiftBEnd: '23:00',
        offDays: [],
      },
      submit: (data: any) => act('roster.bulk', data, 'Jadwal cepat berhasil dibuat'),
    });
  };
  const correctAttendance = (at?: Row) =>
    setModal({
      title: at ? 'Koreksi absensi · ' + employee(at.employeeId) : 'Koreksi / tambah absensi',
      description:
        'Admin dapat menambah atau mengoreksi absensi di shift lampau. Perubahan akan menghitung ulang snapshot dan payroll yang belum dibayar; periode yang sudah dibayar terkunci.',
      fields: [
        {
          key: 'shiftId',
          label: 'Shift',
          type: 'select',
          options: s.shifts.map((sh) => ({ value: sh.id, label: sh.name + ' · ' + sh.date })),
          required: true,
        },
        {
          key: 'employeeId',
          label: 'Karyawan',
          type: 'select',
          options: s.employees.map((e) => ({ value: e.id, label: e.name })),
          required: true,
        },
        {
          key: 'status',
          label: 'Status',
          type: 'select',
          options: opts(['hadir', 'sakit', 'izin', 'libur']),
          default: 'hadir',
        },
        { key: 'checkIn', label: 'Jam check-in WITA (wajib jika hadir)', type: 'datetime-local' },
        {
          key: 'checkOut',
          label: 'Jam check-out WITA (boleh kosong jika belum check-out)',
          type: 'datetime-local',
        },
        { key: 'reason', label: 'Alasan perubahan', required: true },
      ],
      initial: at
        ? { ...at, reason: '' }
        : {
            shiftId: current?.id || s.shifts.find((sh) => sh.date === today)?.id || '',
            status: 'hadir',
            checkIn: '',
            checkOut: '',
          },
      submit: (data: any) =>
        act(
          'attendance.correct',
          { ...data, id: at?.id },
          'Absensi dikoreksi; payroll yang belum dibayar dihitung ulang',
        ),
    });
  const correctOrder = (o: Row) =>
    setModal({
      title: 'Koreksi pemasukan · ' + o.no,
      description:
        'Koreksi diskon, pajak, atau metode pembayaran. Total transaksi dan laporan shift akan diperbarui. Jika nilai tunai berubah, selesaikan selisih di luar aplikasi.',
      fields: [
        { key: 'discount', label: 'Diskon (Rp)', type: 'number', required: true },
        { key: 'taxEnabled', label: 'Pajak berlaku', type: 'boolean' },
        {
          key: 'paymentMethod',
          label: 'Metode pembayaran',
          type: 'select',
          options: opts(['tunai', 'qris', 'transfer', 'ewallet']),
        },
        { key: 'cashPaid', label: 'Uang diterima (Rp)', type: 'number', required: true },
        { key: 'reason', label: 'Alasan koreksi', required: true },
      ],
      initial: {
        discount: o.discount,
        taxEnabled: o.taxEnabled ?? o.tax > 0,
        paymentMethod: o.paymentMethod,
        cashPaid: o.cashPaid,
        reason: '',
      },
      submit: (data: any) =>
        act(
          'order.correct',
          { ...data, id: o.id },
          'Transaksi dikoreksi; payroll yang belum dibayar perlu dihitung ulang',
        ),
    });
  const completeHpp = (o: Row) => {
    const flagged = o.items
        .map((item: any, index: number) => (item.hppMissing ? index : -1))
        .filter((index: number) => index >= 0),
      indices: number[] = flagged.length ? flagged : o.items.map((_: any, index: number) => index);
    const initial: Record<string, any> = { reason: '', confirmed: false };
    const hppFields: Field[] = indices.map((index) => {
      const item = o.items[index],
        recipe = s.recipes.find((r) => r.productId === item.productId);
      initial['hpp_' + index] = recipe
        ? Math.round(
            recipe.ingredients.reduce(
              (sum: number, r: any) =>
                sum +
                ingredientUnitCost(s.ingredients.find((ing) => ing.id === r.ingredientId)) *
                  r.amount,
              0,
            ),
          )
        : '';
      return {
        key: 'hpp_' + index,
        label: item.name + ' · HPP per porsi (Rp)',
        type: 'number',
        required: true,
        default: '',
        hint:
          item.quantity +
          ' porsi pada transaksi. ' +
          (recipe
            ? 'Nilai awal berasal dari resep saat ini; sesuaikan dengan modal sebenarnya saat transaksi.'
            : 'Masukkan modal sebenarnya saat transaksi, bukan harga jual.'),
      };
    });
    setModal({
      title: 'Lengkapi HPP · ' + o.no,
      description:
        'Melengkapi HPP historis yang belum ada. Harga jual dan pembayaran pelanggan tetap sama. Tidak memotong stok ulang. Perubahan menghitung ulang laba serta gaji dengan tier historis dan membatalkan payroll yang belum dibayar.',
      fields: [
        ...hppFields,
        { key: 'reason', label: 'Alasan / sumber modal historis', required: true },
        {
          key: 'confirmed',
          label: 'Saya sudah memeriksa modal per porsi; nilai Rp0 memang benar bila diisi nol',
          type: 'boolean',
          default: false,
        },
      ],
      initial,
      submit: (v: any) => {
        if (!v.confirmed) {
          toast.error('Konfirmasikan HPP yang sudah diperiksa.');
          return false;
        }
        return act(
          'order.hpp.correct',
          {
            id: o.id,
            reason: v.reason,
            items: indices.map((index) => ({ index, hppPerUnit: Number(v['hpp_' + index]) })),
          },
          'HPP dilengkapi; laba dan estimasi gaji diperbarui',
        );
      },
    });
  };
  const deleteOrder = (o: Row) =>
    setModal({
      title: 'Hapus transaksi · ' + o.no,
      description:
        'Transaksi akan hilang dari laporan keuangan. Stok resep akan dikembalikan ke sistem. Jika pembayaran nyata sudah diterima, lakukan pengembalian uang secara manual di luar aplikasi. Periode gaji yang sudah dibayar terkunci.',
      fields: [{ key: 'reason', label: 'Alasan penghapusan', required: true }],
      initial: {},
      submit: async (v: any) => {
        setConfirm({
          title: 'Konfirmasi hapus transaksi?',
          description:
            'Tindakan dicatat dalam audit. Pastikan transaksi ini memang salah input atau transaksi uji coba.',
          run: () =>
            act('order.delete', { id: o.id, reason: v.reason }, 'Transaksi dihapus dari laporan'),
        });
        return true;
      },
    });
  const deleteAttendance = (at: Row) =>
    setModal({
      title: 'Hapus absensi · ' + employee(at.employeeId),
      description:
        'Absensi ini tidak lagi dihitung dalam penggajian shift. Jika payroll belum dibayar, payroll akan perlu dihitung ulang. Periode yang sudah dibayar terkunci.',
      fields: [{ key: 'reason', label: 'Alasan penghapusan', required: true }],
      initial: {},
      submit: async (v: any) => {
        setConfirm({
          title: 'Konfirmasi hapus absensi?',
          description:
            'Penghapusan dicatat dalam audit. Pastikan karyawan memang masuk shift yang salah atau absensi ini merupakan data uji coba.',
          run: () =>
            act(
              'attendance.delete',
              { id: at.id, reason: v.reason },
              'Absensi dihapus; periksa ulang payroll',
            ),
        });
        return true;
      },
    });
  let content: ReactNode = null;
  if (tab === 'dashboard')
    content = (
      <>
        <div className="welcome">
          <div>
            <p className="eyebrow">RUANG OPERASIONAL / {localDate()}</p>
            <h1>Setiap shift, terlihat jelas.</h1>
            <p>Pantau pesanan dan ritme kerja tim hari ini.</p>
          </div>
          <button className="button primary" onClick={() => setTab('pos')}>
            <Plus size={18} />
            Pesanan baru
          </button>
        </div>
        <div className="metrics">
          <Metric
            label="Pesanan aktif"
            value={String(activeOrders.length)}
            detail="Dari kasir hingga siap disajikan"
            icon={Receipt}
          />
          <Metric
            label="Tim sedang bertugas"
            value={String(
              s.attendance.filter((at) => at.status === 'hadir' && !at.checkOut).length,
            )}
            detail={current?.name || 'Belum ada shift berjalan'}
            icon={Users}
          />
          {admin && (
            <>
              <Metric
                label="Laba shift berjalan"
                value={money(totals?.profit || 0)}
                detail="Sesudah HPP & biaya, sebelum gaji"
              />
              <Metric
                label="Estimasi gaji / orang"
                value={money(totals?.wage || 0)}
                detail="Dikunci saat shift ditutup"
                icon={Wallet}
              />
            </>
          )}
        </div>
        <div className="dashboard-grid">
          <section className="panel activity-panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">LIVE OPERATIONS</p>
                <h2>Ruang aktivitas kafe</h2>
              </div>
              <Badge value={current ? 'open' : 'planned'} />
            </div>
            <CafeActivity
              orders={activeOrders}
              tables={s.tables}
              staff={s.attendance
                .filter((at) => at.status === 'hadir' && !at.checkOut)
                .map((at) => ({ id: at.employeeId, name: employee(at.employeeId) }))}
            />
            <div className="row between">
              <small>Gerakan mengikuti status pesanan yang tercatat.</small>
              <button className="text-link" onClick={() => setTab('orders')}>
                Lihat antrean
              </button>
            </div>
          </section>
          <section className="panel">
            <div className="section-head">
              <h2>Shift hari ini</h2>
              <CalendarDays size={19} />
            </div>
            {s.shifts
              .filter((sh) => sh.date === localDate())
              .map((sh) => (
                <div className="shift-mini" key={sh.id}>
                  <div className="row between">
                    <strong>{sh.name}</strong>
                    <Badge value={sh.status} />
                  </div>
                  <p>
                    {dateTime(sh.startAt)} –{' '}
                    {new Date(sh.endAt).toLocaleTimeString('id-ID', {
                      timeZone: CAFE_TIMEZONE,
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                  <div className="avatars">
                    {sh.employeeIds.map((id: string) => (
                      <span key={id} title={employee(id)}>
                        {employee(id).slice(0, 2).toUpperCase()}
                      </span>
                    ))}
                  </div>
                  <small>{sh.employeeIds.map(employee).join(', ')}</small>
                </div>
              ))}
            {!s.shifts.some((sh) => sh.date === localDate()) && (
              <Empty>Belum ada jadwal hari ini.</Empty>
            )}
            <button className="button w-full" onClick={() => setTab('roster')}>
              Buka kalender shift
            </button>
          </section>
        </div>
        <div className="dashboard-grid">
          <section className="panel">
            <div className="section-head">
              <h2>Antrean terbaru</h2>
              <span className="badge">{activeOrders.length} pesanan</span>
            </div>
            {activeOrders
              .slice(-4)
              .reverse()
              .map((o) => (
                <div className="list-row" key={o.id}>
                  <div>
                    <strong>{o.no}</strong>
                    <p>{o.items.map((i: any) => i.quantity + '× ' + i.name).join(', ')}</p>
                  </div>
                  <Badge value={o.status} />
                </div>
              ))}
            {!activeOrders.length && <Empty>Belum ada pesanan aktif.</Empty>}
          </section>
          <section className="panel">
            <div className="section-head">
              <h2>Perlu perhatian</h2>
              <Activity size={19} />
            </div>
            {s.ingredients
              .filter((i) => i.trackStock === true && i.stock <= i.minStock)
              .map((i) => (
                <div className="list-row" key={i.id}>
                  <span>{i.name}</span>
                  <strong className="warning">
                    {i.stock} {i.unit}
                  </strong>
                </div>
              ))}
            {!s.ingredients.some((i) => i.trackStock === true && i.stock <= i.minStock) && (
              <p className="muted">Tidak ada bahan di bawah batas stok minimum.</p>
            )}
            <p className="muted">
              {s.loans.filter((l) => !l.returnDate && l.dueDate < localDate()).length} buku melewati
              batas pengembalian.
            </p>
          </section>
        </div>
      </>
    );
  if (tab === 'pos')
    content = (
      <>
        <div className="section-head">
          <div className="page-search">
            <Search size={17} />
            <input
              placeholder="Cari menu…"
              aria-label="Cari menu kasir"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Choice
            label="Kategori menu"
            value={category}
            onChange={setCategory}
            options={[{ value: 'all', label: 'Semua kategori' }, ...categoryOptions()]}
          />
        </div>
        <div className="notice">
          {openShiftNow ? (
            <>
              <strong>{openShiftNow.name}</strong> · Shift sedang berjalan.
            </>
          ) : (
            <>
              <span>
                Tidak ada shift berjalan. Pilih shift yang sudah lewat pada pesanan untuk mencatat
                transaksi terlambat.
              </span>
              {admin && (
                <button className="button" onClick={() => setTab('roster')}>
                  <CalendarDays size={16} />
                  Buka kalender shift
                </button>
              )}
            </>
          )}
        </div>
        {missingRecipeProducts.length > 0 && (
          <div className="notice warning">
            Kasir tetap bisa dipakai untuk uji coba. Menu tanpa resep/HPP dicatat dengan HPP Rp0 dan
            stok bahan tidak dipotong; laba shift dan gaji bersifat sementara sampai resep
            dilengkapi.
          </div>
        )}
        <div className="pos-layout">
          <section>
            <div className="product-grid">
              {filtered(s.products)
                .filter(
                  (p) => p.status === 'tersedia' && (category === 'all' || p.category === category),
                )
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((p) => (
                  <button
                    className="product-card"
                    key={p.id}
                    onClick={() =>
                      setCart((c) =>
                        c.some((i) => i.id === p.id)
                          ? c.map((i) => (i.id === p.id ? { ...i, quantity: i.quantity + 1 } : i))
                          : [...c, { ...p, quantity: 1 }],
                      )
                    }
                  >
                    {p.image ? (
                      <img src={p.image} alt={p.name} />
                    ) : (
                      <div className="product-icon">
                        <Coffee size={42} />
                      </div>
                    )}
                    <small>
                      {categoryName(p.category)}
                      {!s.recipes.some((r) => r.productId === p.id) && ' · HPP belum diisi'}
                    </small>
                    <h2>{p.name}</h2>
                    <div className="row between">
                      <strong>{money(p.price)}</strong>
                      <Plus size={20} />
                    </div>
                  </button>
                ))}
            </div>
            {!s.products.length && (
              <Empty>
                Tambahkan menu dan resep melalui katalog atau muat menu contoh dari Pengaturan.
              </Empty>
            )}
          </section>
          <aside className="panel cart">
            <h2>Pesanan baru</h2>
            <Choice
              label="Tanggal & shift transaksi"
              value={selectedOrderShift?.id || ''}
              onChange={setOrderShiftId}
              options={[
                {
                  value: '',
                  label: eligibleOrderShifts.length
                    ? 'Pilih tanggal dan shift'
                    : 'Tidak ada shift yang dijadwalkan untukmu',
                },
                ...eligibleOrderShifts.map((sh) => ({
                  value: sh.id,
                  label: `${fmtDate(sh.date)} · ${sh.name} · ${sh.status === 'open' ? 'berjalan' : 'lampau'}`,
                })),
              ]}
            />
            {selectedOrderShift?.status === 'planned' && (
              <small className="muted">
                Shift lampau yang masih terjadwal akan ditutup otomatis setelah pembayaran dicatat.
              </small>
            )}
            {!eligibleOrderShifts.length && (
              <small className="warning">
                Hubungi admin untuk memastikan kamu tercantum pada jadwal shift tanggal transaksi.
              </small>
            )}
            <Choice
              label="Jenis pesanan"
              value={orderType}
              onChange={setOrderType}
              options={[
                { value: 'takeaway', label: 'Bawa pulang' },
                { value: 'dine_in', label: 'Makan di tempat' },
              ]}
            />
            {orderType === 'dine_in' && (
              <Choice
                label="Meja"
                value={tableId}
                onChange={setTableId}
                options={[
                  { value: '', label: 'Pilih meja' },
                  ...s.tables
                    .filter((t) => ['kosong', 'terisi'].includes(t.status))
                    .map((t) => ({ value: t.id, label: 'Meja ' + t.number + ' · ' + t.zone })),
                ]}
              />
            )}
            <div className="cart-items">
              {cart.map((i) => (
                <div className="cart-item" key={i.id}>
                  <div className="row between">
                    <strong>{i.name}</strong>
                    <button
                      className="icon-button"
                      aria-label={'Hapus ' + i.name}
                      onClick={() => setCart((c) => c.filter((x) => x.id !== i.id))}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  {!s.recipes.some((r) => r.productId === i.id) && (
                    <small className="warning">HPP belum diisi · untuk uji coba</small>
                  )}
                  <div className="row between">
                    <input
                      aria-label={'Jumlah ' + i.name}
                      type="number"
                      min={1}
                      max={100}
                      value={i.quantity}
                      onChange={(e) =>
                        setCart((c) =>
                          c.map((x) =>
                            x.id === i.id ? { ...x, quantity: Number(e.target.value) } : x,
                          ),
                        )
                      }
                    />
                    <span>{money(i.price * i.quantity)}</span>
                  </div>
                  <input
                    placeholder="Catatan pesanan"
                    aria-label={'Catatan ' + i.name}
                    value={i.notes || ''}
                    onChange={(e) =>
                      setCart((c) =>
                        c.map((x) => (x.id === i.id ? { ...x, notes: e.target.value } : x)),
                      )
                    }
                  />
                </div>
              ))}
            </div>
            {!cart.length && <p className="muted">Pilih menu untuk memulai pesanan.</p>}
            <div className="row between">
              <span>Subtotal</span>
              <span>{money(subtotal)}</span>
            </div>
            <label>
              Diskon (Rp)
              <input
                type="number"
                min={0}
                max={subtotal}
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value))}
              />
            </label>
            <label className="row">
              <Checkbox checked={taxEnabled} onCheckedChange={(v) => setTaxEnabled(v === true)} />
              Pajak {settings?.taxPercentage || 0}%<span className="ml-auto">{money(tax)}</span>
            </label>
            <div className="total row between">
              <strong>Total</strong>
              <strong>{money(total)}</strong>
            </div>
            <Choice
              label="Metode pembayaran"
              value={paymentMethod}
              onChange={setPaymentMethod}
              options={opts(['tunai', 'qris', 'transfer', 'ewallet'])}
            />
            {paymentMethod === 'tunai' && (
              <label>
                Uang diterima
                <input
                  type="number"
                  min={0}
                  value={cashPaid}
                  onChange={(e) => setCashPaid(e.target.value)}
                />
                <small>Kembalian {money(Math.max(0, Number(cashPaid) - total))}</small>
              </label>
            )}
            <button
              className="button primary"
              disabled={busy || !cart.length || !selectedOrderShift}
              onClick={() => checkout(true)}
            >
              Catat pembayaran & pesanan
            </button>
            <button
              className="button"
              disabled={
                busy || !cart.length || !selectedOrderShift || selectedOrderShift.status !== 'open'
              }
              onClick={() => checkout(false)}
            >
              Simpan · menunggu pembayaran
            </button>
          </aside>
        </div>
      </>
    );
  if (tab === 'orders')
    content = (
      <>
        <div className="section-head">
          <h1>Pesanan</h1>
          <div className="row">
            <span className="badge">{activeOrders.length} aktif</span>
            <Choice
              label="Filter status pesanan"
              value={orderFilter}
              onChange={setOrderFilter}
              options={[
                { value: 'all', label: 'Semua status' },
                { value: 'hpp_incomplete', label: 'HPP belum lengkap' },
                ...opts([
                  'menunggu_pembayaran',
                  'diproses',
                  'sedang_dibuat',
                  'siap_disajikan',
                  'selesai',
                  'dibatalkan',
                ]),
              ]}
            />
          </div>
        </div>
        <div className="orders-grid">
          {[...s.orders]
            .reverse()
            .filter(
              (o) =>
                o.no.toLowerCase().includes(search.toLowerCase()) &&
                (orderFilter === 'all' ||
                  (orderFilter === 'hpp_incomplete'
                    ? o.paid && o.status !== 'dibatalkan' && hasMissingHpp(o)
                    : o.status === orderFilter)),
            )
            .map((o) => (
              <article className="panel order-card" key={o.id}>
                <div className="row between">
                  <strong>{o.no}</strong>
                  <Badge value={o.status} />
                </div>
                <small>
                  {dateTime(o.createdAt)} · {shiftName(o.shiftId)} ·{' '}
                  {o.orderType === 'takeaway'
                    ? 'Bawa pulang'
                    : 'Meja ' + s.tables.find((t) => t.id === o.tableId)?.number}
                </small>
                {hasMissingHpp(o) && (
                  <div className="notice warning">
                    HPP belum diisi saat transaksi. Menu tersebut tercatat dengan HPP Rp0 dan stok
                    bahan tidak dipotong. Lengkapi HPP sebelum menghitung atau membayar gaji.
                  </div>
                )}
                <ul>
                  {o.items.map((i: any, n: number) => (
                    <li key={n}>
                      {i.quantity}× {i.name}
                      {i.notes && <small> · {i.notes}</small>}
                    </li>
                  ))}
                </ul>
                <div className="row between">
                  <strong>{money(o.total)}</strong>
                  <button
                    className="icon-button"
                    aria-label="Lihat struk"
                    onClick={() => setReceipt(o)}
                  >
                    <Printer size={18} />
                  </button>
                </div>
                <div className="row wrap">
                  {admin && o.status !== 'dibatalkan' && hasMissingHpp(o) && (
                    <button
                      className="button primary"
                      disabled={
                        busy ||
                        s.payrolls.some(
                          (pr) => pr.period === o.date.slice(0, 7) && pr.status === 'lunas',
                        )
                      }
                      onClick={() => completeHpp(o)}
                    >
                      <ChefHat size={15} />
                      Lengkapi HPP
                    </button>
                  )}
                  {admin && o.status !== 'dibatalkan' && (
                    <button className="button" disabled={busy} onClick={() => correctOrder(o)}>
                      <Pencil size={15} />
                      Koreksi
                    </button>
                  )}
                  {admin && (
                    <button
                      className="button danger"
                      disabled={busy}
                      onClick={() => deleteOrder(o)}
                    >
                      <Trash2 size={15} />
                      Hapus transaksi
                    </button>
                  )}
                  {o.status === 'menunggu_pembayaran' && (
                    <button className="button primary" disabled={busy} onClick={() => payOrder(o)}>
                      Terima pembayaran
                    </button>
                  )}
                  {(
                    {
                      diproses: 'sedang_dibuat',
                      sedang_dibuat: 'siap_disajikan',
                      siap_disajikan: 'selesai',
                    } as any
                  )[o.status] && (
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() =>
                        act('order.status', {
                          id: o.id,
                          status: (
                            {
                              diproses: 'sedang_dibuat',
                              sedang_dibuat: 'siap_disajikan',
                              siap_disajikan: 'selesai',
                            } as any
                          )[o.status],
                        })
                      }
                    >
                      {
                        (
                          {
                            diproses: 'Mulai buat',
                            sedang_dibuat: 'Siap disajikan',
                            siap_disajikan: 'Selesaikan',
                          } as any
                        )[o.status]
                      }
                    </button>
                  )}
                  {admin && ['menunggu_pembayaran', 'diproses'].includes(o.status) && (
                    <button
                      className="button danger"
                      onClick={() =>
                        setModal({
                          title: 'Batalkan pesanan',
                          description: o.paid
                            ? 'Lakukan pengembalian uang secara manual sebelum mengonfirmasi. Aplikasi tidak memproses refund bank.'
                            : 'Stok pesanan akan dikembalikan.',
                          fields: [
                            { key: 'reason', label: 'Alasan pembatalan', required: true },
                            {
                              key: 'refundRecorded',
                              label: 'Pembayaran telah dikembalikan (jika sudah dibayar)',
                              type: 'boolean',
                            },
                          ],
                          initial: {},
                          submit: (v: any) =>
                            act('order.status', { id: o.id, status: 'dibatalkan', ...v }),
                        })
                      }
                    >
                      Batalkan
                    </button>
                  )}
                </div>
              </article>
            ))}
        </div>
        {!s.orders.length && <Empty>Pesanan dari kasir akan tampil di sini.</Empty>}
      </>
    );
  if (tab === 'roster')
    content = (
      <>
        {toolbar(
          'Kalender shift',
          'shifts',
          <div className="row">
            <button
              className="icon-button"
              aria-label="Minggu sebelumnya"
              onClick={() => setWeek((w) => w - 1)}
            >
              <ChevronLeft />
            </button>
            <button className="button" onClick={() => setWeek(0)}>
              Minggu ini
            </button>
            <button
              className="icon-button"
              aria-label="Minggu berikutnya"
              onClick={() => setWeek((w) => w + 1)}
            >
              <ChevronRight />
            </button>
          </div>,
        )}
        <div className="notice">
          Semua jam menggunakan WITA (Pangkep). Jadwal menjadi acuan absensi dan alokasi gaji.
          Karyawan check-in untuk memulai shift; check-out terakhir menyelesaikan shift otomatis
          setelah pesanan selesai.
        </div>
        {admin && s.shifts.some((sh) => !sh.scheduleTimezone) && (
          <div className="notice warning">
            Jadwal lama dibuat sebelum penyeragaman WITA. Timestamp dan tanggal usaha lama
            dipertahankan; tampilan jam kini WITA. Periksa jadwal mendatang dan ubah bila jam
            lokalnya perlu disesuaikan.
          </div>
        )}
        <div className="calendar">
          {days.map((d) => (
            <section key={d} className={'calendar-day ' + (d === localDate() ? 'today' : '')}>
              <header>
                <small>
                  {new Date(d + 'T12:00:00').toLocaleDateString('id-ID', { weekday: 'short' })}
                </small>
                <strong>{d.slice(8)}</strong>
                <small>{d.slice(5, 7)}</small>
              </header>
              {s.shifts
                .filter((sh) => sh.date === d)
                .sort((a, b) => a.startAt.localeCompare(b.startAt))
                .map((sh) => (
                  <article className={'calendar-shift ' + sh.status} key={sh.id}>
                    <div className="row between">
                      {(new Date(sh.startAt).getUTCHours() + 8) % 24 >= 17 ? (
                        <Moon size={16} />
                      ) : (
                        <Sun size={16} />
                      )}
                      <Badge value={sh.status} />
                    </div>
                    <h3>{sh.name}</h3>
                    <small>
                      {new Date(sh.startAt).toLocaleTimeString('id-ID', {
                        timeZone: CAFE_TIMEZONE,
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      –
                      {new Date(sh.endAt).toLocaleTimeString('id-ID', {
                        timeZone: CAFE_TIMEZONE,
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </small>
                    <p>{sh.employeeIds.map(employee).join(', ')}</p>
                    {sh.status === 'closed' && (
                      <div>
                        <small>Laba {money(sh.snapshot?.profit || 0)}</small>
                        <p>
                          Gaji / orang <strong>{money(sh.snapshot?.wage || 0)}</strong>
                        </p>
                      </div>
                    )}
                    {admin &&
                      (sh.status === 'planned' ? (
                        controls('shifts', sh)
                      ) : (
                        <button className="button danger" onClick={() => remove('shifts', sh)}>
                          <Trash2 size={15} />
                          Hapus shift
                        </button>
                      ))}
                  </article>
                ))}
              {admin && (
                <button
                  className="calendar-add"
                  onClick={() =>
                    setModal({
                      title: 'Tambah shift · ' + d,
                      fields: fields('shifts'),
                      initial: {
                        startAt: d + 'T08:00:00+08:00',
                        endAt: d + 'T16:00:00+08:00',
                        employeeIds: [],
                      },
                      submit: (data: any) => act('save', { kind: 'shifts', data }),
                    })
                  }
                >
                  <Plus size={16} />
                  Jadwalkan
                </button>
              )}
            </section>
          ))}
        </div>
      </>
    );
  if (tab === 'attendance')
    content = (
      <>
        {toolbar(
          'Absensi',
          undefined,
          admin ? (
            <button className="button" onClick={() => correctAttendance()}>
              <Pencil size={16} />
              Tambah / koreksi absensi
            </button>
          ) : null,
        )}
        {attendanceShifts.map((sh) => (
          <section className="panel" key={sh.id}>
            <div className="section-head">
              <div>
                <h2>{sh.name}</h2>
                <small>
                  {sh.date} ·{' '}
                  {new Date(sh.startAt).toLocaleTimeString('id-ID', {
                    timeZone: CAFE_TIMEZONE,
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  –
                  {new Date(sh.endAt).toLocaleTimeString('id-ID', {
                    timeZone: CAFE_TIMEZONE,
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </small>
              </div>
              <Badge value={sh.status} />
            </div>
            <div className="staff-grid">
              {sh.employeeIds
                .filter((id: string) => admin || id === actor?.employeeId)
                .map((id: string) => {
                  const at = s.attendance.find((x) => x.shiftId === sh.id && x.employeeId === id);
                  const withinTime =
                    Date.now() >= new Date(sh.startAt).getTime() &&
                    Date.now() < new Date(sh.endAt).getTime();
                  return (
                    <div className="staff-card" key={id}>
                      <div className="avatar">{employee(id).slice(0, 2).toUpperCase()}</div>
                      <strong>{employee(id)}</strong>
                      <small>
                        {at
                          ? at.status !== 'hadir'
                            ? labels[at.status]
                            : at.checkOut
                              ? 'Check-in ' +
                                dateTime(at.checkIn) +
                                ' · Check-out ' +
                                dateTime(at.checkOut)
                              : 'Check-in ' + dateTime(at.checkIn)
                          : 'Belum check-in'}
                      </small>
                      {!at && sh.status !== 'closed' && withinTime ? (
                        <button
                          className="button primary"
                          disabled={busy}
                          onClick={() =>
                            act(
                              'attendance.in',
                              { shiftId: sh.id, employeeId: id },
                              'Check-in tercatat',
                            )
                          }
                        >
                          Check-in
                        </button>
                      ) : at && at.status === 'hadir' && !at.checkOut ? (
                        <button
                          className="button"
                          disabled={
                            busy ||
                            (!admin &&
                              !(sh.date === today || localDate(new Date(sh.endAt)) === today))
                          }
                          onClick={() => act('attendance.out', { id: at.id }, 'Check-out tercatat')}
                        >
                          Check-out
                        </button>
                      ) : at ? (
                        <Badge value={at.status === 'hadir' ? 'selesai' : at.status} />
                      ) : (
                        <Badge value={sh.status} />
                      )}
                    </div>
                  );
                })}
            </div>
          </section>
        ))}
        {!attendanceShifts.length && (
          <div className="panel">
            <Empty>Tidak ada jadwal shift untukmu hari ini.</Empty>
          </div>
        )}
        {table(
          [
            'Karyawan',
            'Shift',
            'Status',
            'Check-in',
            'Check-out',
            'Catatan',
            ...(admin ? ['Aksi'] : []),
          ],
          [...s.attendance]
            .reverse()
            .filter((at) => admin || at.employeeId === actor?.employeeId)
            .map((at) => [
              employee(at.employeeId),
              shiftName(at.shiftId),
              <Badge value={at.status} key="s" />,
              at.checkIn ? dateTime(at.checkIn) : '—',
              at.checkOut ? dateTime(at.checkOut) : '—',
              at.notes || '—',
              ...(admin
                ? [
                    <div className="row" key="actions">
                      <button
                        className="icon-button"
                        aria-label="Koreksi absensi"
                        onClick={() => correctAttendance(at)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="icon-button danger"
                        aria-label="Hapus absensi"
                        onClick={() => deleteAttendance(at)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>,
                  ]
                : []),
            ]),
        )}
      </>
    );
  if (tab === 'expenses')
    content = (
      <>
        {toolbar('Catatan pengeluaran', 'expenses')}
        <div className="notice">
          Karyawan dapat menambah dan mengubah catatan pembelian atau biaya operasional, termasuk
          mengalokasikannya ke shift selesai selama periode belum dibayar. Penghapusan tetap
          memerlukan akun admin agar riwayat tidak hilang tanpa pengawasan.
        </div>
        {table(
          ['Tanggal', 'Keterangan', 'Kategori', 'Alokasi', 'Nominal', 'Aksi'],
          [...s.expenses]
            .reverse()
            .map((e) => [
              e.date,
              e.title,
              e.category,
              shiftName(e.shiftId),
              money(e.amount),
              controls('expenses', e),
            ]),
        )}
      </>
    );
  if (tab === 'payroll')
    content = (
      <>
        {toolbar(
          'Gaji & bonus',
          undefined,
          <div className="row">
            <input
              aria-label="Periode gaji"
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            />
            {admin && (
              <button
                className="button primary"
                disabled={busy || incompleteHppOrders.some((o) => o.date.startsWith(period))}
                onClick={() =>
                  act('payroll.generate', { period }, 'Payroll dihitung dari shift yang ditutup')
                }
              >
                Hitung periode
              </button>
            )}
          </div>,
        )}
        <div className="notice">
          Gaji mengikuti laba bersih shift sebelum gaji. Setiap staf yang hadir mendapat tier penuh.
          Koreksi shift selesai mempertahankan tier yang tersimpan saat penutupan. HPP harus lengkap
          sebelum payroll dihitung atau dibayar. Bonus bulanan: {settings?.bonusPercentage}% laba
          positif setelah biaya umum dan gaji, dibagi menurut jumlah shift hadir.
        </div>
        {incompleteHppOrders.some((o) => o.date.startsWith(period)) && (
          <div className="notice warning">
            Ada {incompleteHppOrders.filter((o) => o.date.startsWith(period)).length} transaksi
            lunas yang HPP-nya belum lengkap pada periode ini. Penghitungan dan pencatatan
            pembayaran gaji diblokir sampai HPP dilengkapi atau transaksi uji dihapus.
            {admin && (
              <button
                className="button"
                onClick={() => {
                  setTab('orders');
                  setSearch('');
                  setOrderFilter('hpp_incomplete');
                }}
              >
                Tinjau transaksi tanpa HPP
              </button>
            )}
          </div>
        )}
        {s.payrolls.some(
          (pr) =>
            pr.period === period && pr.status !== 'lunas' && pr.rulesVersion !== OPERATIONS_VERSION,
        ) && (
          <div className="notice warning">
            Payroll ini dibuat dengan aturan lama. Nominal akan divalidasi ulang terhadap HPP, tier
            historis dan absensi sebelum pembayaran. Gunakan Hitung periode jika perlu memperbarui
            payroll yang belum dikunci.
          </div>
        )}
        {admin && (
          <section className="panel">
            <div className="section-head">
              <h2>Tier gaji per shift</h2>
              <button
                className="button"
                onClick={() =>
                  setModal({
                    title: 'Atur tier gaji',
                    description:
                      'Mulai dari Rp0, tanpa celah. Kosongkan batas atas tier terakhir. Tier baru berlaku untuk penutupan shift berikutnya; koreksi shift lama tetap memakai tier historisnya. Laba negatif memakai tier pertama.',
                    fields: [
                      { key: 'rows', label: 'Tier gaji', type: 'tiers' },
                      { key: 'reason', label: 'Alasan perubahan tier', required: true },
                    ],
                    initial: { rows: s.tiers },
                    submit: (v: any) => act('tiers.replace', { rows: v.rows, reason: v.reason }),
                  })
                }
              >
                <Pencil size={16} />
                Ubah tier
              </button>
            </div>
            <div className="tier-row">
              {s.tiers.map((t) => (
                <div key={t.id}>
                  <small>
                    {money(t.min)} – {t.max === null ? 'tak terbatas' : money(t.max)}
                  </small>
                  <strong>
                    {money(t.wage)} <small>/ orang / shift</small>
                  </strong>
                </div>
              ))}
            </div>
            <p className="muted">
              Tier di atas Rp300.000 masih memakai Rp25.000 sebagai nilai awal. Sesuaikan sebelum
              operasional.
            </p>
          </section>
        )}
        {table(
          ['Karyawan', 'Periode', 'Shift hadir', 'Gaji shift', 'Bonus', 'Total', 'Status', 'Aksi'],
          s.payrolls
            .filter((pr) => pr.period === period)
            .map((pr) => [
              employee(pr.employeeId),
              pr.period,
              pr.shifts,
              money(pr.base),
              money(pr.bonus),
              <strong key="t">{money(pr.total)}</strong>,
              <Badge value={pr.status} key="s" />,
              admin && pr.status !== 'lunas' ? (
                <button
                  key="pay"
                  className="button"
                  disabled={busy || incompleteHppOrders.some((o) => o.date.startsWith(pr.period))}
                  onClick={() =>
                    setConfirm({
                      title: 'Tandai gaji telah dibayar?',
                      description:
                        'Lakukan pembayaran terlebih dahulu. Rekaman pembayaran ini tidak mentransfer uang dan akan mengunci periode. Seluruh jadwal periode ini harus sudah selesai; hapus jadwal uji yang tidak digunakan.',
                      run: () => act('payroll.pay', { id: pr.id }),
                    })
                  }
                >
                  Catat pembayaran
                </button>
              ) : pr.paidAt ? (
                dateTime(pr.paidAt)
              ) : (
                '—'
              ),
            ]),
        )}
        <h2>Rincian pendapatan per karyawan dan shift</h2>
        {table(
          ['Tanggal', 'Shift', 'Karyawan', 'Laba shift', 'Gaji shift'],
          s.shifts
            .filter((sh) => sh.status === 'closed' && sh.date.startsWith(period))
            .flatMap((sh) =>
              (sh.snapshot.employees || []).map((e: any) => [
                sh.date,
                sh.name,
                employee(e.employeeId),
                admin ? money(sh.snapshot.profit) : '—',
                money(e.wage),
              ]),
            ),
        )}
      </>
    );
  if (tab === 'financials') {
    const shifts = s.shifts.filter((sh) => sh.date >= reportFrom && sh.date <= reportTo);
    const orders = s.orders.filter(
      (o) => o.date >= reportFrom && o.date <= reportTo && o.paid && o.status !== 'dibatalkan',
    );
    const rev = orders.reduce((n, o) => n + o.subtotal - o.discount, 0),
      hpp = orders.reduce((n, o) => n + o.hpp, 0);
    const expenses = s.expenses.filter((e) => e.date >= reportFrom && e.date <= reportTo),
      cost = expenses.filter((e) => e.category !== 'bahan_baku').reduce((n, e) => n + e.amount, 0),
      wages = shifts.reduce(
        (n, sh) => n + (sh.snapshot?.employees || []).reduce((v: number, e: any) => v + e.wage, 0),
        0,
      );
    const bonus = s.payrolls
      .filter((pr) => pr.period >= reportFrom.slice(0, 7) && pr.period <= reportTo.slice(0, 7))
      .reduce((n, pr) => n + pr.bonus, 0);
    content = (
      <>
        {toolbar(
          'Laporan keuangan',
          'expenses',
          <div className="row">
            <input
              aria-label="Dari tanggal"
              type="date"
              value={reportFrom}
              onChange={(e) => setReportFrom(e.target.value)}
            />
            <input
              aria-label="Sampai tanggal"
              type="date"
              value={reportTo}
              onChange={(e) => setReportTo(e.target.value)}
            />
            <button
              className="button"
              onClick={() =>
                downloadCsv('laporan-shift.csv', [
                  ['Tanggal', 'Shift', 'Omzet bersih', 'HPP', 'Biaya', 'Laba sebelum gaji'],
                  ...shifts.map((sh) => {
                    const t = sh.snapshot || shiftTotals(s, sh);
                    return [sh.date, sh.name, t.revenue, t.hpp, t.costs, t.profit];
                  }),
                ])
              }
            >
              <Download size={16} />
              CSV
            </button>
          </div>,
        )}
        <div className="metrics">
          <Metric
            label="Omzet bersih"
            value={money(rev)}
            detail="Setelah diskon, tidak termasuk pajak"
          />
          <Metric
            label="HPP terjual"
            value={money(hpp)}
            detail="Biaya resep saat transaksi"
            icon={Package}
          />
          <Metric
            label="Biaya operasional"
            value={money(cost)}
            detail="Termasuk biaya umum dan biaya shift"
            icon={Receipt}
          />
          <Metric
            label="Laba sebelum bonus"
            value={money(rev - hpp - cost - wages)}
            detail={'Setelah gaji shift ' + money(wages)}
            icon={Wallet}
          />
        </div>
        {incompleteHppOrders.some((o) => o.date >= reportFrom && o.date <= reportTo) && (
          <div className="notice warning">
            Ada transaksi dalam rentang ini dengan HPP belum lengkap. Nilai laba dan gaji shift
            belum final; menu tersebut dicatat dengan HPP Rp0 dan stoknya tidak dipotong.
          </div>
        )}
        <div className="notice">
          Bonus tercatat untuk bulan dalam rentang: {money(bonus)} (angka bulanan, bukan prorata
          harian). Pembelian bahan baku{' '}
          {money(
            expenses.filter((e) => e.category === 'bahan_baku').reduce((n, e) => n + e.amount, 0),
          )}{' '}
          dicatat terpisah agar tidak menghitung HPP dua kali.
        </div>
        <section className="panel">
          <h2>Laba sebelum gaji per shift</h2>
          <div style={{ height: 260, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={shifts.map((sh) => ({
                  name: sh.date.slice(5) + ' ' + sh.name,
                  laba: (sh.snapshot || shiftTotals(s, sh)).profit,
                }))}
              >
                <CartesianGrid stroke="#293447" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#a5b1c3', fontSize: 12 }} />
                <YAxis
                  tick={{ fill: '#a5b1c3', fontSize: 12 }}
                  tickFormatter={(v) => String(Math.round(v / 1000)) + 'rb'}
                />
                <Tooltip
                  contentStyle={{
                    background: '#17202d',
                    border: '1px solid #344052',
                    borderRadius: 8,
                  }}
                  formatter={(v: any) => money(Number(v))}
                />
                <Bar dataKey="laba" name="Laba shift" fill="#c4ec81" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <h2>Perbandingan hasil shift</h2>
        {table(
          [
            'Tanggal',
            'Shift',
            'Karyawan',
            'Omzet bersih',
            'HPP',
            'Biaya shift',
            'Laba sebelum gaji',
            'Status',
          ],
          shifts.map((sh) => {
            const t = sh.snapshot || shiftTotals(s, sh);
            return [
              sh.date,
              sh.name,
              sh.employeeIds.map(employee).join(', '),
              money(t.revenue),
              money(t.hpp),
              money(t.costs),
              <strong key="p" className={t.profit < 0 ? 'danger' : 'accent'}>
                {money(t.profit)}
              </strong>,
              <Badge key="s" value={sh.status} />,
            ];
          }),
        )}
        <h2>Pengeluaran</h2>
        {table(
          ['Tanggal', 'Keterangan', 'Kategori', 'Alokasi', 'Nominal', 'Aksi'],
          expenses.map((e) => [
            e.date,
            e.title,
            e.category,
            shiftName(e.shiftId),
            money(e.amount),
            controls('expenses', e),
          ]),
        )}
        <h2>Pembayaran diterima</h2>
        {table(
          ['Metode', 'Transaksi', 'Nilai termasuk pajak'],
          ['tunai', 'qris', 'transfer', 'ewallet'].map((m) => [
            m,
            orders.filter((o) => o.paymentMethod === m).length,
            money(orders.filter((o) => o.paymentMethod === m).reduce((n, o) => n + o.total, 0)),
          ]),
        )}
      </>
    );
  }
  if (tab === 'products')
    content = (
      <>
        {toolbar('Menu kafe', 'products')}
        <section className="panel">
          <div className="section-head">
            <div>
              <h2>Kategori menu</h2>
              <p className="muted">Atur kategori yang digunakan di kasir dan menu pelanggan.</p>
            </div>
            <button className="button" onClick={() => edit('categories')}>
              <Plus size={16} />
              Tambah kategori
            </button>
          </div>
          <div className="category-management">
            {[...s.categories]
              .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
              .map((c) => (
                <div className="category-item" key={c.id}>
                  <span>
                    {c.name}{' '}
                    <small>· {s.products.filter((p) => p.category === c.id).length} menu</small>
                  </span>
                  {controls('categories', c)}
                </div>
              ))}
          </div>
        </section>
        <div className="product-grid">
          {filtered(s.products).map((p) => (
            <article className="product-card" key={p.id}>
              {p.image ? (
                <img src={p.image} alt={p.name} />
              ) : (
                <div className="product-icon">
                  <Coffee size={40} />
                </div>
              )}
              <small>{categoryName(p.category)}</small>
              <h2>{p.name}</h2>
              <p>{p.description}</p>
              <strong>{money(p.price)}</strong>
              <div className="row between">
                <Badge value={p.status} />
                {controls('products', p)}
              </div>
            </article>
          ))}
        </div>
        {!s.products.length && (
          <Empty>Tambahkan menu pertama atau muat katalog contoh di Pengaturan.</Empty>
        )}
      </>
    );
  if (tab === 'ingredients')
    content = (
      <>
        {toolbar('Bahan baku', 'ingredients')}
        {table(
          [
            'Bahan',
            'Satuan resep',
            'Isi / kemasan',
            'Harga / kemasan',
            'Biaya / satuan resep',
            'Aksi',
          ],
          filtered(s.ingredients).map((i) => [
            i.name,
            i.unit,
            hasPackageCost(i) ? (
              ingredientQuantity(i.packageQuantity) + ' ' + i.unit
            ) : (
              <span className="warning">Belum diisi</span>
            ),
            hasPackageCost(i) ? money(i.packagePrice) : '—',
            <span className="recipe-money" key="cost">
              {preciseMoney(ingredientUnitCost(i))}
              <small className="muted"> / {i.unit}</small>
            </span>,
            controls('ingredients', i),
          ]),
          { className: 'ingredients-table', columns: ['25%', '10%', '17%', '17%', '20%', '11%'] },
        )}
        <div className="notice">
          Biaya per satuan = harga beli kemasan ÷ isi kemasan. Resep memakai satuan pemakaian (ml,
          gram, atau pcs). Contoh: susu Rp21.000 ÷ 1000 ml = Rp21/ml; cup Rp15.000 ÷ 25 pcs =
          Rp600/pcs. Harga baru dipakai untuk transaksi berikutnya; HPP transaksi yang sudah dicatat
          tetap tersimpan. Pelacakan stok nonaktif secara default; aktifkan melalui Ubah bahan bila
          diperlukan.
        </div>
        {s.ingredients.some((i) => !hasPackageCost(i)) && (
          <div className="notice warning">
            Bahan lama masih memakai biaya per satuan yang tersimpan. Ubah bahan untuk melengkapi
            harga dan isi kemasan sebenarnya, lalu periksa jumlah pemakaian resepnya.
          </div>
        )}
      </>
    );
  if (tab === 'recipes')
    content = (
      <>
        {toolbar('Resep & HPP', 'recipes')}
        {table(
          ['Menu', 'Komposisi', 'HPP / porsi', 'Harga jual', 'Margin sebelum biaya', 'Aksi'],
          s.recipes.map((r) => {
            const p = s.products.find((p) => p.id === r.productId);
            const cost = Math.round(
              r.ingredients.reduce(
                (n: number, i: any) =>
                  n +
                  ingredientUnitCost(s.ingredients.find((x) => x.id === i.ingredientId)) * i.amount,
                0,
              ),
            );
            return [
              <strong className="recipe-menu-name" key="menu">
                {p?.name || 'Menu tidak tersedia'}
              </strong>,
              <ul className="recipe-composition" key="composition">
                {r.ingredients.map((i: any, index: number) => {
                  const ing = s.ingredients.find((x) => x.id === i.ingredientId);
                  return (
                    <li key={i.ingredientId + '-' + index}>
                      <span>{ing?.name || 'Bahan tidak tersedia'}</span>
                      <span className="recipe-amount">
                        {ingredientQuantity(i.amount)} {ing?.unit}
                        <small className="recipe-line-cost">
                          {preciseMoney(ingredientUnitCost(ing) * i.amount)}
                        </small>
                      </span>
                    </li>
                  );
                })}
              </ul>,
              <span className="recipe-money" key="cost">
                {money(cost)}
              </span>,
              <span className="recipe-money" key="price">
                {money(p?.price || 0)}
              </span>,
              <span className="recipe-money" key="margin">
                {money((p?.price || 0) - cost)}
              </span>,
              <div className="recipe-actions" key="actions">
                {controls('recipes', r)}
              </div>,
            ];
          }),
          { className: 'recipes-table', columns: ['18%', '34%', '12%', '12%', '14%', '10%'] },
        )}
      </>
    );
  if (tab === 'tables')
    content = (
      <>
        {toolbar(
          'Meja & area',
          admin ? 'tables' : undefined,
          <button className="button" onClick={() => setModal({ title: 'QR menu meja', qr: true })}>
            <QrCode size={17} />
            QR menu
          </button>,
        )}
        <div className="tables-grid">
          {filtered(s.tables, 'number').map((t) => (
            <article className={'panel table-card ' + t.status} key={t.id}>
              <div className="row between">
                <Badge value={t.status} />
                {admin && controls('tables', t)}
              </div>
              <Grid2X2 size={34} />
              <h2>Meja {t.number}</h2>
              <p>
                {t.zone} · {t.capacity} kursi
              </p>
              <small>{t.notes}</small>
              <p>
                {
                  s.orders.filter(
                    (o) => o.tableId === t.id && !['selesai', 'dibatalkan'].includes(o.status),
                  ).length
                }{' '}
                pesanan aktif
              </p>
              {t.status !== 'terisi' && (
                <Choice
                  label={'Status meja ' + t.number}
                  value={t.status}
                  onChange={(status) => act('table.status', { id: t.id, status })}
                  options={opts(['kosong', 'reserved', 'dibersihkan'])}
                />
              )}
            </article>
          ))}
        </div>
      </>
    );
  if (tab === 'employees')
    content = (
      <>
        {toolbar('Karyawan & akses', 'employees')}
        <div className="notice">
          Buat data karyawan, lalu pilih “Atur ID & PIN”. Email tidak diperlukan untuk masuk. PIN
          berisi 8–12 angka dan hanya diketahui saat dibuat. Akun nonaktif kehilangan akses;
          aktifkan lalu atur PIN baru untuk memberi akses kembali.
        </div>
        {table(
          ['Karyawan', 'ID login', 'Peran', 'Status', 'Akses login', 'Aksi'],
          filtered(s.employees).map((e) => {
            const account = accounts.find((x) => x.employeeId === e.id);
            return [
              e.name,
              account?.loginId || 'Belum diatur',
              e.role,
              <Badge value={e.status} key="s" />,
              account?.enabled && e.status === 'aktif'
                ? 'Aktif'
                : account
                  ? 'Dicabut / nonaktif'
                  : 'Belum diatur',
              <div className="row" key="a">
                {controls('employees', e)}
                {(e.id !== 'owner' || actor?.employeeId === 'owner') && (
                  <>
                    <button
                      className="button"
                      disabled={e.status !== 'aktif'}
                      onClick={() => accessEditor(e)}
                    >
                      Atur ID & PIN
                    </button>
                    {account?.enabled === 1 && e.id !== 'owner' && (
                      <button className="button danger" onClick={() => accessEditor(e, true)}>
                        Cabut akses
                      </button>
                    )}
                  </>
                )}
              </div>,
            ];
          }),
        )}
      </>
    );
  if (tab === 'books')
    content = (
      <>
        {toolbar('Koleksi & peminjaman buku', 'books')}
        <Tabs defaultValue="catalog">
          <TabsList>
            <TabsTrigger value="catalog">Katalog</TabsTrigger>
            <TabsTrigger value="loans">Peminjaman</TabsTrigger>
          </TabsList>
          <TabsContent value="catalog">
            <div className="product-grid">
              {filtered(s.books, 'title').map((b) => (
                <article className="panel book-card" key={b.id}>
                  {b.image ? <img src={b.image} alt={b.title} /> : <BookOpen size={36} />}
                  <h2>{b.title}</h2>
                  <p>{b.author}</p>
                  <small>
                    {b.category} · {b.shelfLocation}
                  </small>
                  <p>
                    {b.totalCopies -
                      s.loans.filter((l) => l.bookId === b.id && !l.returnDate).length}{' '}
                    / {b.totalCopies} tersedia
                  </p>
                  <div className="row">
                    <button className="button" onClick={() => borrow(b)}>
                      Pinjamkan
                    </button>
                    {controls('books', b)}
                  </div>
                </article>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="loans">
            {table(
              ['Buku', 'Peminjam', 'Kontak', 'Dipinjam', 'Batas kembali', 'Status', 'Aksi'],
              s.loans.map((l) => [
                l.bookTitle,
                l.borrowerName,
                l.borrowerContact,
                l.borrowDate,
                l.dueDate,
                l.returnDate ? 'Dikembalikan' : l.dueDate < localDate() ? 'Terlambat' : 'Dipinjam',
                !l.returnDate ? (
                  <button
                    className="button"
                    key="r"
                    disabled={busy}
                    onClick={() => act('book.return', { id: l.id })}
                  >
                    Kembalikan
                  </button>
                ) : (
                  l.returnDate
                ),
              ]),
            )}
          </TabsContent>
        </Tabs>
      </>
    );
  if (tab === 'notes')
    content = (
      <>
        {toolbar(
          'Catatan tim',
          undefined,
          <button
            className="button primary"
            onClick={() =>
              setModal({
                title: 'Catatan baru',
                fields: [
                  { key: 'text', label: 'Isi catatan', type: 'textarea', required: true },
                  {
                    key: 'color',
                    label: 'Warna',
                    type: 'select',
                    options: opts(['yellow', 'blue', 'green', 'pink', 'purple']),
                    default: 'yellow',
                  },
                ],
                initial: {},
                submit: (v: any) => act('note.add', v),
              })
            }
          >
            <Plus size={16} />
            Tambah catatan
          </button>,
        )}
        <div className="notes-grid">
          {s.notes.map((n) => (
            <article className={'note ' + n.color} key={n.id}>
              <p>{n.text}</p>
              <div className="row between">
                <small>
                  {n.authorName} · {dateTime(n.createdAt)}
                </small>
                {(admin || n.authorId === actor?.employeeId) && (
                  <button
                    className="icon-button"
                    aria-label="Hapus catatan"
                    onClick={() =>
                      setConfirm({
                        title: 'Hapus catatan?',
                        description: 'Catatan akan dihapus dari ruang tim.',
                        run: () => act('note.delete', { id: n.id }),
                      })
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </>
    );
  if (tab === 'feedback')
    content = (
      <>
        {toolbar('Kritik & saran')}
        <div className="orders-grid">
          {s.feedback.map((f) => (
            <article className="panel" key={f.id}>
              <div className="row between">
                <strong>
                  {f.customerName || 'Pelanggan'} · {'★'.repeat(f.rating)}
                </strong>
                <Badge value={f.status} />
              </div>
              <p>{f.message}</p>
              <small>
                {f.phone} · {dateTime(f.createdAt)}
              </small>
              {f.response && <p className="notice">Tindak lanjut: {f.response}</p>}
              <div className="row">
                <button
                  className="button"
                  onClick={() =>
                    setModal({
                      title: 'Tindak lanjut masukan',
                      fields: [
                        {
                          key: 'status',
                          label: 'Status',
                          type: 'select',
                          options: opts(['baru', 'diproses', 'selesai']),
                        },
                        {
                          key: 'response',
                          label: 'Catatan tindak lanjut internal',
                          type: 'textarea',
                        },
                      ],
                      initial: f,
                      submit: (v: any) => act('feedback.respond', { id: f.id, ...v }),
                    })
                  }
                >
                  Tindak lanjuti
                </button>
                <button
                  className="icon-button"
                  aria-label="Hapus masukan"
                  onClick={() => remove('feedback', f)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </>
    );
  if (tab === 'settings')
    content = (
      <>
        <div className="section-head">
          <h1>Pengaturan kafe</h1>
          <button className="button primary" onClick={() => edit('settings', settings)}>
            <Pencil size={16} />
            Ubah profil
          </button>
        </div>
        <div className="dashboard-grid">
          <section className="panel">
            <div className="row brand-preview">
              <BrandMark logo={settings?.logo} />
              <div>
                <h2>Logo Winds Space</h2>
                <p className="muted">
                  Unggah dari galeri perangkat. PNG, JPEG, atau WebP maksimal 2 MB.
                </p>
              </div>
            </div>
            <button
              className="button"
              onClick={() =>
                setModal({
                  title: 'Ganti logo Winds Space',
                  fields: [
                    { key: 'logo', label: 'Logo', type: 'image' },
                    { key: '_auditReason', label: 'Alasan perubahan logo', required: true },
                  ],
                  initial: { logo: settings?.logo || '' },
                  submit: (data: any) =>
                    act('save', {
                      kind: 'settings',
                      id: settings.id,
                      data: { ...settings, logo: data.logo },
                      reason: data._auditReason,
                    }),
                })
              }
            >
              <Upload size={16} />
              Ganti logo
            </button>
            <h2>{settings?.name}</h2>
            <p>{settings?.tagline}</p>
            <p>{settings?.address || 'Alamat belum diisi'}</p>
            <p>{settings?.phone}</p>
            <div className="list-row">
              <span>Pajak</span>
              <strong>{settings?.taxPercentage}%</strong>
            </div>
            <div className="list-row">
              <span>Bonus bulanan</span>
              <strong>{settings?.bonusPercentage}%</strong>
            </div>
            <div className="list-row">
              <span>Kertas struk</span>
              <strong>{settings?.printerWidth} mm</strong>
            </div>
            <p className="muted">
              Cetak memakai dialog cetak perangkat. Pilih printer thermal yang sudah terhubung pada
              komputer atau tablet kasir.
            </p>
          </section>
          <BackupPanel onRestored={load} />
        </div>
        <section className="panel">
          <h2>Aturan hitung versi 1</h2>
          <ul className="bullets">
            <li>
              Laba untuk tier = omzet setelah diskon (tanpa pajak) − HPP − biaya yang dialokasikan
              ke shift.
            </li>
            <li>
              Gaji shift itu sendiri dikurangkan setelah tier ditentukan. Laba negatif memakai tier
              pertama.
            </li>
            <li>Setiap staf hadir mendapat nominal tier penuh, tanpa prorata keterlambatan.</li>
            <li>
              Biaya umum mengurangi laba bulanan; alokasikan ke shift jika harus memengaruhi tier
              shift.
            </li>
            <li>
              Bonus dihitung bulanan dari laba positif setelah biaya dan gaji, dibagi menurut jumlah
              shift hadir.
            </li>
            <li>
              Pembayaran non-tunai dan pembayaran gaji adalah pencatatan manual. Tidak ada transfer
              otomatis.
            </li>
          </ul>
        </section>
        <AuditPanel />
      </>
    );
  if (loading)
    return (
      <main className="login">
        <BrandMark logo={settings?.logo} />
        <h1>Membuka ruang kafe…</h1>
        <p>Memuat data tersimpan.</p>
      </main>
    );
  if (!actor)
    return (
      <main className="login">
        <h1>Akses belum tersedia</h1>
        <p role="alert">{error}</p>
        <a className="button primary" href="/login">
          Masuk kembali
        </a>
        <button className="button" onClick={() => load()}>
          Coba lagi
        </button>
      </main>
    );
  if (setup)
    return (
      <main className="login">
        <Toaster />
        <BrandMark logo={settings?.logo} />
        <p className="eyebrow">WINDS SPACE / PENGATURAN AWAL</p>
        <h1>Siapkan ruang kafe Anda.</h1>
        <p>
          Akun {name} akan menjadi pemilik. Data operasional dimulai kosong. Setelah masuk, atur
          tier gaji, daftarkan tim, dan buat jadwal shift pertama.
        </p>
        <button
          className="button primary"
          disabled={busy}
          onClick={() => act('initialize', {}, 'Ruang kafe siap digunakan')}
        >
          Siapkan kafe saya
        </button>
        <small>Situs pertama kali dibuka secara privat untuk pemilik.</small>
        {error && <p className="error">{error}</p>}
      </main>
    );
  return (
    <SidebarProvider>
      <Toaster richColors />
      <Sidebar>
        <SidebarHeader>
          <div className="brand">
            <BrandMark logo={settings?.logo} />
            <div>
              <strong>WINDS SPACE</strong>
              <small>CAFE MANAGEMENT</small>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          {nav.map((g) => (
            <SidebarGroup key={g.group}>
              <SidebarGroupLabel>{g.group}</SidebarGroupLabel>
              <SidebarMenu>
                {g.items
                  .filter(([id]) => admin || !restricted.includes(id as string))
                  .map(([id, label, Icon]: any) => (
                    <SidebarMenuItem key={id}>
                      <SidebarMenuButton
                        isActive={tab === id}
                        onClick={() => {
                          setTab(id);
                          setSearch('');
                        }}
                      >
                        <Icon size={18} />
                        <span>{label}</span>
                        {id === 'orders' && activeOrders.length > 0 && (
                          <span className="nav-count">{activeOrders.length}</span>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter>
          <a className="button" href="/" target="_blank">
            Dashboard 3D <ArrowUpRight size={16} />
          </a>
          <a className="button" href="/menu" target="_blank">
            Menu pelanggan <ArrowUpRight size={16} />
          </a>
          <div className="profile">
            <div className="avatar">{actor.name.slice(0, 2).toUpperCase()}</div>
            <div>
              <strong>{actor.name}</strong>
              <small>{actor.role === 'admin' ? 'Pemilik / admin' : 'Karyawan'}</small>
            </div>
            <button className="icon-button" onClick={logout} aria-label="Keluar">
              <LogOut size={17} />
            </button>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="topbar">
          <div className="row">
            <SidebarTrigger />
            <span>Workspace</span>
            <span className="muted">/</span>
            <strong>{title}</strong>
          </div>
          <div className="row">
            <button
              className="icon-button"
              aria-label="Kalkulator cepat"
              onClick={() => setModal({ title: 'Kalkulator cepat', calculator: true })}
            >
              <Calculator size={19} />
            </button>
            <span className={'connection ' + (error ? 'offline' : '')}>
              {error ? 'Koneksi terputus' : 'Tersinkron'}
            </span>
            <small className="hide-mobile">{synced} WITA</small>
          </div>
        </header>
        <main className="workspace">
          {error && (
            <div role="alert" className="error">
              {error} · Perubahan belum dikonfirmasi sampai server merespons.
              <button className="button" onClick={() => load()}>
                Coba lagi
              </button>
            </div>
          )}
          {![
            'dashboard',
            'settings',
            'pos',
            'roster',
            'financials',
            'payroll',
            'attendance',
            'chat',
          ].includes(tab) && (
            <div className="page-search">
              <Search size={17} />
              <input
                placeholder="Cari…"
                aria-label="Cari data"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}
          {content}
        </main>
        <footer className="app-footer">
          <span>Winds Space · Operasional v1</span>
          <span>Pembaruan otomatis 3 detik · Jadwal WITA</span>
        </footer>
      </SidebarInset>
      <Dialog
        open={!!modal}
        onOpenChange={(v) => {
          if (!busy && !v) setModal(null);
        }}
      >
        <DialogContent className="editor-dialog">
          <DialogHeader>
            <DialogTitle>{modal?.title}</DialogTitle>
            <DialogDescription>
              {modal?.description ||
                'Isi data lalu simpan. Perubahan berlaku pada semua perangkat.'}
            </DialogDescription>
          </DialogHeader>
          {modal?.calculator ? (
            <CalculatorPanel />
          ) : modal?.qr ? (
            <QrPanel tables={s.tables} name={settings?.name || 'Winds Space'} />
          ) : (
            modal && (
              <Editor
                key={modal.title + JSON.stringify(modal.initial)}
                fields={modal.fields}
                initial={modal.initial}
                ingredients={s.ingredients}
                busy={busy}
                onSave={async (data) => {
                  if (await modal.submit(data)) setModal(null);
                }}
              />
            )
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async () => {
                const c = confirm;
                setConfirm(null);
                await c.run();
              }}
            >
              Konfirmasi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={!!receipt} onOpenChange={(v) => !v && setReceipt(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Struk transaksi</DialogTitle>
            <DialogDescription>
              Gunakan printer yang terhubung ke perangkat kasir.
            </DialogDescription>
          </DialogHeader>
          {receipt && <ReceiptView order={receipt} settings={settings} />}
          <button className="button primary no-print" onClick={() => window.print()}>
            <Printer size={17} />
            Cetak struk
          </button>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
function RecipeBuilder({
  value,
  ingredients,
  onChange,
}: {
  value: { ingredientId: string; amount: number }[];
  ingredients: Row[];
  onChange: (value: { ingredientId: string; amount: number }[]) => void;
}) {
  const cost = value.reduce(
    (sum, item) =>
      sum + ingredientUnitCost(ingredients.find((i) => i.id === item.ingredientId)) * item.amount,
    0,
  );
  return (
    <div className="recipe-builder stack">
      <p className="muted">
        Masukkan jumlah yang dipakai untuk satu porsi, bukan jumlah kemasan. Contoh: susu 80 ml dan
        cup 1 pcs.
      </p>
      {value.map((item, index) => {
        const ingredient = ingredients.find((i) => i.id === item.ingredientId);
        return (
          <div className="recipe-editor-item" key={index}>
            <Choice
              label={'Bahan resep ' + (index + 1)}
              value={item.ingredientId}
              onChange={(ingredientId) =>
                onChange(value.map((row, i) => (i === index ? { ...row, ingredientId } : row)))
              }
              options={[
                { value: '', label: 'Pilih bahan' },
                ...ingredients.map((i) => ({ value: i.id, label: i.name + ' (' + i.unit + ')' })),
              ]}
            />
            <label>
              Jumlah pemakaian
              <input
                aria-label={'Jumlah bahan ' + (index + 1)}
                type="number"
                min="0.001"
                step="0.001"
                required
                value={item.amount}
                onChange={(e) =>
                  onChange(
                    value.map((row, i) =>
                      i === index ? { ...row, amount: Number(e.target.value) } : row,
                    ),
                  )
                }
              />
              <small>{ingredient?.unit || 'Pilih bahan'}</small>
            </label>
            <button
              type="button"
              className="icon-button danger"
              aria-label={'Hapus bahan ' + (index + 1)}
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            >
              <Trash2 size={16} />
            </button>
            <div className="recipe-editor-detail">
              {ingredient ? (
                <>
                  <span>
                    {ingredientQuantity(item.amount)} {ingredient.unit} ×{' '}
                    {preciseMoney(ingredientUnitCost(ingredient))}/{ingredient.unit}
                  </span>
                  <strong>{preciseMoney(ingredientUnitCost(ingredient) * item.amount)}</strong>
                </>
              ) : (
                <span>Pilih bahan untuk melihat biaya pemakaiannya.</span>
              )}
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className="button"
        onClick={() => onChange([...value, { ingredientId: '', amount: 1 }])}
      >
        <Plus size={16} />
        Tambah bahan
      </button>
      <div className="notice">
        <strong>Total HPP / porsi: {money(Math.round(cost))}</strong>
        <p>
          Biaya bahan dijumlahkan tanpa pembulatan per satuan; total per porsi dibulatkan ke rupiah.
        </p>
      </div>
    </div>
  );
}
function Editor({
  fields,
  initial,
  ingredients,
  busy,
  onSave,
}: {
  fields: Field[];
  initial: any;
  ingredients: Row[];
  busy: boolean;
  onSave: (v: any) => Promise<void>;
}) {
  const [v, setV] = useState<any>(() =>
      Object.fromEntries(
        fields.map((f) => {
          let value =
            initial[f.key] ?? f.default ?? (f.type === 'multi' || f.type === 'recipe' ? [] : '');
          if (f.type === 'datetime-local' && value)
            value = new Date(new Date(value).getTime() + 8 * 3600000).toISOString().slice(0, 16);
          return [f.key, value];
        }),
      ),
    ),
    [uploading, setUploading] = useState(false);
  const change = (key: string, value: any) => setV((x: any) => ({ ...x, [key]: value }));
  return (
    <form
      className="form-grid"
      onSubmit={async (e) => {
        e.preventDefault();
        const data = { ...v };
        for (const f of fields) {
          if (
            f.required &&
            (data[f.key] === '' || (Array.isArray(data[f.key]) && !data[f.key].length))
          ) {
            toast.error('Lengkapi ' + f.label);
            return;
          }
          if (f.type === 'number') data[f.key] = Number(data[f.key] || 0);
          if (f.type === 'datetime-local' && data[f.key])
            data[f.key] = new Date(data[f.key] + '+08:00').toISOString();
        }
        if (
          fields.some((f) => f.key === 'packageQuantity') &&
          (!Number.isFinite(data.packageQuantity) || data.packageQuantity <= 0)
        ) {
          toast.error('Isi per kemasan harus lebih dari nol.');
          return;
        }
        await onSave(data);
      }}
    >
      {initial._legacyPricing && (
        <div className="notice warning cost-preview">
          Data lama masih memakai biaya per satuan. Isi harga dan ukuran kemasan yang sebenarnya.
          Periksa satuan stok dan jumlah pemakaian pada resep setelah mengubahnya.
        </div>
      )}
      {fields
        .filter(
          (f) =>
            !fields.some((item) => item.key === 'trackStock') ||
            !['stock', 'minStock'].includes(f.key) ||
            v.trackStock === true,
        )
        .map((f) => (
          <div className="field" key={f.key}>
            <label htmlFor={'field-' + f.key}>
              {f.label}
              {f.required ? ' *' : ''}
            </label>
            {f.type === 'select' ? (
              <Choice
                label={f.label}
                value={v[f.key]}
                onChange={(value) => change(f.key, value)}
                options={[{ value: '', label: 'Pilih…' }, ...(f.options || [])]}
              />
            ) : f.type === 'multi' ? (
              <div className="checkbox-group">
                {f.options?.map((o) => (
                  <label className="row" key={o.value}>
                    <Checkbox
                      checked={v[f.key].includes(o.value)}
                      onCheckedChange={(checked) =>
                        change(
                          f.key,
                          checked
                            ? [...v[f.key], o.value]
                            : v[f.key].filter((id: string) => id !== o.value),
                        )
                      }
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            ) : f.type === 'boolean' ? (
              <label className="row">
                <Checkbox
                  checked={!!v[f.key]}
                  onCheckedChange={(checked) => change(f.key, checked === true)}
                />
                {f.key === 'trackStock' ? 'Aktifkan pelacakan stok' : 'Ya, sudah dilakukan'}
              </label>
            ) : f.type === 'textarea' ? (
              <textarea
                id={'field-' + f.key}
                value={v[f.key]}
                required={f.required}
                maxLength={2000}
                onChange={(e) => change(f.key, e.target.value)}
              />
            ) : f.type === 'image' ? (
              <div>
                <input
                  id={'field-' + f.key}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploading(true);
                    try {
                      const r = await fetch('/api/upload', {
                        method: 'POST',
                        headers: { 'Content-Type': file.type },
                        body: file,
                      });
                      const d: any = await r.json();
                      if (!r.ok) throw Error(d.error);
                      change(f.key, d.url);
                      toast.success('Gambar diunggah');
                    } catch (e: any) {
                      toast.error(e.message);
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
                {v[f.key] && (
                  <div className="row">
                    <img className="image-preview" src={v[f.key]} alt="Pratinjau" />
                    <button type="button" className="button" onClick={() => change(f.key, '')}>
                      Lepas gambar
                    </button>
                  </div>
                )}
                <small>PNG, JPEG, atau WebP · maksimal 2 MB</small>
              </div>
            ) : f.type === 'recipe' ? (
              <RecipeBuilder
                value={v[f.key] || []}
                ingredients={ingredients}
                onChange={(value) => change(f.key, value)}
              />
            ) : f.type === 'tiers' ? (
              <div className="stack">
                <div className="tier-editor-label">
                  <small>Laba dari (Rp)</small>
                  <small>Sampai (Rp)</small>
                  <small>Gaji (Rp)</small>
                </div>
                {(v[f.key] || []).map((r: any, i: number) => (
                  <div className="tier-editor" key={i}>
                    {['min', 'max', 'wage'].map((k) => (
                      <input
                        key={k}
                        aria-label={'Tier ' + (i + 1) + ' ' + k}
                        type="number"
                        min={0}
                        required={k !== 'max'}
                        placeholder={k === 'max' ? 'Tanpa batas' : ''}
                        value={r[k] ?? ''}
                        onChange={(e) =>
                          change(
                            f.key,
                            v[f.key].map((x: any, j: number) =>
                              i === j
                                ? {
                                    ...x,
                                    [k]:
                                      e.target.value === '' && k === 'max'
                                        ? null
                                        : Number(e.target.value),
                                  }
                                : x,
                            ),
                          )
                        }
                      />
                    ))}
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Hapus tier"
                      onClick={() =>
                        change(
                          f.key,
                          v[f.key].filter((_: any, j: number) => j !== i),
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <button
                  className="button"
                  type="button"
                  onClick={() => change(f.key, [...v[f.key], { min: 0, max: null, wage: 0 }])}
                >
                  Tambah tier
                </button>
              </div>
            ) : (
              <input
                id={'field-' + f.key}
                type={f.type || 'text'}
                autoComplete={f.type === 'password' ? 'new-password' : undefined}
                inputMode={f.type === 'password' ? 'numeric' : undefined}
                value={v[f.key]}
                required={f.required}
                min={f.type === 'number' ? 0 : undefined}
                step={f.step || '1'}
                maxLength={200}
                onChange={(e) => change(f.key, e.target.value)}
              />
            )}
            {f.hint && <small>{f.hint}</small>}
          </div>
        ))}
      {fields.some((f) => f.key === 'packageQuantity') && (
        <div className="notice cost-preview">
          <strong>Biaya otomatis per {v.unit || 'satuan'}</strong>
          <p>
            {Number(v.packageQuantity) > 0 && v.packagePrice !== ''
              ? `${preciseMoney(Number(v.packagePrice))} ÷ ${ingredientQuantity(Number(v.packageQuantity))} ${v.unit} = ${preciseMoney(Number(v.packagePrice) / Number(v.packageQuantity))} / ${v.unit}`
              : 'Lengkapi harga dan isi kemasan untuk melihat biaya per satuan.'}
          </p>
        </div>
      )}
      <button className="button primary" disabled={busy || uploading}>
        {busy ? 'Menyimpan…' : uploading ? 'Mengunggah…' : 'Simpan'}
      </button>
    </form>
  );
}
function CafeActivity({ orders, tables, staff }: { orders: Row[]; tables: Row[]; staff: Row[] }) {
  const making = orders.filter((o) => o.status === 'sedang_dibuat').length,
    queued = orders.filter((o) => ['diproses', 'menunggu_pembayaran'].includes(o.status)).length,
    ready = orders.filter((o) => o.status === 'siap_disajikan').length;
  return (
    <div className="activity-diagram" aria-label="Diagram aktivitas kafe berdasarkan pesanan">
      <div className="stations">
        <div className={'station ' + (queued ? 'station-active' : '')}>
          <Receipt size={23} />
          <span>Kasir</span>
          <strong>{queued}</strong>
          <small>antrean</small>
        </div>
        <div className={'station bar ' + (making ? 'station-active' : '')}>
          <Coffee size={28} />
          <span>Bar kopi</span>
          <strong>{making}</strong>
          <small>sedang dibuat</small>
          {making > 0 && (
            <div className="working-lines" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
          )}
        </div>
        <div className={'station ' + (ready ? 'station-active' : '')}>
          <Utensils size={23} />
          <span>Pengambilan</span>
          <strong>{ready}</strong>
          <small>siap disajikan</small>
        </div>
      </div>
      <div className="staff-lane">
        <span className="lane-label">TIM SHIFT</span>
        {staff.length ? (
          staff.slice(0, 4).map((person, i) => (
            <div
              className={
                'staff-token ' +
                (making ? 'at-bar working' : queued ? 'to-bar' : ready ? 'at-pickup' : 'idle')
              }
              style={{ '--i': i } as any}
              key={person.id}
            >
              <div className="avatar">{person.name.slice(0, 2).toUpperCase()}</div>
              <small>{person.name.split(' ')[0]}</small>
            </div>
          ))
        ) : (
          <p className="muted">Avatar staf muncul setelah absen masuk.</p>
        )}
      </div>
      <div className="floor-tables">
        {tables.slice(0, 8).map((t) => (
          <div className={'floor-table ' + t.status} key={t.id}>
            <Grid2X2 size={19} />
            <strong>{t.number}</strong>
            {t.status === 'terisi' && <Users size={15} />}
            <small>{labels[t.status]}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
function ReceiptView({ order: o, settings: s }: { order: Row; settings?: Row }) {
  return (
    <div id="receipt" style={{ maxWidth: (s?.printerWidth || 58) + 'mm' }}>
      <h2>{s?.name}</h2>
      <p>{s?.address}</p>
      <p>
        {o.no}
        <br />
        {dateTime(o.createdAt)} WITA
      </p>
      <hr />
      {o.items.map((i: any, n: number) => (
        <div key={n}>
          <strong>{i.name}</strong>
          <div className="row between">
            <span>
              {i.quantity} × {money(i.price)}
            </span>
            <span>{money(i.price * i.quantity)}</span>
          </div>
          {i.notes && <small>{i.notes}</small>}
        </div>
      ))}
      <hr />
      <div className="row between">
        <span>Subtotal</span>
        <span>{money(o.subtotal)}</span>
      </div>
      <div className="row between">
        <span>Diskon</span>
        <span>{money(o.discount)}</span>
      </div>
      <div className="row between">
        <span>Pajak</span>
        <span>{money(o.tax)}</span>
      </div>
      <div className="row between">
        <strong>Total</strong>
        <strong>{money(o.total)}</strong>
      </div>
      <p>
        {o.paid ? 'LUNAS · ' + o.paymentMethod.toUpperCase() : 'BELUM DIBAYAR'}
        <br />
        Kembalian {money(o.change)}
      </p>
      <p>{s?.receiptFooter}</p>
    </div>
  );
}
function downloadJson(data: any, name: string) {
  download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), name);
}
function downloadCsv(name: string, rows: any[][]) {
  const csv = rows
    .map((r) =>
      r
        .map(
          (v) =>
            '"' +
            String(v ?? '')
              .replace(/^[=+@-]/, "'$&")
              .replaceAll('"', '""') +
            '"',
        )
        .join(','),
    )
    .join('\r\n');
  download(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }), name);
}
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function QrPanel({ tables, name }: { tables: Row[]; name: string }) {
  const [tid, setTid] = useState(''),
    [url, setUrl] = useState(''),
    [qr, setQr] = useState('');
  useEffect(() => {
    const address =
      window.location.origin + '/menu' + (tid ? '?table=' + encodeURIComponent(tid) : '');
    setUrl(address);
    QRCode.toDataURL(address, { width: 320, margin: 2, errorCorrectionLevel: 'M' })
      .then(setQr)
      .catch(() => toast.error('QR belum dapat dibuat.'));
  }, [tid]);
  return (
    <div className="stack">
      <Choice
        label="Pilih meja untuk QR"
        value={tid}
        onChange={setTid}
        options={[
          { value: '', label: 'Menu umum' },
          ...tables.map((t) => ({ value: t.id, label: 'Meja ' + t.number })),
        ]}
      />
      <div className="qr-card" id="receipt">
        <h2>{name}</h2>
        <p>{tid ? 'Meja ' + tables.find((t) => t.id === tid)?.number : 'Menu digital'}</p>
        {qr && <img src={qr} alt="QR menu kafe" />}
        <p>Pindai untuk melihat menu</p>
        <small>{url}</small>
      </div>
      <button className="button primary no-print" onClick={() => window.print()}>
        <Printer size={16} />
        Cetak QR
      </button>
      <p className="muted">
        Tautan ini membuka menu pelanggan. Data operasional tetap memerlukan login ID dan PIN.
      </p>
    </div>
  );
}
function CalculatorPanel() {
  const [left, setLeft] = useState(''),
    [right, setRight] = useState(''),
    [op, setOp] = useState('+');
  const a = Number(left),
    b = Number(right),
    value = op === '+' ? a + b : op === '-' ? a - b : op === '×' ? a * b : b ? a / b : NaN;
  return (
    <div className="stack">
      <label>
        Angka pertama
        <input type="number" step="any" value={left} onChange={(e) => setLeft(e.target.value)} />
      </label>
      <Choice label="Operasi" value={op} onChange={setOp} options={opts(['+', '-', '×', '÷'])} />
      <label>
        Angka kedua
        <input type="number" step="any" value={right} onChange={(e) => setRight(e.target.value)} />
      </label>
      <output className="calculator-result">
        {Number.isFinite(value)
          ? new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(value)
          : 'Tidak dapat dibagi nol'}
      </output>
    </div>
  );
}
