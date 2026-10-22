import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { rt } from '../world/runtime';
import { districtAt } from '../../shared/townPlan';
/** One light rig, interpolated in place: no extra shadow passes on zone changes. */
export function TownAmbientLight(){
 const light=useRef<THREE.HemisphereLight>(null);
 const palettes=useMemo(()=>({plaza:{sky:new THREE.Color('#b9d0df'),ground:new THREE.Color('#56687b'),power:1.45},commerce:{sky:new THREE.Color('#e4d6c6'),ground:new THREE.Color('#716779'),power:1.55},leisure:{sky:new THREE.Color('#cdd6ef'),ground:new THREE.Color('#746c91'),power:1.7},expansion:{sky:new THREE.Color('#b9d0df'),ground:new THREE.Color('#56687b'),power:1.45}}),[]);
 useFrame((_,dt)=>{if(!light.current)return;const p=palettes[districtAt(rt.me.x,rt.me.z).id],a=1-Math.exp(-Math.min(dt,.1)*1.2);light.current.color.lerp(p.sky,a);light.current.groundColor.lerp(p.ground,a);light.current.intensity=THREE.MathUtils.lerp(light.current.intensity,p.power,a);});
 return <hemisphereLight ref={light} args={['#b9d0df','#56687b',1.45]}/>;
}
