import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { rng } from '../../shared/rules.ts';
import { rt, useWorld } from '../world/runtime.ts';
import { useRenderQuality } from '../renderQuality.ts';
import { StaticBatch } from './StaticBatch.tsx';
import { glow, std } from './materials.ts';

/** Rooftop service trunks only. */
export function UrbanDetails() {
  const frame = std('#111f26', .42, .65);
  return <StaticBatch worldStatic>
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
