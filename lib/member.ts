// Winds Space member cards (see RENCANA_MEMBER.md). Everything a card shows — stamps, cards, free
// drink vouchers, points and which gifts can be claimed — is worked out from the member's paid
// orders and gift claims, so cancelling or correcting an order adjusts the card by itself.
import { localDate, type Row, type State } from './model';

export type MemberRules = {
  /** A stamp needs at least one paid drink at this price or more. */
  minDrinkPrice: number;
  /** Category ids that count as drinks, and which of those are coffee. */
  drinkCategories: string[];
  coffeeCategories: string[];
  /** Rupiah per point when a menu has no points of its own. */
  rupiahPerPoint: number;
  /** A free drink is lost after this many months unused. */
  voucherMonths: number;
  /** All points are lost after this many months without a qualifying transaction. */
  pointsExpireMonths: number;
};
export const STAMPS_PER_CARD = 10;
/** Stamp 5 of each card gives a non-coffee drink, stamp 10 a coffee. */
export const FREE_AT: { slot: number; type: 'nonkopi' | 'kopi' }[] = [
  { slot: 5, type: 'nonkopi' },
  { slot: 10, type: 'kopi' },
];
export const DEFAULT_RULES: MemberRules = {
  minDrinkPrice: 15000,
  drinkCategories: ['kopi', 'non_kopi', 'mocktail'],
  coffeeCategories: ['kopi'],
  rupiahPerPoint: 1000,
  voucherMonths: 6,
  pointsExpireMonths: 12,
};
/** The card's look, set by the admin: artwork for each side and the colours drawn over it. */
export type CardDesign = {
  front: string;
  back: string;
  /** Member name and code on the front. */
  textColor: string;
  /** Stamp ink. */
  inkColor: string;
  /** Empty stamp circles on the back. */
  slotColor: string;
};
export const DEFAULT_DESIGN: CardDesign = {
  front: '',
  back: '',
  textColor: '#f7efdf',
  inkColor: '#9c3b26',
  slotColor: '#4d5a39',
};
export const cardDesign = (s: State): CardDesign => ({
  ...DEFAULT_DESIGN,
  ...(s.settings[0]?.memberDesign ?? {}),
});
/** A claim the member asked for on their card waits until staff hand the gift over. */
export const claimStatus = (c: Row): 'menunggu' | 'diserahkan' =>
  c.status === 'menunggu' ? 'menunggu' : 'diserahkan';
export const memberRules = (s: State): MemberRules => ({
  ...DEFAULT_RULES,
  ...(s.settings[0]?.member ?? {}),
});

/** A menu's points: its own value, or one point per `rupiahPerPoint` of its price. */
export const productPoints = (product: Row | undefined, rules: MemberRules): number =>
  !product
    ? 0
    : Number.isInteger(product.memberPoints)
      ? (product.memberPoints as number)
      : Math.floor(((product.price as number) || 0) / rules.rupiahPerPoint);

const addMonths = (iso: string, months: number) => {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString();
};
const orderTime = (o: Row) => (o.paidAt || o.createdAt) as string;
/** What a free drink voucher is good for. */
export const voucherFits = (
  product: Row | undefined,
  type: 'nonkopi' | 'kopi',
  rules: MemberRules,
) =>
  !!product &&
  rules.drinkCategories.includes(product.category) &&
  (type === 'kopi'
    ? rules.coffeeCategories.includes(product.category)
    : !rules.coffeeCategories.includes(product.category));

/**
 * Stamp and points one order earns for its member (zero unless it qualifies). The free drink in
 * it is not counted; a normal discount lowers the points in proportion.
 */
export function orderEarnings(s: State, o: Row, rules = memberRules(s)) {
  let qualifies = false,
    points = 0;
  const free = o.memberFree as { productId: string; value: number } | undefined;
  let freeLeft = free ? 1 : 0;
  for (const item of o.items as Row[]) {
    const product = s.products.find((p) => p.id === item.productId);
    let units = item.quantity as number;
    if (freeLeft && free && item.productId === free.productId) {
      units -= 1;
      freeLeft = 0;
    }
    if (units <= 0) continue;
    if (
      product &&
      rules.drinkCategories.includes(product.category) &&
      item.price >= rules.minDrinkPrice
    )
      qualifies = true;
    points += productPoints(product ?? { id: '', price: item.price }, rules) * units;
  }
  if (!qualifies) return { qualifies: false, points: 0 };
  const freeValue = free?.value ?? 0,
    paidBase = o.subtotal - freeValue,
    ratio = paidBase > 0 ? Math.min(1, Math.max(0, (o.subtotal - o.discount) / paidBase)) : 0;
  return { qualifies: true, points: Math.floor(points * ratio) };
}

export type Voucher = {
  id: string;
  type: 'nonkopi' | 'kopi';
  card: number;
  earnedAt: string;
  expiresAt: string;
  status: 'tersedia' | 'terpakai' | 'hangus';
};

/** The whole card for one member, as of `now`. */
export function memberCard(s: State, member: Row, now = new Date()) {
  const rules = memberRules(s);
  const nowIso = now.toISOString();
  const orders = s.orders
    .filter((o) => o.memberId === member.id && o.paid && o.status !== 'dibatalkan')
    .sort((a, b) => orderTime(a).localeCompare(orderTime(b)));
  const stamps: { at: string; points: number; orderNo: string; orderId: string }[] = [];
  for (const o of orders) {
    const e = orderEarnings(s, o, rules);
    if (e.qualifies)
      stamps.push({ at: orderTime(o), points: e.points, orderNo: o.no, orderId: o.id });
  }
  // Cards and free drinks.
  const cards: { no: number; completedAt: string | null; stamps: typeof stamps }[] = [];
  const vouchers: Voucher[] = [];
  stamps.forEach((st, i) => {
    const no = Math.floor(i / STAMPS_PER_CARD) + 1,
      slot = (i % STAMPS_PER_CARD) + 1;
    if (!cards[no - 1]) cards[no - 1] = { no, completedAt: null, stamps: [] };
    cards[no - 1].stamps.push(st);
    if (slot === STAMPS_PER_CARD) cards[no - 1].completedAt = st.at;
    const free = FREE_AT.find((f) => f.slot === slot);
    if (free) {
      const id = `c${no}-${slot}`;
      const used = orders.some((o) => o.memberFree?.voucherId === id);
      const expiresAt = addMonths(st.at, rules.voucherMonths);
      vouchers.push({
        id,
        type: free.type,
        card: no,
        earnedAt: st.at,
        expiresAt,
        status: used ? 'terpakai' : expiresAt < nowIso ? 'hangus' : 'tersedia',
      });
    }
  });
  if (!cards.length || cards.at(-1)!.completedAt)
    cards.push({ no: cards.length + 1, completedAt: null, stamps: [] });
  // Points: earned with each stamp, spent on gifts; all lost after a long quiet spell.
  const claims = s.memberClaims
    .filter((c) => c.memberId === member.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const events = [
    ...stamps.map((st) => ({ at: st.at, delta: st.points, earn: true })),
    ...claims.map((c) => ({
      at: c.createdAt as string,
      delta: -(c.points as number),
      earn: false,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  let points = 0,
    lastEarn: string | null = null;
  for (const ev of events) {
    if (ev.earn && lastEarn && addMonths(lastEarn, rules.pointsExpireMonths) < ev.at) points = 0;
    points = Math.max(0, points + ev.delta);
    if (ev.earn) lastEarn = ev.at;
  }
  const pointsExpireAt = lastEarn ? addMonths(lastEarn, rules.pointsExpireMonths) : null;
  if (pointsExpireAt && pointsExpireAt < nowIso) points = 0;
  // Gifts of this year's collection.
  const year = Number(localDate(now).slice(0, 4));
  const fullCardsSince = (since: string | null) =>
    cards.filter((c) => c.completedAt && (!since || c.completedAt > since)).length;
  const rewards = s.memberRewards
    .filter((r) => r.year === year && r.active !== false)
    .sort((a, b) => (a.points as number) - (b.points as number))
    .map((r) => {
      const lastOfType = claims
        .filter((c) => c.type === r.type)
        .map((c) => c.createdAt as string)
        .at(-1);
      const cardsSince = fullCardsSince(lastOfType ?? null);
      const claim = claims.find((c) => c.rewardId === r.id);
      const claimed = !!claim;
      const given = s.memberClaims.filter((c) => c.rewardId === r.id).length;
      const stockLeft =
        r.stock === null || r.stock === undefined ? null : Math.max(0, r.stock - given);
      const missingPoints = Math.max(0, r.points - points),
        missingCards = Math.max(0, r.minCards - cardsSince);
      return {
        id: r.id as string,
        type: r.type as string,
        name: r.name as string,
        image: (r.image as string) || '',
        model: (r.model as string) || '',
        description: (r.description as string) || '',
        points: r.points as number,
        minCards: r.minCards as number,
        cardsSince,
        claimed,
        claimStatus: claim ? claimStatus(claim) : null,
        stockLeft,
        missingPoints,
        missingCards,
        canClaim: !claimed && !missingPoints && !missingCards && stockLeft !== 0,
      };
    });
  return {
    rules,
    stampCount: stamps.length,
    current: cards.at(-1)!,
    cards,
    fullCards: cards.filter((c) => c.completedAt).length,
    vouchers,
    points,
    pointsExpireAt,
    year,
    rewards,
    claims,
  };
}

/** A member's card for the member themselves (no phone, no staff details). */
export function publicCard(s: State, member: Row, now = new Date()) {
  const card = memberCard(s, member, now);
  return {
    member: {
      code: member.code,
      name: member.name,
      status: member.status,
      joinedAt: member.createdAt,
    },
    stampCount: card.stampCount,
    current: {
      no: card.current.no,
      stamps: card.current.stamps.map((st) => ({ at: st.at, points: st.points })),
    },
    fullCards: card.fullCards,
    vouchers: card.vouchers.filter((v) => v.status === 'tersedia'),
    points: card.points,
    pointsExpireAt: card.pointsExpireAt,
    year: card.year,
    rewards: card.rewards,
    history: card.claims.map((c) => ({
      at: c.createdAt,
      name: c.name,
      points: c.points,
      status: claimStatus(c),
    })),
    design: cardDesign(s),
    rules: {
      minDrinkPrice: card.rules.minDrinkPrice,
      voucherMonths: card.rules.voucherMonths,
      pointsExpireMonths: card.rules.pointsExpireMonths,
    },
  };
}

/** Indonesian phone numbers in one form: 08… (from +62 / 62 / 8…). */
export function normalizePhone(raw: string) {
  let d = raw.replace(/[^\d+]/g, '');
  if (d.startsWith('+62')) d = '0' + d.slice(3);
  else if (d.startsWith('62')) d = '0' + d.slice(2);
  else if (d.startsWith('8')) d = '0' + d;
  return d;
}
export const validPhone = (phone: string) => /^08\d{7,12}$/.test(phone);
