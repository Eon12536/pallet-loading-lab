// Existing relay/adaptive/bookmarked views remain addressable.
export function dashboardPalletsPerRobot(single:boolean):1|2{return single?1:2;}
export function initialDashboardView(search:string){const q=new URLSearchParams(search),v=q.get('palletView');if(v&&['single','relay','simulate','adaptive','packaging','compare','benchmark','alps','data','guide'].includes(v))return v;if(q.get('palletDemo')==='relay')return 'relay';if(q.get('palletDemo')==='strategies')return 'simulate';return 'single';}
