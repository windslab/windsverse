import test from 'node:test';
import assert from 'node:assert/strict';
import {minimumWideAltitude,FOREGROUND_DISTANCE,FOREGROUND_BOTTOM_ALTITUDE} from '../lib/sky-panorama';
import {clampMountAltitude,MIN_MOUNT_ALT} from '../lib/sky-optics';

test('wide can descend farther after zoom and its lower rim meets the image bottom',()=>{
 let previous=-Infinity;
 for(const fov of [15,25,45,65,87.5]){
  const minimum=minimumWideAltitude(fov);
  assert.ok(minimum>previous);previous=minimum;
  assert.ok(Math.abs(minimum-fov/2-FOREGROUND_BOTTOM_ALTITUDE)<1e-10);
  assert.equal(clampMountAltitude(-90,minimum),minimum);
 }
 assert.ok(minimumWideAltitude(15)<0);
 assert.equal(clampMountAltitude(-90),MIN_MOUNT_ALT);
});

test('bottom rim lands on the foreground image edge across parallax and full rotations',()=>{
 const d=Math.PI/180;
 for(const fov of [15,45,87.5])for(let az=0;az<=360;az+=15){
  for(const observer of [{x:0,y:0,z:0},{x:.55*Math.sin(az*d),y:.1,z:.55*(1-Math.cos(az*d))}]){
   const bottom=(minimumWideAltitude(fov,az,observer)-fov/2)*d;
   const ray={x:Math.sin(az*d)*Math.cos(bottom),y:Math.sin(bottom),z:-Math.cos(az*d)*Math.cos(bottom)};
   const dot=observer.x*ray.x+observer.y*ray.y+observer.z*ray.z;
   const lengthSq=observer.x**2+observer.y**2+observer.z**2;
   const t=-dot+Math.sqrt(dot*dot+FOREGROUND_DISTANCE**2-lengthSq);
   const hitY=observer.y+t*ray.y;
   const mapped=Math.asin(hitY/FOREGROUND_DISTANCE)/d;
   assert.ok(Math.abs(mapped-FOREGROUND_BOTTOM_ALTITUDE)<1e-9,`az=${az}, fov=${fov}`);
  }
 }
 assert.ok(Math.abs(minimumWideAltitude(87.5,0)-minimumWideAltitude(87.5,360))<1e-10);
});
