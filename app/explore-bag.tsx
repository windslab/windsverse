'use client';
// Luna's bag in explore mode: what she carries and what it's for. A notebook for ideas and
// quotes (kept in this browser), a book to read anywhere, her digicam and its tripod, and the
// Story of Winds camera.
import { useState } from 'react';
import styles from './explore-mode.module.css';
import bag from './explore-bag.module.css';

export type BagItem = 'notebook' | 'book' | 'digicam' | 'tripod' | 'storycam';

const ITEMS: { id: BagItem; name: string; note: string; icon: string }[] = [
  { id: 'notebook', name: 'Buku catatan', note: 'tulis ide & kutipan', icon: '📓' },
  { id: 'book', name: 'Buku bacaan', note: 'Catatan dari Teras', icon: '📖' },
  { id: 'digicam', name: 'Digicam', note: 'foto & video', icon: '📷' },
  { id: 'tripod', name: 'Tripod', note: 'rekam diri sendiri', icon: '🎥' },
  { id: 'storycam', name: 'Kamera Story of Winds', note: 'film & album', icon: '🎞️' },
];

export function Bag({
  tripodPlaced,
  onUse,
  onClose,
}: {
  tripodPlaced: boolean;
  onUse: (item: BagItem, action?: string) => void;
  onClose: () => void;
}) {
  return (
    <div className={styles.panel} role="dialog" aria-label="Tas Luna">
      <header>
        <strong>Tas Luna</strong>
        <button onClick={onClose} aria-label="Tutup">
          ×
        </button>
      </header>
      <ul className={bag.items}>
        {ITEMS.map((item) => (
          <li key={item.id}>
            <span className={bag.icon} aria-hidden>
              {item.icon}
            </span>
            <span className={bag.name}>
              {item.name}
              <small>{item.note}</small>
            </span>
            <span className={bag.actions}>
              {item.id === 'notebook' && <button onClick={() => onUse('notebook')}>tulis</button>}
              {item.id === 'book' && <button onClick={() => onUse('book')}>baca</button>}
              {item.id === 'digicam' && <button onClick={() => onUse('digicam')}>pakai</button>}
              {item.id === 'storycam' && <button onClick={() => onUse('storycam')}>pakai</button>}
              {item.id === 'tripod' &&
                (tripodPlaced ? (
                  <>
                    <button onClick={() => onUse('tripod', 'camera')}>kamera</button>
                    <button onClick={() => onUse('tripod', 'pack')}>ambil</button>
                  </>
                ) : (
                  <button onClick={() => onUse('tripod', 'place')}>pasang</button>
                ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Note = { id: string; kind: 'ide' | 'kutipan'; text: string; at: number };
const NOTES_KEY = 'luna-notebook-v1';
const loadNotes = (): Note[] => {
  try {
    const list = JSON.parse(localStorage.getItem(NOTES_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};
const saveNotes = (notes: Note[]) => {
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
  } catch {
    /* Storage blocked: the notes last for this visit. */
  }
};

/** The notebook: write down an idea or a quote; they stay in this browser. */
export function Notebook({ onClose }: { onClose: () => void }) {
  const [notes, setNotes] = useState<Note[]>(loadNotes),
    [kind, setKind] = useState<Note['kind']>('ide'),
    [text, setText] = useState('');
  const add = () => {
    const clean = text.trim().slice(0, 600);
    if (!clean) return;
    const next = [{ id: crypto.randomUUID(), kind, text: clean, at: Date.now() }, ...notes].slice(
      0,
      200,
    );
    setNotes(next);
    saveNotes(next);
    setText('');
  };
  const remove = (id: string) => {
    const next = notes.filter((n) => n.id !== id);
    setNotes(next);
    saveNotes(next);
  };
  return (
    <div className={styles.panel} role="dialog" aria-label="Buku catatan">
      <header>
        <strong>Buku catatan Luna</strong>
        <button onClick={onClose} aria-label="Tutup">
          ×
        </button>
      </header>
      <div className={bag.kinds}>
        {(['ide', 'kutipan'] as const).map((k) => (
          <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>
            {k}
          </button>
        ))}
      </div>
      <textarea
        className={bag.write}
        value={text}
        maxLength={600}
        rows={3}
        placeholder={kind === 'ide' ? 'Ide apa hari ini?' : 'Kutipan yang ingin diingat…'}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <button className={styles.primary} onClick={add} disabled={!text.trim()}>
        simpan
      </button>
      {notes.length > 0 && (
        <ul className={bag.notes}>
          {notes.map((n) => (
            <li key={n.id}>
              <small>
                {n.kind} ·{' '}
                {new Date(n.at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
              </small>
              <p className={n.kind === 'kutipan' ? bag.quote : undefined}>{n.text}</p>
              <button onClick={() => remove(n.id)} aria-label="Hapus catatan">
                hapus
              </button>
            </li>
          ))}
        </ul>
      )}
      <small className={styles.muted}>Catatan tersimpan di browser ini saja.</small>
    </div>
  );
}

// A small book written for Luna's bag.
const PAGES = [
  'Catatan dari Teras\n\nPagi di kafe selalu dimulai dengan bunyi yang sama: gelas yang dibalik, kursi yang digeser, dan angin yang menyelinap lewat celah jendela. Tidak ada yang istimewa, dan justru karena itu terasa seperti rumah.',
  'Ada tamu yang datang hanya untuk duduk. Ia memesan kopi, lalu lupa meminumnya karena terlalu asyik memandangi jalan. Mungkin tidak semua hal perlu dihabiskan. Sebagian cukup ditemani.',
  'Hujan sore tadi turun pelan-pelan, seperti orang yang ragu mengetuk pintu. Setelah reda, langit menyisakan pelangi tipis di atas padang. Aku belajar: yang lembut pun bisa meninggalkan warna.',
  'Di menara, rak-rak buku menunggu dengan sabar. Setiap buku adalah jendela kecil. Kadang aku membuka satu hanya untuk mencium bau kertasnya, lalu menutupnya lagi sambil tersenyum.',
  'Malam ini bulan berwarna kuning hangat. Kunang-kunang menyalakan jalan setapak, dan dandelion ikut berpendar. Kalau besok ada yang bertanya kenapa aku betah di sini, akan kujawab: karena di sini, waktu tidak terburu-buru.',
];

/** Reading: one page at a time while Luna sits with her book. */
export function Reader({ onClose }: { onClose: () => void }) {
  const [page, setPage] = useState(0);
  return (
    <div className={`${styles.panel} ${bag.reader}`} role="dialog" aria-label="Buku bacaan">
      <header>
        <strong>
          📖 Halaman {page + 1} / {PAGES.length}
        </strong>
        <button onClick={onClose} aria-label="Tutup buku">
          ×
        </button>
      </header>
      <p className={bag.page}>{PAGES[page]}</p>
      <div className={styles.row}>
        <button
          className={styles.secondary}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
        >
          ← sebelumnya
        </button>
        <button
          className={styles.primary}
          onClick={() => setPage((p) => Math.min(PAGES.length - 1, p + 1))}
          disabled={page === PAGES.length - 1}
        >
          berikutnya →
        </button>
      </div>
    </div>
  );
}
