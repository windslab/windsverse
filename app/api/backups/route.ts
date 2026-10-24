import {authenticate,confirmAdminPin} from '@/lib/auth';
import {body,checkMutation,errorResponse,database} from '@/lib/store';
import {Fault} from '@/lib/engine';
import {backupRow,summary,createBackup,stepBackup,previewRestore,startRestore,stepRestore,finishRestore,exportBackup,uploadPackage} from '@/lib/backups';
export const dynamic='force-dynamic';
const json=(value:unknown)=>Response.json(value,{headers:{'Cache-Control':'no-store'}});
export async function GET(req:Request){try{const actor=await authenticate(req);if(actor.role!=='admin')throw new Fault('Hanya admin dapat membaca cadangan.',403);const url=new URL(req.url),id=url.searchParams.get('id');if(url.searchParams.get('download')==='1'){if(!id)throw new Fault('Pilih cadangan.');return await exportBackup(id);}if(id)return json(await summary(await backupRow(id)));const rows=await database().prepare('SELECT * FROM backups ORDER BY created_at DESC LIMIT 100').all<any>();const jobs=await database().prepare("SELECT id,status,created_at,safety_backup_id FROM restore_jobs WHERE actor_id=? AND status IN ('safety','images','ready') AND created_at>? ORDER BY created_at DESC LIMIT 5").bind(actor.id,new Date(Date.now()-60*60_000).toISOString()).all();const ids=rows.results.map(row=>row.id),stats=ids.length?await database().prepare('SELECT backup_id,kind,status,count(*) AS n,coalesce(sum(size),0) AS bytes FROM backup_parts WHERE backup_id IN ('+ids.map(()=>'?').join(',')+') GROUP BY backup_id,kind,status').bind(...ids).all<any>():{results:[]};return json({backups:await Promise.all(rows.results.map(row=>summary(row,stats.results.filter(item=>item.backup_id===row.id)))),jobs:jobs.results});}catch(error){return errorResponse(error)}}
export async function POST(req:Request){try{
 const actor=await authenticate(req);if(actor.role!=='admin')throw new Fault('Hanya admin dapat mengelola cadangan.',403);
 const origin=req.headers.get('origin');if(origin!==new URL(req.url).origin||req.headers.get('sec-fetch-site')==='cross-site')throw new Fault('Permintaan harus dari aplikasi ini.',403);
 if(new URL(req.url).searchParams.get('upload')==='1')return json({id:await uploadPackage(req,actor)});
 checkMutation(req);const p=await body(req);
 if(p.action==='create')return json({id:await createBackup(actor,typeof p.reason==='string'?p.reason.trim().slice(0,2000)||'Cadangan manual':'Cadangan manual')});
 if(p.action==='step')return json(await stepBackup(p.id));
 if(p.action==='preview')return json(await previewRestore(p.id,actor));
 if(p.action==='restore.start'){if(p.confirmation!=='PULIHKAN'||typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>2000)throw new Fault('Isi alasan dan ketik PULIHKAN untuk mengonfirmasi.');await confirmAdminPin(req,actor,p.currentPin);return json(await startRestore(p.ticket,actor,p.reason.trim()));}
 if(p.action==='restore.step')return json(await stepRestore(p.id,actor));
 if(p.action==='restore.commit')return json(await finishRestore(p.id,actor));
 throw new Fault('Tindakan cadangan tidak dikenal.');
}catch(error){return errorResponse(error)}}
