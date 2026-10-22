import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { rt } from '../world/runtime';
import { districtAt } from '../../shared/townPlan';
/** One light rig, interpolated in place: no extra shadow passes on zone changes. */
export function TownAmbientLight(){
 const light=useRef<THREE.HemisphereLight>(null);
 const palettes=useMemo(()=>({plaza:{sky:new THREE.Color('#dcecff'),ground:new THREE.Color('#8296b6'),power:2.5},commerce:{sky:new THREE.Color('#ffe6cb'),ground:new THREE.Color('#ad87a0'),power:2.7},leisure:{sky:new THREE.Color('#e5e3ff'),ground:new THREE.Color('#b099ca'),power:3.0},expansion:{sky:new THREE.Color('#dcecff'),ground:new THREE.Color('#8296b6'),power:2.5}}),[]);
 useFrame((_,dt)=>{if(!light.current)return;const p=palettes[districtAt(rt.me.x,rt.me.z).id],a=1-Math.exp(-Math.min(dt,.1)*1.2);light.current.color.lerp(p.sky,a);light.current.groundColor.lerp(p.ground,a);light.current.intensity=THREE.MathUtils.lerp(light.current.intensity,p.power,a);});
 return <hemisphereLight ref={light} args={['#dcecff','#8296b6',2.5]}/>;
}
