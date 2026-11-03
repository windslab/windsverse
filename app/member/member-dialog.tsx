'use client';
// The member card from the 3D café and Windstopia: the card opened last on this device, in 3D,
// with a way to the full card and gifts; or how to get one.
import { useEffect, useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import MemberCard3D from './card-3d';
import { TOKEN_KEY, cardFace, useMemberCard } from './member-card';
import styles from './member.module.css';

export default function MemberDialog({ onClose }: { onClose: () => void }) {
  const [token] = useState(() => {
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
        {token ? <Saved token={token} /> : <Join />}
      </div>
    </div>
  );
}

function Saved({ token }: { token: string }) {
  const { card, error, fresh } = useMemberCard(token);
  if (error && !card)
    return <Join note="Kartu yang tersimpan di perangkat ini sudah tidak berlaku." />;
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
    </>
  );
}

function Join({ note }: { note?: string }) {
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
      <p className={styles.fine}>
        Sudah punya? Buka sekali tautan kartu yang dikirim kasir lewat WhatsApp di perangkat ini,
        nanti kartumu muncul di sini.
      </p>
    </>
  );
}
