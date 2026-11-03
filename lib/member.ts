// Winds Space member cards (see RENCANA_MEMBER.md). Everything a card shows — stamps, cards, free
// drink vouchers, points and which gifts can be claimed — is worked out from the member's paid
// orders and gift claims, so cancelling or correcting an order adjusts the card by itself.
import { businessDay, localDate, type Row, type State } from './model';

export type MemberRules = {
  /** A stamp needs at least one paid drink at this price or more… */
  minDrinkPrice: number;
  /** …or one paid food item at this price or more. */
  minFoodPrice: number;
  /** Category ids that count as drinks, and which of those are coffee (not used by rewards). */
  drinkCategories: string[];
  coffeeCategories: string[];
  /** Food categories that earn a stamp too (free drinks stay drinks). */
  foodCategories: string[];
  /** Rupiah per point when a menu has no points of its own. */
  rupiahPerPoint: number;
  /** Stamp 5 takes this much off a bill. */
  voucherDiscount: number;
  /** Stamp 10 pays for a drink up to this price; the customer pays any difference. */
  freeDrinkMax: number;
  /** A stamp reward is lost after this many months unused. */
  voucherMonths: number;
  /** All points are lost after this many months without a qualifying transaction. */
  pointsExpireMonths: number;
};
export const STAMPS_PER_CARD = 10;
export type VoucherType = 'potongan' | 'minuman';
/** Stamp 5 of each card gives money off a bill, stamp 10 a drink. */
export const REWARD_AT: { slot: number; type: VoucherType }[] = [
  { slot: 5, type: 'potongan' },
  { slot: 10, type: 'minuman' },
];
export const DEFAULT_RULES: MemberRules = {
  minDrinkPrice: 15000,
  minFoodPrice: 15000,
  drinkCategories: ['kopi', 'non_kopi', 'mocktail'],
  coffeeCategories: ['kopi'],
  foodCategories: ['makanan', 'snack', 'dessert'],
  rupiahPerPoint: 1000,
  voucherDiscount: 5000,
  freeDrinkMax: 20000,
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
const FOOD = /snack|food|makan|roti|kue|cake|pastry|dessert|camilan|cemilan/i,
  COFFEE = /coffee|kopi|espresso/i,
  NOT_COFFEE = /non[\s_-]*(kopi|coffee)/i;
/**
 * Until the admin saves the rules, the categories are guessed from the café's own names: food is
 * named so, every other category is a drink, and coffee is the drink named so.
 */
export function guessCategories(s: State) {
  const drinks = s.categories.filter((c) => !FOOD.test(c.name));
  return {
    foodCategories: s.categories.filter((c) => FOOD.test(c.name)).map((c) => c.id as string),
    drinkCategories: drinks.map((c) => c.id as string),
    coffeeCategories: drinks
      .filter((c) => COFFEE.test(c.name) && !NOT_COFFEE.test(c.name))
      .map((c) => c.id as string),
  };
}
export function memberRules(s: State): MemberRules {
  const rules: MemberRules = {
    ...DEFAULT_RULES,
    ...(s.categories.length ? guessCategories(s) : {}),
    ...(s.settings[0]?.member ?? {}),
  };
  // Only categories the café still has (the demo defaults are not on a real menu).
  if (s.categories.length) {
    const known = new Set(s.categories.map((c) => c.id as string));
    rules.drinkCategories = rules.drinkCategories.filter((c) => known.has(c));
    rules.coffeeCategories = rules.coffeeCategories.filter((c) => known.has(c));
    rules.foodCategories = rules.foodCategories.filter((c) => known.has(c));
  }
  return rules;
}
/** The stamp rule in one sentence for the card, the till and the sign-up page. */
export function stampRule(rules: MemberRules) {
  const rp = (n: number) => 'Rp' + n.toLocaleString('id-ID');
  if (!rules.foodCategories.length)
    return `1 stamp per hari untuk transaksi dengan minimal 1 minuman ≥ ${rp(rules.minDrinkPrice)}`;
  return rules.minDrinkPrice === rules.minFoodPrice
    ? `1 stamp per hari untuk transaksi dengan minimal 1 minuman atau makanan ≥ ${rp(rules.minDrinkPrice)}`
    : `1 stamp per hari untuk transaksi dengan minimal 1 minuman ≥ ${rp(rules.minDrinkPrice)} atau makanan ≥ ${rp(rules.minFoodPrice)}`;
}

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
/** The stamp 10 reward is good for any drink. */
export const voucherFits = (product: Row | undefined, rules: MemberRules) =>
  !!product && rules.drinkCategories.includes(product.category);
/** What a reward takes off the bill: a drink's price up to the limit, or the stamp 5 discount. */
export const voucherValue = (rules: MemberRules, subtotal: number, drinkPrice?: number) =>
  drinkPrice === undefined
    ? Math.min(rules.voucherDiscount, subtotal)
    : Math.min(drinkPrice, rules.freeDrinkMax);

/**
 * Stamp and points one order earns for its member (zero unless it qualifies). The free drink in
 * it is not counted; a normal discount lowers the points in proportion.
 */
export function orderEarnings(s: State, o: Row, rules = memberRules(s)) {
  let qualifies = false,
    points = 0;
  // The stamp 5 discount has no product: it lowers the points like any other discount.
  const free = o.memberFree as { productId: string; value: number } | undefined;
  let freeLeft = free?.productId ? 1 : 0;
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
      ((rules.drinkCategories.includes(product.category) && item.price >= rules.minDrinkPrice) ||
        (rules.foodCategories.includes(product.category) && item.price >= rules.minFoodPrice))
    )
      qualifies = true;
    points += productPoints(product ?? { id: '', price: item.price }, rules) * units;
  }
  if (!qualifies) return { qualifies: false, points: 0 };
  const freeValue = free?.productId ? free.value : 0,
    paidBase = o.subtotal - freeValue,
    ratio = paidBase > 0 ? Math.min(1, Math.max(0, (o.subtotal - o.discount) / paidBase)) : 0;
  return { qualifies: true, points: Math.floor(points * ratio) };
}

export type Voucher = {
  id: string;
  type: VoucherType;
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
  // One stamp per café day, so splitting a bill earns nothing extra; every order keeps its points.
  const earnings: { at: string; points: number }[] = [],
    stampDays = new Set<string>();
  for (const o of orders) {
    const e = orderEarnings(s, o, rules);
    if (!e.qualifies) continue;
    const at = orderTime(o),
      orderDay = (o.date as string) || businessDay(new Date(at));
    earnings.push({ at, points: e.points });
    if (stampDays.has(orderDay)) continue;
    stampDays.add(orderDay);
    stamps.push({ at, points: e.points, orderNo: o.no, orderId: o.id });
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
    const reward = REWARD_AT.find((f) => f.slot === slot);
    if (reward) {
      const id = `c${no}-${slot}`;
      const used = orders.some((o) => o.memberFree?.voucherId === id);
      const expiresAt = addMonths(st.at, rules.voucherMonths);
      vouchers.push({
        id,
        type: reward.type,
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
    ...earnings.map((en) => ({ at: en.at, delta: en.points, earn: true })),
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
    stampDays: [...stampDays],
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
      stampRule: stampRule(card.rules),
      voucherDiscount: card.rules.voucherDiscount,
      freeDrinkMax: card.rules.freeDrinkMax,
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
