import {runThreeTrial} from './threeStudy';
import type {BenchmarkConfig,TrialSpec} from './model';
self.onmessage=async(event:MessageEvent<{id:string;config:BenchmarkConfig;spec:TrialSpec}>)=>{
 const {id,config,spec}=event.data;
 try{const row=await runThreeTrial(config,spec,{beforeDecision:step=>self.postMessage({id,type:'decision-start',step}),afterDecision:step=>self.postMessage({id,type:'decision-end',step})});self.postMessage({id,type:'result',row});}
 catch(e){self.postMessage({id,type:'error',message:e instanceof Error?e.message:String(e)});}
};
