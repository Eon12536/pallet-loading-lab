import {useEffect} from 'react';
import FlowLab from '../relay/FlowLab';
import {clusterScenario} from './preset';
import '../pallet.css';
import './fleet-page.css';
const base=clusterScenario();
export default function FleetPage(){
 useEffect(()=>{const old=document.title;document.title='ALPS 군집 · 다중 로봇 전용 시뮬레이터';return()=>{document.title=old;};},[]);
 return <main className="pallet-lab cluster-fleet-page" data-view="relay"><header className="cluster-fleet-header"><a href="/?palletView=relay&clusterSkus=6#pallet">ALPS LAB ↗</a><span>군집 다중 로봇 · 전용 시뮬레이터</span><small>6 SKU / CENTRAL DISPATCH</small></header><FlowLab sourceScenario={base} active standalone/></main>;
}
