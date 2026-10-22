import {useEffect,useRef} from 'react';
import * as T from 'three';
import {TABLE,arc,catchPad,handWorld,heroFrame,settledHero,shellFrame,tableStack,returnFrame,returnOrder,ease,clamp01,type Round,type TableGame,type V3} from '../../shared/tableGames';
import {sound} from '../audio';

type Props={game:TableGame;round:Round|null;onHammer:()=>void;onPick:(slot:number)=>void;onReady:(ready:boolean)=>void};
export function TableScene(props:Props){
 const host=useRef<HTMLDivElement>(null);const live=useRef(props);live.current=props;
 useEffect(()=>{
  const el=host.current!;const renderer=new T.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor('#060e1c');renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;el.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden','true');
  const scene=new T.Scene();scene.fog=new T.Fog('#071020',13,35);const camera=new T.PerspectiveCamera(48,1,.05,60);
  const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>();
  const mat=(color:string,metal=.7,rough=.35,glow=false)=>{const m=new T.MeshStandardMaterial({color,metalness:metal,roughness:rough,emissive:glow?color:'#000000',emissiveIntensity:glow?2:0});materials.add(m);return m;};
  const metal=mat('#293950'),dark=mat('#101d2c'),gold=mat('#e8b956',.85,.25),cyan=mat('#40f5ee',.2,.35,true),pink=mat('#ef419c',.2,.35,true),rubber=mat('#101d29',.2,.7),silver=mat('#7998b0',.85,.3);
  const mesh=(g:T.BufferGeometry,m:T.Material,parent:T.Object3D=scene,pos:V3=[0,0,0])=>{geometries.add(g);const o=new T.Mesh(g,m);o.position.set(...pos);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;};
  const box=(w:number,h:number,d:number,m:T.Material,parent:T.Object3D=scene,pos:V3=[0,0,0])=>mesh(new T.BoxGeometry(w,h,d),m,parent,pos);
  const ring=(r:number,t:number,m:T.Material,parent:T.Object3D,pos:V3)=>{const o=mesh(new T.TorusGeometry(r,t,8,64),m,parent,pos);o.rotation.x=Math.PI/2;return o;};
  scene.add(new T.HemisphereLight('#a2d8ff','#15203b',2));const key=new T.DirectionalLight('#fff0ca',4);key.position.set(1,7,4);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-6;key.shadow.camera.right=6;key.shadow.camera.top=6;key.shadow.camera.bottom=-6;scene.add(key);
  for(const [x,c] of [[-4,'#22e8ed'],[4,'#e83caa']] as const){const l=new T.PointLight(c,35,14,2);l.position.set(x,3,-1);scene.add(l);box(.06,4,.06,mat(c,.2,.3,true),scene,[x,2,-3]);}
  box(11.8,.25,11,dark,scene,[0,-.18,2.1]);box(11.6,.035,10.8,metal,scene,[0,-.035,2.1]);
  for(const x of [-3.82,3.82])box(.035,.02,10.7,cyan,scene,[x,.005,2.1]);
  box(7.6,.025,.04,pink,scene,[0,.01,-3.2]);box(11.6,.12,.15,dark,scene,[0,0,7.55]);
  // Inlaid street-tech panels, real table bevels and rear skyline.
  for(let i=0;i<11;i++){box(.025,.008,10.2,dark,scene,[-3.5+i*.7,-.012,2]);}
  for(const x of [-3.4,3.4])for(const z of [-2.8,2.8])mesh(new T.CylinderGeometry(.05,.05,.025,12),silver,scene,[x,.015,z]);
  for(let i=0;i<14;i++){const h=1+(i%5)*.7;box(.7,h,.8,dark,scene,[-7+i*1.1,h/2-1,-7-(i%3)]);for(let j=0;j<3;j++)box(.04,.12,.02,i%2?pink:cyan,scene,[-7+i*1.1+.2,j*.4,-6.58-(i%3)]);}
  function label(text:string,color:string,w:number,h:number,parent:T.Object3D,pos:V3){const c=document.createElement('canvas');c.width=768;c.height=192;const ctx=c.getContext('2d')!;ctx.fillStyle='#071324';ctx.fillRect(0,0,768,192);ctx.strokeStyle=color;ctx.lineWidth=5;ctx.strokeRect(10,10,748,172);ctx.fillStyle=color;ctx.font='bold 64px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,384,96);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;textures.add(tex);const m=new T.MeshBasicMaterial({map:tex});materials.add(m);return mesh(new T.PlaneGeometry(w,h),m,parent,pos);}
  label('NIGHT MARKET / 07','#5eece7',4,1,scene,[0,2.15,-4]);
  const pad=mesh(new T.CylinderGeometry(TABLE.landingRadius,TABLE.landingRadius,.025,64),dark,scene,[0,-.01,0]);ring(TABLE.landingRadius,.018,cyan,scene,[0,.012,0]);
  const tray=new T.Group();scene.add(tray);tray.position.set(2.9,.02,.95);box(.9,.10,1.2,dark,tray,[0,.01,0]);for(const x of [-.46,.46])box(.07,.27,1.2,metal,tray,[x,.11,0]);for(const z of [-.6,.6])box(.9,.27,.07,metal,tray,[0,.11,z]);
  const hand=new T.Group();hand.position.set(...TABLE.hand);scene.add(hand);
  box(1.25,.25,1.3,rubber,hand,[0,.075,0]);box(1.12,.05,1.14,metal,hand,[0,.175,0]);
  for(const x of [-.46,-.15,.16,.47]){box(.24,.22,.55,metal,hand,[x,.04,-.88]);box(.19,.04,.15,cyan,hand,[x,.17,-.75]);}
  box(.23,.2,.55,metal,hand,[-.8,.02,.03]);box(.95,.4,.65,dark,hand,[0,-.08,.96]);box(.95,.06,.08,cyan,hand,[0,.14,.68]);
  for(let i=0;i<4;i++){const p=catchPad(i);ring(.185,.009,gold,hand,[p[0],.205,p[2]]);}
  const right=new T.Group();right.position.set(2.05,.2,2.65);scene.add(right);box(.85,.3,1.2,rubber,right,[0,0,0]);box(.8,.06,.7,metal,right,[0,.18,0]);for(let i=0;i<4;i++)box(.16,.18,.55,silver,right,[-.3+i*.2,0,-.75]);box(.7,.4,.5,dark,right,[0,-.06,.85]);
  const faceTex=(moon:boolean)=>{const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d')!;ctx.fillStyle=moon?'#102540':'#9b6518';ctx.beginPath();ctx.arc(128,128,124,0,Math.PI*2);ctx.fill();ctx.strokeStyle=moon?'#57ffef':'#fff0a6';ctx.lineWidth=9;ctx.beginPath();ctx.arc(128,128,109,0,Math.PI*2);ctx.stroke();ctx.fillStyle=moon?'#72fff3':'#fff1a1';if(moon){ctx.beginPath();ctx.arc(122,125,68,0,Math.PI*2);ctx.fill();ctx.fillStyle='#102540';ctx.beginPath();ctx.arc(154,100,62,0,Math.PI*2);ctx.fill();}else{ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5;const r=i%2?31:77;ctx.lineTo(128+Math.cos(a)*r,128+Math.sin(a)*r);}ctx.closePath();ctx.fill();}const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;textures.add(tex);const m=new T.MeshStandardMaterial({map:tex,metalness:.6,roughness:.3,emissive:moon?'#086c63':'#6a430b',emissiveIntensity:.25});materials.add(m);return m;};
  const starMat=faceTex(false),moonMat=faceTex(true);const coinGeom=new T.CylinderGeometry(TABLE.coinRadius,TABLE.coinRadius,TABLE.coinThickness,24);geometries.add(coinGeom);
  const smallFaceGeom=new T.CircleGeometry(TABLE.coinRadius*.91,32);geometries.add(smallFaceGeom);
  function coin(hero=false){const g=new T.Group();const radius=hero?TABLE.heroRadius:TABLE.coinRadius,thick=hero?TABLE.heroThickness:TABLE.coinThickness;mesh(hero?new T.CylinderGeometry(radius,radius,thick,48):coinGeom,gold,g);const top=mesh(hero?new T.CircleGeometry(radius*.91,32):smallFaceGeom,starMat,g,[0,thick/2+.001,0]);top.rotation.x=-Math.PI/2;const bottom=mesh(hero?new T.CircleGeometry(radius*.91,32):smallFaceGeom,moonMat,g,[0,-thick/2-.001,0]);bottom.rotation.x=Math.PI/2;return g;}
  const hero=coin(true);scene.add(hero);hero.position.y=.05;
  for(let i=0;i<24;i++){const c=coin();c.position.set(.65+(i%3)*.38,.04+Math.floor(i/3)*.07,2.7);scene.add(c);}
  const hammer=new T.Group();scene.add(hammer);hammer.position.set(1.4,.275,0);const handle=box(1.4,.14,.18,rubber,hammer,[-.65,0,0]);for(let i=0;i<6;i++)box(.045,.17,.2,silver,hammer,[-.12-i*.16,0,0]);const head=box(.68,.35,.44,metal,hammer,[-1.4,0,0]);box(.72,.05,.47,cyan,hammer,[-1.4,.19,0]);
  const outline= new T.LineSegments(new T.EdgesGeometry(head.geometry),new T.LineBasicMaterial({color:'#ffdf70',transparent:true,opacity:1}));geometries.add(outline.geometry);materials.add(outline.material);head.add(outline);outline.scale.setScalar(1.04);
  const hammerLabel=label('点击榔头','#ffdf70',1.1,.28,hammer,[-.75,.48,.1]);
  const cups:T.Group[]=[];
  for(let i=0;i<3;i++){const g=new T.Group();scene.add(g);mesh(new T.CylinderGeometry(.34,TABLE.cupRadius,.78,32,1,true),metal,g,[0,.42,0]);mesh(new T.CylinderGeometry(.34,.34,.08,32),dark,g,[0,.85,0]);ring(TABLE.cupRadius,.028,cyan,g,[0,.04,0]);ring(.34,.025,pink,g,[0,.88,0]);for(let k=0;k<4;k++){const a=k*Math.PI/2;box(.07,.4,.07,silver,g,[Math.cos(a)*.38,.43,Math.sin(a)*.38]);}g.userData.entity=i;cups.push(g);}
  const core=mesh(new T.IcosahedronGeometry(.19,1),cyan);const coreLight=new T.PointLight('#2ffff0',2,2);core.add(coreLight);
  const shock=ring(.8,.025,gold,scene,[0,.025,0]);shock.visible=false;
  let coins:T.Group[]=[],trails:T.Mesh[]=[],roundId='',lastPhase='',frame=0,disposed=false,lastSound=-1;
  const tailUp=new T.Vector3(0,1,0);const tailDirection=new T.Vector3();
  const tail=(tr:T.Mesh,c:T.Group,previous:V3)=>{tailDirection.copy(c.position).sub(new T.Vector3(...previous));const length=Math.min(.22,tailDirection.length());tailDirection.normalize();tr.visible=true;tr.position.copy(c.position).addScaledVector(tailDirection,-length/2);tr.quaternion.setFromUnitVectors(tailUp,tailDirection);tr.scale.set(1,length/.18,1);};
  const clearCoins=()=>{for(const c of coins)c.removeFromParent();for(const t of trails)t.removeFromParent();coins=[];trails=[];};
  const trailGeometry=new T.CylinderGeometry(.009,.023,.18,6);geometries.add(trailGeometry);
  function makeCoins(r:Round){clearCoins();roundId=r.id;for(let i=0;i<r.count*2;i++){const c=coin();scene.add(c);coins.push(c);const trail=mesh(trailGeometry,cyan);trails.push(trail);}}
  const ray=new T.Raycaster(),pointer=new T.Vector2();
  function hit(e:PointerEvent){const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);const r=live.current.round;if(r?.phase==='hammer'&&ray.intersectObjects([head,handle],false).length)return 'hammer';if(r?.phase==='pick'){for(let i=0;i<3;i++)if(ray.intersectObject(cups[i],true).length)return shellFrame(r.swaps,2).slots[i];}return null;}
  const move=(e:PointerEvent)=>{renderer.domElement.style.cursor=hit(e)!==null?'pointer':'default';};
  const click=(e:PointerEvent)=>{const target=hit(e);if(target==='hammer')live.current.onHammer();else if(typeof target==='number')live.current.onPick(target);};
  renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerup',click);
  const resize=()=>{const {width,height}=el.getBoundingClientRect();renderer.setSize(width,height);camera.aspect=width/height;camera.fov=camera.aspect<1?60:48;camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(el);resize();
  function tick(){if(disposed)return;frame=requestAnimationFrame(tick);const {round:r,game}=live.current;const time=performance.now()/1000;const t=r?Math.max(0,(Date.now()-r.at)/1000):0;const phase=r?.phase??'idle';if(r&&r.id!==roundId)makeCoins(r);if(!r&&roundId){clearCoins();roundId='';}
   if(phase!==lastPhase){lastPhase=phase;lastSound=-1;if(phase==='flip'){sound.play('step');sound.play('shield');}if(phase==='settle')sound.play('step');}
   const coinGame=game==='coin';hero.visible=coinGame;pad.visible=coinGame;hammer.visible=coinGame;outline.visible=phase==='hammer';hammerLabel.visible=phase==='hammer';head.material=phase==='hammer'?gold:metal;
   hammer.rotation.z=phase==='strike'? t<.32?-.5-ease(t/.32)*.55:-1.05+ease((t-.32)/.14)*1.05:phase==='flip'?-Math.min(.5,t*1.7):-.5;
   hero.rotation.set(0,0,0);hero.position.set(0,.05,0);
   if(r&&phase==='flip'){const f=heroFrame(t,r.outcome);hero.rotation.x=f.rotation;hero.position.y=f.y;}
   else if(r&&phase==='settle'){const f=settledHero(t,r.outcome);hero.rotation.x=f.rotation;hero.position.y=f.y;}
   else if(r&&['payout','loss','result'].includes(phase)){hero.rotation.x=r.outcome*Math.PI;hero.position.y=.05;}
   const follow=phase==='flip'?hero.position.y-.05:0;const shake=phase==='flip'&&t<.13?Math.sin(t*140)*.045*(1-t/.13):0;
   camera.position.set(shake,3.75+follow*.30,camera.aspect<1?7.8:7.2);camera.lookAt(0,.25+follow*.75,.25);
   shock.visible=phase==='flip'&&t<.4;shock.scale.setScalar(1+t*3);
   const cf=r?shellFrame(r.swaps,phase==='shuffle'?t:['pick','reveal','payout','loss','result'].includes(phase)?2:0):shellFrame([],0);
   cups.forEach((c,i)=>{c.visible=!coinGame;c.position.set(...cf.positions[i]);let lift=!r||phase==='result'?(i===1||cf.slots[i]===r?.picked)?1.25:0:phase==='toss'?i===1?(1-ease(t/.35))*1.25:0:0;
    if(r&&phase==='reveal'){const selected=cf.slots[i]===r.picked;lift=selected?(t<.4?ease(t/.4)*.18:t<.7?.18:.18+ease((t-.7)/.4)*1.1):i===1?ease((t-.9)/.4)*1.28:0;}
    if(['payout','loss'].includes(phase))lift=i===1||cf.slots[i]===r?.picked?1.28:0;c.position.y=lift;});
   core.visible=!coinGame;coreLight.visible=!coinGame&&cups[1].position.y>.5;core.position.set(cf.positions[1][0],.22,cf.positions[1][2]);core.rotation.y=time;
   // Tiny receiver motion only after landing: attached coins inherit the same transform.
   hand.position.set(...TABLE.hand);if(phase==='result')hand.position.y+=Math.sin(time*1.7)*.016;
   hand.rotation.x=0;if(phase==='toss')hand.position.y+=Math.sin(clamp01(t/.9)*Math.PI)*.10;
   if(r){const total=r.count*2;const won=phase==='payout'||phase==='result'&&r.win;let caught=0;
    coins.forEach((c,i)=>{const tr=trails[i];tr.visible=false;c.visible=i<r.count||!!won;if(!c.visible)return;
     if(phase==='toss'){const p=clamp01((t-.15-i*.065)/.85);const origin=handWorld(catchPad(i));origin[1]+=hand.position.y-TABLE.hand[1];c.position.set(...arc(origin,tableStack(i),ease(p),1.35,(i%4-1.5)*.12));c.rotation.set(Math.PI*4*(1-p),p*Math.PI*3,0);if(p===1)c.rotation.set(0,0,0);else if(p>0){tail(tr,c,arc(origin,tableStack(i),ease(Math.max(0,p-.025)),1.35,(i%4-1.5)*.12));}if(p===1&&i>lastSound){lastSound=i;sound.play('catch');}}
     else if(won){const catchIndex=returnOrder(total).indexOf(i);const f=returnFrame(catchIndex,phase==='result'?20:t,total);if(f.p>=1){caught++;if(c.parent!==hand){scene.updateMatrixWorld(true);c.position.set(...handWorld(catchPad(catchIndex)));c.rotation.set(0,0,0);hand.attach(c);c.position.set(...catchPad(catchIndex));}c.rotation.set(0,0,0);}else{c.position.set(...f.position);c.rotation.set(f.rotation,0,0);if(f.p>0){tail(tr,c,returnFrame(catchIndex,Math.max(0,t-.035),total).position);}}}
     else if(phase==='loss'||phase==='result'){const p=clamp01(((phase==='result'?10:t)-i*.09)/.9);c.position.set(...arc(tableStack(i),[2.9,.10+Math.floor(i/2)*.07,.72+(i%2)*.38],ease(p),.9,(i%2?1:-1)*.1));c.rotation.x=(1-ease(p))*Math.PI*2;}
     else{c.position.set(...tableStack(i));c.rotation.set(0,0,0);}
    });if(won&&caught>lastSound){if(caught>0)sound.play('catch');lastSound=caught;}
   }
   renderer.render(scene,camera);
  }
  tick();live.current.onReady(true);
  return()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();renderer.domElement.removeEventListener('pointermove',move);renderer.domElement.removeEventListener('pointerup',click);clearCoins();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());renderer.dispose();renderer.domElement.remove();};
 },[]);
 return <div ref={host} className="table-viewport" role="group" aria-label={props.game==='coin'?'榔头场景：就绪后聚焦这里按回车挥锤':'三杯桌面：交换结束后选择罩子'} tabIndex={props.round?.phase==='hammer'?0:-1} onKeyDown={e=>{if(e.key==='Enter'&&props.round?.phase==='hammer'){e.preventDefault();props.onHammer();}}}/>;
}
