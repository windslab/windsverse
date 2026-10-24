import { digest } from './auth-crypto';
import type { State } from './model';
import type { CafeVisitor } from './cafe-activity';
export const DRINK_TIME_MS = 90_000;
/** Anonymous visual tokens cannot be used to look up receipts or customer details. */
export async function sceneVisitors(state: State, now = Date.now()): Promise<CafeVisitor[]> {
  const orders = state.orders
    .filter(
      (o) =>
        o.paid &&
        !o.historicalEntry &&
        (['diproses', 'sedang_dibuat', 'siap_disajikan'].includes(o.status) ||
          (o.status === 'selesai' &&
            Number.isFinite(Date.parse(o.sceneFinishedAt)) &&
            now - Date.parse(o.sceneFinishedAt) < DRINK_TIME_MS + 60_000)),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-12);
  const groups = await Promise.all(
    orders.map(async (o) => {
      const group = (await digest('cafe-visual:' + o.id)).slice(0, 24),
        guests = Math.min(MAX_GUESTS_PER_ORDER, Math.max(1, drinkCount(state, o)));
      return Array.from({ length: guests }, (_, i) => ({
        key: i ? group + ':' + i : group,
        group,
        status: o.status,
        type: o.orderType,
        tableNumber: state.tables.find((t) => t.id === o.tableId)?.number ?? null,
        finishedAt: o.status === 'selesai' ? Date.parse(o.sceneFinishedAt) : null,
      }));
    }),
  );
  // The scene has a fixed number of guest avatars; keep the newest orders whole.
  const visitors: CafeVisitor[] = [];
  for (const group of groups.reverse()) {
    if (visitors.length + group.length > MAX_SCENE_GUESTS) break;
    visitors.unshift(...group);
  }
  return visitors;
}
export const MAX_GUESTS_PER_ORDER = 4,
  MAX_SCENE_GUESTS = 8;
const FOOD_CATEGORIES = new Set(['makanan', 'dessert', 'snack']);
/** One guest per drink: food lines (makanan, dessert, snack or a category named like food) add none. */
function drinkCount(state: State, order: State['orders'][number]) {
  let drinks = 0;
  for (const item of order.items || []) {
    const category = state.products.find((p) => p.id === item.productId)?.category ?? '',
      name = state.categories.find((c) => c.id === category)?.name ?? '';
    if (FOOD_CATEGORIES.has(category) || /makan|snack|dessert|kue|roti|food/i.test(name)) continue;
    drinks += item.quantity || 1;
  }
  return drinks;
}
