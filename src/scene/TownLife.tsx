import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TOWN_CRATES, TOWN_VEHICLES, TOWN_WALKERS } from '../../shared/townLife.ts';
import type { Look } from '../../shared/types.ts';
import { Character, type Rig } from './Character.tsx';
import { StaticBatch } from './StaticBatch.tsx';
import { std, glow } from './materials.ts';

function Vehicle({x,z,color,van}: typeof TOWN_VEHICLES[number]) {
  return <group position={[x,0,z]}>
    <mesh position={[0,.47,0]} material={std('#253544')} castShadow><boxGeometry args={[1.9,.4,3.8]}/></mesh>
    <mesh position={[0,.95,.8]} material={std(color)} castShadow><boxGeometry args={[1.85,.95,1.7]}/></mesh>
    <mesh position={[0,1.2,1.67]} material={std('#9bd6df',.2,.3)}><boxGeometry args={[1.5,.52,.035]}/></mesh>
    <mesh position={[0,van?1.22:1,-.95]} material={std(van?'#c9d3d0':color)} castShadow><boxGeometry args={[1.9,van?1.65:.95,2]}/></mesh>
    {van&&<><mesh position={[.96,1.2,-.9]} material={std(color)}><boxGeometry args={[.025,.35,1.6]}/></mesh><mesh position={[-.96,1.2,-.9]} material={std(color)}><boxGeometry args={[.025,.35,1.6]}/></mesh></>}
    {[-1,1].flatMap(a=>[-1.2,1.2].map(b=><mesh key={`${a}:${b}`} position={[a*.94,.43,b]} rotation-z={Math.PI/2} material={std('#222935')}><cylinderGeometry args={[.38,.38,.22,10]}/></mesh>))}
    {[-.65,.65].map(a=><group key={a}><mesh position={[a,.83,1.68]} material={glow('#fff1b5',1.5)}><boxGeometry args={[.34,.18,.07]}/></mesh><mesh position={[a,.68,-1.99]} material={glow('#fa8265',1.1)}><boxGeometry args={[.25,.16,.05]}/></mesh></group>)}
    <mesh position={[0,.58,1.73]} material={std('#cbd7ce')}><boxGeometry args={[1.8,.12,.14]}/></mesh>
  </group>;
}
const shirts=['#dbab6e','#79cbb9','#ba91d0','#769ed1','#d68190','#8fb56e','#d1c4a3','#81c6d8'];
function Resident({index}:{index:number}) {
  const root=useRef<THREE.Group>(null),rig=useRef<Rig>(null);
  const route=TOWN_WALKERS[index];
  const reduced=useMemo(()=>matchMedia('(prefers-reduced-motion: reduce)').matches,[]);
  const look:Look={skin:index%2?'#d7a27e':'#f0c7a5',hair:'#323345',hairStyle:index%3===0?'cap':index%3===1?'bob':'short',shirt:shirts[index%shirts.length],pants:'#354456',accessory:index%4===0?'glasses':'none'};
  useFrame(({clock,camera})=>{
    if(!root.current)return;
    const phase=(clock.elapsedTime*.65+index*4.7)%(2*(route.b-route.a));
    const forward=phase<route.b-route.a;
    const x=reduced?route.a+index:forward?route.a+phase:route.b-(phase-(route.b-route.a));
    root.current.position.set(x,0,route.z);
    root.current.rotation.y=forward?Math.PI/2:-Math.PI/2;
    root.current.visible=root.current.position.distanceTo(camera.position)<90;
    if(rig.current&&!reduced){const step=Math.sin(clock.elapsedTime*5+index);rig.current.legL.rotation.x=step*.34;rig.current.legR.rotation.x=-step*.34;rig.current.armL.rotation.x=-step*.22;rig.current.armR.rotation.x=step*.22;}
  });
  return <group ref={root} position={[route.a,0,route.z]}><Character ref={rig} look={look} scale={1.05}/></group>;
}
/** 环境居民仅营造生活气息，无同事姓名/雇佣标记，不参与多人或经营状态。 */
export function TownLife(){return <>
  <StaticBatch worldStatic>
    {TOWN_VEHICLES.map(v=><Vehicle key={`${v.x}:${v.z}`} {...v}/>)}
    {TOWN_CRATES.map(c=><group key={`${c.x}:${c.z}`} position={[c.x,0,c.z]}>
      <mesh position={[0,.4,0]} material={std('#bc9263')} castShadow><boxGeometry args={[.8,.8,.8]}/></mesh>
      <mesh position={[0,.82,0]} material={std('#e2c893')}><boxGeometry args={[.12,.03,.82]}/></mesh>
      <mesh position={[.1,1.08,0]} material={std('#6e9d88')} castShadow><boxGeometry args={[.62,.5,.6]}/></mesh>
    </group>)}
  </StaticBatch>
  {TOWN_WALKERS.map((_,i)=><Resident key={i} index={i}/>)}
</>}
