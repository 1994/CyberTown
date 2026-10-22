import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TEA_TOWN_SITES } from '../../shared/teaTown';
import { TOWN_LANDMARKS, TOWN_SHOPHOUSES } from '../../shared/townPlan';
import { rt } from '../world/runtime';

const textures=new Map<string,THREE.CanvasTexture>();
function icon(kind:'enter'|'arcade'|'closed'){
 if(textures.has(kind))return textures.get(kind)!;
 const c=document.createElement('canvas');c.width=128;c.height=144;const g=c.getContext('2d')!;
 const color=kind==='closed'?'#94a3b8':kind==='arcade'?'#dbabff':'#73ffe1';
 g.fillStyle='#101c30';g.strokeStyle=color;g.lineWidth=5;g.lineJoin='round';g.beginPath();g.moveTo(28,8);g.lineTo(100,8);g.lineTo(120,28);g.lineTo(120,100);g.lineTo(100,120);g.lineTo(28,120);g.lineTo(8,100);g.lineTo(8,28);g.closePath();g.fill();g.stroke();
 g.fillStyle=color;g.beginPath();g.moveTo(51,126);g.lineTo(77,126);g.lineTo(64,140);g.fill();g.lineWidth=7;g.lineCap='round';
 if(kind==='closed'){g.strokeRect(41,60,46,34);g.beginPath();g.arc(64,58,17,Math.PI,0);g.stroke();g.fillRect(61,72,6,11);}
 else if(kind==='arcade'){g.beginPath();g.roundRect(26,43,76,45,14);g.stroke();g.beginPath();g.moveTo(39,65);g.lineTo(57,65);g.moveTo(48,56);g.lineTo(48,74);g.stroke();g.beginPath();g.arc(80,59,4,0,7);g.arc(91,72,4,0,7);g.fill();}
 else{g.beginPath();g.moveTo(64,34);g.lineTo(91,34);g.lineTo(91,95);g.lineTo(64,95);g.stroke();g.beginPath();g.moveTo(30,64);g.lineTo(69,64);g.moveTo(55,49);g.lineTo(70,64);g.lineTo(55,79);g.stroke();}
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;textures.set(kind,t);return t;
}
function Marker({x,z,y=4,kind}:{x:number;z:number;y?:number;kind:'enter'|'arcade'|'closed'}){
 const ref=useRef<THREE.Sprite>(null);const texture=useMemo(()=>icon(kind),[kind]);
 const reduced=useMemo(()=>matchMedia('(prefers-reduced-motion: reduce)').matches,[]);
 useFrame(({clock})=>{if(!ref.current)return;const d=Math.hypot(rt.me.x-x,rt.me.z-z);ref.current.visible=kind!=='closed'||d<11;ref.current.position.y=y+(reduced||kind==='closed'?0:Math.sin(clock.elapsedTime*1.8)*.12);});
 return <sprite ref={ref} position={[x,y,z]} scale={kind==='closed'?[.025,.028,1]:[.052,.059,1]} renderOrder={5}><spriteMaterial map={texture} transparent sizeAttenuation={false} opacity={kind==='closed'?.65:1} depthWrite={false} depthTest={kind==='closed'} toneMapped={false}/></sprite>;
}
export function EntranceMarkers(){return <group name="town-entrance-markers">
 {Object.entries(TEA_TOWN_SITES).map(([id,s])=><Marker key={id} x={s.x} z={s.z} y={3.7} kind={id==='arcade'?'arcade':'enter'}/>)}
 {TOWN_LANDMARKS.filter(l=>!l.open).map(l=><Marker key={l.name} x={l.x} z={l.z} y={5} kind="closed"/>)}
 {TOWN_SHOPHOUSES.map((h,i)=><Marker key={i} x={h.x} z={h.z} y={h.h+.8} kind="closed"/>)}
 </group>;}
