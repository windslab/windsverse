'use client';
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { dateTime } from '@/lib/model';
import { parseAuditDetail } from '@/lib/audit';
const names: Record<string, string> = {
  access: 'Akses akun',
  orders: 'Pesanan',
  attendance: 'Absensi',
  shifts: 'Shift',
  expenses: 'Pengeluaran',
  payrolls: 'Gaji',
  ingredients: 'Bahan baku',
  recipes: 'Resep',
  settings: 'Pengaturan',
  employees: 'Karyawan',
  tiers: 'Tier gaji',
  products: 'Menu',
  books: 'Buku',
  loans: 'Peminjaman',
};
const actions: Record<string, string> = {
  'order.create': 'Catat pesanan',
  'order.pay': 'Terima pembayaran pesanan',
  'order.status': 'Ubah status pesanan',
  'attendance.in': 'Check-in',
  'attendance.out': 'Check-out',
  'roster.bulk': 'Buat roster cepat',
  'shift.open': 'Mulai shift',
  'shift.close': 'Selesaikan shift',
  'book.borrow': 'Pinjam buku',
  'book.return': 'Kembalikan buku',
  'note.add': 'Tambah catatan',
  'note.delete': 'Hapus catatan',
  'feedback.add': 'Masukan pengunjung',
  'feedback.respond': 'Tindak lanjut masukan',
  save: 'Simpan/ubah data',
  delete: 'Hapus data',
  'order.correct': 'Koreksi transaksi',
  'order.hpp.correct': 'Lengkapi HPP',
  'order.delete': 'Hapus transaksi',
  'attendance.correct': 'Koreksi absensi',
  'attendance.delete': 'Hapus absensi',
  'tiers.replace': 'Ubah tier gaji',
  'payroll.generate': 'Hitung payroll',
  'payroll.pay': 'Catat pembayaran gaji',
  'backup.create': 'Buat cadangan',
  'backup.import': 'Unggah cadangan',
  'backup.restore.requested': 'Minta pemulihan',
  'backup.restore': 'Pemulihan data',
  'auth.credentials': 'Atur ID/PIN',
  'auth.revoke': 'Cabut akses',
};
const display = (value: any) =>
  value === null
    ? 'Tidak ada catatan'
    : typeof value === 'string'
      ? value
      : JSON.stringify(value, null, 2);
function RecordChange({ change }: { change: any }) {
  const before = change.before,
    after = change.after,
    keys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])].filter(
      (key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]),
    );
  return (
    <article className="audit-change">
      <h4>
        {names[change.kind] || change.kind} ·{' '}
        {after?.no || before?.no || after?.name || before?.name || change.recordId}
      </h4>
      <small>{before === null ? 'Ditambahkan' : after === null ? 'Dihapus' : 'Diubah'}</small>
      <div className="audit-compare">
        <section>
          <h5>Sebelum</h5>
          <pre>
            {before === null
              ? 'Tidak ada catatan'
              : display(Object.fromEntries(keys.map((key) => [key, before?.[key] ?? null])))}
          </pre>
        </section>
        <section>
          <h5>Sesudah</h5>
          <pre>
            {after === null
              ? 'Catatan dihapus'
              : display(Object.fromEntries(keys.map((key) => [key, after?.[key] ?? null])))}
          </pre>
        </section>
      </div>
    </article>
  );
}
async function request(url: string) {
  const response = await fetch(url, { cache: 'no-store' }),
    data: any = await response.json();
  if (!response.ok) throw Error(data.error || 'Audit belum dapat dimuat.');
  return data;
}
export default function AuditPanel() {
  const [events, setEvents] = useState<any[]>([]),
    [next, setNext] = useState<string | null>(null),
    [action, setAction] = useState(''),
    [selected, setSelected] = useState<any>(null),
    [changes, setChanges] = useState<any[]>([]),
    [nextOffset, setNextOffset] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function load(more = false) {
    setBusy(true);
    setError('');
    try {
      const data = await request(
        '/api/audit?' +
          new URLSearchParams({
            ...(action ? { action } : {}),
            ...(more && next ? { before: next } : {}),
          }),
      );
      setEvents((previous) => (more ? [...previous, ...data.events] : data.events));
      setNext(data.next);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, [action]);
  async function details(id: string, offset = 0) {
    setBusy(true);
    setError('');
    try {
      const data = await request('/api/audit?id=' + encodeURIComponent(id) + '&offset=' + offset);
      setSelected(data.event);
      setChanges((previous) => (offset ? [...previous, ...data.changes] : data.changes));
      setNextOffset(data.nextOffset);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel audit-panel" aria-label="Riwayat perubahan">
      <div className="section-head">
        <h2>Riwayat perubahan</h2>
        <button className="button" disabled={busy} onClick={() => void load()}>
          <RefreshCw size={16} />
          Muat ulang
        </button>
      </div>
      <p className="muted">
        Nilai sebelum/sesudah dicatat sejak pembaruan ini. Audit lama tetap tampil, tetapi detail
        yang sebelumnya tidak direkam tidak dapat dibuat ulang. PIN dan sesi login tidak
        ditampilkan.
      </p>
      <label>
        Jenis tindakan
        <select
          value={action}
          onChange={(event) => {
            setAction(event.target.value);
            setSelected(null);
          }}
        >
          <option value="">Semua tindakan</option>
          {Object.entries(actions).map(([key, value]) => (
            <option key={key} value={key}>
              {value}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="audit-events">
        {events.map((event) => (
          <article key={event.id}>
            <div>
              <strong>{actions[event.action] || event.action}</strong>
              <small>
                {dateTime(event.created_at)} WITA · {event.detail.actorName || event.actor_id}
              </small>
              {event.detail.reason && <p>{event.detail.reason}</p>}
            </div>
            <button className="button" disabled={busy} onClick={() => void details(event.id)}>
              Lihat perubahan{' '}
              {event.detail.changeCount !== undefined ? '(' + event.detail.changeCount + ')' : ''}
            </button>
          </article>
        ))}
      </div>
      {next && (
        <button className="button" disabled={busy} onClick={() => void load(true)}>
          Muat riwayat lebih lama
        </button>
      )}
      {!events.length && !busy && <p className="muted">Belum ada audit untuk filter ini.</p>}
      {selected && (
        <section className="audit-detail" aria-label="Detail perubahan">
          <div className="section-head">
            <h3>{actions[selected.action] || selected.action}</h3>
            <button className="button" onClick={() => setSelected(null)}>
              Tutup detail
            </button>
          </div>
          <p>
            {dateTime(selected.created_at)} WITA · {selected.detail.actorName || selected.actor_id}
          </p>
          {selected.detail.reason && <p>Alasan: {selected.detail.reason}</p>}
          {selected.detail.safetyBackupId && (
            <p>Cadangan pengaman: {selected.detail.safetyBackupId}</p>
          )}
          {changes.map((change, index) => (
            <RecordChange key={change.recordId + ':' + index} change={change} />
          ))}
          {!changes.length && selected.detail.after !== undefined && (
            <RecordChange
              change={{
                kind: 'access',
                recordId: selected.detail.employeeId,
                before: selected.detail.before,
                after: selected.detail.after,
              }}
            />
          )}
          {!changes.length && selected.detail.after === undefined && (
            <p className="muted">
              Tidak ada detail sebelum/sesudah untuk audit ini. {selected.detail.summary || ''}
            </p>
          )}
          {nextOffset !== null && (
            <button
              className="button"
              disabled={busy}
              onClick={() => void details(selected.id, nextOffset)}
            >
              Muat catatan terkait lainnya
            </button>
          )}
        </section>
      )}
    </section>
  );
}
export function AuditArchive({ backupId, onClose }: { backupId: string; onClose: () => void }) {
  const [parts, setParts] = useState<any[]>([]),
    [rows, setRows] = useState<any[]>([]),
    [kind, setKind] = useState(''),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    void request('/api/audit?backup=' + backupId)
      .then((data) => {
        if (active) setParts(data.parts);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [backupId]);
  const select = async (part: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await request(
        '/api/audit?backup=' + backupId + '&part=' + encodeURIComponent(part),
      );
      setRows(data.rows);
      setKind(data.kind);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <section className="audit-archive" aria-label="Audit dalam cadangan">
      <div className="section-head">
        <h3>Audit dalam cadangan</h3>
        <button className="button" onClick={onClose}>
          Tutup arsip
        </button>
      </div>
      <p className="muted">
        Arsip dari cadangan, bukan aktivitas baru di situs ini. Audit saat ini tetap disimpan
        terpisah saat pemulihan.
      </p>
      <label>
        Bagian arsip
        <select
          defaultValue=""
          disabled={loading}
          onChange={(event) => void select(event.target.value)}
        >
          <option value="" disabled>
            Pilih bagian audit
          </option>
          {parts.map((part) => (
            <option key={part.id} value={part.id}>
              {part.kind.includes('changes') ? 'Sebelum/sesudah' : 'Daftar tindakan'} · {part.id}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {rows.map((row, index) =>
        kind.includes('changes') ? (
          <RecordChange
            key={index}
            change={{
              kind: row.kind,
              recordId: row.record_id,
              before: row.before_data === null ? null : JSON.parse(row.before_data),
              after: row.after_data === null ? null : JSON.parse(row.after_data),
            }}
          />
        ) : (
          <details key={index}>
            <summary>
              {dateTime(row.created_at)} · {actions[row.action] || row.action}
            </summary>
            <pre>{display(parseAuditDetail(row.detail))}</pre>
          </details>
        ),
      )}
    </section>
  );
}
