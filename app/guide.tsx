'use client';
// How to Winds Space: the handbook for running the café, open to staff and admins. Built-in
// chapters (app/guide-content.ts) plus the rules and SOP the admin writes here; theirs are saved
// as `guides` records, so every device shows them as soon as they are saved. Long processes are
// drawn as flows: steps joined by arrows, and choices that split into branches.
import { Fragment, useMemo, useState } from 'react';
import { BookMarked, ChevronRight, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import type { Row, State } from '@/lib/model';
import { blockText, inline, parseGuide, type Block, type FlowStep } from '@/lib/guide-text';
import { CHAPTERS, GUIDE_GROUPS, type Chapter, type GuideGroup } from './guide-content';
import styles from './guide.module.css';

type Props = {
  s: State;
  admin: boolean;
  busy: boolean;
  act: (action: string, payload: Record<string, unknown>, success?: string) => Promise<unknown>;
};
type Shown = Chapter & { record?: Row };
type Draft = { id?: string; title: string; group: GuideGroup; body: string; sortOrder: number };

const EXAMPLE = `Tulis aturan dengan kalimat biasa. Contoh format:

## Membuka kafe
1. Nyalakan mesin kopi 20 menit sebelum buka
2. Cek stok susu dan es batu
- Poin biasa diawali tanda minus
> Catatan diawali tanda >
! Peringatan diawali tanda !
Datang -> Cek in | di Ringkasan -> Siapkan bar -> Buka pintu
? Pelanggan komplain?
* Minuman salah: Minta maaf -> Buat ulang
* Lainnya: Catat -> Lapor admin`;

/** Text with **bold**. */
function Text({ children }: { children: string }) {
  return (
    <>
      {inline(children).map((part, i) =>
        part.bold ? <b key={i}>{part.text}</b> : <Fragment key={i}>{part.text}</Fragment>,
      )}
    </>
  );
}

/** Steps joined by arrows; wraps onto more rows on a narrow screen. */
function Flow({ steps }: { steps: FlowStep[] }) {
  return (
    <ol className={styles.flow}>
      {steps.map((st, i) => (
        <li key={i}>
          <span className={styles.step}>
            <b>
              <Text>{st.title}</Text>
            </b>
            {st.sub && (
              <small>
                <Text>{st.sub}</Text>
              </small>
            )}
          </span>
          {i < steps.length - 1 && <ChevronRight className={styles.arrow} aria-hidden size={18} />}
        </li>
      ))}
    </ol>
  );
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        if ('h' in b)
          return (
            <h4 key={i}>
              <Text>{b.h}</Text>
            </h4>
          );
        if ('p' in b)
          return (
            <p key={i}>
              <Text>{b.p}</Text>
            </p>
          );
        if ('ul' in b)
          return (
            <ul key={i}>
              {b.ul.map((x, j) => (
                <li key={j}>
                  <Text>{x}</Text>
                </li>
              ))}
            </ul>
          );
        if ('ol' in b)
          return (
            <ol key={i} className={styles.steps}>
              {b.ol.map((x, j) => (
                <li key={j}>
                  <Text>{x}</Text>
                </li>
              ))}
            </ol>
          );
        if ('note' in b || 'warn' in b) {
          const warn = 'warn' in b;
          return (
            <div key={i} className={warn ? styles.warn : styles.note}>
              {b.title && <b>{b.title}</b>}
              <span>
                <Text>{warn ? b.warn : b.note}</Text>
              </span>
            </div>
          );
        }
        if ('flow' in b) return <Flow key={i} steps={b.flow} />;
        if ('choice' in b)
          return (
            <div key={i} className={styles.choice}>
              <p className={styles.question}>
                <Text>{b.choice}</Text>
              </p>
              <div className={styles.branches}>
                {b.options.map((o, j) => (
                  <div key={j} className={styles.branch}>
                    <span className={styles.answer}>
                      <Text>{o.label}</Text>
                    </span>
                    <Flow steps={o.steps} />
                  </div>
                ))}
              </div>
            </div>
          );
        return (
          <div key={i} className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  {b.table.head.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.table.rows.map((r, j) => (
                  <tr key={j}>
                    {r.map((c, k) => (
                      <td key={k}>
                        <Text>{c}</Text>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', {
    timeZone: 'Asia/Makassar',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export default function Guide({ s, admin, busy, act }: Props) {
  const [query, setQuery] = useState(''),
    [draft, setDraft] = useState<Draft | null>(null),
    [removing, setRemoving] = useState('');
  // The admin's rules go first in their group, by their order number and then title.
  const chapters = useMemo<Shown[]>(() => {
    const written: Shown[] = [...s.guides]
      .sort(
        (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.title).localeCompare(b.title),
      )
      .map((r) => ({
        id: 'g-' + r.id,
        group: r.group as GuideGroup,
        title: r.title,
        lead: '',
        blocks: parseGuide(r.body || ''),
        record: r,
      }));
    const builtIn = CHAPTERS.filter((c) => admin || !c.adminOnly);
    return GUIDE_GROUPS.flatMap((g) => [
      ...written.filter((c) => c.group === g.id),
      ...builtIn.filter((c) => c.group === g.id),
    ]);
  }, [s.guides, admin]);
  const q = query.trim().toLowerCase();
  const shown = q
    ? chapters.filter((c) =>
        (c.title + ' ' + c.lead + ' ' + blockText(c.blocks)).toLowerCase().includes(q),
      )
    : chapters;
  const number = new Map(chapters.map((c, i) => [c.id, i + 1]));
  const save = async () => {
    if (!draft) return;
    const ok = await act(
      'save',
      {
        kind: 'guides',
        id: draft.id,
        data: {
          title: draft.title,
          group: draft.group,
          body: draft.body,
          sortOrder: draft.sortOrder,
        },
      },
      'Aturan tersimpan',
    );
    if (ok) setDraft(null);
  };
  const preview = useMemo(() => (draft ? parseGuide(draft.body) : []), [draft]);

  return (
    <div className={styles.guide}>
      <header className={styles.cover}>
        <p className={styles.eyebrow}>Winds Space · Pangkep</p>
        <h2>How to Winds Space</h2>
        <p>
          Semua yang perlu dipahami untuk menjalankan Winds Space: SOP, cara memakai sistem, member,
          perpustakaan, game, dan aturan dari admin.
        </p>
        <div className={styles.tools}>
          <label className={styles.search}>
            <Search size={16} aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari: cek in, stamp, pesanan lampau…"
              aria-label="Cari di panduan"
            />
            {query && (
              <button type="button" aria-label="Hapus pencarian" onClick={() => setQuery('')}>
                <X size={15} />
              </button>
            )}
          </label>
          {admin && !draft && (
            <button
              className="button primary"
              onClick={() =>
                setDraft({ title: '', group: 'aturan', body: '', sortOrder: s.guides.length })
              }
            >
              <Plus size={16} /> Tambah aturan
            </button>
          )}
        </div>
      </header>

      {admin && draft && (
        <section className={styles.editor}>
          <div className={styles.editorHead}>
            <h3>{draft.id ? 'Ubah aturan' : 'Aturan baru'}</h3>
            <button className="icon-button" aria-label="Tutup" onClick={() => setDraft(null)}>
              <X size={18} />
            </button>
          </div>
          <div className={styles.editorGrid}>
            <div className={styles.fields}>
              <label>
                Judul
                <input
                  value={draft.title}
                  maxLength={200}
                  placeholder="Misal: SOP membuka kafe"
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </label>
              <label>
                Bagian
                <select
                  value={draft.group}
                  onChange={(e) => setDraft({ ...draft, group: e.target.value as GuideGroup })}
                >
                  {GUIDE_GROUPS.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Isi
                <textarea
                  rows={14}
                  value={draft.body}
                  placeholder={EXAMPLE}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                />
              </label>
              <details className={styles.help}>
                <summary>Cara menulis daftar, catatan, dan alur visual</summary>
                <pre>{EXAMPLE}</pre>
              </details>
              <div className="row">
                <button
                  className="button primary"
                  disabled={busy || !draft.title.trim() || !draft.body.trim()}
                  onClick={save}
                >
                  {busy ? 'Menyimpan…' : 'Simpan'}
                </button>
                <button className="button" onClick={() => setDraft(null)}>
                  Batal
                </button>
              </div>
            </div>
            <div className={styles.preview}>
              <small className="muted">Pratinjau</small>
              <article className={styles.chapter}>
                <h3>{draft.title || 'Judul aturan'}</h3>
                {preview.length ? (
                  <Blocks blocks={preview} />
                ) : (
                  <p className="muted">Isi aturan akan tampil di sini.</p>
                )}
              </article>
            </div>
          </div>
        </section>
      )}

      <div className={styles.book}>
        <nav className={styles.toc} aria-label="Daftar isi">
          <details open>
            <summary>
              <BookMarked size={16} aria-hidden /> Daftar isi
            </summary>
            {GUIDE_GROUPS.map((g) => {
              const items = shown.filter((c) => c.group === g.id);
              if (!items.length) return null;
              return (
                <div key={g.id}>
                  <h4>{g.title}</h4>
                  <ol>
                    {items.map((c) => (
                      <li key={c.id}>
                        <a href={'#' + c.id}>
                          <span>{number.get(c.id)}</span>
                          {c.title}
                        </a>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
            {!shown.length && <p className="muted">Tidak ada bab yang cocok.</p>}
          </details>
        </nav>

        <div className={styles.pages}>
          {GUIDE_GROUPS.map((g) => {
            const items = shown.filter((c) => c.group === g.id);
            if (!items.length && !(g.id === 'aturan' && admin && !q)) return null;
            return (
              <Fragment key={g.id}>
                <div className={styles.part}>
                  <h3>{g.title}</h3>
                  <p>{g.lead}</p>
                </div>
                {g.id === 'aturan' && !items.length && (
                  <p className="muted">
                    Belum ada aturan. Tekan <b>Tambah aturan</b> untuk menulis SOP atau aturan kafe.
                  </p>
                )}
                {items.map((c) => (
                  <article key={c.id} id={c.id} className={styles.chapter}>
                    <span className={styles.num}>
                      BAB {number.get(c.id)}
                      {c.record && ' · dari admin'}
                      {c.adminOnly && ' · khusus admin'}
                    </span>
                    <h3>{c.title}</h3>
                    {c.lead && <p className={styles.lead}>{c.lead}</p>}
                    <Blocks blocks={c.blocks} />
                    {c.record && (
                      <div className={styles.meta}>
                        <small className="muted">
                          Diperbarui {c.record.updatedAt ? when(c.record.updatedAt) : '-'}
                          {c.record.updatedBy ? ` oleh ${c.record.updatedBy}` : ''}
                        </small>
                        {admin && (
                          <div className="row">
                            <button
                              className="button"
                              onClick={() => {
                                setDraft({
                                  id: c.record!.id,
                                  title: c.record!.title,
                                  group: c.record!.group,
                                  body: c.record!.body,
                                  sortOrder: c.record!.sortOrder || 0,
                                });
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                            >
                              <Pencil size={15} /> Ubah
                            </button>
                            {removing === c.record.id ? (
                              <>
                                <button
                                  className="button danger"
                                  disabled={busy}
                                  onClick={async () => {
                                    await act(
                                      'delete',
                                      {
                                        kind: 'guides',
                                        id: c.record!.id,
                                        reason: 'Dihapus dari How to Winds Space',
                                      },
                                      'Aturan dihapus',
                                    );
                                    setRemoving('');
                                  }}
                                >
                                  Ya, hapus
                                </button>
                                <button className="button" onClick={() => setRemoving('')}>
                                  Batal
                                </button>
                              </>
                            ) : (
                              <button className="button" onClick={() => setRemoving(c.record!.id)}>
                                <Trash2 size={15} /> Hapus
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
