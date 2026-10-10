import * as THREE from 'three';
import {HUB,hubRoute} from './hubConveyor';
import {CONVEYOR} from './conveyor';
import {robotCount} from './fleet';
import {TWIN_CONVEYOR,TWIN_ROBOT_PALETTE} from './twinSceneTheme';
import type {Pallet,Vec3} from '../types';
export function createHubConveyorView(p:Pallet){
 const group=new THREE.Group();group.name='perpendicular-main-parallel-fanout';
 const steel=new THREE.MeshStandardMaterial({color:TWIN_ROBOT_PALETTE.steel,metalness:.65,roughness:.35}),dark=new THREE.MeshStandardMaterial({color:TWIN_ROBOT_PALETTE.dark,roughness:.8}),red=new THREE.MeshStandardMaterial({color:TWIN_CONVEYOR.main}),blue=new THREE.MeshStandardMaterial({color:TWIN_CONVEYOR.sub});
 const deck=CONVEYOR.deck/1000;
 const cube=(parent:THREE.Group,size:[number,number,number],at:[number,number,number],mat:THREE.Material)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(...size),mat);m.position.set(...at);m.castShadow=m.receiveShadow=true;parent.add(m);return m;};
 function lane(a:Vec3,b:Vec3,mat:THREE.Material,name:string){const length=Math.hypot(b.x-a.x,b.y-a.y)/1000,r=new THREE.Group();r.name=name;r.position.set((a.x+b.x)/2000,0,(a.y+b.y)/2000);r.rotation.y=-Math.atan2(b.y-a.y,b.x-a.x);group.add(r);
  cube(r,[length,.14,.9],[0,deck-.07,0],dark);for(const sign of [-1,1])cube(r,[length,.15,.05],[0,deck-.02,sign*.46],mat);
  for(let x=-length/2+.12;x<length/2;x+=.23)cube(r,[.013,.005,.85],[x,deck+.003,0],steel);
  for(let x=-length/2+.3;x<length/2;x+=1.4)for(const sign of [-1,1])cube(r,[.065,deck+.4,.065],[x,(deck-.4)/2,sign*.35],steel);
 }
 const hub={x:0,y:HUB.y,z:450};lane({x:0,y:HUB.inletY,z:450},hub,red,'main-red-rear-feed');
 for(let i=0;i<robotCount(p);i++){const route=hubRoute(p,i);lane(route[0],route[1],blue,`parallel-sub-${i+1}`);lane(route[1],{...route[2],y:route[2].y+450},blue,`pickup-sub-${i+1}`);cube(group,[.95,.035,.08],[route[2].x/1000,deck+.05,(route[2].y+450)/1000],blue);}
 cube(group,[1.4,.16,1.4],[0,deck-.08,HUB.y/1000],red);
 const scanY=(HUB.inletY+650)/1000,scan=new THREE.Group();scan.name='inlet-u-scanner';group.add(scan);
 for(const sign of [-1,1])cube(scan,[.13,1.15,.22],[sign*.58,deck+.575,scanY],dark);cube(scan,[1.3,.15,.23],[0,deck+1.15,scanY],steel);
 const signal=new THREE.MeshStandardMaterial({color:TWIN_CONVEYOR.scan,emissive:TWIN_CONVEYOR.scan,emissiveIntensity:.2});cube(scan,[.48,.06,.12],[0,deck+1.04,scanY],signal);
 const laser=new THREE.Mesh(new THREE.PlaneGeometry(1.03,1.02),new THREE.MeshBasicMaterial({color:TWIN_CONVEYOR.scan,transparent:true,opacity:.08,side:THREE.DoubleSide,depthWrite:false}));laser.position.set(0,deck+.52,scanY);scan.add(laser);
 const pushY=(HUB.inletY+1500)/1000,push=new THREE.Group();push.name='pre-hub-side-pusher';group.add(push);cube(push,[.6,.18,.42],[.8,deck+.16,pushY],steel);const paddle=cube(push,[.07,.26,.82],[.43,deck+.15,pushY],red);
 lane({x:-500,y:HUB.inletY+1500,z:450},{x:-1400,y:HUB.inletY+1500,z:450},red,'reject-side-chute');
 return {group,update:(_time:number,scanning=false,rejected=false,progress=0)=>{signal.color.set(rejected?TWIN_ROBOT_PALETTE.warning:TWIN_CONVEYOR.scan);signal.emissive.copy(signal.color);signal.emissiveIntensity=scanning?.7:.2;laser.material.opacity=scanning?.2:.06;const t=Math.max(0,Math.min(1,progress));paddle.position.x=.43-1.05*(t<.8?t/.8:(1-t)/.2);},dispose:()=>{}};
}
