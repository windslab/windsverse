import * as THREE from 'three';
export type CafePathData={version:number;modelSha?:string;nodes:number[][]};
/** Runtime only searches the prebuilt graph; no navmesh baking on visitors' devices. */
export function cafePaths(cafe:THREE.Object3D,data:CafePathData){
 cafe.updateWorldMatrix(true,true);const inverse=cafe.matrixWorld.clone().invert(),scale=cafe.getWorldScale(new THREE.Vector3()).x;
 const nodes=data.nodes.map((row,id)=>({id,p:new THREE.Vector3(row[0],row[1],row[2]),edges:row.slice(3)}));
 const local=(p:THREE.Vector3)=>p.clone().applyMatrix4(inverse),world=(p:THREE.Vector3)=>cafe.localToWorld(p.clone());
 function nearest(p:THREE.Vector3,max=1){let best:typeof nodes[number]|undefined,d=max;for(const node of nodes){const distance=Math.hypot(node.p.x-p.x,node.p.z-p.z)+Math.abs(node.p.y-p.y)*3;if(distance<d){d=distance;best=node;}}return best;}
 function path(from:THREE.Vector3,to:THREE.Vector3,role:'staff'|'visitor'='staff',avoid:THREE.Vector3[]=[]){const start=nearest(local(from)),end=nearest(local(to),.9);if(!start||!end)return null;const blocked=avoid.map(local);const open=[start.id],score=new Map([[start.id,0]]),previous=new Map<number,number>(),closed=new Set<number>();
  while(open.length){let best=0,bestScore=Infinity;open.forEach((id,i)=>{const value=score.get(id)!+nodes[id].p.distanceTo(end.p);if(value<bestScore){best=i;bestScore=value;}});const id=open.splice(best,1)[0];if(id===end.id){const result=[end.p.clone()];let cursor=id;while(previous.has(cursor)){cursor=previous.get(cursor)!;result.push(nodes[cursor].p.clone());}result.reverse();if(result.length>1&&result[0].distanceTo(local(from))<.20)result.shift();return result.filter((p,i)=>!i||i===result.length-1||result[i-1].clone().sub(p).normalize().dot(p.clone().sub(result[i+1]).normalize())<.999).map(world);}
   if(closed.has(id))continue;closed.add(id);for(const next of nodes[id].edges){const p=nodes[next].p;if(blocked.some(b=>Math.abs(b.y-p.y)<.65&&Math.hypot(b.x-p.x,b.z-p.z)<.32))continue;if(role==='visitor'&&p.y<1.5&&p.x> -4.53&&p.x< -2.14&&p.z>2.94&&p.z<4.96)continue;if(closed.has(next))continue;const value=score.get(id)!+nodes[id].p.distanceTo(nodes[next].p);if(value<(score.get(next)??Infinity)){score.set(next,value);previous.set(next,id);open.push(next);}}
  }return null;
 }
 const walk:THREE.Mesh[]=[];cafe.traverse(n=>{if(!(n instanceof THREE.Mesh))return;let node:THREE.Object3D|null=n;while(node&&node!==cafe){if(/floor|lantai|tangga|trotoar/.test(node.name)||node.name==='Cube007'||node.name==='Cube008'){walk.push(n);break;}node=node.parent;}});
 const ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,-1,0));
 function ground(p:THREE.Vector3){ray.ray.origin.copy(p).add(new THREE.Vector3(0,.46*scale,0));ray.far=1.0*scale;const hits=ray.intersectObjects(walk,false);const hit=hits.filter(h=>h.face&&h.face.normal.clone().transformDirection(h.object.matrixWorld).y>.65).sort((a,b)=>Math.abs(a.point.y-p.y)-Math.abs(b.point.y-p.y))[0];return hit?.point.y??p.y;}
 return {scale,path,local,world,ground,nodes,snap(p:THREE.Vector3,max=1){const n=nearest(local(p),max);return n?world(n.p):null;}};
}
export type CafePaths=ReturnType<typeof cafePaths>;
