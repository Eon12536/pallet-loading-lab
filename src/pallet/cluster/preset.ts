import {ONLINE_SEARCH} from '../types';
import type {Scenario,BoxType,SearchSettings} from '../types';
export const CLUSTER_GUIDE_SIGNATURE='8bab669522ba33fdce1f082fe36fc5b8ff2f7f4b4e4dc100bba05912e2928feb';
export const CLUSTER_SETTINGS:SearchSettings={...ONLINE_SEARCH,temporaryBuffer:false,plannerSeed:91473,maxCandidates:48,topK:4,samples:2,depth:2,reserveProbes:4,virtualCandidates:8,portfolio:false,inventoryMode:'none'};
const specs=[['생수',400,300,280,12,85],['과자',500,340,250,3,24],['세제',320,240,320,8,55],['생활용품',400,300,220,4,40],['헤어케어',300,250,240,6,45],['스킨케어',250,200,200,4,30],['음료',380,260,230,7,50],['주방용품',450,300,210,5,40]] as const;
export function clusterScenario(skus:6|8=6,order=0,robots=4):Scenario{
 if(![6,8].includes(skus)||!Number.isInteger(order)||order<0||order>99||!Number.isInteger(robots)||robots<1||robots>8)throw Error('군집 조건은 6/8 SKU, 순서 0–99, 로봇 1–8대입니다.');
 const types:BoxType[]=specs.slice(0,skus).map(([name,w,d,h,weight,maxLoadKg],i)=>({id:`S${i+1}`,name,size:{w,d,h},weight,maxLoadKg,maxLoadSource:'synthetic',quantity:skus===6?5:i<6?4:3,orientations:[0,90],handling:'upright',material:'paper',friction:.45,color:['#80b4c4','#c0a67a','#9ba5c7','#82b9a2'][Math.floor(i/2)]}));
 return {version:1,units:{length:'mm',weight:'kg',time:'s'},id:`alps-cluster-h1200-n30-s${skus}`,name:`ALPS 군집 고정 · 30개 / ${skus} SKU`,clusterPreset:{version:1,skus,order,searchMs:9000,cycleMs:10000,plannerSeed:91473},
  pallet:{clusterLayout:true,width:1200,depth:1000,maxHeight:1200,palletsPerRobot:1,conveyorMode:robots===1?'straight':'branched',conveyorExtensionMm:1500,robotLayout:{count:robots,architecture:'floor',floorCount:robots}},types,
  constraints:{robotMode:'gripper',supportRatio:.85,contactTolerance:.5,horizontalGap:0,heavyRule:'off',stability:{maxSlenderness:2,minMarginRatio:.05,lateralAccelerationG:0,loadSafetyFactor:1.2,slendernessMode:'score'},gripper:{width:180,depth:160,height:160,mass:8,payload:38,margin:5,lift:180,speed:650,pickSeconds:.7,placeSeconds:.45,rotationSpeed:90},workspace:{xMin:-1400,xMax:1800,yMin:-600,yMax:1600,zMax:2600},reach:{baseX:-700,baseY:500,minRadius:0,maxRadius:2700},standingHeight:{enabled:false,maxRiseMm:100}},
  arrival:{seed:(skus===6?460000000:460100000)+order,pattern:'random-draw'},events:[],supplyMode:'arrival',intake:{damageRate:0,thresholdMm:8}};
}
