import * as THREE from 'three';

// One additive draw adds glare and optical ghosts without a second scene render.
export function createSolarEffects(){
 const geometry=new THREE.PlaneGeometry(2,2);
 const uniforms={sun:{value:new THREE.Vector2()},aspect:{value:1},radius:{value:.02},strength:{value:0},time:{value:0},motion:{value:1}};
 const material=new THREE.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,uniforms,
  vertexShader:'varying vec2 screen;void main(){screen=position.xy;gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader:`varying vec2 screen;uniform vec2 sun;uniform float aspect;uniform float radius;uniform float strength;uniform float time;uniform float motion;
   float ghost(vec2 p,vec2 center,float size){float r=length(p-center);return exp(-pow(r/size,2.)*2.)*.22+exp(-pow((r-size*.8)/(size*.09),2.))*.07;}
   void main(){
    vec2 p=screen*vec2(aspect,1.),s=sun*vec2(aspect,1.),offset=p-s;
    float angle=atan(offset.y,offset.x),r=length(offset),halo=max(.095,radius*7.);
    float shimmer=motion*sin(angle*9.+time*.65)*sin(r*53.-time*.9)*.018*exp(-r/max(halo*2.,.1));
    float rr=max(0.,r+shimmer*halo);
    float core=exp(-pow(rr/max(radius*2.8,.012),2.)*1.4);
    float glow=exp(-rr/halo)*.62;
    float rays=(pow(abs(cos(angle*3.)),36.)+pow(abs(sin(angle*5.+.2)),55.)*.4)*exp(-rr/(halo*2.5))*.20;
    vec3 color=vec3(1.,.96,.84)*(core*.95+glow+rays);
    color+=vec3(.76,.85,.65)*ghost(p,-s*.35,.12)*.20;
    color+=vec3(1.,.83,.57)*ghost(p,-s*.75,.055)*.27;
    color+=vec3(.65,.78,.87)*ghost(p,-s*1.15,.19)*.12;
    float veil=exp(-r/(halo*4.))*.04;
    color+=vec3(1.,.93,.78)*veil;
    float alpha=clamp(max(color.r,max(color.g,color.b))*strength,0.,.85);
    gl_FragColor=vec4(color*strength,alpha);
   }`});
 const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=40;mesh.visible=false;
 const projected=new THREE.Vector3();
 const update=(sunPosition:THREE.Vector3,camera:THREE.PerspectiveCamera,time:number,reduced:boolean,blocked:boolean,diameter:number)=>{
  camera.updateMatrixWorld();projected.copy(sunPosition).project(camera);
  const visible=!blocked&&projected.z>0&&projected.z<1&&Math.abs(projected.x)<1.35&&Math.abs(projected.y)<1.35;
  mesh.visible=visible;if(!visible)return;
  uniforms.sun.value.set(projected.x,projected.y);uniforms.aspect.value=camera.aspect;
  uniforms.radius.value=THREE.MathUtils.clamp(diameter/Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*.5,.006,.32);
  uniforms.strength.value=1-THREE.MathUtils.smoothstep(Math.hypot(projected.x,projected.y),1.,1.55);
  uniforms.time.value=reduced?0:time;uniforms.motion.value=reduced?0:1;
 };
 return {mesh,geometry,material,update};
}
