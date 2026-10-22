import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SHOPPING } from '../../shared/townActivities';
import { Bicycle } from './Bicycle';
import { useRide } from '../tea/rideState';
import { Label3D } from '../tea/Label3D';
import { StaticBatch } from './StaticBatch.tsx';
import { std, glow } from './materials';
import { rt } from '../world/runtime';
export function TownShoppingScenery(){
 const {riding,shared,parked}=useRide();const label=useRef<THREE.Group>(null);
 useFrame(()=>{if(label.current)label.current.visible=Math.hypot(rt.me.x-parked.x,rt.me.z-parked.z)<12;});
 return <>
 <group name="shopping-frontage"><StaticBatch>
 {[-26.8,-21.6,-15].map((x,i)=><group key={x} position={[x,0,i===2?13.68:8.68]}>
 <mesh position={[0,1.3,0]} material={std('#163341',.3,.2)}><boxGeometry args={[3.4,2.2,.12]}/></mesh>
 <mesh position={[0,2.5,-.07]} material={glow(['#ff7ab8','#c297ff','#50dfd3'][i],1.5)}><boxGeometry args={[3.6,.07,.2]}/></mesh>
 <mesh position={[0,.15,-.35]} material={std('#293b49')}><boxGeometry args={[3.5,.2,.7]}/></mesh>
 </group>)}
 {/* Garments in the actual shop window. */}
 {[-27.5,-26.1].map((x,i)=><group key={x} position={[x,1.25,8.82]}><mesh material={std(i?'#50d4c7':'#e88a66')}><boxGeometry args={[.55,.7,.18]}/></mesh>{[-1,1].map(a=><mesh key={a} position={[a*.35,.2,0]} rotation-z={a*.5} material={std(i?'#50d4c7':'#e88a66')}><boxGeometry args={[.3,.3,.18]}/></mesh>)}</group>)}
 {[-22.25,-20.95].map((x,i)=><group key={x} position={[x,1.5,8.82]}><mesh rotation-x={Math.PI/2} material={std(i?'#eee1c9':'#27314a')}><cylinderGeometry args={[.32,.32,.1,6]}/></mesh>{[-.12,.12].map(a=><mesh key={a} position={[a,.05,.08]} material={glow(i?'#ff688e':'#59ede7',1.7)}><boxGeometry args={[.14,.035,.02]}/></mesh>)}</group>)}
 <mesh position={[SHOPPING.x,.06,SHOPPING.z]} rotation-x={-Math.PI/2} material={glow('#ff7ab8',.8)}><ringGeometry args={[.6,.67,32]}/></mesh>
 </StaticBatch>
 <group position={[-15,.25,13.25]} rotation-y={Math.PI/2}><Bicycle color="#f2b94e"/></group>
 <Label3D text="购物" tone="hot" position={[SHOPPING.x,3.35,8.9]} height={.46}/>
 </group>
 {!(riding&&shared)&&<group name="shared-bicycle" position={[parked.x,0,parked.z]} rotation-y={parked.yaw}><Bicycle/><group ref={label}><Label3D text="骑行 · 免费" tone="on" position={[0,2.2,0]} height={.35}/></group></group>}
 </>;
}
