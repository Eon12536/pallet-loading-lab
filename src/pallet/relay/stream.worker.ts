import {planClusterStream} from '../cluster/dispatch';
/// <reference lib="webworker" />
import {planStream} from './streamPlanner';
self.onmessage=e=>{try{const {scenario,world,busy,central=true}=e.data;if(scenario.clusterPreset)self.postMessage({decision:planClusterStream(scenario,world,busy,d=>self.postMessage({incumbent:d}))});else self.postMessage({decision:planStream(scenario,world,busy,central)});}catch(error){self.postMessage({error:String(error)});}};

self.postMessage({ready:true});
