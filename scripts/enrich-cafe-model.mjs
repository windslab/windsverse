/** Append decorative book geometry without re-exporting the original cafe or its textures. */
import fs from 'node:fs';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node scripts/enrich-cafe-model.mjs input.glb output.glb');
const bytes=fs.readFileSync(input),jsonLength=bytes.readUInt32LE(12),original=JSON.parse(bytes.subarray(20,20+jsonLength).toString()),bin=bytes.subarray(28+jsonLength);
let seed=1042;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const palette=['#875248','#526c5a','#d0ad78','#555f75','#b47a88','#697c8c','#836746','#d7c7a6'];
const materials=palette.map((color,i)=>new THREE.MeshStandardMaterial({name:'WS_Book_Cover_'+i,color,roughness:.84}));
const pages=new THREE.MeshStandardMaterial({name:'WS_Book_Pages',color:'#e8ddc7',roughness:.95}),gilt=new THREE.MeshStandardMaterial({name:'WS_Book_Spine_Lines',color:'#d6bd85',roughness:.7});
const batches=new Map([...materials,pages,gilt].map(m=>[m,[]]));
const group=new THREE.Group();group.name='WS_Decorative_Books';
function box(material,size,position,rotation=0){const geo=new THREE.BoxGeometry(...size);geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),rotation),new THREE.Vector3(1,1,1)));batches.get(material).push(geo);}
// The new TV occupies the central bay. Keep the side shelves and central screen clear.
let count=0;
for(const [row,base] of [.615,.814,1.016,1.217,1.419,1.620,1.822].entries()){
 for(const [side,range] of [[0,[3.00,3.45]],[1,[4.36,4.78]]]){
  if(row===2&&side===1){
   for(let i=0;i<4;i++){const y=base+.013+i*.027;box(materials[(i+2)%materials.length],[.13,.025,.25],[3.729,y,4.56]);box(pages,[.126,.018,.238],[3.724,y,4.56]);count++;}
   continue;
  }
  let z=range[0]+.025;
  while(z<range[1]-.05){
   const w=.025+random()*.022,h=(row===6?.082:.113)+random()*.032,depth=.115+random()*.022,cover=materials[Math.floor(random()*materials.length)];
   if(z+w>range[1]-.02)break;
   const x=3.727,y=base+h/2+.004,at=z+w/2;
   box(pages,[depth-.009,h-.01,w-.008],[x+.001,y,at]);
   for(const sign of [-1,1])box(cover,[depth+.005,h,.004],[x,y,at+sign*(w/2-.002)]);
   box(cover,[.006,h,w],[x-depth/2,y,at]);
   for(const line of [-.29,.29])box(gilt,[.0012,.0025,w*.72],[x-depth/2-.0036,y+h*line,at]);
   z+=w+.009+random()*.012;count++;
  }

 }
}
for(const [material,geometries] of batches){if(!geometries.length)continue;const mesh=new THREE.Mesh(mergeGeometries(geometries),material);mesh.name=material.name;group.add(mesh);geometries.forEach(g=>g.dispose());}
class Reader{result=null;onloadend=null;onerror=null;async readAsArrayBuffer(blob){try{this.result=await blob.arrayBuffer();this.onloadend?.();}catch(error){this.onerror?.(error);}}}
globalThis.FileReader=Reader;
const extraBytes=Buffer.from(await new GLTFExporter().parseAsync(group,{binary:true})),extraLength=extraBytes.readUInt32LE(12),extra=JSON.parse(extraBytes.subarray(20,20+extraLength).toString()),extraBin=extraBytes.subarray(28+extraLength);
const offsets=Object.fromEntries(['bufferViews','accessors','materials','meshes','nodes'].map(key=>[key,original[key]?.length||0])),binOffset=bin.length;
for(const view of extra.bufferViews||[])view.byteOffset=(view.byteOffset||0)+binOffset;
for(const accessor of extra.accessors||[])if(accessor.bufferView!==undefined)accessor.bufferView+=offsets.bufferViews;
for(const mesh of extra.meshes||[])for(const primitive of mesh.primitives){for(const key of Object.keys(primitive.attributes))primitive.attributes[key]+=offsets.accessors;if(primitive.indices!==undefined)primitive.indices+=offsets.accessors;if(primitive.material!==undefined)primitive.material+=offsets.materials;}
for(const node of extra.nodes||[]){if(node.mesh!==undefined)node.mesh+=offsets.meshes;if(node.children)node.children=node.children.map(index=>index+offsets.nodes);}
for(const key of Object.keys(offsets))original[key]=[...(original[key]||[]),...(extra[key]||[])];
original.scenes[original.scene||0].nodes.push(...extra.scenes[extra.scene||0].nodes.map(index=>index+offsets.nodes));
original.buffers[0].byteLength=bin.length+extraBin.length;
original.asset.extras={...original.asset.extras,windsSpace:{decorativeBookCount:count,source:'Winds Space New Model.glb',note:'Decorative book models are separate from the registered library catalogue.'}};
let json=Buffer.from(JSON.stringify(original));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,0x20)]);const payload=Buffer.concat([bin,extraBin]);const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+payload.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(payload.length);binHeader.writeUInt32LE(0x004e4942,4);
fs.writeFileSync(output,Buffer.concat([header,json,binHeader,payload]));console.log(JSON.stringify({output,decorativeBooks:count,additionalDrawCalls:group.children.length,bytes:fs.statSync(output).size}));
