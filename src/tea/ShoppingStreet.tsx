import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Bike, Check, Coins, Shirt, VenetianMask, X } from 'lucide-react';
import { useGame } from '../store';
import { api } from '../api';
import { dressed, tryOn } from '../look';
import { Portrait } from '../scene/Portrait';
import { Bicycle } from '../scene/Bicycle';
import { mountBike } from './rideState';
import { sound } from '../audio';
import './shopping.css';
const CATEGORIES=[{id:'shirt',name:'衣服',Icon:Shirt},{id:'accessory',name:'面具',Icon:VenetianMask},{id:'vehicle',name:'载具',Icon:Bike}] as const;
export function ShoppingStreet({onClose,onChanged,initialCategory='shirt'}:{initialCategory?:string;onClose:()=>void;onChanged:()=>void}){
 const snap=useGame(s=>s.snapshot)!;
 const [category,setCategory]=useState<string>(initialCategory),[selected,setSelected]=useState('sunset-shirt'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const close=useRef<HTMLButtonElement>(null);
 const items=snap.shop.filter(i=>i.kind===category),item=items.find(i=>i.id===selected)??items[0];
 const av=snap.colleagues.find(c=>c.id===snap.me.avatarColleagueId);
 const worn=!!item&&item.kind!=='vehicle'&&snap.me.style[item.kind]===item.value;
 const short=item&&!item.owned?Math.max(0,item.price-snap.me.coins):0;
 useEffect(()=>{close.current?.focus();},[]);
 useEffect(()=>{const f=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy)onClose();};window.addEventListener('keydown',f);return()=>window.removeEventListener('keydown',f);},[busy,onClose]);
 const act=async()=>{if(!item||busy)return;setBusy(true);setError('');try{
  if(!item.owned)await api.buyItem(item.id,item.price);
  if(item.kind!=='vehicle')await api.equipItem(item.id,item.kind,'player');
  await useGame.getState().refresh();onChanged();sound.play('equip');
  if(item.kind==='vehicle'&&item.owned&&mountBike(item.id))onClose();
 }catch(e){setError(e instanceof Error?e.message:'没有成功，请重试');await useGame.getState().refresh().catch(()=>undefined);onChanged();}finally{setBusy(false);}};
 const remove=async()=>{if(!item||item.kind==='vehicle'||busy)return;setBusy(true);try{await api.equipItem('',item.kind,'player');await useGame.getState().refresh();}catch(e){setError(e instanceof Error?e.message:'更换失败');}finally{setBusy(false);}};
 return <div className="shopping-backdrop" onKeyDown={e=>{if(e.key!=='Tab')return;const list=[...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];if(e.shiftKey&&document.activeElement===list[0]){e.preventDefault();list.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===list.at(-1)){e.preventDefault();list[0]?.focus();}}}>
 <section className="shopping-street" role="dialog" aria-modal="true" aria-label="霓虹购物街" data-testid="shopping-street">
 <header><div><small>NIGHT MARKET / 01</small><h1>霓虹购物街</h1></div><b className="shopping-balance"><Coins size={18}/>{snap.me.coins}</b><button ref={close} className="tea-btn" onClick={onClose} disabled={busy} aria-label="离开购物街"><X size={20}/></button></header>
 <nav aria-label="商品分类">{CATEGORIES.map(c=><button key={c.id} className={category===c.id?'on':''} aria-pressed={category===c.id} disabled={busy} onClick={()=>{setCategory(c.id);setError('');}}><c.Icon size={20}/>{c.name}</button>)}</nav>
 <div className="shopping-content"><div className="shopping-fitting">
 <span className="shopping-preview-tag">{item?.kind==='vehicle'?'车库预览':'试衣镜'}</span>
 {item?.kind==='vehicle'?<Canvas camera={{position:[3,2.1,4],fov:34}} onCreated={({camera})=>camera.lookAt(0,.65,0)} dpr={[1,1.25]}><ambientLight intensity={2}/><directionalLight position={[3,5,4]} intensity={3}/><Bicycle color={item.value}/><OrbitControls target={[0,.65,0]} enablePan={false} enableZoom={false}/></Canvas>:av&&<Portrait look={tryOn(dressed(av.look,snap.me.style),item)}/>}
 <span className="shopping-model-label">{item?.name}<small>拖动旋转</small></span>
 </div><div className="shopping-merch">
 <div className="shopping-items">{items.map(i=>{const Icon=i.kind==='shirt'?Shirt:i.kind==='vehicle'?Bike:VenetianMask;return <button key={i.id} data-testid={`market-item-${i.id}`} aria-pressed={item?.id===i.id} disabled={busy} className={item?.id===i.id?'selected':''} onClick={()=>{setSelected(i.id);setError('');}}><Icon size={36} style={{color:i.kind==='shirt'||i.kind==='vehicle'?i.value:'#a2f2ed'}}/><b>{i.name}</b><small>{i.owned?<><Check size={12}/>已拥有</>:<><Coins size={12}/>{i.price}</>}</small></button>;})}</div>
 {item&&<div className="shopping-checkout"><p>{item.description}</p>{error&&<p role="alert" className="shopping-error">{error}</p>}<button className="tea-btn primary" data-testid="market-purchase" disabled={busy||worn||short>0} onClick={()=>void act()}>{busy?'处理中…':worn?'已穿戴':short?`还差 ${short} 金币`:item.owned?(item.kind==='vehicle'?'骑上街':'穿上'):`购买${item.kind==='vehicle'?'':'并穿上'} · ${item.price} 金币`}</button>{worn&&<button className="tea-btn" disabled={busy} onClick={()=>void remove()}>换回原装</button>}</div>}
 </div></div>
 </section></div>;
}
