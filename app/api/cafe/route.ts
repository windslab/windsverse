import {authenticate} from '@/lib/auth';
import {publicOrder} from '@/lib/model';
import {read,visible,checkMutation,body,commit,errorResponse} from '@/lib/store';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{const actor=await authenticate(req);const loaded=await read();const url=new URL(req.url);const extra=actor.role==='admin'&&url.searchParams.get('audit')==='1'?await loaded.db.prepare('SELECT actor_id,action,detail,created_at FROM audit ORDER BY created_at DESC LIMIT 100').all():null;return Response.json({actor,setup:!loaded.control,revision:loaded.control?.revision||0,state:visible(loaded.state,actor),audit:extra?.results},{headers:{'Cache-Control':'no-store'}})}catch(e){return errorResponse(e)}}
export async function POST(req:Request){try{checkMutation(req);const actor=await authenticate(req);const data=await body(req);const loaded=await read();const result=await commit(loaded,actor,data.action,data.payload||{},data.revision,data.key);return Response.json({ok:true,result:actor.role!=='admin'&&result?.items?publicOrder(result):result},{headers:{'Cache-Control':'no-store'}})}catch(e){return errorResponse(e)}}
