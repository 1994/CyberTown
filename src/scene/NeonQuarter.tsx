import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Shophouse } from '../../shared/townPlan';
import { glow, std } from './materials';
import { Neon } from './TownDistricts';
import { LocalPointLight } from './LocalLights';

const ACCENTS = ['#45e7ff','#ff4fa8','#ffc46b'];
const SIGNS = ['云端酒店','星河资本','光域科技','霓虹都会','极光中心','夜航公馆','天际汇'];
/** Reuses the original street-house footprint: height only, no new ground obstacles. */
export function NeonTower({ h, index }: { h: Shophouse; index: number }) {
  const c = ACCENTS[index % 3], w = h.w, d = h.d, height = h.h;
  const floors = Math.floor((height-5)/1.45);
  return <group position={[h.x,0,h.z]}>
    <mesh position={[0,2,0]} material={std('#24374b',.3,.65)} castShadow><boxGeometry args={[w,4,d]}/></mesh>
    <mesh position={[0,height/2,0]} material={std(index%2?'#172d44':'#26334f',.24,.72)} castShadow><boxGeometry args={[w*.88,height,d*.9]}/></mesh>
    {/* Set-back service spines catch grazing light on otherwise dark side walls. */}
    <mesh position={[w*.31,height*.4,-d*.23]} material={std('#3c5266',.3,.65)}><boxGeometry args={[w*.28,height*.8,d*.48]}/></mesh>
    {index%2===0 && <mesh position={[-w*.2,height*.85,0]} material={std('#33455f',.25,.7)}><boxGeometry args={[w*.45,height*.34,d*.66]}/></mesh>}
    {/* Stepped crown and mechanical penthouse give each tower a real silhouette. */}
    <mesh position={[0,height+1,0]} material={std('#263c51',.3,.65)}><boxGeometry args={[w*.68,2,d*.7]}/></mesh>
    <mesh position={[0,height+2.25,0]} material={glow(c,1.9)}><boxGeometry args={[w*.72,.16,d*.73]}/></mesh>
    <mesh position={[w*.2,height+3.2,0]} material={std('#6b8da1',.3,.7)}><cylinderGeometry args={[.05,.09,2,6]}/></mesh>
    <mesh position={[w*.2,height+4.2,0]} material={glow('#ff647e',2)}><sphereGeometry args={[.12,6,6]}/></mesh>
    {[-1,1].map(side=><group key={side}>
      <mesh position={[side*w*.442,height/2,d*.451]} material={glow(c,1.5)}><boxGeometry args={[.07,height,.07]}/></mesh>
      <mesh position={[side*w*.445,height/2,0]} material={std('#50637c',.35,.7)}><boxGeometry args={[.12,height,d*.9]}/></mesh>
      {Array.from({length:floors},(_,f)=><group key={f}>
        <mesh position={[0,4.8+f*1.45,side*d*.455]} material={std('#0d1d31',.22,.65)}><boxGeometry args={[w*.84,1.1,.025]}/></mesh>
        {[0,1,2,3,4].map(k=><mesh key={k} position={[(k-2)*w*.16,4.8+f*1.45,side*d*.46]} material={glow((k+f+index)%5===0?c:'#ffddb3',(k*3+f+index)%7===0?.15:.65)}><boxGeometry args={[w*.09,.65,.025]}/></mesh>)}
        <mesh position={[side*w*.452,4.8+f*1.45,0]} material={glow((f+index)%3===0?c:'#91bad8',.5)}><boxGeometry args={[.025,.18,d*.8]}/></mesh>
      </group>)}
    </group>)}
    {[4,height*.54,height-.6].map(y=><mesh key={y} position={[0,y,0]} material={glow(c,1.35)}><boxGeometry args={[w*.91,.09,d*.94]}/></mesh>)}
    {/* Large framed ads, rather than scattered instruction labels. */}
    <mesh position={[0,height*.68,d*.48]} material={std('#081522',.4,.4)}><boxGeometry args={[w*.78,4.7,.18]}/></mesh>
    <mesh position={[0,height*.68-2.3,d*.5]} material={glow(c,2)}><boxGeometry args={[w*.8,.08,.08]}/></mesh>
    <Neon text={SIGNS[index]} color={c} w={w*.73} h={1.1} position={[0,height*.68+.6,d*.51]}/>
    <Neon text={index===3?'NEON CITY':'2088 / NIGHT LIFE'} color="#e8f3ff" w={w*.68} h={.52} position={[0,height*.68-.7,d*.51]}/>
    <mesh position={[0,1.5,d*.501]} material={glow('#ffd4a4',.7)}><boxGeometry args={[w*.76,2.2,.03]}/></mesh>
    {[-.3,0,.3].map(x=><mesh key={x} position={[w*x,1.5,d*.51]} material={std('#182839',.3,.65)}><boxGeometry args={[.12,2.8,.06]}/></mesh>)}
    <mesh position={[0,3.2,d*.3]} material={std('#23314b',.2,.75)}><boxGeometry args={[w,.18,d*.42]}/></mesh>
    <mesh position={[0,3.1,d*.51]} material={glow(c,1.7)}><boxGeometry args={[w,.08,.08]}/></mesh>
  </group>;
}

export function NeonQuarterStatic() {
  return <group name="neon-quarter-showcase">
    {/* Central sky lobby joins two towers well above street level. */}
    <mesh position={[46,14,-60]} material={std('#304963',.24,.7)}><boxGeometry args={[13,4,4.7]}/></mesh>
    <mesh position={[46,14,-57.63]} material={glow('#36abbf',.55)}><boxGeometry args={[12.5,2.8,.04]}/></mesh>
    {Array.from({length:10},(_,i)=><mesh key={i} position={[40.5+i*1.2,14,-57.58]} material={std('#182a3d',.4,.5)}><boxGeometry args={[.1,3.5,.08]}/></mesh>)}
    <mesh position={[46,16.1,-60]} material={glow('#ffd080',1.3)}><boxGeometry args={[13.2,.1,4.8]}/></mesh>
    <group position={[50,40.5,-60]}>
      <mesh rotation-x={Math.PI/2} material={glow('#60efff',1.6)}><torusGeometry args={[4,.075,6,48]}/></mesh>
      <mesh rotation-z={Math.PI/4} material={glow('#ffc778',1.2)}><octahedronGeometry args={[1.4,0]}/></mesh>
    </group>
    {/* Elevated links never obstruct the existing north-ring walking route. */}
    {[[42,50,11],[66,74,17],[74,82,9]].map(([a,b,y])=><group key={a}>
      <mesh position={[(a+b)/2,y,-60]} material={std('#233b50',.23,.7)}><boxGeometry args={[b-a,1.4,2.2]}/></mesh>
      <mesh position={[(a+b)/2,y+.25,-58.88]} material={glow('#5be3ff',.65)}><boxGeometry args={[b-a,.55,.025]}/></mesh>
      <mesh position={[(a+b)/2,y-.65,-58.85]} material={glow('#ff5db4',1.8)}><boxGeometry args={[b-a,.07,.06]}/></mesh>
    </group>)}
    {/* Broad luminous pavement strips pull the eye into the district. */}
    {[ -55.6,-53.3].map(z=><mesh key={z} position={[50,.03,z]} material={glow(z< -54?'#55dcff':'#f66fb9',.8)}><boxGeometry args={[69,.025,.07]}/></mesh>)}
    {[20,29,39,47,55,63,71,79].map((x,i)=><group key={x}>
      <mesh rotation-x={-Math.PI/2} position={[x,.018,-55.8]}><planeGeometry args={[2.5,2.8]}/><meshBasicMaterial color={ACCENTS[i%3]} transparent opacity={.07} depthWrite={false}/></mesh>
      {/* Small inset paving lights: no obstruction or additional colliders. */}
      <mesh position={[x,.035,-53.7]} material={glow('#ffdb94',1.6)}><boxGeometry args={[.6,.04,.16]}/></mesh>
    </group>)}
    <Neon text="霓虹都会" color="#ffdc7d" w={8} h={1.8} position={[50,6.5,-56.9]}/>
    <Neon text="未来版图 / 尚未解锁" color="#a5d5ed" w={5.5} h={.6} position={[50,5.1,-56.9]}/>
  </group>;
}

/** A distant airborne shuttle adds life; it stays above roofs and uses no physics. */
export function NeonQuarterLife() {
  const shuttle=useRef<THREE.Group>(null!);
  useFrame(({clock})=>{
    if(!shuttle.current)return;
    const t=clock.elapsedTime*.07;
    shuttle.current.position.set(50+Math.sin(t)*30,42+Math.sin(t*2)*.6,-61+Math.cos(t)*3);
    shuttle.current.rotation.y=Math.cos(t)>0?Math.PI/2:-Math.PI/2;
  });
  return <group>
    <LocalPointLight position={[48,5,-55]} color="#5bdcff" intensity={70} distance={19} decay={2}/>
    <LocalPointLight position={[69,5,-55]} color="#ff54ac" intensity={60} distance={18} decay={2}/>
    <group ref={shuttle}>
      <mesh material={std('#607c90',.25,.7)}><boxGeometry args={[.9,.6,2.7]}/></mesh>
      <mesh position={[0,.25,.7]} material={glow('#a4ecff',1)}><boxGeometry args={[.8,.25,.9]}/></mesh>
      {[-.55,.55].map(x=><mesh key={x} position={[x,-.1,-1]} material={glow('#ff70bc',2)}><boxGeometry args={[.22,.2,1.3]}/></mesh>)}
    </group>
  </group>;
}
