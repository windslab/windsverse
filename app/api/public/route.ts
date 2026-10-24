import {read,checkMutation,body,commit,errorResponse} from '@/lib/store';
import {Fault} from '@/lib/engine';
import {digest} from '@/lib/auth-crypto';
import {sceneVisitors} from '@/lib/cafe-visitors';
import {publicBooks} from '@/lib/public-books';
import {localDate} from '@/lib/model';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{
 const url=new URL(req.url),loaded=await read(),s=loaded.state;
 const tracking=url.searchParams.get('track');
 if(tracking!==null){
  if(tracking.trim().length>40)throw new Fault('Nomor pesanan tidak valid.');
  const ip=req.headers.get('cf-connecting-ip')||'local',key='public-track:'+await digest(ip),now=Date.now(),windowMs=60_000;
  const result=await loaded.db.prepare('INSERT INTO auth_attempts(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING count').bind(key,now+windowMs,now,now).first<{count:number}>();
  if((result?.count||0)>30)throw new Fault('Terlalu banyak pencarian. Tunggu sebentar lalu coba lagi.',429);
  const query=tracking.trim();
  if(!/^WS-/i.test(query)){
   // Lookup by name: today's paid orders only, first name + status + queue position, nothing else.
   const name=query.toLowerCase();
   if(name.length<2)throw new Fault('Ketik minimal 2 huruf nama pemesan.');
   const today=localDate(),open=s.orders.filter(o=>o.paid&&!o.historicalEntry&&o.date===today&&o.status!=='dibatalkan').sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
   const waiting=open.filter(o=>['diproses','sedang_dibuat'].includes(o.status));
   const matches=open.filter(o=>(o.customerName||'').toLowerCase().split(/\s+/).some((w:string)=>w.startsWith(name))).slice(-10).map(o=>{const i=waiting.indexOf(o);return{name:(o.customerName||'').trim().split(/\s+/)[0],status:o.status,orderType:o.orderType,queue:i<0?null:i+1};});
   return Response.json({found:matches.length>0,matches},{headers:{'Cache-Control':'no-store'}});
  }
  const order=s.orders.find(o=>o.no.toUpperCase()===query.toUpperCase());
  if(!order)return Response.json({found:false},{headers:{'Cache-Control':'no-store'}});
  return Response.json({found:true,status:order.status,orderType:order.orderType},{headers:{'Cache-Control':'no-store'}});
 }
 if(url.searchParams.get('books')==='1')return Response.json({books:publicBooks(s)},{headers:{'Cache-Control':'no-store'}});
 if(url.searchParams.get('scene')==='1'){
  const active=s.orders.filter(o=>o.paid&&!o.historicalEntry&&!['selesai','dibatalkan','menunggu_pembayaran'].includes(o.status));
  const cutoff=new Date(Date.now()-30_000).toISOString();
  const presence=await loaded.db.prepare("SELECT count(*) AS n FROM records WHERE kind='presence' AND json_extract(data,'$.updatedAt')>? ").bind(cutoff).first<{n:number}>();
  const queued=active.filter(o=>o.status==='diproses'),making=active.filter(o=>o.status==='sedang_dibuat'),ready=active.filter(o=>o.status==='siap_disajikan'),dineInReady=ready.filter(o=>o.orderType==='dine_in'),posActive=(presence?.n||0)>0;
  // Single aggregate scene state makes the transition deterministic and keeps every order identifier private.
  const priorityOrder=dineInReady.length?dineInReady:making.length?making:queued.length?queued:ready;
  const selected=priorityOrder.sort((a,b)=>a.createdAt.localeCompare(b.createdAt))[0];
  const mode: 'idle'|'cashier'|'working'|'deliver'|'waiting'=dineInReady.length?'deliver':making.length?'working':queued.length||posActive?'cashier':ready.length?'waiting':'idle';
  const seating: {tableNumber:string|number|null;count:number;type:string}[]=[];
  for(const order of active){const tableNumber=order.orderType==='dine_in'?(s.tables.find(t=>t.id===order.tableId)?.number??null):null;const group=seating.find(g=>g.type===order.orderType&&g.tableNumber===tableNumber);if(group)group.count++;else seating.push({type:order.orderType,tableNumber,count:1});}
  return Response.json({visitors:await sceneVisitors(s),seating,active:active.length,queued:queued.length,making:making.length,ready:ready.length,dineInCount:active.filter(o=>o.orderType==='dine_in').length,dineInReady:dineInReady.length,takeaway:active.filter(o=>o.orderType==='takeaway').length,posActive,mode,dineIn:!!selected&&selected.orderType==='dine_in',tableNumber:selected?.orderType==='dine_in'?(s.tables.find(table=>table.id===selected.tableId)?.number??null):null},{headers:{'Cache-Control':'no-store'}});
 }
 return Response.json({settings:s.settings.map(({name,tagline,logo,address,phone,whatsapp})=>({name,tagline,logo,address,phone,whatsapp})),categories:[...s.categories].sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name)),products:s.products,tables:s.tables.map(({id,number,zone})=>({id,number,zone})),books:publicBooks(s)},{headers:{'Cache-Control':'no-store'}})
}catch(e){return errorResponse(e)}}
export async function POST(req:Request){try{checkMutation(req);const p=await body(req);const loaded=await read();if(!loaded.control)throw new Fault('Kafe belum disiapkan.',503);const ip=req.headers.get('cf-connecting-ip')||'local';const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip));const actorId='guest-'+Array.from(new Uint8Array(hash)).map(v=>v.toString(16).padStart(2,'0')).join('');const count=await loaded.db.prepare('SELECT count(*) AS n FROM audit WHERE actor_id=? AND created_at>?').bind(actorId,new Date(Date.now()-60000).toISOString()).first<{n:number}>();if((count?.n||0)>=3)throw new Fault('Tunggu satu menit sebelum mengirim masukan lagi.',429);await commit(loaded,{id:actorId,employeeId:'',name:'Pelanggan',email:'',role:'karyawan'},'feedback.add',p,loaded.control.revision,crypto.randomUUID());return Response.json({ok:true})}catch(e){return errorResponse(e)}}
