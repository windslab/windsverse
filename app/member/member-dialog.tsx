'use client';
// The member card from the 3D café and Windstopia: the card opened last on this device, in 3D,
// with a way to the full card and gifts; or a choice between signing up and opening one's card
// with its code and phone number.
import { useEffect, useState } from 'react';
import { ArrowRight, LogIn, X } from 'lucide-react';
import MemberCard3D from './card-3d';
import { TOKEN_KEY, cardFace, useMemberCard } from './member-card';
import styles from './member.module.css';

export default function MemberDialog({ onClose }: { onClose: () => void }) {
  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem(TOKEN_KEY) || '';
    } catch {
      return '';
    }
  });
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className={styles.dialogBackdrop} onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Kartu member"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className={styles.dialogClose} aria-label="Tutup" onClick={onClose}>
          <X size={18} />
        </button>
        {token ? (
          <Saved token={token} onLogout={() => setToken(forget())} onLogin={setToken} />
        ) : (
          <Join onLogin={setToken} />
        )}
      </div>
    </div>
  );
}

/** Forgets the card saved on this device; returns the empty token. */
function forget() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
  return '';
}

function Saved({
  token,
  onLogout,
  onLogin,
}: {
  token: string;
  onLogout: () => void;
  onLogin: (token: string) => void;
}) {
  const { card, error, fresh } = useMemberCard(token);
  if (error && !card)
    return (
      <Join note="Kartu yang tersimpan di perangkat ini sudah tidak berlaku." onLogin={onLogin} />
    );
  if (!card) return <p className={styles.fine}>Membuka kartu…</p>;
  const ready = card.rewards.filter((r) => r.canClaim).length;
  return (
    <>
      <header className={styles.top}>
        <small>WINDS SPACE · MEMBER</small>
        <h1>{card.member.name}</h1>
      </header>
      <MemberCard3D face={cardFace(card)} design={card.design} fresh={fresh} />
      <div className={styles.stats}>
        <div>
          <b>{card.points.toLocaleString('id-ID')}</b>
          <small>poin</small>
        </div>
        <div>
          <b>
            {card.current.stamps.length}
            <i>/10</i>
          </b>
          <small>stamp</small>
        </div>
        <div>
          <b>{card.vouchers.length}</b>
          <small>hadiah stamp</small>
        </div>
      </div>
      <a className={styles.primary} href={'/member/' + token}>
        {ready ? `${ready} hadiah bisa diklaim · ` : ''}Buka kartu & hadiah <ArrowRight size={16} />
      </a>
      <button type="button" className={styles.ghost} onClick={onLogout}>
        Bukan kartumu? Keluar
      </button>
    </>
  );
}

function Join({ note, onLogin }: { note?: string; onLogin: (token: string) => void }) {
  const [login, setLogin] = useState(false);
  if (login) return <Login onLogin={onLogin} onBack={() => setLogin(false)} />;
  return (
    <>
      <header className={styles.top}>
        <small>WINDS SPACE · MEMBER</small>
        <h1>Kartu member</h1>
      </header>
      {note && <p className={styles.pending}>{note}</p>}
      <p className={styles.fine}>
        Kumpulkan 1 stamp per hari: stamp ke-5 potongan Rp5.000, stamp ke-10 minuman gratis sampai
        Rp20.000, dan poin untuk hadiah eksklusif tahunan. Gratis.
      </p>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- plain links, like the rest of the site */}
      <a className={styles.primary} href="/member/daftar">
        Daftar member <ArrowRight size={16} />
      </a>
      <button type="button" className={styles.ghost} onClick={() => setLogin(true)}>
        <LogIn size={16} /> Sudah punya? Masuk dengan kode member
      </button>
    </>
  );
}

function Login({ onLogin, onBack }: { onLogin: (token: string) => void; onBack: () => void }) {
  const [code, setCode] = useState(''),
    [phone, setPhone] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/public', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'member.login', code, phone }),
      });
      const d = (await r.json()) as { token?: string; error?: string };
      if (!r.ok || !d.token) throw Error(d.error || 'Belum berhasil masuk.');
      try {
        localStorage.setItem(TOKEN_KEY, d.token);
      } catch {}
      onLogin(d.token);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <form className={styles.loginForm} onSubmit={submit}>
      <header className={styles.top}>
        <small>WINDS SPACE · MEMBER</small>
        <h1>Masuk member</h1>
      </header>
      <label className={styles.field}>
        <span>Kode member</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          required
          placeholder="WSM-7KQ4"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <label className={styles.field}>
        <span>Nomor HP yang dipakai saat daftar</span>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          inputMode="tel"
          placeholder="0812 3456 7890"
          autoComplete="tel"
        />
      </label>
      {error && <p className={styles.error}>{error}</p>}
      <button className={styles.primary} disabled={busy}>
        {busy ? 'Membuka kartu…' : 'Lihat kartuku'}
      </button>
      <button type="button" className={styles.ghost} onClick={onBack}>
        Kembali
      </button>
      <p className={styles.fine}>
        Kode member ada di kartumu (contoh WSM-7KQ4). Lupa? Tanyakan ke kasir.
      </p>
    </form>
  );
}
