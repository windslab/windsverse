import {database,checkMutation,errorResponse} from '@/lib/store';
import {authenticate,authResponse,canActivateOwner,clearAttempts,confirmAdminPin,createSession,credentialFor,limitAttempt,sessionCookie,sessionToken} from '@/lib/auth';
import {digest,hashPin,loginId,randomSecret,validatePin,verifyPin} from '@/lib/auth-crypto';
import {Fault} from '@/lib/engine';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{
 if(new URL(req.url).searchParams.get('accounts')==='1'){
  const a=await authenticate(req);if(a.role!=='admin')throw new Fault('Hanya admin dapat melihat akun.',403);
  const rows=await database().prepare('SELECT employee_id AS employeeId,login_id AS loginId,enabled,updated_at AS updatedAt FROM auth_credentials').all();return authResponse({accounts:rows.results});
 }
 let actor=null;try{actor=await authenticate(req)}catch(e){if(!(e instanceof Fault)||e.status!==401)throw e;}
 const activationPending=!await database().prepare("SELECT employee_id FROM auth_credentials WHERE employee_id='owner'").first();
 return authResponse({actor,activationPending,canActivate:!actor&&activationPending&&await canActivateOwner()});
}catch(e){return errorResponse(e)}}
export async function POST(req:Request){try{
 checkMutation(req);const raw=await req.text();if(raw.length>4096)throw new Fault('Permintaan terlalu besar.',413);
 let p:any;try{p=JSON.parse(raw)}catch{throw new Fault('Isian tidak valid.')};if(!p||typeof p!=='object')throw new Fault('Isian tidak valid.');
 const db=database();
 if(p.action==='logout') {const token=sessionToken(req);if(token)await db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(await digest(token)).run();return authResponse({ok:true},sessionCookie(req,'',0));}
 if(p.action==='login') {
  let id='';try{id=loginId(p.loginId)}catch{throw new Fault('ID atau PIN tidak sesuai.',401)}
  await limitAttempt(req,'login:'+id);
  const c=await db.prepare('SELECT * FROM auth_credentials WHERE login_id=?').bind(id).first<any>();
  const valid=await verifyPin(p.pin,c||{salt:'winds-space-missing-account',pin_hash:'0'.repeat(64)});
  const employee=c?await db.prepare("SELECT data FROM records WHERE kind='employees' AND id=?").bind(c.employee_id).first<any>():null;
  if(!valid||!c?.enabled||!employee||JSON.parse(employee.data).status!=='aktif')throw new Fault('ID atau PIN tidak sesuai.',401);
  const cookie=await createSession(req,c);await clearAttempts('login:'+id);return authResponse({ok:true},cookie);
 }
 if(p.action==='activate') {
  if(!await canActivateOwner())throw new Fault('Aktivasi hanya tersedia untuk pemilik awal yang belum memiliki ID dan PIN.',403);
  const id=loginId(p.loginId);validatePin(p.pin);const salt=randomSecret(16),hash=await hashPin(p.pin,salt),version=randomSecret(16),now=Date.now();
  if(await db.prepare('SELECT employee_id FROM auth_credentials WHERE login_id=?').bind(id).first())throw new Fault('ID sudah digunakan.',409);
  try{await db.batch([db.prepare("INSERT INTO auth_credentials(employee_id,login_id,pin_hash,salt,version,enabled,updated_at) VALUES('owner',?,?,?,?,1,?)").bind(id,hash,salt,version,now),db.prepare('INSERT INTO audit(id,actor_id,action,detail,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),'employee:owner','auth.activate','Login ID dan PIN pemilik diaktifkan',new Date(now).toISOString())]);}catch{throw new Fault('Aktivasi telah dilakukan atau ID sudah digunakan. Muat ulang halaman.',409)}
  return authResponse({ok:true},await createSession(req,(await credentialFor('owner'))!));
 }
 const a=await authenticate(req);const adminCredential=await confirmAdminPin(req,a,p.currentPin);
 const target=typeof p.employeeId==='string'?p.employeeId:'';
 if(target==='owner'&&a.employeeId!=='owner')throw new Fault('Hanya pemilik dapat mengubah akun pemilik.',403);
 const rec=await db.prepare("SELECT data FROM records WHERE id=? AND kind='employees'").bind(target).first<any>();
 if(!rec)throw new Fault('Karyawan tidak ditemukan.',404);
 const guard=`EXISTS(SELECT 1 FROM auth_credentials c JOIN records r ON r.id=c.employee_id WHERE c.employee_id=? AND c.version=? AND c.enabled=1 AND json_extract(r.data,'$.role')='admin' AND json_extract(r.data,'$.status')='aktif' AND EXISTS(SELECT 1 FROM auth_sessions s WHERE s.employee_id=c.employee_id AND s.version=c.version AND s.token_hash=? AND s.expires_at>unixepoch()*1000 AND s.last_seen>unixepoch()*1000-3600000))`;
 const previous=await db.prepare('SELECT login_id,enabled,version FROM auth_credentials WHERE employee_id=?').bind(target).first<{login_id:string;enabled:number;version:string}>();
 const targetGuard="AND coalesce((SELECT version FROM auth_credentials WHERE employee_id=?),'')=?";
 const beforeAccess=previous?{loginId:previous.login_id,enabled:previous.enabled}:null;
 const version=randomSecret(16),now=Date.now();
 if(p.action==='credentials'){
  if(JSON.parse(rec.data).status!=='aktif')throw new Fault('Aktifkan karyawan sebelum membuat login.');
  const id=loginId(p.loginId);validatePin(p.pin);const salt=randomSecret(16),hash=await hashPin(p.pin,salt);
  const exists=await db.prepare('SELECT employee_id FROM auth_credentials WHERE login_id=? AND employee_id<>?').bind(id,target).first();if(exists)throw new Fault('ID sudah digunakan.',409);
  const result=await db.batch([
   db.prepare(`INSERT INTO auth_credentials(employee_id,login_id,pin_hash,salt,version,enabled,updated_at) SELECT ?,?,?,?,?,1,? WHERE ${guard} AND EXISTS(SELECT 1 FROM records WHERE id=? AND kind='employees' AND json_extract(data,'$.status')='aktif') ${targetGuard} ON CONFLICT(employee_id) DO UPDATE SET login_id=excluded.login_id,pin_hash=excluded.pin_hash,salt=excluded.salt,version=excluded.version,enabled=1,updated_at=excluded.updated_at`).bind(target,id,hash,salt,version,now,a.employeeId,adminCredential.version,a.sessionHash,target,target,previous?.version||''),
   db.prepare('DELETE FROM auth_sessions WHERE employee_id=? AND EXISTS(SELECT 1 FROM auth_credentials WHERE employee_id=? AND version=?)').bind(target,target,version),
   db.prepare('INSERT INTO audit(id,actor_id,action,detail,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM auth_credentials WHERE employee_id=? AND version=?)').bind(crypto.randomUUID(),a.id,'auth.credentials',JSON.stringify({employeeId:target,actorName:a.name,before:beforeAccess,after:{loginId:id,enabled:1}}),new Date(now).toISOString(),target,version)
  ]);if(result[0].meta.changes!==1)throw new Fault('Akun berubah. Masuk kembali lalu ulangi.',409);
  await clearAttempts('login:'+id);return authResponse({ok:true,relogin:target===a.employeeId},target===a.employeeId?sessionCookie(req,'',0):undefined);
 }
 if(p.action==='revoke'){
  if(target==='owner')throw new Fault('Akses pemilik utama tidak dapat dicabut.');
  const result=await db.batch([
   db.prepare(`UPDATE auth_credentials SET enabled=0,version=?,updated_at=? WHERE employee_id=? AND ${guard} ${targetGuard}`).bind(version,now,target,a.employeeId,adminCredential.version,a.sessionHash,target,previous?.version||''),
   db.prepare('DELETE FROM auth_sessions WHERE employee_id=? AND EXISTS(SELECT 1 FROM auth_credentials WHERE employee_id=? AND version=?)').bind(target,target,version),
   db.prepare('INSERT INTO audit(id,actor_id,action,detail,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM auth_credentials WHERE employee_id=? AND version=?)').bind(crypto.randomUUID(),a.id,'auth.revoke',JSON.stringify({employeeId:target,actorName:a.name,before:beforeAccess,after:previous?{loginId:previous.login_id,enabled:0}:null}),new Date(now).toISOString(),target,version)
  ]);if(result[0].meta.changes!==1)throw new Fault('Akun tidak tersedia atau sudah berubah.',409);
  return authResponse({ok:true,relogin:target===a.employeeId},target===a.employeeId?sessionCookie(req,'',0):undefined);
 }
 throw new Fault('Tindakan tidak dikenal.');
}catch(e){return errorResponse(e)}}
