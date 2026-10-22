import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { LocalPointLight } from './LocalLights';
// Broad colored spill below the signs. Shared soft texture adds readable color
// even on low quality; actual facade lighting uses the existing bounded pool.
const SPILLS: [number,number,string][] = [
 [-19,1,'#ff5dbd'],[-24,10,'#ffb74c'],[-14,13,'#43e6ff'],[-5,11,'#4cebdc'],
 [5,11,'#ffb858'],[15,10,'#ff5cdb'],[23,11,'#50ddff'],[24,-5,'#b884ff'],
 [-58,-16,'#ffac55'],[-74,16,'#45dcca'],[60,-16,'#ff65cc'],[82,18,'#62caff'],
];
export function NeonStreetLight(){
 const texture=useMemo(()=>{const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d')!;const r=g.createRadialGradient(64,64,4,64,64,64);r.addColorStop(0,'rgba(255,255,255,.7)');r.addColorStop(.35,'rgba(255,255,255,.32)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);},[]);
 useEffect(()=>()=>texture.dispose(),[texture]);
 return <group name="neon-street-spill">{SPILLS.map(([x,z,color])=><group key={`${x}:${z}`} position={[x,0,z]}>
  <LocalPointLight position={[0,3,0]} color={color} intensity={85} distance={18} decay={2}/>
  <mesh rotation-x={-Math.PI/2} position-y={.045} renderOrder={1}><planeGeometry args={[13,8]}/><meshBasicMaterial map={texture} color={color} transparent opacity={.42} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false}/></mesh>
 </group>)}</group>;
}
