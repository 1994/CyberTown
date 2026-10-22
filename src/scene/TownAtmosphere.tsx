import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { rt } from '../world/runtime';
import { districtAt } from '../../shared/townPlan';
/** One light rig, interpolated in place: no extra shadow passes on zone changes. */
export function TownAmbientLight(){
 const light=useRef<THREE.HemisphereLight>(null);
 const palettes=useMemo(()=>({plaza:{sky:new THREE.Color('#b5cfdf'),ground:new THREE.Color('#526475'),power:1.3},commerce:{sky:new THREE.Color('#ffe0b0'),ground:new THREE.Color('#726058'),power:1.48},leisure:{sky:new THREE.Color('#d9dcff'),ground:new THREE.Color('#7977a6'),power:1.95},expansion:{sky:new THREE.Color('#b5cfdf'),ground:new THREE.Color('#526475'),power:1.3}}),[]);
 useFrame((_,dt)=>{if(!light.current)return;const p=palettes[districtAt(rt.me.x,rt.me.z).id],a=1-Math.exp(-Math.min(dt,.1)*1.2);light.current.color.lerp(p.sky,a);light.current.groundColor.lerp(p.ground,a);light.current.intensity=THREE.MathUtils.lerp(light.current.intensity,p.power,a);});
 return <hemisphereLight ref={light} args={['#b5cfdf','#526475',1.3]}/>;
}
