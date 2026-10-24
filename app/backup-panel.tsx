'use client';
import { useEffect, useRef, useState } from 'react';
import { Download, Upload, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { dateTime } from '@/lib/model';
import { AuditArchive } from './audit-panel';
type Backup = {
  id: string;
  status: string;
  createdAt: string;
  snapshotAt: string;
  reason: string;
  revision: number;
  recordCount: number | null;
  files: number;
  missingFiles: number;
  bytes: number;
  phase: string;
};
async function post(value: any, signal?: AbortSignal) {
  const response = await fetch('/api/backups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
    signal,
  });
  const data: any = await response.json();
  if (!response.ok) throw Error(data.error || 'Permintaan cadangan gagal.');
  return data;
}
const size = (bytes: number) =>
  new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024) + ' MB';
export default function BackupPanel({ onRestored }: { onRestored: () => Promise<unknown> }) {
  const [backups, setBackups] = useState<Backup[]>([]),
    [jobs, setJobs] = useState<any[]>([]),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(''),
    [error, setError] = useState(''),
    [preview, setPreview] = useState<any>(null),
    [selected, setSelected] = useState<Backup | null>(null),
    [archive, setArchive] = useState(''),
    [reason, setReason] = useState(''),
    [pin, setPin] = useState(''),
    [phrase, setPhrase] = useState('');
  const controller = useRef<AbortController | null>(null),
    running = useRef(false);
  async function load() {
    const response = await fetch('/api/backups', { cache: 'no-store' }),
      data: any = await response.json();
    if (!response.ok) throw Error(data.error);
    setBackups(data.backups);
    setJobs(data.jobs || []);
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
    return () => controller.current?.abort();
  }, []);
  async function perform(work: (signal: AbortSignal) => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    const c = new AbortController();
    controller.current = c;
    try {
      await work(c.signal);
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setError(e.message);
        toast.error(e.message);
      }
    } finally {
      running.current = false;
      setBusy(false);
      setProgress('');
      void load().catch(() => {});
    }
  }
  async function copy(id: string, signal: AbortSignal) {
    for (let i = 0; i < 3000; i++) {
      const data = await post({ action: 'step', id }, signal);
      setProgress(data.phase + ' · ' + data.files + ' gambar tersalin');
      if (data.status === 'ready') {
        if (data.missingFiles)
          toast.warning(
            'Cadangan selesai, tetapi ' +
              data.missingFiles +
              ' gambar sumber sudah tidak tersedia.',
          );
        return;
      }
      if (signal.aborted) throw new DOMException('Dibatalkan', 'AbortError');
    }
    throw Error('Proses panjang dijeda. Klik Lanjutkan untuk meneruskan.');
  }
  const create = () =>
    perform(async (signal) => {
      setProgress('Mengambil snapshot data…');
      const { id } = await post({ action: 'create', reason: 'Cadangan manual' }, signal);
      await copy(id, signal);
      toast.success('Cadangan data, gambar dan audit tersimpan.');
    });
  async function resumeRestore(id: string, signal: AbortSignal) {
    for (let i = 0; i < 3000; i++) {
      const data = await post({ action: 'restore.step', id }, signal);
      setProgress(data.phase || 'Memeriksa cadangan pengaman…');
      if (data.status === 'completed') break;
      if (data.status === 'ready') {
        await post({ action: 'restore.commit', id }, signal);
        break;
      }
      if (i === 2999) throw Error('Proses dijeda. Lanjutkan pemulihan dari daftar proses.');
    }
    setPreview(null);
    setSelected(null);
    setPin('');
    setPhrase('');
    toast.success('Data dipulihkan. ID/PIN akun lain perlu diatur ulang melalui Karyawan.');
    await onRestored();
  }
  const restore = () =>
    perform(async (signal) => {
      const currentPin = pin;
      setPin('');
      const job = await post(
        {
          action: 'restore.start',
          ticket: preview.ticket,
          currentPin,
          confirmation: phrase,
          reason,
        },
        signal,
      );
      await resumeRestore(job.id, signal);
    });
  return (
    <section className="panel backup-panel" aria-label="Cadangan dan pemulihan">
      <div className="section-head">
        <div>
          <ShieldCheck className="accent" />
          <h2>Cadangan & pemulihan</h2>
        </div>
        <button
          className="icon-button"
          disabled={busy}
          aria-label="Muat ulang cadangan"
          onClick={() => void load().catch((e) => setError(e.message))}
        >
          <RefreshCw size={17} />
        </button>
      </div>
      <p className="muted">
        Cadangan mencakup data operasional, gambar unggahan, serta audit yang tersedia. PIN dan sesi
        login tidak disertakan. Simpan paket unduhan di tempat pribadi.
      </p>
      <div className="row wrap">
        <button className="button primary" disabled={busy} onClick={create}>
          <ShieldCheck size={16} />
          Buat cadangan lengkap
        </button>
        <label className={'button ' + (busy ? 'disabled' : '')}>
          <Upload size={16} />
          Unggah paket cadangan
          <input
            className="sr-only"
            type="file"
            accept=".jsonl,.json,application/x-ndjson,application/json"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              if (file.size > 32 * 1024 * 1024) {
                setError(
                  'Unggahan maksimal 32 MB. Cadangan besar dapat dipulihkan langsung dari server.',
                );
                return;
              }
              void perform(async (signal) => {
                setProgress('Mengunggah paket…');
                const response = await fetch('/api/backups?upload=1', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/octet-stream' },
                    body: file,
                    signal,
                  }),
                  data: any = await response.json();
                if (!response.ok) throw Error(data.error);
                await copy(data.id, signal);
                toast.success('Paket terbaca. Pilih Periksa pemulihan untuk meninjau isinya.');
              });
            }}
          />
        </label>
      </div>
      <small className="muted">
        Paket .winds.jsonl atau JSON lama · unggahan maksimal 32 MB. JSON lama hanya memuat
        audit/gambar yang masih tersedia. Gambar dari URL eksternal/Drive tetap bergantung pada
        sumbernya; yang disalin adalah gambar unggahan situs.
      </small>
      {busy && (
        <div className="notice" role="status">
          {progress || 'Memproses…'}
          <button className="button" onClick={() => controller.current?.abort()}>
            Jeda
          </button>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {jobs
        .filter((job) => job.status !== 'completed')
        .map((job) => (
          <div className="notice warning" key={job.id}>
            Pemulihan belum selesai · {dateTime(job.created_at)} WITA
            <button
              className="button"
              disabled={busy}
              onClick={() => void perform((signal) => resumeRestore(job.id, signal))}
            >
              Lanjutkan pemulihan
            </button>
          </div>
        ))}
      <div className="backup-list">
        {backups.map((backup) => (
          <article className="backup-card" key={backup.id}>
            <strong>{dateTime(backup.snapshotAt)} WITA</strong>
            <span className="badge">
              {backup.status === 'ready'
                ? 'Siap'
                : backup.status === 'failed'
                  ? 'Gagal'
                  : 'Belum selesai'}
            </span>
            <p>{backup.reason}</p>
            {backup.snapshotAt !== backup.createdAt && (
              <small>Disimpan/diunggah: {dateTime(backup.createdAt)} WITA</small>
            )}
            <small>
              {backup.recordCount ?? 'Paket'} catatan · {backup.files} gambar · {size(backup.bytes)}
            </small>
            {backup.missingFiles > 0 && (
              <p className="warning">
                {backup.missingFiles} gambar sumber tidak tersedia; tautan tersebut belum dapat
                dipulihkan.
              </p>
            )}
            <div className="row wrap">
              {backup.status === 'ready' ? (
                <>
                  <a className="button" href={'/api/backups?id=' + backup.id + '&download=1'}>
                    <Download size={15} />
                    Unduh paket
                  </a>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      void perform(async (signal) => {
                        const data = await post({ action: 'preview', id: backup.id }, signal);
                        setPreview(data);
                        setSelected(backup);
                        setReason('');
                        setPhrase('');
                        setPin('');
                      })
                    }
                  >
                    Periksa pemulihan
                  </button>
                  <button className="button" onClick={() => setArchive(backup.id)}>
                    Audit cadangan
                  </button>
                </>
              ) : (
                backup.status !== 'failed' && (
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => void perform((signal) => copy(backup.id, signal))}
                  >
                    Lanjutkan
                  </button>
                )
              )}
            </div>
          </article>
        ))}
      </div>
      {!backups.length && <p className="muted">Belum ada cadangan tersimpan.</p>}
      {preview && selected && (
        <section className="restore-preview" aria-label="Pratinjau pemulihan">
          <h3>Periksa sebelum memulihkan</h3>
          <p>
            {dateTime(selected.snapshotAt)} WITA · {preview.counts.added} ditambahkan,{' '}
            {preview.counts.changed} diganti, {preview.counts.deleted} dihapus.
          </p>
          <details>
            <summary>Perbandingan koleksi data</summary>
            <ul>
              {preview.collections.map((collection: any) => (
                <li key={collection.kind}>
                  {collection.kind}: {collection.before} → {collection.after}
                </li>
              ))}
            </ul>
          </details>
          <p className="notice warning">
            Pemulihan mengganti data operasional saat ini. Hentikan sementara pencatatan transaksi.
            Cadangan kondisi saat ini dibuat terlebih dahulu; perubahan baru akan membatalkan
            pemulihan. Akun pemilik dan admin pelaku dipertahankan; ID/PIN akun lain perlu dibuat
            ulang. Audit saat ini tetap disimpan.
          </p>
          {preview.missingFiles > 0 && (
            <p className="warning">
              Paket ini tidak mempunyai {preview.missingFiles} gambar sumber.
            </p>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void restore();
            }}
          >
            <label>
              Alasan pemulihan
              <textarea
                required
                maxLength={2000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <label>
              PIN admin saat ini
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                required
                minLength={8}
                maxLength={12}
                value={pin}
                onChange={(event) => setPin(event.target.value)}
              />
            </label>
            <label>
              Ketik PULIHKAN
              <input
                required
                autoComplete="off"
                value={phrase}
                onChange={(event) => setPhrase(event.target.value)}
                pattern="PULIHKAN"
              />
            </label>
            <div className="row wrap">
              <button className="button danger" disabled={busy || phrase !== 'PULIHKAN'}>
                Buat cadangan pengaman & pulihkan
              </button>
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => {
                  setPreview(null);
                  setPin('');
                }}
              >
                Batal
              </button>
            </div>
          </form>
        </section>
      )}
      {archive && <AuditArchive backupId={archive} onClose={() => setArchive('')} />}
    </section>
  );
}
