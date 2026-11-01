'use client';
// Member tab in the café system: the member list and each member's card (gifts are claimed here),
// and for the admin the rules, the yearly gift collection and the sign-up QR poster.
import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Coffee, CupSoda, Gift, Printer } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { localDate, money, type Row, type State } from '@/lib/model';
import { memberCard, memberRules, STAMPS_PER_CARD } from '@/lib/member';

type Act = (action: string, payload: Record<string, unknown>, success?: string) => Promise<unknown>;
const day = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('id-ID', {
        timeZone: 'Asia/Makassar',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';
const statusLabel: Record<string, string> = {
  aktif: 'Aktif',
  menunggu: 'Menunggu aktivasi',
  nonaktif: 'Nonaktif',
};

export default function MemberAdmin({
  s,
  admin,
  busy,
  act,
}: {
  s: State;
  admin: boolean;
  busy: boolean;
  act: Act;
}) {
  const [query, setQuery] = useState(''),
    [openId, setOpenId] = useState('');
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...s.members]
      .filter(
        (m) =>
          !q ||
          m.name.toLowerCase().includes(q) ||
          m.code.toLowerCase().includes(q) ||
          m.phone.includes(q.replace(/^\+?62/, '0')),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [s.members, query]);
  const open = s.members.find((m) => m.id === openId);
  return (
    <>
      <div className="section-head">
        <h1>Member</h1>
        <span className="muted">
          {s.members.filter((m) => m.status === 'aktif').length} aktif ·{' '}
          {s.members.filter((m) => m.status === 'menunggu').length} menunggu aktivasi
        </span>
      </div>
      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">Daftar member</TabsTrigger>
          {admin && <TabsTrigger value="rewards">Hadiah tahunan</TabsTrigger>}
          {admin && <TabsTrigger value="rules">Aturan</TabsTrigger>}
          <TabsTrigger value="poster">Poster QR daftar</TabsTrigger>
        </TabsList>
        <TabsContent value="list">
          <div className="member-admin">
            <div className="member-list">
              <input
                className="search"
                placeholder="Cari nama, nomor HP, atau kode"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {!list.length && (
                <p className="muted">
                  Belum ada member. Daftarkan di Kasir POS, atau minta pelanggan memindai poster QR.
                </p>
              )}
              <ul>
                {list.map((m) => {
                  const card = memberCard(s, m);
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        data-open={m.id === openId || undefined}
                        onClick={() => setOpenId(m.id)}
                      >
                        <b>{m.name}</b>
                        <small>
                          {m.code} · {m.phone} · {statusLabel[m.status]}
                        </small>
                        <small>
                          Kartu {card.current.no} ({card.current.stamps.length}/{STAMPS_PER_CARD}) ·{' '}
                          {card.points.toLocaleString('id-ID')} poin
                        </small>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
            {open ? (
              <MemberDetail key={open.id} s={s} member={open} admin={admin} busy={busy} act={act} />
            ) : (
              <p className="muted member-hint">Pilih member untuk melihat kartunya.</p>
            )}
          </div>
        </TabsContent>
        {admin && (
          <TabsContent value="rewards">
            <Rewards s={s} busy={busy} act={act} />
          </TabsContent>
        )}
        {admin && (
          <TabsContent value="rules">
            <Rules s={s} busy={busy} act={act} />
          </TabsContent>
        )}
        <TabsContent value="poster">
          <Poster />
        </TabsContent>
      </Tabs>
    </>
  );
}

function MemberDetail({
  s,
  member,
  admin,
  busy,
  act,
}: {
  s: State;
  member: Row;
  admin: boolean;
  busy: boolean;
  act: Act;
}) {
  const card = memberCard(s, member);
  const [form, setForm] = useState({
    name: member.name,
    phone: member.phone,
    birthday: member.birthday || '',
    status: member.status,
  });
  const link = `${typeof location !== 'undefined' ? location.origin : ''}/member/${member.token}`;
  const whatsapp =
    'https://wa.me/' +
    member.phone.replace(/^0/, '62') +
    '?text=' +
    encodeURIComponent(
      `Halo ${member.name}! Ini kartu member Winds Space kamu (${member.code}): ${link}`,
    );
  return (
    <section className="member-detail">
      <header className="row between">
        <div>
          <h2>{member.name}</h2>
          <small className="muted">
            {member.code} · {member.phone} · {statusLabel[member.status]} · daftar{' '}
            {member.source === 'mandiri' ? 'sendiri' : 'di kasir'} {day(member.createdAt)}
          </small>
        </div>
        <div className="row">
          <a className="button" href={link} target="_blank" rel="noreferrer">
            Buka kartu
          </a>
          <a className="button" href={whatsapp} target="_blank" rel="noreferrer">
            WhatsApp
          </a>
        </div>
      </header>
      <div className="member-stamps" aria-label={'Kartu ' + card.current.no}>
        {Array.from({ length: STAMPS_PER_CARD }, (_, i) => (
          <span key={i} data-on={card.current.stamps[i] ? '' : undefined}>
            {card.current.stamps[i] ? (
              'W'
            ) : i === 4 ? (
              <CupSoda size={13} />
            ) : i === 9 ? (
              <Coffee size={13} />
            ) : (
              i + 1
            )}
          </span>
        ))}
      </div>
      <div className="member-glance">
        <span>Kartu {card.current.no}</span>
        <span>{card.points.toLocaleString('id-ID')} poin</span>
        <span>{card.fullCards} kartu penuh</span>
        <span>{card.stampCount} stamp total</span>
        {card.pointsExpireAt && <span>poin aman s/d {day(card.pointsExpireAt)}</span>}
      </div>
      <h3>Minuman gratis</h3>
      {!card.vouchers.length && <p className="muted">Belum ada (stamp ke-5 dan ke-10).</p>}
      <ul className="member-rows">
        {card.vouchers.map((v) => (
          <li key={v.id}>
            {v.type === 'kopi' ? 'Kopi' : 'Non-kopi'} · kartu {v.card} · didapat {day(v.earnedAt)} ·{' '}
            {v.status === 'tersedia' ? `berlaku s/d ${day(v.expiresAt)}` : v.status}
          </li>
        ))}
      </ul>
      <h3>Hadiah {card.year}</h3>
      {!card.rewards.length && (
        <p className="muted">
          Belum ada hadiah tahun ini{admin ? ' (atur di tab Hadiah tahunan)' : ''}.
        </p>
      )}
      <ul className="member-rows">
        {card.rewards.map((r) => (
          <li key={r.id} className="row between">
            <span>
              <Gift size={14} /> <b>{r.name}</b> · {r.points.toLocaleString('id-ID')} poin
              {r.minCards ? ` + ${r.minCards} kartu (${r.cardsSince} terkumpul)` : ''}
              {r.stockLeft !== null && ` · stok ${r.stockLeft}`}
            </span>
            {r.claimed ? (
              <small className="muted">sudah ditukar</small>
            ) : r.canClaim ? (
              <button
                className="button primary"
                disabled={busy}
                onClick={() =>
                  act(
                    'member.claim',
                    { memberId: member.id, rewardId: r.id },
                    `${r.name} ditukar · −${r.points} poin`,
                  )
                }
              >
                Tukar
              </button>
            ) : (
              <small className="muted">
                {r.stockLeft === 0
                  ? 'stok habis'
                  : [
                      r.missingPoints && `kurang ${r.missingPoints} poin`,
                      r.missingCards && `kurang ${r.missingCards} kartu`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
              </small>
            )}
          </li>
        ))}
      </ul>
      <h3>Riwayat stamp</h3>
      <ul className="member-rows">
        {card.cards
          .flatMap((c) => c.stamps.map((st, i) => ({ ...st, card: c.no, slot: i + 1 })))
          .reverse()
          .slice(0, 30)
          .map((st) => (
            <li key={st.orderId}>
              Kartu {st.card} #{st.slot} · {day(st.at)} · {st.orderNo} · +{st.points} poin
            </li>
          ))}
      </ul>
      {card.claims.length > 0 && (
        <>
          <h3>Riwayat hadiah</h3>
          <ul className="member-rows">
            {card.claims.map((c) => (
              <li key={c.id}>
                {c.name} · {day(c.createdAt)} · −{c.points} poin
              </li>
            ))}
          </ul>
        </>
      )}
      {admin && (
        <>
          <h3>Ubah data</h3>
          <div className="member-form">
            <label>
              Nama
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              Nomor HP
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </label>
            <label>
              Tanggal lahir
              <input
                type="date"
                value={form.birthday}
                onChange={(e) => setForm({ ...form, birthday: e.target.value })}
              />
            </label>
            <label>
              Status
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="aktif">Aktif</option>
                <option value="menunggu">Menunggu aktivasi</option>
                <option value="nonaktif">Nonaktif</option>
              </select>
            </label>
          </div>
          <div className="row">
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                act('member.update', { id: member.id, ...form }, 'Data member disimpan')
              }
            >
              Simpan
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() => {
                if (confirm('Buat tautan kartu baru? Tautan lama tidak bisa dipakai lagi.'))
                  void act('member.relink', { id: member.id }, 'Tautan kartu diganti');
              }}
            >
              Ganti tautan kartu
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function Rewards({ s, busy, act }: { s: State; busy: boolean; act: Act }) {
  const thisYear = Number(localDate().slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const blank = {
    type: '',
    name: '',
    image: '',
    points: '',
    minCards: '',
    stock: '',
    active: true,
  };
  const [form, setForm] = useState<typeof blank>(blank),
    [editing, setEditing] = useState('');
  const rewards = s.memberRewards
    .filter((r) => r.year === year)
    .sort((a, b) => a.points - b.points);
  const save = async () => {
    const ok = await act(
      'reward.save',
      {
        id: editing || undefined,
        data: {
          year,
          type: form.type,
          name: form.name,
          image: form.image,
          points: Number(form.points),
          minCards: Number(form.minCards || 0),
          stock: form.stock === '' ? null : Number(form.stock),
          active: form.active,
        },
      },
      'Hadiah disimpan',
    );
    if (ok) {
      setForm(blank);
      setEditing('');
    }
  };
  return (
    <div className="member-panel">
      <div className="row">
        <label>
          Tahun koleksi
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
        </label>
        {!rewards.length && year === thisYear && (
          <button
            className="button"
            disabled={busy}
            onClick={() =>
              act(
                'reward.save',
                {
                  data: {
                    year,
                    type: 'tshirt',
                    name: 'T-shirt WINDS LAB ' + year,
                    image: '',
                    points: 2500,
                    minCards: 5,
                    stock: null,
                    active: true,
                  },
                },
                'T-shirt ditambahkan',
              )
            }
          >
            Tambah T-shirt (2.500 poin, 5 kartu)
          </button>
        )}
      </div>
      <ul className="member-rows">
        {rewards.map((r) => {
          const given = s.memberClaims.filter((c) => c.rewardId === r.id).length;
          return (
            <li key={r.id} className="row between">
              <span>
                <b>{r.name}</b> ({r.type}) · {r.points.toLocaleString('id-ID')} poin · {r.minCards}{' '}
                kartu · {r.stock === null ? 'stok bebas' : `stok ${r.stock}`} · ditukar {given}
                {r.active === false && ' · nonaktif'}
              </span>
              <span className="row">
                <button
                  className="button"
                  onClick={() => {
                    setEditing(r.id);
                    setForm({
                      type: r.type,
                      name: r.name,
                      image: r.image || '',
                      points: String(r.points),
                      minCards: String(r.minCards),
                      stock: r.stock === null ? '' : String(r.stock),
                      active: r.active !== false,
                    });
                  }}
                >
                  Ubah
                </button>
                {!given && (
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => act('reward.delete', { id: r.id }, 'Hadiah dihapus')}
                  >
                    Hapus
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <h3>
        {editing ? 'Ubah hadiah' : 'Tambah hadiah'} {year}
      </h3>
      <div className="member-form">
        <label>
          Jenis (huruf kecil, contoh: tshirt, mug, stiker)
          <input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
        </label>
        <label>
          Nama hadiah
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          Poin
          <input
            type="number"
            min={1}
            value={form.points}
            onChange={(e) => setForm({ ...form, points: e.target.value })}
          />
        </label>
        <label>
          Minimal kartu penuh
          <input
            type="number"
            min={0}
            value={form.minCards}
            onChange={(e) => setForm({ ...form, minCards: e.target.value })}
          />
        </label>
        <label>
          Stok (kosong = tidak dibatasi)
          <input
            type="number"
            min={0}
            value={form.stock}
            onChange={(e) => setForm({ ...form, stock: e.target.value })}
          />
        </label>
        <label>
          Foto (tautan https, opsional)
          <input value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} />
        </label>
        <label className="row">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          Aktif (tampil di kartu member)
        </label>
      </div>
      <div className="row">
        <button
          className="button primary"
          disabled={busy || !form.name || !form.points}
          onClick={save}
        >
          {editing ? 'Simpan perubahan' : 'Tambah hadiah'}
        </button>
        {editing && (
          <button
            className="button"
            onClick={() => {
              setEditing('');
              setForm(blank);
            }}
          >
            Batal
          </button>
        )}
      </div>
      <p className="muted">
        Setiap hadiah bisa ditukar 1 kali per tahun per member. Kartu penuh dihitung sejak penukaran
        terakhir hadiah jenis yang sama, jadi T-shirt tahun berikutnya butuh kartu baru lagi.
      </p>
    </div>
  );
}

function Rules({ s, busy, act }: { s: State; busy: boolean; act: Act }) {
  const current = memberRules(s);
  const [rules, setRules] = useState(current);
  const toggle = (key: 'drinkCategories' | 'coffeeCategories', id: string, on: boolean) =>
    setRules((r) => ({
      ...r,
      [key]: on ? [...new Set([...r[key], id])] : r[key].filter((x) => x !== id),
    }));
  return (
    <div className="member-panel">
      <div className="member-form">
        <label>
          Harga minimal minuman untuk dapat stamp (Rp)
          <input
            type="number"
            min={0}
            value={rules.minDrinkPrice}
            onChange={(e) => setRules({ ...rules, minDrinkPrice: Number(e.target.value) })}
          />
        </label>
        <label>
          Rupiah per 1 poin (menu tanpa poin khusus)
          <input
            type="number"
            min={100}
            value={rules.rupiahPerPoint}
            onChange={(e) => setRules({ ...rules, rupiahPerPoint: Number(e.target.value) })}
          />
        </label>
        <label>
          Minuman gratis hangus setelah (bulan)
          <input
            type="number"
            min={1}
            value={rules.voucherMonths}
            onChange={(e) => setRules({ ...rules, voucherMonths: Number(e.target.value) })}
          />
        </label>
        <label>
          Poin hangus bila tidak ada transaksi selama (bulan)
          <input
            type="number"
            min={1}
            value={rules.pointsExpireMonths}
            onChange={(e) => setRules({ ...rules, pointsExpireMonths: Number(e.target.value) })}
          />
        </label>
      </div>
      <h3>Kategori menu</h3>
      <table className="member-categories">
        <thead>
          <tr>
            <th>Kategori</th>
            <th>Minuman</th>
            <th>Kopi</th>
          </tr>
        </thead>
        <tbody>
          {s.categories.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>
                <input
                  type="checkbox"
                  checked={rules.drinkCategories.includes(c.id)}
                  onChange={(e) => toggle('drinkCategories', c.id, e.target.checked)}
                />
              </td>
              <td>
                <input
                  type="checkbox"
                  disabled={!rules.drinkCategories.includes(c.id)}
                  checked={rules.coffeeCategories.includes(c.id)}
                  onChange={(e) => toggle('coffeeCategories', c.id, e.target.checked)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        Minuman gratis stamp ke-5 untuk minuman non-kopi, stamp ke-10 untuk minuman kopi. Poin tiap
        menu bisa diubah di Menu kafe (kolom “Poin member per porsi”); contoh dengan aturan ini:
        menu {money(18000)} = {Math.floor(18000 / rules.rupiahPerPoint)} poin.
      </p>
      <button
        className="button primary"
        disabled={busy}
        onClick={() =>
          act(
            'member.settings',
            {
              rules: {
                ...rules,
                coffeeCategories: rules.coffeeCategories.filter((c) =>
                  rules.drinkCategories.includes(c),
                ),
              },
            },
            'Aturan member disimpan',
          )
        }
      >
        Simpan aturan
      </button>
    </div>
  );
}

function Poster() {
  const [qr, setQr] = useState(''),
    [url] = useState(() =>
      typeof location === 'undefined' ? '' : location.origin + '/member/daftar',
    );
  useEffect(() => {
    if (!url) return;
    void QRCode.toDataURL(url, {
      margin: 1,
      width: 600,
      color: { dark: '#2f3a24', light: '#ffffff' },
    }).then(setQr);
  }, [url]);
  return (
    <div className="member-panel">
      <div className="member-poster" id="member-poster">
        <small>WINDS SPACE</small>
        <h2>Jadi member, kumpulkan stamp</h2>
        <p>Stamp ke-5 minuman non-kopi gratis · stamp ke-10 minuman kopi gratis</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {qr && <img src={qr} alt="QR daftar member" />}
        <p>Pindai untuk daftar, gratis</p>
        <small>{url}</small>
      </div>
      <button className="button" onClick={() => window.print()}>
        <Printer size={15} /> Cetak poster
      </button>
    </div>
  );
}
