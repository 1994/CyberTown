import { create } from 'zustand';
import { BIKE_STAND } from '../../shared/townActivities';
import { rt } from '../world/runtime';
import { useGame } from '../store';
export const useRide = create<{riding:boolean;color:string;shared:boolean;parked:{x:number;z:number;yaw:number}}>(()=>({riding:false,color:'#50dfd3',shared:true,parked:{...BIKE_STAND}}));
export function parkBike(){
 const s=useRide.getState();if(!s.riding)return;
 useRide.setState({riding:false,...(s.shared?{parked:{x:rt.me.x,z:rt.me.z,yaw:rt.me.yaw}}:{})});
 rt.path=null;rt.keys.clear();rt.joy={x:0,z:0};
}
export function mountBike(itemId?:string){
 if(itemId){const item=useGame.getState().snapshot?.shop.find(i=>i.id===itemId&&i.kind==='vehicle'&&i.owned);if(!item)return false;useRide.setState({riding:true,color:item.value,shared:false});}
 else {const p=useRide.getState().parked;if(Math.hypot(rt.me.x-p.x,rt.me.z-p.z)>BIKE_STAND.range)return false;useRide.setState({riding:true,color:'#50dfd3',shared:true});}
 rt.path=null;return true;
}
export function resetRide(){useRide.setState({riding:false,shared:true,color:'#50dfd3',parked:{...BIKE_STAND}});}
