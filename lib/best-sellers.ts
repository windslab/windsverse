import { businessDay, type Row } from './model';

/** The days counted as "this week": today's business day and the six before it. */
export function weekDays(today: string) {
  const days: string[] = [];
  const d = new Date(today + 'T00:00:00Z');
  for (let i = 0; i < 7; i++) {
    days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return days;
}

/**
 * The menu items sold most over the last seven days, ranked by cups or plates sold. Only paid,
 * uncancelled orders count, and items no longer on the menu are skipped. Guests see the rank
 * alone, so the counts never leave this function.
 */
export function weeklyBestSellers(
  s: { orders: Row[]; products: Row[] },
  today = businessDay(),
  limit = 5,
) {
  const days = new Set(weekDays(today)),
    sold = new Map<string, number>();
  for (const o of s.orders) {
    if (!o.paid || o.status === 'dibatalkan' || !days.has(o.date)) continue;
    for (const i of o.items || [])
      sold.set(i.productId, (sold.get(i.productId) || 0) + (Number(i.quantity) || 0));
  }
  return s.products
    .filter((p) => (sold.get(p.id) || 0) > 0)
    .sort((a, b) => sold.get(b.id)! - sold.get(a.id)! || a.name.localeCompare(b.name, 'id'))
    .slice(0, limit)
    .map((p, i) => ({
      rank: i + 1,
      id: p.id,
      name: p.name,
      image: p.image || '',
      price: p.price,
      category: p.category,
      status: p.status,
    }));
}
