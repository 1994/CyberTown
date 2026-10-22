import {useEffect,useRef} from 'react';
import {Canvas,useFrame,useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {FISH,fishX,type FishingRound} from '../../shared/fishing';
import {std,glow} from '../scene/materials';
import {Neon} from '../scene/TownDistricts';
function Segment({a,b,width,color}:{a:[number,number,number];b:[number,number,number];width:number;color:string}){
 const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),d=bv.clone().sub(av);
 return <mesh position={av.add(bv).multiplyScalar(.5)} quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.clone().normalize())} material={glow(color,.9)}><cylinderGeometry args={[width,width,d.length(),8]}/></mesh>;
}
function Fish({index,round}:{index:number;round:FishingRound}){
 const ref=useRef<THREE.Group>(null);
 useFrame(()=>{if(!ref.current)return;const t=(Date.now()-round.started)/1000,age=(Date.now()-round.at)/1000;
  const selected=round.fish===index&&['wait','bite','reel','caught'].includes(round.phase);
  const p=round.phase==='wait'?Math.min(1,age/(2.4+index*.45)):1;
  const x=fishX(index,t),z=-1.2+Math.sin(t*.5+index)*.7;
  ref.current.position.set(selected?x+(round.aim-x)*p:x,-.28,selected?z+(1.6-z)*p:z);
  ref.current.rotation.y=Math.sin(t*2+index)*.15;
  if(selected&&round.phase==='reel'){ref.current.position.z=1.6+round.progress*1.5;ref.current.rotation.z=Math.sin(t*18)*.18;}
  if(selected&&round.phase==='caught'){ref.current.position.y=.3+Math.sin(Math.min(1,age/1.6)*Math.PI)*2;ref.current.rotation.z=age*4;}
 });
 const f=FISH[index],scale=.7+index*.23;
 return <group ref={ref} scale={scale}>
  <mesh scale={[.32,.22,.7]} material={std(f.color,.3,.45,{emissive:f.color,emissiveIntensity:.6})}><sphereGeometry args={[1,16,10]}/></mesh>
  <mesh position={[0,0,-.78]} rotation-x={Math.PI/2} material={glow(f.color,.8)}><coneGeometry args={[.35,.45,3]}/></mesh>
  {[-1,1].map(side=><mesh key={side} position={[side*.21,.08,.42]} material={glow('#ffffff',1.2)}><sphereGeometry args={[.065,8,6]}/></mesh>)}
  <mesh position={[0,.27,-.1]} material={glow(f.color,1)}><coneGeometry args={[.2,.3,3]}/></mesh>
 </group>;
}
function World({round}:{round:FishingRound}){
 const {camera,size}=useThree();
 useEffect(()=>{const c=camera as THREE.OrthographicCamera;c.position.set(0,8,11);c.lookAt(0,0,.4);c.zoom=Math.min(size.width/11.7,size.height/9);c.updateProjectionMatrix();},[camera,size]);
 const bite=round.phase==='bite',caught=round.phase==='caught',reeling=round.phase==='reel';
 const end:[number,number,number]=[round.aim,caught?2:reeling?1.6:bite?-.15:.2,reeling?1.6+round.progress*1.5:1.6];
 return <>
  <color attach="background" args={['#081626']}/><ambientLight intensity={1.8}/><directionalLight position={[2,8,5]} intensity={2.5} color="#b3eaff"/>
  <mesh rotation-x={-Math.PI/2} position={[0,-.55,-1]} material={std('#104259',.25,.65)}><planeGeometry args={[25,30]}/></mesh>
  {Array.from({length:16},(_,i)=><mesh key={i} position={[(i%5-2)*2.5,-.51,-6+Math.floor(i/5)*3]} rotation-x={-Math.PI/2} material={glow(i%2?'#b766b4':'#3cbdc9',.32)}><planeGeometry args={[.12,.75]}/></mesh>)}
  {[-1,1].map(side=><group key={side} position={[side*6,0,-2]}><mesh material={std('#213047')}><boxGeometry args={[1,1,18]}/></mesh><mesh position={[0,.6,0]} material={glow(side>0?'#f38ac8':'#55ead8',1.3)}><boxGeometry args={[.06,.08,18]}/></mesh></group>)}
  {Array.from({length:9},(_,i)=><group key={i} position={[(i-4)*1.8,0,-6.8]}><mesh position-y={1.5+i%3*.6} material={std('#132337')}><boxGeometry args={[1.4,3+i%3*1.2,1.8]}/></mesh>{[1,2,3].map(y=><mesh key={y} position={[0,y,.92]} material={glow(i%2?'#f294ce':'#6ae1e4',.7)}><boxGeometry args={[.8,.1,.025]}/></mesh>)}</group>)}
  <Neon text="霓虹夜钓" color="#6affde" w={4} h={.8} position={[0,2.8,-4.7]}/>
  {[0,1,2].map(i=><mesh key={'ripple'+i} position={[(i-1)*3,-.49,-1]} rotation-x={-Math.PI/2} material={glow('#428697',.5)}><ringGeometry args={[.9,.915,40]}/></mesh>)}
  {[0,1,2].map(i=><Fish key={i} index={i} round={round}/>)}
  <mesh position={[0,-.1,5]} material={std('#28364b',.6,.4)}><boxGeometry args={[12,.45,2.6]}/></mesh>
  <mesh position={[0,.15,3.75]} material={glow('#f2c977',1)}><boxGeometry args={[12,.04,.05]}/></mesh>
  {Array.from({length:15},(_,i)=><mesh key={'plank'+i} position={[-5.6+i*.8,.14,5]} material={std('#51657a',.8)}><boxGeometry args={[.025,.018,2.4]}/></mesh>)}
  <mesh position={[1,.4,5]} rotation-x={Math.PI/2} material={std('#273043',.5,.6)}><cylinderGeometry args={[.13,.13,.9,12]}/></mesh>
  <mesh position={[1.17,.48,4.8]} rotation-y={Math.PI/2} material={std('#c9a565',.3,.8)}><torusGeometry args={[.19,.055,8,18]}/></mesh>
  <Segment a={[1,.4,5]} b={[round.aim,2.3+(reeling?round.tension*.5:0),2.2]} width={.055} color="#ebc881"/>
  <Segment a={[round.aim,2.3+(reeling?round.tension*.5:0),2.2]} b={end} width={.012} color={round.tension>.75?'#ff638b':'#a5fff1'}/>
  {round.phase!=='ready'&&<group position={end}><mesh material={glow(bite?'#ffdf68':'#6bffe8',1.4)}><sphereGeometry args={[bite?.16:.1,12,8]}/></mesh><mesh rotation-x={-Math.PI/2} material={glow(bite?'#ffdf68':'#6bffe8',.8)}><ringGeometry args={[bite?.35:.2,bite?.40:.23,32]}/></mesh></group>}
 </>;
}
export function FishingScene({round}:{round:FishingRound}){return <Canvas orthographic dpr={[1,1.5]} camera={{position:[0,8,11],zoom:50,near:.1,far:80}} gl={{antialias:true}}><World round={round}/></Canvas>;}
