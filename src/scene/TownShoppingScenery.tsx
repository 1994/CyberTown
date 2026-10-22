import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SHOPPING_STORES } from '../../shared/townActivities';
import { Bicycle } from './Bicycle';
import { useRide } from '../tea/rideState';
import { Label3D } from '../tea/Label3D';
import { StaticBatch } from './StaticBatch.tsx';
import { std, glow } from './materials';
import { Neon } from './TownDistricts';
import { rt } from '../world/runtime';
export function TownShoppingScenery(){
 const {riding,shared,parked}=useRide();const label=useRef<THREE.Group>(null);
 useFrame(()=>{if(label.current)label.current.visible=Math.hypot(rt.me.x-parked.x,rt.me.z-parked.z)<12;});
 return <>
 <group name="shopping-frontage"><StaticBatch>
 {SHOPPING_STORES.map((store,i)=>{
 const color=['#ff7ab8','#c297ff','#50dfd3'][i],face=i===2?-1:1;
 return <group key={store.category} position={[store.x,0,i===2?13.68:8.68]}>
 <mesh position={[0,1.3,0]} material={std('#163341',.3,.2)}><boxGeometry args={[3.4,2.2,.12]}/></mesh>
 {/* A storefront-sized sign and portal remain part of the building, not HUD text. */}
 <mesh position={[0,3.05,face*.12]} material={std('#101e30',.4,.4)}><boxGeometry args={[3.45,.88,.18]}/></mesh>
 <Neon text={['霓虹衣橱','面具工坊','夜骑车行'][i]} color={color} w={3.15} h={.65} position={[0,3.06,face*.23]} rotation={[0,i===2?Math.PI:0,0]}/>
 {[-1,1].map(side=><mesh key={side} position={[side*1.65,1.4,face*.15]} material={glow(color,1.7)}><boxGeometry args={[.075,2.55,.075]}/></mesh>)}
 <mesh position={[0,2.68,face*.15]} material={glow(color,1.7)}><boxGeometry args={[3.4,.08,.08]}/></mesh>
 <mesh position={[0,.055,face*.5]} material={glow(color,.7)}><boxGeometry args={[3.2,.025,.65]}/></mesh>
 <mesh position={[0,.15,-face*.15]} material={std('#293b49')}><boxGeometry args={[3.5,.2,.4]}/></mesh>
 </group>;
 })}
 {/* Garments in the actual shop window. */}
 {[-27.5,-26.1].map((x,i)=><group key={x} position={[x,1.25,8.82]}><mesh material={std(i?'#50d4c7':'#e88a66')}><boxGeometry args={[.55,.7,.18]}/></mesh>{[-1,1].map(a=><mesh key={a} position={[a*.35,.2,0]} rotation-z={a*.5} material={std(i?'#50d4c7':'#e88a66')}><boxGeometry args={[.3,.3,.18]}/></mesh>)}</group>)}
 {[-22.25,-20.95].map((x,i)=><group key={x} position={[x,1.5,8.82]}><mesh rotation-x={Math.PI/2} material={std(i?'#eee1c9':'#27314a')}><cylinderGeometry args={[.32,.32,.1,6]}/></mesh>{[-.12,.12].map(a=><mesh key={a} position={[a,.05,.08]} material={glow(i?'#ff688e':'#59ede7',1.7)}><boxGeometry args={[.14,.035,.02]}/></mesh>)}</group>)}
 {SHOPPING_STORES.map((store,i)=><group key={store.category} position={[store.x,.06,store.z]}>
 <mesh rotation-x={-Math.PI/2} material={glow(['#ff7ab8','#c297ff','#50dfd3'][i],.9)}><ringGeometry args={[.73,.81,32]}/></mesh>
 <mesh position={[0,.01,i===2?.25:-.25]} rotation-x={-Math.PI/2} rotation-z={i===2?Math.PI:0} material={glow('#fff0b0',1)}><circleGeometry args={[.24,3]}/></mesh>
 </group>)}
 </StaticBatch>
 <group position={[-15,.25,13.25]} rotation-y={Math.PI/2}><Bicycle color="#f2b94e"/></group>

 </group>
 {!(riding&&shared)&&<group name="shared-bicycle" position={[parked.x,0,parked.z]} rotation-y={parked.yaw}><Bicycle/><group ref={label}><Label3D text="骑行 · 免费" tone="on" position={[0,2.2,0]} height={.35}/></group></group>}
 </>;
}
