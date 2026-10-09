import * as THREE from 'three';
import type { Pallet } from '../types';
import { CONVEYOR,beltBounds,beltStation } from './conveyor';
import {TWIN_ROBOT_PALETTE} from './twinSceneTheme';
import {robotCount} from './fleet';

export function createConveyorView(p:Pallet) {
  const group=new THREE.Group();group.name='single-shared-conveyor';
  const b=beltBounds(p),left=b.left/1000,right=b.right/1000,front=CONVEYOR.front/1000,back=CONVEYOR.back/1000;
  const width=CONVEYOR.width/1000,z=CONVEYOR.deck/1000,geometry=new THREE.BoxGeometry(1,1,1);
  const steel=new THREE.MeshStandardMaterial({color:'#969b99',metalness:.65,roughness:.35});
  const dark=new THREE.MeshStandardMaterial({color:'#252c2b',roughness:.83});
  const markings=new THREE.MeshStandardMaterial({color:'#d8d2b5',roughness:.7});
  const parts:{w:number;h:number;d:number;x:number;y:number;z:number}[]=[];
  const block=(w:number,h:number,d:number,x:number,y:number,z:number)=>parts.push({w,h,d,x,y,z});
  const decks=new THREE.Group();group.add(decks);
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=32;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='#303734';ctx.fillRect(0,0,128,32);ctx.fillStyle='#4c5550';ctx.fillRect(0,0,3,32);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  const animated:THREE.Texture[]=[];
  function run(x:number,y:number,length:number,vertical=false,reverse=false){
    const t=texture.clone();t.repeat.set(length/.22,1);animated.push(t);
    const deck=new THREE.Mesh(new THREE.BoxGeometry(length,.13,width),[dark,dark,new THREE.MeshStandardMaterial({map:t,roughness:.8}),dark,dark,dark]);
    deck.position.set(x,z-.065,y);deck.rotation.y=vertical?Math.PI/2:0;deck.userData.reverse=reverse;deck.receiveShadow=true;decks.add(deck);
    for(const edge of [-1,1])block(vertical?width*.025:length,.095,vertical?length:width*.025,x+(vertical?edge*width/2:0),z-.035,y+(vertical?0:edge*width/2));
    for(let d=-length/2+.25;d<length/2;d+=1.4)for(const side of [-1,1]){
      block(.075,z+.34,.075,x+(vertical?side*.32:d),(z-.41)/2-.03,y+(vertical?d:side*.32));
      block(.16,.04,.16,x+(vertical?side*.32:d),-.39,y+(vertical?d:side*.32));
    }
  }
  run((left+right)/2,front,right-left);if(p.conveyorMode!=='straight'){run((left+right)/2,back,right-left,false,true);
  run(left,(front+back)/2,front-back+width,true);run(right,(front+back)/2,front-back+width,true,true);}
  const frame=new THREE.InstancedMesh(geometry,steel,parts.length),dummy=new THREE.Object3D();
  parts.forEach((v,i)=>{dummy.position.set(v.x,v.y,v.z);dummy.scale.set(v.w,v.h,v.d);dummy.updateMatrix();frame.setMatrixAt(i,dummy.matrix);});frame.castShadow=true;group.add(frame);
  for(let i=0;i<robotCount(p);i++){
    const point=beltStation(i,p);
    for(const edge of [-1,1]){const marker=new THREE.Mesh(new THREE.BoxGeometry(.8,.012,.045),markings);marker.position.set(point.x/1000,z+.008,front+edge*(width/2-.055));group.add(marker);}
  }
  // Three-sided profile scanner; no crossbar obstructs the belt surface.
  const portal=new THREE.Group();portal.name='intake-u-scanner';group.add(portal);
  for(const side of [-1,1]){const upright=new THREE.Mesh(new THREE.BoxGeometry(.24,1.12,.13),dark);upright.position.set(left+.65,z+.56,front+side*.57);portal.add(upright);}
  const bridge=new THREE.Mesh(new THREE.BoxGeometry(.24,.16,1.27),steel);bridge.position.set(left+.65,z+1.12,front);portal.add(bridge);
  const signal=new THREE.MeshStandardMaterial({color:'#548a87',emissive:'#548a87',emissiveIntensity:.25});
  for(const side of [-1,1]){const head=new THREE.Mesh(new THREE.BoxGeometry(.12,.28,.055),signal);head.position.set(left+.65,z+.44,front+side*.49);portal.add(head);}
  const topHead=new THREE.Mesh(new THREE.BoxGeometry(.13,.07,.48),signal);topHead.position.set(left+.65,z+1.01,front);portal.add(topHead);
  const laser=new THREE.Mesh(new THREE.PlaneGeometry(1.05,1.02),new THREE.MeshBasicMaterial({color:'#548a87',transparent:true,opacity:.12,side:THREE.DoubleSide,depthWrite:false}));
  laser.rotation.y=Math.PI/2;laser.position.set(left+.65,z+.51,front);portal.add(laser);
  return {group,update:(time:number,active=false,rejected=false)=>{
   animated.forEach((t,i)=>{t.offset.x=(i===1||i===3?1:-1)*time*CONVEYOR.speed/220;});
   const color=rejected?TWIN_ROBOT_PALETTE.warning:'#548a87';signal.color.set(color);signal.emissive.set(color);signal.emissiveIntensity=active?.7:.2;
   laser.material.color.set(color);laser.material.opacity=active?.2:.06;
  },dispose:()=>texture.dispose()};
}
