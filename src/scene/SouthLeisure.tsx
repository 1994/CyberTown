import { SOUTH_STANDS, SOUTH_PLANTERS, SOUTH_BIKE_RACK } from '../../shared/southLeisure';
import { StaticBatch } from './StaticBatch.tsx';
import { glow, std } from './materials';
import { Neon } from './TownDistricts';

/** A connected riverside district: low scenery preserves the southern camera sightline. */
export function SouthLeisure(){
 const paving=(x:number,z:number,w:number,d:number,color:string)=><mesh position={[x,.023,z]} rotation-x={-Math.PI/2} receiveShadow><planeGeometry args={[w,d]}/><meshStandardMaterial color={color} roughness={.85}/></mesh>;
 return <group name="south-sports-riverside"><StaticBatch worldStatic>
  {/* Broad public promenade links the arrival square, court entrance and river. */}
  {paving(0,39,5,12,'#4b6571')}
  {paving(9,38.5,18,3,'#4b6571')}
  {paving(-8.5,39,10,9,'#36594f')}
  {paving(10,35.5,12,6,'#355564')}
  {paving(37,34,4,9,'#3b536c')}
  {[34,36,38,40,42,44].map(z=><group key={z}>
   {[-1,1].map(s=><mesh key={s} position={[s*2.4,.045,z]} material={glow(s<0?'#ffcf8a':'#78e7d7',.8)}><boxGeometry args={[.055,.025,1.15]}/></mesh>)}
   <mesh position={[0,.045,z]} rotation-x={-Math.PI/2} material={std('#adc8c2')}><planeGeometry args={[.5,.07]}/></mesh>
  </group>)}
  {[3,6,9,12,15].map(x=><mesh key={x} position={[x,.048,38.5]} rotation-x={-Math.PI/2} rotation-z={-Math.PI/2} material={glow('#83e7dc',.8)}><circleGeometry args={[.18,3]}/></mesh>)}
  <Neon text="滨河运动公园" color="#93ece0" w={4.4} h={.7} position={[0,.055,34]} rotation={[-Math.PI/2,0,0]}/>
  <Neon text="河畔步道 ↓" color="#ffdf9b" w={2.8} h={.5} position={[0,.055,43.6]} rotation={[-Math.PI/2,0,0]}/>
  {SOUTH_PLANTERS.map(p=><group key={`${p.x}:${p.z}`} position={[p.x,0,p.z]}>
   <mesh position-y={.25} material={std('#547181',.7)}><boxGeometry args={[p.w,.5,p.d]}/></mesh>
   <mesh position-y={.56} material={std('#438d78',.9)}><boxGeometry args={[p.w-.16,.22,p.d-.16]}/></mesh>
   {[-.3,0,.3].map((n,i)=><mesh key={n} position={[n*p.w,.72,0]} material={glow(['#ffacbd','#f1d784','#8de1d8'][i],.35)}><icosahedronGeometry args={[.13,0]}/></mesh>)}
   <mesh position={[0,.32,p.d/2+.012]} material={glow('#79e7da',.9)}><boxGeometry args={[p.w-.2,.035,.025]}/></mesh>
  </group>)}
  {SOUTH_STANDS.map(p=><group key={p.x} position={[p.x,0,p.z]}>
   {[0,1,2].map(i=><group key={i} position={[-.8+i*.8,0,0]}>
    <mesh position-y={.18+i*.18} material={std('#3e566a',.65,.25)}><boxGeometry args={[.8,.36+i*.36,p.d]}/></mesh>
    <mesh position-y={.39+i*.36} material={std(i%2?'#deb179':'#79c4c2',.7)}><boxGeometry args={[.7,.06,p.d-.2]}/></mesh>
   </group>)}
   <mesh position={[1.15,1.15,0]} material={std('#668799',.5,.5)}><boxGeometry args={[.08,.18,p.d]}/></mesh>
  </group>)}
  {/* Three empty bays: a parking facility, not additional rideable bikes. */}
  <group position={[SOUTH_BIKE_RACK.x,0,SOUTH_BIKE_RACK.z]}>
   {[-1,0,1].map(x=><group key={x} position={[x,0,0]}>
    <mesh position={[0,.018,0]} rotation-x={-Math.PI/2} material={std('#668a92')}><planeGeometry args={[.8,1.8]}/></mesh>
    {[-.55,.55].map(z=><mesh key={z} position={[0,.35,z]} material={std('#a1c3cc',.4,.6)}><boxGeometry args={[.07,.7,.07]}/></mesh>)}
    <mesh position={[0,.7,0]} material={glow('#7edfd6',.6)}><boxGeometry args={[.08,.07,1.15]}/></mesh>
   </group>)}
   <Neon text="单车停放" color="#a9e9e2" w={2.4} h={.4} position={[0,.05,1.12]} rotation={[-Math.PI/2,0,0]}/>
  </group>
  <Neon text="运动补给" color="#ffdfa4" w={1.8} h={.4} position={[12.8,1.4,37.83]}/>
  {/* Drinks sit on the existing kiosk counter, inside its shared footprint. */}
  {[-.6,0,.6].map((x,i)=><mesh key={x} position={[12.8+x,1.1,37.5]} material={std(['#ffbd86','#a5e3c5','#df9dcf'][i])}><cylinderGeometry args={[.1,.08,.3,8]}/></mesh>)}
 </StaticBatch></group>;
}
