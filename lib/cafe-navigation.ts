import * as THREE from 'three';
import {Octree} from 'three/addons/math/Octree.js';
import {Capsule} from 'three/addons/math/Capsule.js';

/** Navigation is authored in model units. Walk surfaces retain each floor/stair height. */
export function createCafeNavigation(cafe:THREE.Object3D){
 cafe.updateWorldMatrix(true,true);const inverse=cafe.matrixWorld.clone().invert(),scale=cafe.getWorldScale(new THREE.Vector3()).x;
 const walk:THREE.Mesh[]=[],solid=new THREE.Group(),mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
 cafe.traverse(node=>{if(!(node instanceof THREE.Mesh))return;const labels:string[]=[];let parent:THREE.Object3D|null=node;while(parent&&parent!==cafe){labels.push(parent.name);parent=parent.parent;}const label=labels.join(' ').toLowerCase();
  const transform=new THREE.Matrix4().multiplyMatrices(inverse,node.matrixWorld),copy=new THREE.Mesh(node.geometry,mat);copy.applyMatrix4(transform);
  if(/floor|lantai|tangga|trotoar/.test(label)||node.name==='Cube007'||node.name==='Cube008')walk.push(copy);
  if(/leaf|leaves|undergrowth|cable|socket|bulb|book_|coffee_cup|artwork|neon|ikan|kolam/.test(label))return;
  const box=new THREE.Box3().setFromObject(copy);if(box.max.y<.02||box.min.y>4.4)return;solid.add(copy.clone());
 });
 solid.updateMatrixWorld(true);walk.forEach(m=>m.updateMatrixWorld(true));
 const collision=new Octree().fromGraphNode(solid),ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,-1,0),0,8),capsule=new Capsule(),radius=.18,height=1.24,step=.12;
 function floors(x:number,z:number){ray.ray.origin.set(x,5,z);const hits=ray.intersectObjects(walk,false);const levels:number[]=[];for(const hit of hits){if(!hit.face)continue;const normal=hit.face.normal.clone().transformDirection(hit.object.matrixWorld);if(normal.y<.65)continue;const y=hit.point.y;if(!levels.some(v=>Math.abs(v-y)<.025))levels.push(y);}return levels;}
 function clear(point:THREE.Vector3){capsule.radius=radius;capsule.start.set(point.x,point.y+.55,point.z);capsule.end.set(point.x,point.y+height-radius,point.z);const hit=collision.capsuleIntersect(capsule);return !hit||hit.depth<.004;}
 type Node={id:number;x:number;z:number;p:THREE.Vector3};const nodes:Node[]=[],cells=new Map<string,Node[]>();
 for(let x=0;x<=101;x++)for(let z=0;z<=96;z++){const px=-6.7+x*step,pz=-5.77+z*step;for(const y of floors(px,pz)){const p=new THREE.Vector3(px,y,pz);if(!clear(p))continue;const node={id:nodes.length,x,z,p};nodes.push(node);const key=x+':'+z,list=cells.get(key)??[];list.push(node);cells.set(key,list);}}
 const nearest=(p:THREE.Vector3,max=1.1)=>{let best:Node|undefined,distance=max;for(const n of nodes){const d=Math.hypot(n.p.x-p.x,n.p.z-p.z)+Math.abs(n.p.y-p.y)*2.5;if(d<distance){distance=d;best=n;}}return best;};
 const edges=new Map<number,Node[]>();function adjacent(node:Node){let found=edges.get(node.id);if(found)return found;found=[];for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]])for(const next of cells.get((node.x+dx)+':'+(node.z+dz))??[]){if(Math.abs(next.p.y-node.p.y)>.45)continue;if(!clear(node.p.clone().lerp(next.p,.5)))continue;found.push(next);}edges.set(node.id,found);return found;}
 function localPath(from:THREE.Vector3,to:THREE.Vector3){const start=nearest(from),end=nearest(to,.9);if(!start||!end)return null;const open=[start],cost=new Map([[start.id,0]]),previous=new Map<number,Node>(),closed=new Set<number>();let iterations=0;
  while(open.length&&iterations++<nodes.length*2){let best=0,bestScore=Infinity;open.forEach((n,i)=>{const score=(cost.get(n.id)??Infinity)+n.p.distanceTo(end.p);if(score<bestScore){bestScore=score;best=i;}});const node=open.splice(best,1)[0];if(node.id===end.id){const path=[node.p.clone()];let cursor=node;while(previous.has(cursor.id)){cursor=previous.get(cursor.id)!;path.push(cursor.p.clone());}return path.reverse();}if(closed.has(node.id))continue;closed.add(node.id);for(const next of adjacent(node)){if(closed.has(next.id))continue;const nextCost=cost.get(node.id)!+node.p.distanceTo(next.p);if(nextCost<(cost.get(next.id)??Infinity)){cost.set(next.id,nextCost);previous.set(next.id,node);open.push(next);}}}return null;
 }
 const toLocal=(p:THREE.Vector3)=>p.clone().applyMatrix4(inverse),toWorld=(p:THREE.Vector3)=>cafe.localToWorld(p.clone());
 return {scale,nodes,localPath,clear,floors,toLocal,toWorld,serialize(){return {version:1,nodes:nodes.map(n=>[...n.p.toArray().map(v=>+v.toFixed(5)),...adjacent(n).map(v=>v.id)])};},
  path(from:THREE.Vector3,to:THREE.Vector3){return localPath(toLocal(from),toLocal(to))?.map(toWorld)??null;},
  snap(point:THREE.Vector3,max=1.1){const n=nearest(toLocal(point),max);return n?toWorld(n.p):null;},
  surface(point:THREE.Vector3){const p=toLocal(point),levels=floors(p.x,p.z);const y=levels.sort((a,b)=>Math.abs(a-p.y)-Math.abs(b-p.y))[0];if(y===undefined)return null;p.y=y;return toWorld(p);},
  dispose(){mat.dispose();collision.clear();},
 };
}
