import {digest} from './auth-crypto';
import type {State} from './model';
import type {CafeVisitor} from './cafe-activity';
export const DRINK_TIME_MS=90_000;
/** Anonymous visual tokens cannot be used to look up receipts or customer details. */
export async function sceneVisitors(state:State,now=Date.now()):Promise<CafeVisitor[]>{
 const orders=state.orders.filter(o=>o.paid&&!o.historicalEntry&&(['diproses','sedang_dibuat','siap_disajikan'].includes(o.status)||o.status==='selesai'&&Number.isFinite(Date.parse(o.sceneFinishedAt))&&now-Date.parse(o.sceneFinishedAt)<DRINK_TIME_MS+60_000)).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).slice(-12);
 return Promise.all(orders.map(async o=>({key:(await digest('cafe-visual:'+o.id)).slice(0,24),status:o.status,type:o.orderType,tableNumber:state.tables.find(t=>t.id===o.tableId)?.number??null,finishedAt:o.status==='selesai'?Date.parse(o.sceneFinishedAt):null})));
}
