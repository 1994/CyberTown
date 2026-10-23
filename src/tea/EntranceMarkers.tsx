import { useShopRoster } from './shopRoster.ts';
import './shop-badge.css';
import { SHOPPING_STORES } from '../../shared/townActivities';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TEA_TOWN_SITES } from '../../shared/teaTown';
import { TOWN_LOCKED_AREAS } from '../../shared/townLockedAreas';
import { LockKeyhole } from 'lucide-react';
import { rt } from '../world/runtime';
import { WorldLabel } from '../scene/WorldLabel';
import { Avatar } from '../ui/Avatar';
import { useGame } from '../store';
import { useTownState } from './townState';
import { dressed } from '../look';
import type { Look } from '../../shared/types';


const textures=new Map<string,THREE.CanvasTexture>();
function icon(kind:'enter'|'arcade'|'closed'|'shopping'){
 if(textures.has(kind))return textures.get(kind)!;
 const c=document.createElement('canvas');c.width=128;c.height=144;const g=c.getContext('2d')!;
 const color=kind==='closed'?'#94a3b8':kind==='arcade'?'#dbabff':kind==='shopping'?'#ffd77b':'#73ffe1';
 g.fillStyle='#101c30';g.strokeStyle=color;g.lineWidth=5;g.lineJoin='round';g.beginPath();g.moveTo(28,8);g.lineTo(100,8);g.lineTo(120,28);g.lineTo(120,100);g.lineTo(100,120);g.lineTo(28,120);g.lineTo(8,100);g.lineTo(8,28);g.closePath();g.fill();g.stroke();
 g.fillStyle=color;g.beginPath();g.moveTo(51,126);g.lineTo(77,126);g.lineTo(64,140);g.fill();g.lineWidth=7;g.lineCap='round';
 if(kind==='shopping'){g.strokeRect(36,55,56,43);g.beginPath();g.arc(64,55,16,Math.PI,0);g.stroke();}
 else if(kind==='closed'){g.strokeRect(41,60,46,34);g.beginPath();g.arc(64,58,17,Math.PI,0);g.stroke();g.fillRect(61,72,6,11);}
 else if(kind==='arcade'){g.beginPath();g.roundRect(26,43,76,45,14);g.stroke();g.beginPath();g.moveTo(39,65);g.lineTo(57,65);g.moveTo(48,56);g.lineTo(48,74);g.stroke();g.beginPath();g.arc(80,59,4,0,7);g.arc(91,72,4,0,7);g.fill();}
 else{g.beginPath();g.moveTo(64,34);g.lineTo(91,34);g.lineTo(91,95);g.lineTo(64,95);g.stroke();g.beginPath();g.moveTo(30,64);g.lineTo(69,64);g.moveTo(55,49);g.lineTo(70,64);g.lineTo(55,79);g.stroke();}
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;textures.set(kind,t);return t;
}
function Marker({x,z,y=4,kind}:{x:number;z:number;y?:number;kind:'enter'|'arcade'|'closed'|'shopping'}){
 const ref=useRef<THREE.Sprite>(null);const texture=useMemo(()=>icon(kind),[kind]);
 const reduced=useMemo(()=>matchMedia('(prefers-reduced-motion: reduce)').matches,[]);
 useFrame(({clock})=>{if(!ref.current)return;const d=Math.hypot(rt.me.x-x,rt.me.z-z);ref.current.visible=kind!=='closed'||d<11;ref.current.position.y=y+(reduced||kind==='closed'?0:Math.sin(clock.elapsedTime*1.8)*.12);});
 return <sprite ref={ref} position={[x,y,z]} scale={kind==='closed'?[.025,.028,1]:[.026,.0295,1]} renderOrder={5}><spriteMaterial map={texture} transparent sizeAttenuation={false} opacity={kind==='closed'?.65:1} depthWrite={false} depthTest={kind==='closed'} toneMapped={false}/></sprite>;
}
/** One badge replaces the entry icon on an owned shop; ownership comes from the
 * current town, never the visiting player's identity. Avatar handles failed URLs. */
function ShopOwnerBadge() {
 const owner=useTownState(s=>s.ready?s.home?.owner:null);
 const snapshot=useGame(s=>s.snapshot);
 const roster=useShopRoster();
 if(!owner)return <Marker x={TEA_TOWN_SITES.shop.x} z={TEA_TOWN_SITES.shop.z} y={4.6} kind="enter"/>;
 const player=snapshot?.players.find(p=>p.id===owner.id);
 const colleague=snapshot?.colleagues.find(c=>c.id===player?.avatarColleagueId);
 const base:Look=colleague?dressed(colleague.look,player?.style):{skin:'#f1c7a1',hair:'#2b2b33',hairStyle:'short',shirt:owner.color,pants:'#2a3142',accessory:'none'};
 const look={...base,avatarUrl:owner.avatarUrl??player?.avatarUrl??base.avatarUrl,avatarName:owner.name};
 return <WorldLabel position={[-20.5,4.5,-1]} center zIndexRange={[5,0]} style={{pointerEvents:'none'}}>
  <div className="shop-team-badge" data-testid="shop-owner-badge" data-owner-id={owner.id} role="group" aria-label={`${owner.name}的奶茶店`}>
   <div className="shop-team-owner">
    <span className="shop-team-face"><Avatar look={look} size={28}/><span className="shop-team-crown">★</span></span>
    <div className="shop-team-person"><small>老板</small><strong>{owner.name}</strong></div>
   </div>
   {roster.ownerId === owner.id && roster.workers.length > 0 && <div className="shop-team-staff" aria-label="奶茶店已排班员工">
    {roster.workers.map(worker => {
     const player = snapshot?.players.find(p => p.id === worker.playerId);
     const colleague = snapshot?.colleagues.find(c => c.id === player?.avatarColleagueId);
     const workerLook: Look = {
      ...(colleague ? dressed(colleague.look, player?.style) : {skin:'#f1c7a1',hair:'#2b2b33',hairStyle:'short' as const,shirt:worker.color,pants:'#2a3142',accessory:'none' as const}),
      avatarUrl:worker.avatarUrl ?? player?.avatarUrl, avatarName:worker.name,
     };
     const role = worker.role === 'maker' ? '制作' : worker.role === 'cashier' ? '端送' : '补位';
     return <div className="shop-team-worker" key={worker.id} data-testid="shop-staff-badge" data-worker-id={worker.id} aria-label={`${worker.demo?'NPC':'同事'}：${worker.name}，${role}，已排班`}>
      <span className="shop-team-face"><Avatar look={workerLook} size={23}/><i/></span>
      <div className="shop-team-person"><strong>{worker.name}</strong><small>{worker.demo ? 'NPC' : '同事'} · {role}</small></div>
     </div>;
    })}
   </div>}
  </div>
 </WorldLabel>;
}
function LockedArea({area}:{area:typeof TOWN_LOCKED_AREAS[number]}) {
 const badge=useRef<HTMLDivElement>(null),detail=useRef<HTMLDivElement>(null);
 useFrame(({camera})=>{
  const distance=Math.hypot(rt.me.x-area.x,rt.me.z-area.z);
  if(badge.current)badge.current.style.display=distance<28&&camera.position.y<60?'flex':'none';
  if(detail.current)detail.current.style.display=distance<10?'block':'none';
 });
 return <WorldLabel position={[area.x,4.3,area.z]} center zIndexRange={[4,0]} style={{pointerEvents:'none'}}>
  <div ref={badge} data-testid={`locked-area-${area.id}`} className="town-locked-area" style={{display:'none'}}>
   <LockKeyhole size={24} aria-hidden="true"/><div><strong>{area.name}</strong><span className="town-locked-status">未解锁 · 后续开放</span><div ref={detail} className="town-locked-hint" style={{display:'none'}}>{area.hint}</div></div>
  </div>
 </WorldLabel>;
}
export function EntranceMarkers(){return <group name="town-entrance-markers">
 <ShopOwnerBadge/>
 {SHOPPING_STORES.map(s=><Marker key={s.category} x={s.x} z={s.z} y={3.95} kind="shopping"/>)}
 {Object.entries(TEA_TOWN_SITES).filter(([id])=>id!=='shop').map(([id,s])=><Marker key={id} x={s.x} z={s.z} y={3.7} kind={id==='arcade'?'arcade':'enter'}/>)}
 {TOWN_LOCKED_AREAS.map(area=><LockedArea key={area.id} area={area}/>)}
 </group>;}
