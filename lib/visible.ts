// What each person may see of the café's data: admins everything, staff a trimmed copy.
import { publicOrder, type Actor, type Row, type State } from './model';

/** What a member's card needs of an order staff may not otherwise see (see visible). */
export const memberOrder = (o: Row): Row => ({
  id: o.id,
  no: o.no,
  memberId: o.memberId,
  memberOnly: true,
  date: o.date,
  createdAt: o.createdAt,
  paidAt: o.paidAt,
  paid: o.paid,
  status: o.status,
  subtotal: o.subtotal,
  discount: o.discount,
  items: (o.items as Row[]).map((i) => ({
    productId: i.productId,
    quantity: i.quantity,
    price: i.price,
  })),
  ...(o.memberFree ? { memberFree: o.memberFree } : {}),
});
export function visible(s: State, a: Actor): State {
  if (a.role === 'admin') return s;
  const v = structuredClone(s);
  v.employees = v.employees.map((e) => ({
    id: e.id,
    name: e.name,
    role: e.role,
    status: e.status,
  }));
  v.attendance = v.attendance.filter((x) => x.employeeId === a.employeeId);
  v.payrolls = v.payrolls.filter((x) => x.employeeId === a.employeeId);
  v.tiers = [];
  v.feedback = [];
  const ownShift = (o: Row) =>
    s.shifts.some(
      (sh) =>
        sh.id === o.shiftId && (sh.status === 'open' || sh.employeeIds.includes(a.employeeId)),
    );
  // Staff see the orders of open shifts and of their own. A member's card is counted from all of
  // that member's orders, so those from other shifts come along too, cut down to what the card
  // needs and marked `memberOnly`: the app counts stamps and points with them and shows them
  // nowhere else (no totals, payment, cashier or shift).
  v.orders = v.orders.flatMap((o) =>
    ownShift(o) ? [publicOrder(o)] : o.memberId ? [memberOrder(o)] : [],
  );
  v.shifts = v.shifts.map((sh) => ({
    ...sh,
    snapshot: sh.snapshot
      ? { employees: sh.snapshot.employees.filter((e: any) => e.employeeId === a.employeeId) }
      : undefined,
  }));
  return v;
}
