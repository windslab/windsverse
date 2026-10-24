import * as THREE from 'three';
import {createLunaAnimation} from './luna/animation';

/** Coordinates are authored in the cafe GLB's space, before overview fitting. */
export function placeCafeLuna(model:THREE.Group,cafe:THREE.Object3D){
 const root=new THREE.Group();root.name='Luna_Cafe_Avatar';
 const cafeScale=cafe.getWorldScale(new THREE.Vector3()).x;
 const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
 const scale=1.32*cafeScale/Math.max(size.y,.01);
 model.scale.setScalar(scale);
 // Keep the shoes on the floor, even if a later model has a different origin.
 model.position.set(-(bounds.min.x+bounds.max.x)*.5*scale,-bounds.min.y*scale,-(bounds.min.z+bounds.max.z)*.5*scale);
 root.add(model);root.position.copy(cafe.localToWorld(new THREE.Vector3(-1.1,.17,.4)));
 const ground=cafe.getObjectByName('floor lantai 1')||cafe.getObjectByName('floor_lantai_1');
 if(ground){
  const ray=new THREE.Raycaster(root.position.clone().add(new THREE.Vector3(0,2*cafeScale,0)),new THREE.Vector3(0,-1,0));
  const hit=ray.intersectObject(ground,true)[0];if(hit)root.position.y=hit.point.y+.006*cafeScale;
 }
 root.rotation.y=-2.75;
 model.traverse(node=>{const mesh=node as THREE.Mesh;if(mesh.isMesh){mesh.castShadow=false;mesh.receiveShadow=true;}});
 // A small contact shadow avoids regenerating the cafe's cached shadow map per frame.
 const shadow=new THREE.Mesh(new THREE.CircleGeometry(.23*cafeScale,24),new THREE.MeshBasicMaterial({color:'#48392d',transparent:true,opacity:.14,depthWrite:false}));
 shadow.name='Luna_Contact_Shadow';shadow.rotation.x=-Math.PI/2;shadow.position.y=.002;root.add(shadow);
 const animation=createLunaAnimation(model);
 const target=root.position.clone().add(new THREE.Vector3(0,.73*cafeScale,0));
 const camera=target.clone().add(new THREE.Vector3(-.85,.85,-2.1).multiplyScalar(cafeScale));
 let age=0,nextGreeting=2;
 return {root,target,camera,
  greet(){animation.greet();nextGreeting=age+26;},
  update(delta:number,reduced:boolean,allowGreeting:boolean){
   age+=delta;
   if(!reduced&&allowGreeting&&age>=nextGreeting){animation.greet();nextGreeting=age+26;}
   animation.update(delta,true,reduced);
  },
 };
}

export function disposeLuna(root:THREE.Object3D){
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
 root.traverse(node=>{const mesh=node as THREE.Mesh;if(!mesh.isMesh)return;geometries.add(mesh.geometry);for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){materials.add(material);for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);}});
 textures.forEach(texture=>texture.dispose());materials.forEach(material=>material.dispose());geometries.forEach(geometry=>geometry.dispose());
}
