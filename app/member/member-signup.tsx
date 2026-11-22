'use client';
// Sign up for a member card from the QR in the café (windsverse.com/member/daftar). The card
// opens right away; it becomes active with the first qualifying order at the till. A friend's
// link (…/member/daftar?ajak=AJAK-XXXX) fills in their invite code.
import { useState } from 'react';
import { CupSoda, Gift, Ticket } from 'lucide-react';
import styles from './member.module.css';

export default function MemberSignup({ invite = '' }: { invite?: string }) {
  const [name, setName] = useState(''),
    [phone, setPhone] = useState(''),
    [birthday, setBirthday] = useState(''),
    [inviteCode, setInviteCode] = useState(invite),
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
        body: JSON.stringify({
          action: 'member.signup',
          name,
          phone,
          birthday: birthday || '',
          inviteCode,
        }),
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
            <Ticket size={18} /> Stamp ke-5: langsung potongan Rp5.000
          </li>
          <li>
            <CupSoda size={18} /> Stamp ke-10: langsung minuman gratis sampai Rp20.000
          </li>
          <li>
            <Gift size={18} /> Kumpulkan poin untuk hadiah tahunan, sampai T-shirt WINDS LAB
          </li>
        </ul>
        <p className={styles.fine}>
          Gratis. 1 stamp per hari untuk transaksi dengan minimal 1 minuman atau makanan ≥ Rp15.000.
          Transaksi berikutnya di hari yang sama tetap mendapat poin.
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
        <label className={styles.field}>
          <span>Kode ajak teman (opsional)</span>
          <input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            placeholder="AJAK-XXXX"
            autoComplete="off"
            maxLength={12}
          />
          {inviteCode && (
            <small className={styles.fine}>
              Setelah transaksi pertamamu, kamu dan temanmu sama-sama dapat 1 stamp bonus.
            </small>
          )}
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
