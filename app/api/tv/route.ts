import {TV_DRIVE_FOLDER,type TVAlbum,type TVPhoto} from '@/lib/drive-tv';
export const dynamic='force-dynamic';
const ID=/^[\w-]{10,100}$/;
const MAX_PHOTOS=240,MAX_FOLDERS=24,TTL=300_000;
let cached:{album:TVAlbum;expires:number}|undefined;
let pending:Promise<TVAlbum>|undefined;

// Decode the public page's string literal as data, without executing scripts.
function decodeLiteral(value:string){
 return value.replace(/\\(x[\da-fA-F]{2}|u[\da-fA-F]{4}|[\s\S])/g,(_,escape:string)=>{
  if(escape[0]==='x'||escape[0]==='u')return String.fromCharCode(parseInt(escape.slice(1),16));
  return ({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f'} as Record<string,string>)[escape]??escape;
 });
}
async function folder(id:string,signal:AbortSignal){
 // Only the configured public folder and child IDs returned by Google are read.
 const response=await fetch(`https://drive.google.com/drive/folders/${id}`,{signal,redirect:'follow',headers:{Accept:'text/html'}});
 if(!response.ok||new URL(response.url).hostname!=='drive.google.com')throw new Error('Folder tidak dapat dibuka tanpa login.');
 const reader=response.body?.getReader();if(!reader)throw new Error('Album tidak dapat dibaca.');
 const decoder=new TextDecoder();let html='',bytes=0;
 try{while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>4_000_000)throw new Error('Daftar folder terlalu besar.');html+=decoder.decode(chunk.value,{stream:true});}}finally{await reader.cancel();}
 html+=decoder.decode();
 const match=html.match(/window\['_DRIVE_ivd'\]\s*=\s*'((?:\\.|[^'\\])*)'/);
 if(!match)throw new Error('Daftar foto Google Drive belum dapat dibaca.');
 const data:unknown=JSON.parse(decodeLiteral(match[1]));
 if(!Array.isArray(data)||(data[0]!==null&&!Array.isArray(data[0])))throw new Error('Format album Google Drive berubah.');
 return (data[0]||[]) as unknown[][];
}
async function loadAlbum():Promise<TVAlbum>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),22_000);
 const queue=[{id:TV_DRIVE_FOLDER,name:'Winds Space',depth:0}],seen=new Set<string>(),photos:TVPhoto[]=[],photoIds=new Set<string>();
 let partial=false;
 try{
  while(queue.length&&seen.size<MAX_FOLDERS&&photos.length<MAX_PHOTOS){
   const batch=queue.splice(0,3).filter(item=>!seen.has(item.id));batch.forEach(item=>seen.add(item.id));
   const results=await Promise.allSettled(batch.map(item=>folder(item.id,controller.signal)));
   for(let i=0;i<results.length;i++){
    const result=results[i],parent=batch[i];
    if(result.status==='rejected'){if(parent.id===TV_DRIVE_FOLDER)throw result.reason;partial=true;continue;}
    // Public Drive pages expose one bounded page (normally 50 entries).
    if(result.value.length>=50)partial=true;
    for(const row of result.value){
     const [id,,name,mime]=row;
     if(typeof id!=='string'||!ID.test(id)||typeof name!=='string'||typeof mime!=='string')continue;
     if(mime==='application/vnd.google-apps.folder'){
      if(parent.depth<4&&!seen.has(id)&&!queue.some(item=>item.id===id))queue.push({id,name:name.slice(0,120),depth:parent.depth+1});else partial=true;
     }else if(mime.startsWith('image/')&&!mime.includes('svg')&&!photoIds.has(id)&&photos.length<MAX_PHOTOS){
      photoIds.add(id);photos.push({id,name:name.slice(0,180),album:parent.name,src:`https://drive.google.com/thumbnail?id=${id}&sz=w1200`});
     }
    }
   }
  }
  if(queue.length||photos.length===MAX_PHOTOS)partial=true;
  return {photos,partial,updatedAt:new Date().toISOString()};
 }finally{clearTimeout(timer);}
}
export async function GET(){
 try{
  if(cached&&cached.expires>Date.now())return Response.json(cached.album,{headers:{'Cache-Control':'public, max-age=60'}});
  if(!pending)pending=loadAlbum().then(album=>{cached={album,expires:Date.now()+TTL};return album;}).finally(()=>{pending=undefined;});
  return Response.json(await pending,{headers:{'Cache-Control':'public, max-age=60'}});
 }catch{return Response.json({error:'Album belum dapat dimuat. Pastikan folder dan foto Google Drive dapat dilihat oleh siapa saja yang memiliki link.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
