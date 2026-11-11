'use client';
// Luna's guest book: how well she knows each regular, and the pieces of their story she has
// heard. Kept on this device, like the rest of a player's Windstopia progress.
import { useCallback, useState } from 'react';
import styles from './explore-mode.module.css';
import { REGULARS, regularNamed, storiesOpen, storySteps } from '@/lib/regulars';

const KEY = 'windstopia-friends';
type Served = Record<string, number>;

function load(): Served {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}

/** A story piece that just opened, shown as its own card. */
export type NewStory = { name: string; piece: number; line: string };

export function useFriends() {
  const [served, setServed] = useState<Served>(load);
  /** Luna served this guest; returns the story piece it opened, if any. */
  const serve = useCallback((name: string): NewStory | null => {
    const regular = regularNamed(name);
    if (!regular) return null;
    const now = load(),
      before = now[name] || 0,
      next = { ...now, [name]: before + 1 };
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* The guest book only lasts this visit. */
    }
    setServed(next);
    const opened = storiesOpen(regular, before + 1);
    return opened > storiesOpen(regular, before)
      ? { name, piece: opened, line: regular.stories[opened - 1] }
      : null;
  }, []);
  return { served, serve };
}

export function StoryCard({ story, onClose }: { story: NewStory; onClose: () => void }) {
  return (
    <div className={styles.story} role="dialog" aria-label={'Cerita ' + story.name}>
      <small>
        Cerita {story.name} · {story.piece}/4
      </small>
      <p>“{story.line}”</p>
      <button onClick={onClose}>lanjut</button>
    </div>
  );
}

export function FriendsPanel({ served, onClose }: { served: Served; onClose: () => void }) {
  const [open, setOpen] = useState('');
  const full = REGULARS.filter((r) => storiesOpen(r, served[r.name] || 0) === 4).length;
  return (
    <aside className={styles.missions} aria-label="Buku tamu Luna">
      <header>
        <strong>Buku tamu Luna</strong>
        <button onClick={onClose} aria-label="Tutup buku tamu">
          ×
        </button>
      </header>
      <ul className={styles.friends}>
        {REGULARS.map((r) => {
          const count = served[r.name] || 0,
            known = storiesOpen(r, count),
            next = storySteps(r)[known];
          return (
            <li key={r.name}>
              <button
                aria-expanded={open === r.name}
                onClick={() => setOpen((o) => (o === r.name ? '' : r.name))}
              >
                <b>{count ? r.name : '???'}</b>
                <span aria-label={`${known} dari 4 cerita`}>
                  {'♥'.repeat(known)}
                  {'♡'.repeat(4 - known)}
                </span>
              </button>
              {open === r.name && (
                <div>
                  {count ? <p>{r.about}</p> : <p>Belum pernah mampir. Mungkin suatu hari…</p>}
                  {r.stories.slice(0, known).map((line, i) => (
                    <p key={i}>“{line}”</p>
                  ))}
                  {next && count > 0 && (
                    <small>Cerita berikutnya setelah dilayani {next - count} kali lagi.</small>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p>
        {full === REGULARS.length
          ? 'Semua cerita sudah didengar. Menara mercusuar kini terbuka.'
          : `Menara mercusuar terbuka setelah semua teman ♥ penuh (${full}/${REGULARS.length}).`}
      </p>
    </aside>
  );
}
