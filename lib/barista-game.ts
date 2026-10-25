// Explore mode café simulator: the rules, with no rendering. Players invent their own recipes;
// customers judge the drink by taste against their stated preference, plus the cup, the
// espresso machine for coffee, the change they got back and how long they waited.
// The café's real recipes are never used here (they stay private).

export type Taste = { sweet: number; milky: number; coffee: number; flavor: number };
export type FlavorId = 'cokelat' | 'matcha' | 'taro' | 'vanila' | 'karamel' | 'aren' | 'teh' | '';

export type Ingredient = {
  id: string;
  name: string;
  unit: string;
  /** Amount added per tap. */
  step: number;
  max: number;
  /** Taste contribution per unit. */
  taste: Partial<Taste>;
  flavor?: FlavorId;
  /** Only from the espresso machine. */
  espresso?: boolean;
};

export const INGREDIENTS: Ingredient[] = [
  {
    id: 'espresso',
    name: 'Espresso',
    unit: 'shot',
    step: 1,
    max: 3,
    taste: { coffee: 0.42 },
    espresso: true,
  },
  {
    id: 'kopi-tubruk',
    name: 'Bubuk kopi tubruk',
    unit: 'g',
    step: 5,
    max: 25,
    taste: { coffee: 0.02 },
  },
  {
    id: 'fullcream',
    name: 'Susu full cream',
    unit: 'ml',
    step: 30,
    max: 240,
    taste: { milky: 0.0045, sweet: 0.0004 },
  },
  { id: 'skm', name: 'SKM', unit: 'ml', step: 10, max: 60, taste: { sweet: 0.012, milky: 0.004 } },
  { id: 'gula', name: 'Gula cair', unit: 'ml', step: 5, max: 40, taste: { sweet: 0.016 } },
  {
    id: 'aren',
    name: 'Gula aren',
    unit: 'ml',
    step: 5,
    max: 40,
    taste: { sweet: 0.014 },
    flavor: 'aren',
  },
  {
    id: 'cokelat',
    name: 'Bubuk cokelat',
    unit: 'g',
    step: 5,
    max: 30,
    taste: { sweet: 0.004 },
    flavor: 'cokelat',
  },
  { id: 'matcha', name: 'Bubuk matcha', unit: 'g', step: 3, max: 15, taste: {}, flavor: 'matcha' },
  {
    id: 'taro',
    name: 'Bubuk taro',
    unit: 'g',
    step: 5,
    max: 30,
    taste: { sweet: 0.004 },
    flavor: 'taro',
  },
  {
    id: 'vanila',
    name: 'Sirup vanila',
    unit: 'ml',
    step: 5,
    max: 30,
    taste: { sweet: 0.01 },
    flavor: 'vanila',
  },
  {
    id: 'karamel',
    name: 'Sirup karamel',
    unit: 'ml',
    step: 5,
    max: 30,
    taste: { sweet: 0.012 },
    flavor: 'karamel',
  },
  { id: 'teh', name: 'Teh seduh', unit: 'ml', step: 50, max: 200, taste: {}, flavor: 'teh' },
  { id: 'air', name: 'Air panas', unit: 'ml', step: 50, max: 200, taste: {} },
  { id: 'es', name: 'Es batu', unit: 'sendok', step: 1, max: 4, taste: {} },
];
export const ingredientById = (id: string) => INGREDIENTS.find((i) => i.id === id);

export type CupId = 'cangkir' | 'gelas-es' | 'cup-takeaway';
export const CUPS: { id: CupId; name: string; note: string }[] = [
  { id: 'cangkir', name: 'Cangkir panas', note: 'Untuk minuman panas' },
  { id: 'gelas-es', name: 'Gelas es', note: 'Untuk minuman dingin' },
  { id: 'cup-takeaway', name: 'Cup bawa pulang', note: 'Untuk pesanan dibawa' },
];

export type MenuItem = { id: string; name: string; price: number; category: string };

/** Drinks from the café menu (food is left out for now); a small demo menu if none load. */
export function drinkMenu(
  products: { id: string; name: string; price: number; category: string; status?: string }[],
) {
  const drinks = products.filter(
    (p) =>
      (p.status ?? 'tersedia') === 'tersedia' &&
      !/makanan|dessert|snack|food|kue|roti/i.test(p.category) &&
      p.price > 0,
  );
  return drinks.length
    ? drinks.map(({ id, name, price, category }) => ({ id, name, price, category }))
    : DEMO_MENU;
}
export const DEMO_MENU: MenuItem[] = [
  { id: 'demo-kopsus', name: 'Es Kopi Susu Aren', price: 22000, category: 'kopi' },
  { id: 'demo-americano', name: 'Americano', price: 18000, category: 'kopi' },
  { id: 'demo-latte', name: 'Caffe Latte', price: 25000, category: 'kopi' },
  { id: 'demo-coklat', name: 'Cokelat Panas', price: 20000, category: 'non_kopi' },
  { id: 'demo-matcha', name: 'Es Matcha Latte', price: 24000, category: 'non_kopi' },
  { id: 'demo-teh', name: 'Es Teh Manis', price: 10000, category: 'non_kopi' },
];

export type Order = {
  item: MenuItem;
  /** What the customer asks for, in their words. */
  line: string;
  coffee: boolean;
  iced: boolean;
  takeaway: boolean;
  flavor: FlavorId;
  target: Taste;
  /** Cash the customer hands over. */
  paid: number;
};

const NAMES = ['Rina', 'Dimas', 'Sari', 'Bayu', 'Nadia', 'Arif', 'Tika', 'Fajar', 'Mila', 'Yoga'];
const level = (v: number) => (v < 0.3 ? 'sedikit' : v < 0.62 ? 'sedang' : 'banyak');

/** Reads a menu item name like a barista would: coffee? iced? which flavour? */
export function describeItem(item: MenuItem) {
  const n = item.name.toLowerCase();
  const coffee =
    item.category === 'kopi' ||
    /kopi|coffee|espresso|latte|americano|cappuc|mocha|macchiato/.test(n);
  const flavor: FlavorId = /cokelat|coklat|choco|mocha/.test(n)
    ? 'cokelat'
    : /matcha|green tea/.test(n)
      ? 'matcha'
      : /taro/.test(n)
        ? 'taro'
        : /vanil/.test(n)
          ? 'vanila'
          : /karamel|caramel/.test(n)
            ? 'karamel'
            : /aren|palm/.test(n)
              ? 'aren'
              : /teh|tea/.test(n)
                ? 'teh'
                : '';
  const milky = /susu|latte|milk|cappuc|kopsus|cokelat|coklat|matcha|taro/.test(n);
  return {
    coffee,
    flavor,
    iced: /^es |\bes\b|ice|iced|dingin/.test(n),
    base: {
      coffee: coffee ? (/americano|espresso|tubruk|hitam|black/.test(n) ? 0.85 : 0.55) : 0,
      milky: milky ? 0.6 : 0.05,
      sweet: /manis|aren|susu|kopsus|cokelat|coklat|karamel|vanil|taro/.test(n) ? 0.55 : 0.2,
    },
  };
}

/** A new customer and their order, with a personal twist on sweetness and strength. */
export function newCustomer(menu: MenuItem[], rand = Math.random) {
  const item = menu[Math.floor(rand() * menu.length)],
    d = describeItem(item);
  const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)];
  const jitter = () => (rand() - 0.5) * 0.35;
  // Unspoken preferences stay at the menu's usual taste, so players are only judged on what
  // the customer actually said.
  const target: Taste = {
    sweet: d.base.sweet,
    milky: d.base.milky,
    coffee: d.coffee ? d.base.coffee : 0,
    flavor: d.flavor ? 0.6 : 0,
  };
  const takeaway = rand() < 0.2;
  const extras: string[] = [];
  if (takeaway) extras.push(pick(['dibawa pulang ya', 'take away', 'dibungkus ya', 'buat dibawa']));
  if (rand() < 0.6) {
    target.sweet = clamp01(d.base.sweet + jitter() * 1.6);
    const sweet = level(target.sweet);
    extras.push(
      pick(
        sweet === 'sedikit'
          ? ['gulanya dikit aja', 'jangan terlalu manis ya', 'kurangin manisnya', 'less sugar ya']
          : sweet === 'banyak'
            ? ['yang manis ya', 'manisnya agak banyak', 'suka yang manis nih', 'gulanya lebihin']
            : ['manisnya pas aja', 'manisnya normal', 'manisnya biasa'],
      ),
    );
  }
  if (d.coffee && rand() < 0.5) {
    target.coffee = clamp01(d.base.coffee + jitter() * 1.6);
    extras.push(
      pick(
        target.coffee > 0.62
          ? [
              'kopinya yang kuat',
              'yang strong ya',
              'kopinya dibanyakin',
              'biar melek, kopinya kuat',
            ]
          : target.coffee < 0.35
            ? ['kopinya ringan aja', 'jangan terlalu pahit', 'kopinya tipis aja']
            : ['kopinya standar aja', 'kopinya sedang'],
      ),
    );
  }
  if (!d.coffee && target.milky > 0.4 && rand() < 0.35) {
    target.milky = clamp01(d.base.milky + jitter());
    extras.push(`susunya ${level(target.milky)}`);
  }
  const name = item.name,
    opener = pick([
      `${name} nya 1 ya!`,
      `Kak, ${name} satu ya.`,
      `Aku pesan ${name} satu.`,
      `Mau ${name} dong, satu aja.`,
      `${name} satu, kak!`,
      `Halo kak, boleh ${name} satu?`,
      `Saya ${name} ya, satu.`,
      `Pesan ${name} 1, makasih kak!`,
      `Hmm… ${name} deh, satu.`,
      `Kak, aku mau coba ${name}.`,
    ]);
  const line = extras.length
    ? `${opener} ${extras.map((e, i) => (i ? e : e[0].toUpperCase() + e.slice(1))).join(', ')}.`
    : opener;
  const notes = [20000, 50000, 100000].filter((n) => n >= item.price);
  const paid =
    rand() < 0.15 ? item.price : (notes[Math.floor(rand() * notes.length)] ?? item.price);
  return {
    name: NAMES[Math.floor(rand() * NAMES.length)],
    order: {
      item,
      line,
      coffee: d.coffee,
      iced: d.iced,
      takeaway,
      flavor: d.flavor,
      target,
      paid,
    } satisfies Order,
  };
}

export type Drink = { cup: CupId | null; amounts: Record<string, number>; espressoQuality: number };

/** Taste of a drink from what went into it (dilution by volume keeps it honest). */
export function tasteOf(drink: Drink) {
  const t: Taste = { sweet: 0, milky: 0, coffee: 0, flavor: 0 };
  const flavors = new Map<FlavorId, number>();
  let volume = 0;
  for (const [id, amount] of Object.entries(drink.amounts)) {
    const ing = ingredientById(id);
    if (!ing || !amount) continue;
    for (const k of Object.keys(ing.taste) as (keyof Taste)[]) t[k] += (ing.taste[k] ?? 0) * amount;
    if (ing.flavor) flavors.set(ing.flavor, (flavors.get(ing.flavor) ?? 0) + amount / ing.max);
    volume +=
      ing.unit === 'ml'
        ? amount
        : ing.unit === 'shot'
          ? amount * 30
          : ing.unit === 'sendok'
            ? amount * 20
            : amount * 0.5;
  }
  // A big cup of milk tastes less strong than a small one.
  const dilution = volume > 260 ? 260 / volume : 1;
  t.coffee = clamp01(t.coffee * dilution * (0.7 + 0.3 * drink.espressoQuality));
  t.sweet = clamp01(t.sweet * dilution);
  t.milky = clamp01(t.milky);
  let main = '' as FlavorId,
    best = 0;
  flavors.forEach((v, k) => {
    if (v > best) [main, best] = [k, v];
  });
  t.flavor = clamp01(best * 1.4);
  return { taste: t, flavor: main, volume };
}

export type Review = {
  stars: number;
  lines: string[];
  points: number;
};

/** The customer's verdict on the drink, the change and the wait. */
export function review(
  order: Order,
  drink: Drink,
  change: { given: number; due: number },
  waitedSeconds: number,
): Review {
  const lines: string[] = [];
  let score = 5;
  const { taste, flavor, volume } = tasteOf(drink);
  // Cup.
  const wantCup: CupId = order.takeaway ? 'cup-takeaway' : order.iced ? 'gelas-es' : 'cangkir';
  if (!drink.cup) {
    score -= 2;
    lines.push('Minumannya tanpa gelas?');
  } else if (drink.cup !== wantCup && !(order.takeaway && drink.cup !== 'cangkir')) {
    score -= 0.5;
    lines.push(
      order.takeaway
        ? 'Saya minta dibawa pulang.'
        : order.iced
          ? 'Kok gelasnya untuk panas?'
          : 'Kok pakai gelas es?',
    );
  }
  if (volume < 60) {
    score -= 1.5;
    lines.push('Isinya sedikit sekali.');
  }
  if (order.iced && !(drink.amounts.es > 0)) {
    score -= 0.7;
    lines.push('Kurang dingin, esnya mana?');
  }
  // Coffee needs the machine.
  if (order.coffee && !(drink.amounts.espresso > 0) && !(drink.amounts['kopi-tubruk'] > 0)) {
    score -= 2;
    lines.push('Ini tidak ada kopinya.');
  } else if (order.coffee && drink.amounts.espresso > 0 && drink.espressoQuality < 0.5) {
    score -= 0.5;
    lines.push('Espressonya agak pahit gosong.');
  }
  if (order.flavor && flavor !== order.flavor) {
    score -= 1.2;
    lines.push(`Rasa ${order.flavor}-nya tidak terasa.`);
  }
  // Taste against the preference.
  const miss =
    Math.abs(taste.sweet - order.target.sweet) * 1.6 +
    Math.abs(taste.milky - order.target.milky) * 1.1 +
    Math.abs(taste.coffee - order.target.coffee) * 1.6;
  score -= Math.min(2.2, miss * 1.4);
  if (taste.sweet - order.target.sweet > 0.25) lines.push('Kemanisan.');
  else if (order.target.sweet - taste.sweet > 0.25) lines.push('Kurang manis.');
  if (order.coffee && taste.coffee - order.target.coffee > 0.25)
    lines.push('Kopinya terlalu kuat.');
  else if (order.coffee && order.target.coffee - taste.coffee > 0.25)
    lines.push('Kopinya kurang terasa.');
  // Change.
  if (change.given !== change.due) {
    score -= change.given < change.due ? 1.5 : 0.5;
    lines.push(
      change.given < change.due ? 'Kembaliannya kurang!' : 'Kembaliannya kelebihan, hehe.',
    );
  }
  // Waiting.
  if (waitedSeconds > 150) {
    score -= 1;
    lines.push('Lama sekali menunggunya.');
  } else if (waitedSeconds > 90) score -= 0.4;
  const stars = Math.max(1, Math.min(5, Math.round(score)));
  if (!lines.length) lines.push(stars === 5 ? 'Enak sekali, pas!' : 'Lumayan, terima kasih.');
  return { stars, lines, points: stars * 20 + (stars === 5 ? 20 : 0) };
}

/** Rupiah pieces in the cash drawer. */
export const DENOMINATIONS = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500];
export const rupiah = (n: number) => 'Rp' + n.toLocaleString('id-ID');

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Explore mode's day runs faster than real time: one game hour per real minute. */
export const GAME_MINUTES_PER_SECOND = 1;

export type Crowd = { label: string; chance: number; max: number };
/**
 * How busy the café is this game hour. Some hours are quiet, some normal, some busy, with the
 * lunch and evening hours leaning busier and late night leaning quiet. `chance` is the chance a
 * guest walks in at each check (every few seconds while open); `max` caps guests at once.
 */
export function crowdFor(hour: number, rand = Math.random): Crowd {
  const lean =
    (hour >= 11 && hour < 14) || (hour >= 17 && hour < 21)
      ? 0.25
      : hour >= 22 || hour < 6
        ? -0.3
        : 0;
  const roll = rand() + lean;
  if (roll < 0.35) return { label: 'sepi', chance: 0.12, max: 2 };
  if (roll < 0.8) return { label: 'lumayan', chance: 0.35, max: 4 };
  return { label: 'ramai', chance: 0.75, max: 6 };
}
