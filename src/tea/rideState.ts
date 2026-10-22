import { riderBlocked } from '../world/traffic.ts';
import { TRAFFIC_ROUTES, trafficLoopLength, trafficPose } from '../../shared/townTraffic.ts';
import { touchesVehicle, bikeSamples } from '../../shared/trafficCollision.ts';
import { create } from 'zustand';
import { BIKE_STAND } from '../../shared/townActivities';
import { rt } from '../world/runtime';
import { useGame } from '../store';
export const useRide = create<{riding:boolean;color:string;shared:boolean;parked:{x:number;z:number;yaw:number}}>(()=>({riding:false,color:'#50dfd3',shared:true,parked:{...BIKE_STAND}}));
export function parkBike(){
 const s=useRide.getState();if(!s.riding)return;
 // Do not leave a shared bicycle in an active lane where later cars cross it.
 if(s.shared && TRAFFIC_ROUTES.some(route=>{
  for(let d=0;d<trafficLoopLength(route);d+=.5) {
   const pose={...trafficPose(route,d),scale:route.scale};
   if(bikeSamples(rt.me.x,rt.me.z,rt.me.yaw).some(p=>touchesVehicle(p.x,p.z,p.r+.3,pose))) return true;
  }
  return false;
 })) {
  useRide.setState({riding:false,parked:{...BIKE_STAND}});
  rt.path=null;rt.keys.clear();rt.joy={x:0,z:0};
  useGame.getState().toast({tone:'info',title:'单车已归还广场停车位'});return;
 }
 useRide.setState({riding:false,...(s.shared?{parked:{x:rt.me.x,z:rt.me.z,yaw:rt.me.yaw}}:{})});
 rt.path=null;rt.keys.clear();rt.joy={x:0,z:0};
}
export function mountBike(itemId?:string){
 if(riderBlocked(rt.me.x,rt.me.z,rt.me.yaw)) { useGame.getState().toast({tone:'info',title:'往空地挪一步，再按 E 上车'});return false; }
 if(itemId){const item=useGame.getState().snapshot?.shop.find(i=>i.id===itemId&&i.kind==='vehicle'&&i.owned);if(!item)return false;useRide.setState({riding:true,color:item.value,shared:false});}
 else {const p=useRide.getState().parked;if(Math.hypot(rt.me.x-p.x,rt.me.z-p.z)>BIKE_STAND.range)return false;useRide.setState({riding:true,color:'#50dfd3',shared:true});}
 rt.path=null;return true;
}
export function resetRide(){useRide.setState({riding:false,shared:true,color:'#50dfd3',parked:{...BIKE_STAND}});}
