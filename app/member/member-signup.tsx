'use client';
// Sign up for a member card from the QR in the café (windsverse.com/member/daftar). The card
// opens right away; it becomes active with the first qualifying order at the till.
import { useState } from 'react';
import { Coffee, CupSoda, Gift } from 'lucide-react';
import styles from './member.module.css';

export default function MemberSignup() {
  const [name, setName] = useState(''),
    [phone, setPhone] = useState(''),
    [birthday, setBirthday] = useState(''),
    [agree, setAgree] = useState(false),
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
        body: JSON.stringify({ action: 'member.signup', name, phone, birthday: birthday || '' }),
      });
      const d = (await r.json()) as { token?: string; error?: string };
      if (!r.ok) throw Error(d.error || 'Pendaftaran belum berhasil.');
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- plain navigation, like the rest of the site
      location.assign('/member/' + d.token);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <header className={styles.cardHead}>
          <div>
            <small>WINDS SPACE · MEMBER</small>
            <h1>Daftar member</h1>
          </div>
        </header>
        <ul className={styles.perks}>
          <li>
            <CupSoda size={18} /> Stamp ke-5: minuman non-kopi gratis
          </li>
          <li>
            <Coffee size={18} /> Stamp ke-10: minuman kopi gratis
          </li>
          <li>
            <Gift size={18} /> Kumpulkan poin untuk hadiah tahunan, sampai T-shirt WINDS LAB
          </li>
        </ul>
        <p className={styles.fine}>
          Gratis. 1 stamp tiap transaksi dengan minimal 1 minuman atau makanan ≥ Rp15.000.
        </p>
      </section>
      <form className={styles.block} onSubmit={submit}>
        <label className={styles.field}>
          <span>Nama</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={40}
            autoComplete="name"
          />
        </label>
        <label className={styles.field}>
          <span>Nomor HP (WhatsApp)</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            inputMode="tel"
            placeholder="0812 3456 7890"
            autoComplete="tel"
          />
        </label>
        <label className={styles.field}>
          <span>Tanggal lahir (opsional)</span>
          <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
        </label>
        <label className={styles.agree}>
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>
            Nama dan nomor HP-ku dipakai hanya untuk kartu member Winds Space. Aku bisa minta
            datanya dihapus kapan saja.
          </span>
        </label>
        {error && <p className={styles.error}>{error}</p>}
        <button className={styles.primary} disabled={!agree || busy}>
          {busy ? 'Mendaftar…' : 'Buat kartu member'}
        </button>
        <p className={styles.fine}>
          Kartumu langsung terbuka dan aktif setelah transaksi pertama di kasir.
        </p>
      </form>
    </main>
  );
}
