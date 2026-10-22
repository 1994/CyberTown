import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BASKETBALL, basketballFrame } from '../../shared/townActivities';
import { Character, type Rig } from './Character';
import { std, glow } from './materials';
import { StaticBatch } from './StaticBatch.tsx';
import { Tube } from './Bicycle';
import { Label3D } from '../tea/Label3D';
import { applyPose, idlePose } from './pose';
import { rt } from '../world/runtime';
function CourtPaint(){
 const tex=useMemo(()=>{const c=document.createElement('canvas');c.width=768;c.height=896;const g=c.getContext('2d')!;
 g.fillStyle='#21575f';g.fillRect(0,0,768,896);g.fillStyle='#b96c42';g.fillRect(12,12,744,436);g.fillStyle='#9e573f';g.fillRect(12,448,744,436);
 g.strokeStyle='#b9dcd3';g.lineWidth=5;g.strokeRect(25,25,718,846);g.beginPath();g.moveTo(25,448);g.lineTo(743,448);g.stroke();g.beginPath();g.arc(384,448,90,0,Math.PI*2);g.stroke();
 for(const y of [25,871]){g.fillStyle='#285863';g.fillRect(264,y===25?25:651,240,220);g.strokeRect(264,y===25?25:651,240,220);g.beginPath();g.arc(384,y===25?245:651,75,0,Math.PI*2);g.stroke();g.beginPath();g.arc(384,y===25?58:838,300,y===25?0:Math.PI,y===25?Math.PI:Math.PI*2);g.stroke();}
 g.fillStyle='#edbe72';g.font='italic 900 36px sans-serif';g.textAlign='center';g.fillText('AFTER HOURS',384,410);g.font='bold 18px sans-serif';g.fillText('CYBER TOWN · COURT 01',384,480);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;},[]);
 useEffect(()=>()=>tex.dispose(),[tex]);
 return <mesh position={[0,.035,0]} rotation-x={-Math.PI/2} receiveShadow><planeGeometry args={[12,14]}/><meshStandardMaterial map={tex} roughness={.78}/></mesh>;
}
function Hoop({side}:{side:number}){return <group rotation-y={side<0?0:Math.PI}>
 <Tube a={[0,0,-7.5]} b={[0,3.5,-7.5]} color="#344b60" radius={.12}/><Tube a={[0,3.4,-7.5]} b={[0,3.4,-6.5]} color="#a3b7c6" radius={.08}/>
 <mesh position={[0,3.35,-6.55]} material={std('#b4d5d3',.3,.2)}><boxGeometry args={[2,1.15,.08]}/></mesh>
 {[[-.4,3.1,.03,.6],[.4,3.1,.03,.6],[0,3.4,.8,.03],[0,2.8,.8,.03]].map(([x,y,w,h],i)=><mesh key={i} position={[x,y,-6.49]} material={glow('#eaf3dc',.7)}><boxGeometry args={[w,h,.025]}/></mesh>)}
 <mesh position={[0,2.8,-6]} rotation-x={Math.PI/2} material={glow('#ff9d4f',1)}><torusGeometry args={[.4,.035,8,24]}/></mesh>
 {Array.from({length:10},(_,i)=>{const a=i*Math.PI/5;return <Tube key={i} a={[Math.cos(a)*.39,2.78,-6+Math.sin(a)*.39]} b={[Math.cos(a+.25)*.25,2.25,-6+Math.sin(a+.25)*.25]} color="#d6ece6" radius={.012}/>;})}
 </group>;}
function Players(){const actors=useRef<(THREE.Group|null)[]>([]),rigs=useRef<(Rig|null)[]>([]),ball=useRef<THREE.Group>(null),tag=useRef<THREE.Group>(null);const reduced=useMemo(()=>matchMedia('(prefers-reduced-motion: reduce)').matches,[]);
 useFrame(({clock},dt)=>{const t=reduced?1:clock.elapsedTime,f=basketballFrame(t);f.players.forEach((p,i)=>{const a=actors.current[i],r=rigs.current[i];if(!a||!r)return;const old=a.position.clone();a.position.set(...p);a.rotation.y=Math.atan2(f.ball[0]-p[0],f.ball[2]-p[2]);const pose=idlePose(t);pose.walk=old.distanceTo(a.position)>.002?1:0;pose.walkPhase=t*9+i;pose.reach=i===0?0.3:0;pose.celebrate=i===1&&f.shooting?.8:0;applyPose(r,pose,Math.min(dt,.05));});if(ball.current){ball.current.position.set(...f.ball);ball.current.rotation.x=t*3;ball.current.rotation.z=t;}if(tag.current)tag.current.visible=Math.hypot(rt.me.x-BASKETBALL.x,rt.me.z-BASKETBALL.z)<18;});
 return <>{['#efab48','#efab48','#71cfd2','#71cfd2'].map((shirt,i)=><group key={i} ref={e=>{actors.current[i]=e;}}><Character ref={e=>{rigs.current[i]=e;}} look={{skin:i%2?'#b98361':'#efc39c',hair:'#263244',hairStyle:i%2?'short':'cap',shirt,pants:'#273448',accessory:'none'}} scale={1.1}/></group>)}
 <group ref={ball}><mesh material={std('#ea863c')} castShadow><sphereGeometry args={[.22,16,12]}/></mesh>{[0,Math.PI/2].map(a=><mesh key={a} rotation-y={a} material={std('#573e30')}><torusGeometry args={[.221,.008,5,24]}/></mesh>)}</group>
 <group ref={tag}><Label3D text="NPC · 街头球局" tone="off" position={[0,4,0]} height={.4}/></group></>;
}
export function BasketballCourt(){return <group name="basketball-court" position={[BASKETBALL.x,0,BASKETBALL.z]}>
 <CourtPaint/><StaticBatch><Hoop side={-1}/><Hoop side={1}/>
 {/* Open sidelines keep the court walkable. Backstops are behind each baseline. */}
 {[-7.7,7.7].map(z=><group key={z}>{[-6,0,6].map(x=><Tube key={x} a={[x,0,z]} b={[x,2.3,z]} color="#405a65" radius={.045}/>)}{[.5,1.1,1.7,2.3].map(y=><Tube key={y} a={[-6,y,z]} b={[6,y,z]} color="#405a65" radius={.015}/>)}{Array.from({length:17},(_,i)=><Tube key={i} a={[-6+i*.75,.2,z]} b={[-6+i*.75,2.3,z]} color="#405a65" radius={.012}/>)}</group>)}
 {[-6,6].map(x=><group key={x}>{[-7,0,7].map(z=><group key={z}><Tube a={[x,0,z]} b={[x,5.2,z]} color="#36495b" radius={.06}/><mesh position={[x,5.2,z]} rotation-z={x<0?-.25:.25} material={glow('#fff1cf',2.2)}><boxGeometry args={[.7,.13,.4]}/></mesh></group>)}</group>)}
 <mesh position={[-7.2,.5,0]} material={std('#456375')}><boxGeometry args={[.7,1,4]}/></mesh>
 <mesh position={[-7.2,1.05,0]} material={std('#daa962')}><boxGeometry args={[.9,.12,4.2]}/></mesh>
 </StaticBatch>
 <pointLight position={[0,5,0]} color="#d8eaf4" intensity={28} distance={19} decay={2}/>
 <Label3D text="运动区 · 夜光球场" tone="on" position={[0,4.5,7.8]} height={.65}/><Players/>
 </group>;}
