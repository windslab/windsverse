import * as THREE from 'three';
/** Open a staff aisle in the exported solid counter, preserving exterior glazing and roof. */
export function prepareCafeBarWorkspace(cafe:THREE.Object3D){
 if(cafe.getObjectByName('floor_bar_staff_aisle'))return;
 cafe.updateWorldMatrix(true,true);const inverse=cafe.matrixWorld.clone().invert(),cut=new THREE.Box3(new THREE.Vector3(-4.25,.605,3.65),new THREE.Vector3(-1.55,1.99,4.22));
 const planes=[new THREE.Plane(new THREE.Vector3(-1,0,0),cut.min.x),new THREE.Plane(new THREE.Vector3(1,0,0),-cut.max.x),new THREE.Plane(new THREE.Vector3(0,-1,0),cut.min.y),new THREE.Plane(new THREE.Vector3(0,1,0),-cut.max.y),new THREE.Plane(new THREE.Vector3(0,0,-1),cut.min.z),new THREE.Plane(new THREE.Vector3(0,0,1),-cut.max.z)];
 cafe.traverse(node=>{if(!(node instanceof THREE.Mesh)||/floor|lantai|tangga/.test(node.name))return;const matrix=new THREE.Matrix4().multiplyMatrices(inverse,node.matrixWorld),bounds=new THREE.Box3().setFromBufferAttribute(node.geometry.getAttribute('position') as THREE.BufferAttribute).applyMatrix4(matrix);if(!bounds.intersectsBox(cut))return;
  const geometry=node.geometry,index=geometry.index,attributes=(Object.entries(geometry.attributes) as [string,THREE.BufferAttribute][]).filter(([,a])=>!('isInterleavedBufferAttribute' in a)),position=geometry.getAttribute('position'),output=Object.fromEntries(attributes.map(([name])=>[name,[] as number[]]));
  type Vertex={p:THREE.Vector3;values:Record<string,number[]>};
  const vertex=(i:number):Vertex=>({p:new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(matrix),values:Object.fromEntries(attributes.map(([name,a])=>[name,Array.from({length:a.itemSize},(_,k)=>a.array[i*a.itemSize+k])]))});
  const interpolate=(a:Vertex,b:Vertex,t:number):Vertex=>({p:a.p.clone().lerp(b.p,t),values:Object.fromEntries(attributes.map(([name])=>[name,a.values[name].map((v,k)=>v+(b.values[name][k]-v)*t)]))});
  const split=(polygon:Vertex[],plane:THREE.Plane)=>{const inside:Vertex[]=[],outside:Vertex[]=[];for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],da=plane.distanceToPoint(a.p),db=plane.distanceToPoint(b.p);(da<=0?inside:outside).push(a);if((da<0&&db>0)||(da>0&&db<0)){const v=interpolate(a,b,da/(da-db));inside.push(v);outside.push(v);}}return {inside,outside};};
  const emit=(polygon:Vertex[])=>{for(let i=1;i<polygon.length-1;i++)for(const v of [polygon[0],polygon[i],polygon[i+1]])for(const [name]of attributes)output[name].push(...v.values[name]);};
  for(let i=0;i<(index?.count??position.count);i+=3){let remainder=[vertex(index?index.getX(i):i),vertex(index?index.getX(i+1):i+1),vertex(index?index.getX(i+2):i+2)];for(const plane of planes){if(!remainder.length)break;const parts=split(remainder,plane);emit(parts.outside);remainder=parts.inside;}}
  const replacement=new THREE.BufferGeometry();for(const [name,a]of attributes)replacement.setAttribute(name,new THREE.Float32BufferAttribute(output[name],a.itemSize));replacement.computeBoundingBox();replacement.computeBoundingSphere();node.geometry=replacement;
 });
 const floor=new THREE.Mesh(new THREE.BoxGeometry(2.70,.03,.57),new THREE.MeshStandardMaterial({color:'#b7b1a5',roughness:.95}));floor.name='floor_bar_staff_aisle';floor.position.set(-2.90,.590,3.935);cafe.add(floor);cafe.updateWorldMatrix(true,true);
}
