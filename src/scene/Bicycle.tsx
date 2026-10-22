import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { std, glow } from './materials';
import { StaticBatch } from './StaticBatch.tsx';
import { rt } from '../world/runtime';
type P=[number,number,number];
export function Tube({a,b,color='#50dfd3',radius=.035}:{a:P;b:P;color?:string;radius?:number}){
 const {mid,q,len}=useMemo(()=>{const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),dir=bv.clone().sub(av);return{mid:av.add(bv).multiplyScalar(.5),q:new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir.clone().normalize()),len:dir.length()};},[...a,...b]);
 return <mesh position={mid} quaternion={q} material={std(color,.4,.45)}><cylinderGeometry args={[radius,radius,len,8]}/></mesh>;
}
/** +z is forward, matching the player rig. */
export function Bicycle({color='#50dfd3',riding=false}:{color?:string;riding?:boolean}){
 const wheels=useRef<THREE.Group>(null),pedals=useRef<THREE.Group>(null);
 useFrame((_,dt)=>{if(!wheels.current||!riding)return;for(const wheel of wheels.current.children)wheel.rotation.x+=rt.me.moving?dt*12:0;if(pedals.current)pedals.current.rotation.x+=rt.me.moving?dt*10:0;});
 return <group name="bicycle-model">
 <StaticBatch>
 {([[0,.4,-.76],[0,.4,.76]] as P[]).map((p,i)=><Tube key={i} a={p} b={i?[0,1.12,.49]:[0,1.0,-.27]} color={color}/>)}
 <Tube a={[0,.4,-.76]} b={[0,.45,0]} color={color}/><Tube a={[0,.45,0]} b={[0,1,-.27]} color={color}/>
 <Tube a={[0,1,-.27]} b={[0,1.12,.49]} color={color}/><Tube a={[0,.45,0]} b={[0,1.12,.49]} color={color}/>
 <Tube a={[0,1.12,.49]} b={[0,1.28,.56]}/><Tube a={[-.32,1.28,.56]} b={[.32,1.28,.56]} color="#c8dce0"/>
 <mesh position={[0,1.04,-.27]} material={std('#172231')}><boxGeometry args={[.32,.1,.42]}/></mesh>
 <mesh position={[0,1.23,.63]} material={glow('#fff5bc',2)}><sphereGeometry args={[.07,10,8]}/></mesh>
 <mesh position={[0,.8,-.83]} material={glow('#fa556f',1.5)}><boxGeometry args={[.13,.08,.06]}/></mesh>
 </StaticBatch>
 <group ref={pedals} position={[0,.45,0]}>{[-1,1].map(a=><group key={a}><Tube a={[a*.1,0,0]} b={[a*.1,0,a*.2]} color="#a6bcca" radius={.025}/><mesh position={[a*.2,0,a*.2]} material={std('#263544')}><boxGeometry args={[.22,.06,.12]}/></mesh></group>)}</group>
 <group ref={wheels}>{[-.76,.76].map(z=><group key={z} position={[0,.4,z]}>
 <mesh rotation-y={Math.PI/2} material={std('#111b29')}><torusGeometry args={[.35,.055,8,24]}/></mesh>
 <mesh rotation-y={Math.PI/2} material={glow(color,.65)}><torusGeometry args={[.29,.015,6,24]}/></mesh>
 {[0,Math.PI/3,2*Math.PI/3].map(a=><mesh key={a} rotation-x={a} material={std('#a6bcca')}><boxGeometry args={[.025,.65,.025]}/></mesh>)}</group>)}</group>
 </group>;
}
