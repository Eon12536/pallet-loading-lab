import {useEffect,useRef,useState} from 'react';
import {createStream,advanceStream,applyDecision} from './streamEngine';
import {observedProblem} from './streamPlanner';
import {frameClock} from './frameClock';
import type {Scenario} from '../types';
import type {RelayMotion} from './types';
import type {FlowDecision} from './streamPlanner';
export function useStream(scenario:Scenario,active:boolean){
 const [version,setVersion]=useState(0),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(4),[error,setError]=useState('');
 const [snapshot,setSnapshot]=useState(()=>({world:createStream(scenario),motions:[] as RelayMotion[],peak:0,ms:0,checks:0,busy:false}));
 const live=useRef(snapshot),control=useRef({playing,active,speed});control.current={playing,active,speed};
 useEffect(()=>{
  const initial={world:createStream(scenario),motions:[] as RelayMotion[],peak:0,ms:0,checks:0,busy:false};live.current=initial;setSnapshot(initial);setError('');
  const worker=new Worker(new URL('./stream.worker.ts',import.meta.url),{type:'module'});let disposed=false,raf=0,last=performance.now(),lastPublish=0,lastPlan=-Infinity;
  const fail=(e:unknown)=>{setError(String(e));setPlaying(false);live.current.busy=false;};
  worker.onerror=e=>{if(!disposed)fail(e.message);};
  worker.onmessage=e=>{if(disposed)return;live.current.busy=false;if(e.data.error){fail(e.data.error);return;}
   const d=e.data.decision as FlowDecision;if(d.runId!==live.current.world.runId||!control.current.playing||!control.current.active)return;
   try{const next=applyDecision(scenario,live.current.world,live.current.motions,d);live.current={...live.current,...next,ms:d.checks?d.milliseconds:live.current.ms,checks:live.current.checks+d.checks,peak:Math.max(live.current.peak,next.motions.length)};}catch(error){fail(error);}
  };
  const tick=(now:number)=>{
   if(disposed)return;
   const frame=frameClock(now,last),dt=frame.delta;last=frame.last;const ctl=control.current;
   if(ctl.playing&&ctl.active&&!live.current.world.stream!.complete){
    try{const next=advanceStream(scenario,live.current.world,live.current.motions,live.current.world.time+dt*ctl.speed);live.current={...live.current,...next};
     if(!live.current.busy&&live.current.world.time-lastPlan>.65){lastPlan=live.current.world.time;live.current.busy=true;worker.postMessage({...observedProblem(scenario,live.current.world),busy:live.current.motions.map(m=>m.action.robot)});}
    }catch(error){fail(error);}
   }
   if(now-lastPublish>65){lastPublish=now;setSnapshot({...live.current});}raf=requestAnimationFrame(tick);
  };raf=requestAnimationFrame(tick);
  return()=>{disposed=true;cancelAnimationFrame(raf);worker.terminate();};
 },[scenario,version]);
 const reset=(autoplay=false)=>{control.current.playing=autoplay;setPlaying(autoplay);setVersion(v=>v+1);};
 return {...snapshot,playing,speed,error,setPlaying,setSpeed,reset};
}
