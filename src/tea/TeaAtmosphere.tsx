import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { StaticBatch } from '../scene/StaticBatch.tsx';
import { glow, std } from '../scene/materials.ts';

/** A street around the cutaway: decorative only, outside the working floor. */
export function TeaAtmosphere() {
  const paving = useMemo(() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#344653'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#273742'; g.lineWidth = 2;
    for (let y = 0; y < 128; y += 32) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke();
      for (let x = y % 64 ? 16 : 0; x < 128; x += 32) g.strokeRect(x, y, 32, 32);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(12, 10); return t;
  }, []);
  useEffect(() => () => paving.dispose(), [paving]);
  return <StaticBatch>
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.22, 0]} receiveShadow>
      <planeGeometry args={[160, 160]} /><meshStandardMaterial color="#172b38" roughness={0.9} />
    </mesh>
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.13, 0]} receiveShadow>
      <planeGeometry args={[27, 23]} /><meshStandardMaterial map={paving} roughness={0.78} />
    </mesh>
    <mesh position={[0, -0.2, 8.8]} receiveShadow material={std('#192935', 0.75)}><boxGeometry args={[70, 0.06, 4.4]} /></mesh>
    <mesh position={[0, -0.08, 6.55]} material={std('#68787b', 0.8)}><boxGeometry args={[45, 0.18, 0.23]} /></mesh>
    {Array.from({length: 12}, (_,i) => <mesh key={i} rotation-x={-Math.PI / 2} position={[-24+i*4, -0.16, 8.7]} material={std('#bca76b', 0.8)}><planeGeometry args={[1.8, 0.07]} /></mesh>)}
    {/* Planters stay outside the entrance and every customer route. */}
    {[-8.6, 8.8].map(x => <group key={x} position={[x, -0.1, 2.8]}>
      <mesh position-y={0.26} material={std('#273c46',0.8)} castShadow><boxGeometry args={[0.7,0.52,3.0]} /></mesh>
      <mesh position-y={0.53} material={std('#66513c',0.9)}><boxGeometry args={[0.6,0.04,2.9]} /></mesh>
      {[-1,-.5,0,.5,1].map((z,i) => <mesh key={z} position={[0,.85,z]} material={std(i%2?'#426958':'#63876a',.9)} castShadow><icosahedronGeometry args={[.39,1]} /></mesh>)}
    </group>)}
    {[-9, 9].map(x => <group key={x} position={[x, -0.1, 5.7]}>
      <mesh position-y={1.65} material={std('#25323d',.5,.5)} castShadow><cylinderGeometry args={[.05,.08,3.3,8]} /></mesh>
      <mesh position-y={3.25} material={std('#25323d',.5,.5)}><cylinderGeometry args={[.3,.2,.18,12]} /></mesh>
      <mesh position-y={3.12} material={glow('#ffd29a',1.4)}><sphereGeometry args={[.16,12,8]} /></mesh>
      <mesh rotation-x={-Math.PI/2} position={[0,-.115,0]}><circleGeometry args={[1.3,32]} /><meshBasicMaterial color="#f4c58e" transparent opacity={.08} depthWrite={false} /></mesh>
    </group>)}
    {/* Distant facades give the windows a neighborhood rather than a black void. */}
    {[-18,-13,-8,8,13,18].map((x,i) => <group key={x} position={[x,0,-12]}>
      <mesh position-y={3+(i%3)} material={std(i%2?'#203c4a':'#29374c',.9)}><boxGeometry args={[4,6+(i%3)*2,3]} /></mesh>
      {Array.from({length:9},(_,k)=><mesh key={k} position={[-1.2+(k%3)*1.2,1.2+Math.floor(k/3)*1.65,1.51]} material={glow((i+k)%3?'#d8b58a':'#6da9b9',.55)}><planeGeometry args={[.45,.7]} /></mesh>)}
    </group>)}
  </StaticBatch>;
}
