'use client';
// The member box in the till (Kasir POS): find a member by phone, code or name, sign up a new one,
// see their card at a glance, use a free drink, and see what this order will earn.
import { useMemo, useState } from 'react';
import { Coffee, CupSoda, UserPlus, X } from 'lucide-react';
import { money, type Row, type State } from '@/lib/model';
import {
  memberCard,
  memberRules,
  normalizePhone,
  orderEarnings,
  voucherFits,
  STAMPS_PER_CARD,
} from '@/lib/member';

export type MemberFree = { voucherId: string; productId: string } | null;

export default function MemberPos({
  s,
  busy,
  memberId,
  memberFree,
  cart,
  discount,
  onMember,
  onFree,
  act,
}: {
  s: State;
  busy: boolean;
  memberId: string;
  memberFree: MemberFree;
  cart: Row[];
  discount: number;
  onMember: (id: string, name: string) => void;
  onFree: (free: MemberFree) => void;
  act: (action: string, payload: Record<string, unknown>, success?: string) => Promise<unknown>;
}) {
  const [query, setQuery] = useState(''),
    [signup, setSignup] = useState(false),
    [form, setForm] = useState({ name: '', phone: '', birthday: '' });
  const rules = memberRules(s);
  const member = s.members.find((m) => m.id === memberId);
  const card = useMemo(() => (member ? memberCard(s, member) : null), [s, member]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const phone = normalizePhone(q);
    return s.members
      .filter(
        (m) =>
          m.code.toLowerCase().includes(q) ||
          (phone.length >= 4 && m.phone.includes(phone.replace(/^0/, ''))) ||
          m.name.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [query, s.members]);
  // What this order will earn, worked out the same way the card does.
  const preview = useMemo(() => {
    if (!member || !cart.length) return null;
    const freeItem = memberFree ? cart.find((i) => i.id === memberFree.productId) : null;
    const items = cart.map((i) => ({ productId: i.id, quantity: i.quantity, price: i.price }));
    const subtotal = items.reduce((v, i) => v + i.price * i.quantity, 0);
    const order = {
      id: 'preview',
      items,
      subtotal,
      discount: discount + (freeItem?.price ?? 0),
      memberFree: freeItem ? { productId: freeItem.id, value: freeItem.price } : undefined,
    };
    return orderEarnings(s, order, rules);
  }, [member, cart, memberFree, discount, s, rules]);

  if (!member)
    return (
      <div className="member-pos">
        <label>
          Member (opsional)
          <input
            value={query}
            placeholder="Nomor HP, kode WSM-…, atau nama"
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {matches.length > 0 && (
          <ul className="member-matches">
            {matches.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    onMember(m.id, m.name);
                    setQuery('');
                  }}
                >
                  <b>{m.name}</b>
                  <small>
                    {m.code} · {m.phone}
                    {m.status === 'menunggu' ? ' · menunggu aktivasi' : ''}
                    {m.status === 'nonaktif' ? ' · nonaktif' : ''}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        )}
        {query.trim().length >= 2 && !matches.length && (
          <small className="muted">Belum ada member dengan data itu.</small>
        )}
        {!signup ? (
          <button type="button" className="button" onClick={() => setSignup(true)}>
            <UserPlus size={15} /> Daftar member baru
          </button>
        ) : (
          <div className="member-signup">
            <input
              placeholder="Nama"
              value={form.name}
              maxLength={40}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              placeholder="Nomor HP"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <label>
              Tanggal lahir (opsional)
              <input
                type="date"
                value={form.birthday}
                onChange={(e) => setForm({ ...form, birthday: e.target.value })}
              />
            </label>
            <div className="row">
              <button
                type="button"
                className="button primary"
                disabled={busy}
                onClick={async () => {
                  const result = (await act('member.create', form, 'Member terdaftar')) as
                    | { id?: string }
                    | false;
                  if (result && result.id) {
                    onMember(result.id, form.name);
                    setForm({ name: '', phone: '', birthday: '' });
                    setSignup(false);
                  }
                }}
              >
                Daftarkan
              </button>
              <button type="button" className="button" onClick={() => setSignup(false)}>
                Batal
              </button>
            </div>
          </div>
        )}
      </div>
    );

  const vouchers = card!.vouchers.filter((v) => v.status === 'tersedia');
  const stamps = card!.current.stamps.length;
  const link = typeof location !== 'undefined' ? `${location.origin}/member/${member.token}` : '';
  const whatsapp =
    'https://wa.me/' +
    member.phone.replace(/^0/, '62') +
    '?text=' +
    encodeURIComponent(
      `Halo ${member.name}! Ini kartu member Winds Space kamu (${member.code}): ${link}`,
    );
  return (
    <div className="member-pos" data-selected>
      <div className="row between">
        <div>
          <strong>{member.name}</strong>
          <small className="muted">
            {' '}
            {member.code}
            {member.status === 'menunggu' && ' · aktif setelah transaksi ini memenuhi syarat'}
          </small>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Lepas member"
          onClick={() => {
            onMember('', '');
            onFree(null);
          }}
        >
          <X size={16} />
        </button>
      </div>
      {member.status === 'nonaktif' ? (
        <small className="warning">Kartu ini dinonaktifkan admin.</small>
      ) : (
        <>
          <div className="member-glance">
            <span>
              Kartu {card!.current.no}: {stamps}/{STAMPS_PER_CARD} stamp
            </span>
            <span>{card!.points.toLocaleString('id-ID')} poin</span>
            <span>{card!.fullCards} kartu penuh</span>
          </div>
          {vouchers.map((v) => {
            const fitting = cart.filter((i) =>
              voucherFits(
                s.products.find((p) => p.id === i.id),
                v.type,
                rules,
              ),
            );
            const using = memberFree?.voucherId === v.id;
            return (
              <div key={v.id} className="member-voucher" data-using={using || undefined}>
                {v.type === 'kopi' ? <Coffee size={15} /> : <CupSoda size={15} />}
                <span>{v.type === 'kopi' ? 'Kopi gratis' : 'Non-kopi gratis'}</span>
                {using ? (
                  <button type="button" className="button" onClick={() => onFree(null)}>
                    batal pakai
                  </button>
                ) : fitting.length ? (
                  <select
                    aria-label="Pakai minuman gratis untuk"
                    value=""
                    disabled={member.status !== 'aktif' || (!!memberFree && !using)}
                    onChange={(e) =>
                      e.target.value && onFree({ voucherId: v.id, productId: e.target.value })
                    }
                  >
                    <option value="">pakai untuk…</option>
                    {fitting.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({money(i.price)})
                      </option>
                    ))}
                  </select>
                ) : (
                  <small className="muted">
                    tambahkan menu {v.type === 'kopi' ? 'kopi' : 'non-kopi'} dulu
                  </small>
                )}
              </div>
            );
          })}
          {preview && (
            <small className={preview.qualifies ? 'member-earn' : 'muted'}>
              {preview.qualifies
                ? `Transaksi ini: +1 stamp, +${preview.points} poin`
                : `Belum dapat stamp: butuh minimal 1 minuman ≥ ${money(rules.minDrinkPrice)} yang dibayar.`}
            </small>
          )}
          <div className="row">
            <a className="button" href={link} target="_blank" rel="noreferrer">
              Buka kartu
            </a>
            <a className="button" href={whatsapp} target="_blank" rel="noreferrer">
              Kirim via WhatsApp
            </a>
          </div>
        </>
      )}
    </div>
  );
}
