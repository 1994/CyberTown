import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { rng } from '../../shared/rules.ts';
import { rt, useWorld } from '../world/runtime.ts';
import { useRenderQuality } from '../renderQuality.ts';
import { StaticBatch } from './StaticBatch.tsx';
import { glow, std } from './materials.ts';

const POSTER = `${import.meta.env.BASE_URL}art/boss-bonus-poster.webp`;

/** One original image, one GPU texture; frames stay inside existing shop bodies. */
export function UrbanDetails() {
  const image = useTexture(POSTER);
  image.colorSpace = THREE.SRGBColorSpace;
  image.anisotropy = 4;
  const boards = [[-39, 2.65, -2.94], [39, 2.65, -2.94], [-11, 2.3, -24.94]];
  const frame = std('#111f26', .42, .65);
  const trim = std('#acb1a0', .35, .6);
  return <StaticBatch worldStatic>
    {boards.map(([x,y,z], i) => <group key={x} position={[x,y,z]}>
      <mesh position={[0,0,-.06]} material={frame}><boxGeometry args={[2.96,4.42,.12]} /></mesh>
      <mesh position={[0,0,.012]}><planeGeometry args={[2.72,4.08]} /><meshBasicMaterial map={image} toneMapped={false} /></mesh>
      {[-1,1].flatMap(a => [-1,1].map(b => <mesh key={`${a},${b}`} position={[a*1.41,b*2.14,.025]} rotation-x={Math.PI/2} material={trim}>
        <cylinderGeometry args={[.035,.035,.03,6]} />
      </mesh>))}
      <mesh position={[0,2.24,0]} material={glow(i === 1 ? '#ff5b4f' : '#f3d43c',1.4)}><boxGeometry args={[2.95,.04,.08]} /></mesh>
    </group>)}
    {/* Elevated service trunks join existing rooftops; no new ground obstacles. */}
    {[-8.1,-7.5].map((z,i) => <mesh key={z} position={[0,5.65+i*.28,z]} rotation-z={Math.PI/2} material={std(i ? '#a47135' : '#384b50',.38,.7)}>
      <cylinderGeometry args={[i ? .08 : .16,i ? .08 : .16,78,8]} />
    </mesh>)}
    {[-37,-27,-17,-7,3,13,23,33].map(x => <group key={x} position={[x,5.78,-7.8]}>
      <mesh material={frame}><boxGeometry args={[.12,.8,1.1]} /></mesh>
      <mesh position={[0,.42,0]} material={glow('#d6af35',1.15)}><boxGeometry args={[.2,.05,1.15]} /></mesh>
    </group>)}
  </StaticBatch>;
}

/** Camera-local rain uses one draw call and one time uniform; no React frame state. */
export function NightRain() {
  const group = useRef<THREE.Group>(null);
  const quality = useRenderQuality(s => s.quality);
  const tier = useRenderQuality(s => s.tier);
  const reduced = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const geometry = useMemo(() => {
    const r = rng(774);
    const positions: number[] = [], tips: number[] = [];
    for(let i=0;i<110;i++) {
      const x=(r()-.5)*30,y=r()*12,z=(r()-.5)*30;
      positions.push(x,y,z,x,y,z); tips.push(0,1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setAttribute('aTip',new THREE.Float32BufferAttribute(tips,1));
    return g;
  }, []);
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0}}, transparent:true, depthWrite:false, toneMapped:false,
    vertexShader:'attribute float aTip; uniform float uTime; void main(){ vec3 p=position; p.y=mod(p.y-uTime*6.0,12.0); p+=vec3(0.04,-0.28,0.0)*aTip; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }',
    fragmentShader:'void main(){ gl_FragColor=vec4(0.44,0.72,0.76,0.18); }',
  }), []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry,material]);
  useFrame(({clock}) => {
    if(!group.current) return;
    group.current.visible = !reduced && quality !== 'smooth' && tier === 0 && !useWorld.getState().overview;
    group.current.position.set(rt.me.x,0,rt.me.z);
    material.uniforms.uTime.value=clock.elapsedTime;
  });
  return <group ref={group}><lineSegments geometry={geometry} material={material} frustumCulled={false} /></group>;
}
